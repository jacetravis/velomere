"use client";

import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { ArrowDownUp, ChevronDown, Download, Flame, MessageCircle, Moon, RectangleVertical, ScrollText, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ArtZoom } from "@/components/art-zoom";
import { ChatWithSolace, ConsentLine, EntryMedia, LinkFields } from "@/components/entry-links";
import { FilePicker } from "@/components/file-picker";
import { MeaningText } from "@/components/meaning-text";
import { MiniCard, VelomereBorder } from "@/components/tarot-card";
import { requestUploadConsent } from "@/components/upload-consent";
import { UnsavedChatDialog } from "@/components/unsaved-chat";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { listCards, listDecks, type DeckRecord } from "@/lib/cards/server";
import { suitLabel, type Card } from "@/lib/cards/types";
import { fileToDataUrl } from "@/lib/cards/image";
import type { UploadConsent } from "@/lib/consent";
import { cleanWebsite, cleanYoutube, readLinks } from "@/lib/links";
import {
  conversationFromBackup,
  conversationToBackup,
  dreamFromBackup,
  dreamToBackup,
  labelFromBackup,
  readingFromBackup,
  readingToBackup,
  ritualFromBackup,
  ritualToBackup,
} from "@/lib/journal/backup";
import { useJournal, type Conversation, type Dream, type JournalLabel, type Reading, type Ritual } from "@/lib/journal/store";
import { cardSitting, dreamSitting, ritualSitting, sittingFromOrigin } from "@/lib/solace/sitting";
import { saveCurrentThread, threadNeedsSave } from "@/lib/solace/thread";
import { useSolace } from "@/lib/solace/store";
import type { CardOrigin } from "@/lib/solace/origin";
import { cn } from "@/lib/utils";

const LABEL_COLORS = ["#c4a574", "#8f4d4d", "#4f6f64", "#6a5a8f", "#3d6f8f", "#8f6a4d", "#d4574e", "#8a8f99"];

type JournalTab = "draw" | "dream" | "ritual" | "solace";

const JOURNAL_PAGES = {
  draw: {
    title: "Card journal",
    blurb: "Every pull keeps the hour and the deck. A physical deck can be logged by hand.",
  },
  dream: {
    title: "Dream journal",
    blurb: "A private log you write yourself. Nothing here is drawn for you.",
  },
  ritual: {
    title: "Ritual journal",
    blurb: "A working you keep yourself. A picture can stay with the entry.",
  },
  solace: {
    title: "Solace journal",
    blurb: "Conversations you chose to keep with Solace. Nothing here is written by hand.",
  },
} as const;

function FilterDrawer({ active, children }: { active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-6 rounded-2xl bg-surface">
      <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span className="font-display text-xl">Search & Filters</span>
        <span className="text-xs text-subtle">{active ? "Filters on · " : ""}{open ? "Hide" : "Show"}</span>
      </button>
      {open ? <div className="flex flex-col gap-3 px-4 pb-4">{children}</div> : null}
    </section>
  );
}

export function JournalPage({
  deckId,
  cardId,
  dreamId,
  ritualId,
  readingId,
  chatId,
}: {
  deckId?: number;
  cardId?: number;
  dreamId?: string;
  ritualId?: string;
  readingId?: string;
  chatId?: string;
}) {
  const readings = useJournal((s) => s.readings);
  const dreams = useJournal((s) => s.dreams);
  const rituals = useJournal((s) => s.rituals);
  const conversations = useJournal((s) => s.conversations);
  const navigate = useNavigate();
  const [tab, setTab] = useState<JournalTab>("draw");

  useEffect(() => {
    if (chatId) setTab("solace");
    else if (dreamId) setTab("dream");
    else if (ritualId) setTab("ritual");
    else if (deckId && cardId) setTab("draw");
  }, [deckId, cardId, dreamId, ritualId, chatId]);

  const page = JOURNAL_PAGES[tab];

  return (
    <AppShell>
      <h1 className="font-display text-4xl font-medium tracking-tight">{page.title}</h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">{page.blurb}</p>
      <div className="mt-6 grid grid-cols-4 gap-2">
        {(
          [
            ["draw", "Card", RectangleVertical],
            ["dream", "Dream", Moon],
            ["ritual", "Ritual", Flame],
            ["solace", "Solace", ScrollText],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            className={cn("flex h-11 items-center justify-center gap-1.5 rounded-md px-1 text-sm", tab === id ? "bg-fg text-bg" : "bg-surface text-muted")}
            onClick={() => setTab(id)}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      {tab === "draw" ? (
        <DrawJournal
          readings={readings}
          deckId={deckId}
          cardId={cardId}
          readingId={readingId}
          onReleaseFocus={() => {
            if (deckId && cardId) void navigate({ to: "/journal", search: {} });
          }}
        />
      ) : tab === "dream" ? (
        <DreamJournal dreams={dreams ?? []} focusId={dreamId} />
      ) : tab === "ritual" ? (
        <RitualJournal rituals={rituals ?? []} focusId={ritualId} />
      ) : (
        <SolaceJournal conversations={conversations ?? []} focusId={chatId} />
      )}
    </AppShell>
  );
}

function DrawJournal({
  readings,
  deckId,
  cardId,
  readingId,
  onReleaseFocus,
}: {
  readings: Reading[];
  deckId?: number;
  cardId?: number;
  readingId?: string;
  onReleaseFocus: () => void;
}) {
  const addReading = useJournal((s) => s.addReading);
  const importReadings = useJournal((s) => s.importReadings);
  const labels = useJournal((s) => s.labels);
  const { user } = useCurrentUserState();
  const pinned = deckId != null && cardId != null;
  const { data: decks } = useQuery({
    queryKey: ["decks"],
    queryFn: () => listDecks(),
    enabled: user !== null,
  });
  const { data: focusCards } = useQuery({
    queryKey: ["cards", deckId ?? 0],
    queryFn: () => listCards({ data: { deckId: deckId ?? 0 } }),
    enabled: user !== null && pinned,
  });
  const appliedFocus = useRef("");
  const [viewing, setViewing] = useState<Reading | null>(null);
  const openedReading = useRef("");
  useEffect(() => {
    if (!readingId || openedReading.current === readingId) return;
    const found = readings.find((reading) => reading.id === readingId);
    if (!found) return;
    openedReading.current = readingId;
    setViewing(found);
  }, [readingId, readings]);
  const [deck, setDeck] = useState("");
  const [cardKey, setCardKey] = useState("");
  const [labelId, setLabelId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [logging, setLogging] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [pickStep, setPickStep] = useState<"source" | "card">("source");
  const [pickedDeckId, setPickedDeckId] = useState<number | "">("");
  const [pickedCardId, setPickedCardId] = useState<number | "">("");
  const [appCard, setAppCard] = useState<{ deck: DeckRecord; card: Card } | null>(null);
  const { data: pickedCards } = useQuery({
    queryKey: ["cards", pickedDeckId || 0],
    queryFn: () => listCards({ data: { deckId: Number(pickedDeckId) } }),
    enabled: user !== null && pickedDeckId !== "",
  });

  const deckNames = useMemo(() => {
    const names = new Set<string>();
    for (const reading of readings) {
      if (reading.deckName) names.add(reading.deckName);
    }
    if (deck) names.add(deck);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [readings, deck]);

  const manualDecks = useMemo(() => {
    const names = new Set<string>();
    for (const reading of readings) {
      if (reading.manual && reading.deckName?.trim()) names.add(reading.deckName.trim());
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [readings]);

  const cardOptions = useMemo(() => {
    const map = new Map<string, string>();
    const pinnedToDeck = Boolean(pinned && cardKey.startsWith(`id:${deckId}:`));
    for (const reading of readings) {
      if (pinnedToDeck) {
        if (reading.deckId !== deckId) continue;
      } else if (deck && (reading.deckName || "Unknown deck") !== deck) {
        continue;
      }
      const key = cardKeyFor(reading);
      if (!map.has(key)) map.set(key, reading.cardName);
    }
    if (pinned && cardKey === `id:${deckId}:${cardId}` && !map.has(cardKey)) {
      const named = focusCards?.find((card) => card.id === cardId)?.name ?? "This card";
      map.set(cardKey, named);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [readings, deck, cardKey, deckId, cardId, pinned, focusCards]);

  useEffect(() => {
    if (!pinned || deckId == null || cardId == null) {
      appliedFocus.current = "";
      return;
    }
    if (appliedFocus.current === "cleared") return;
    const key = `${deckId}:${cardId}`;
    const named = readings.find((reading) => reading.deckId === deckId && reading.cardId === cardId);
    const live = decks?.find((item) => item.id === deckId);
    const name = named?.deckName || live?.name || "";
    if (appliedFocus.current !== key) {
      appliedFocus.current = key;
      setCardKey(`id:${deckId}:${cardId}`);
      if (name) setDeck(name);
      return;
    }
    if (name) setDeck((current) => current || name);
  }, [pinned, deckId, cardId, readings, decks]);

  const filtered = useMemo(
    () =>
      readings.filter((reading) => {
        if (pinned && cardKey === `id:${deckId}:${cardId}`) {
          if (reading.deckId !== deckId || reading.cardId !== cardId) return false;
        } else {
          if (deck && (reading.deckName || "Unknown deck") !== deck) return false;
          if (cardKey && cardKeyFor(reading) !== cardKey) return false;
        }
        if (labelId && !(reading.labelIds ?? []).includes(labelId)) return false;
        return inRange(dayKey(reading.pulledAt), from, to);
      }),
    [readings, deck, cardKey, pinned, deckId, cardId, labelId, from, to],
  );
  const grouped = useMemo(() => groupByDay(filtered), [filtered]);
  const filtering = deck !== "" || cardKey !== "" || labelId !== "" || from !== "" || to !== "";

  const openEntry = (reading: Reading) => {
    setViewing(reading);
  };

  return (
    <>
      {readingId && !readings.some((reading) => reading.id === readingId) ? (
        <p className="mt-6 text-sm text-muted">That entry is no longer in the journal.</p>
      ) : null}
      <div className="mt-8 grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="secondary"
          className="h-auto min-h-11 whitespace-normal px-2 text-center text-xs leading-tight"
          onClick={() => {
            if (logging || appCard) {
              setLogging(false);
              setAppCard(null);
              return;
            }
            setPickStep("source");
            setPickedDeckId("");
            setPickedCardId("");
            setChooser(true);
          }}
        >
          {logging || appCard ? "Close" : "New Journal Entry"}
        </Button>
        <BackupButtons
          className="min-w-0"
          compact
          onExport={() =>
            download("card-journal.json", {
              kind: "solace-card-journal",
              labels: catalogForBackup(labels),
              readings: readings.map(readingToBackup),
            })
          }
          onImport={(file) =>
            void restore(
              file,
              ["solace-card-journal", "solace-draw-journal"],
              "readings",
              importReadings,
              readingFromBackup,
            )
          }
        />
        <Button asChild className="h-auto min-h-11 whitespace-normal px-2 text-center text-xs leading-tight">
          <Link to="/">Go to the table</Link>
        </Button>
      </div>
      {logging ? (
        <div className="mt-4">
          <ManualDrawForm
            decks={manualDecks}
            onCancel={() => setLogging(false)}
            onSave={(entry) => {
              const reading = addReading(entry);
              setViewing(reading);
              setLogging(false);
              toast("Card kept");
            }}
          />
        </div>
      ) : appCard ? (
        <div className="mt-4">
          <AppDrawForm
            deck={appCard.deck}
            card={appCard.card}
            onCancel={() => setAppCard(null)}
            onSave={(entry) => {
              const reading = addReading(entry);
              setViewing(reading);
              setAppCard(null);
              toast("Card kept");
            }}
          />
        </div>
      ) : null}
      <Dialog
        open={chooser}
        onOpenChange={(open) => {
          setChooser(open);
          if (!open) setPickStep("source");
        }}
      >
        <DialogContent>
          {pickStep === "source" ? (
            <>
              <DialogHeader>
                <DialogTitle>New journal entry</DialogTitle>
                <DialogDescription>Was this draw made in the app, or from a deck in your hands?</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPickStep("card")}
                >
                  In the app
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setChooser(false);
                    setAppCard(null);
                    setLogging(true);
                  }}
                >
                  A physical deck
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Which card?</DialogTitle>
                <DialogDescription>Choose the deck, then the card this entry is about.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-deck">Deck</Label>
                <select
                  id="entry-deck"
                  value={pickedDeckId}
                  onChange={(event) => {
                    setPickedDeckId(event.target.value ? Number(event.target.value) : "");
                    setPickedCardId("");
                  }}
                  className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
                >
                  <option value="">Choose a deck</option>
                  {(decks ?? []).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-card">Card</Label>
                <select
                  id="entry-card"
                  value={pickedCardId}
                  disabled={pickedDeckId === ""}
                  onChange={(event) => setPickedCardId(event.target.value ? Number(event.target.value) : "")}
                  className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border disabled:opacity-50"
                >
                  <option value="">Choose a card</option>
                  {(pickedCards ?? []).map((card) => (
                    <option key={card.id} value={card.id}>{card.name}</option>
                  ))}
                </select>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setPickStep("source")}>Back</Button>
                <Button
                  type="button"
                  disabled={pickedDeckId === "" || pickedCardId === ""}
                  onClick={() => {
                    const deck = (decks ?? []).find((item) => item.id === pickedDeckId);
                    const card = (pickedCards ?? []).find((item) => item.id === pickedCardId);
                    if (!deck || !card) return;
                    setAppCard({ deck, card });
                    setLogging(false);
                    setChooser(false);
                  }}
                >
                  Continue
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <FilterDrawer active={filtering}>
        <LabelManager />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-deck">Deck</Label>
          <select
            id="journal-deck"
            value={deck}
            onChange={(event) => {
              onReleaseFocus();
              setDeck(event.target.value);
              setCardKey("");
            }}
            className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
          >
            <option value="">All decks</option>
            {deckNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="journal-card">Card</Label>
          <select
            id="journal-card"
            value={cardKey}
            onChange={(event) => {
              onReleaseFocus();
              setCardKey(event.target.value);
            }}
            className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
          >
            <option value="">All cards</option>
            {cardOptions.map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <LabelFilter id="journal-label" value={labelId} onChange={setLabelId} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="draw-from">From</Label>
            <Input id="draw-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="draw-to">To</Label>
            <Input id="draw-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!filtering}
            onClick={() => {
              appliedFocus.current = "cleared";
              onReleaseFocus();
              setDeck("");
              setCardKey("");
              setLabelId("");
              setFrom("");
              setTo("");
            }}
          >
            Show all
          </Button>
        </div>
      </FilterDrawer>

      {readings.length === 0 ? (
        <div className="mt-16 max-w-sm">
          <p className="font-display text-2xl">No cards yet</p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Pull a card at the table. The time, the deck, and any notes you keep will live here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-sm text-muted">Nothing in that range.</p>
      ) : (
        <div className="mt-10 flex flex-col gap-10">
          {grouped.map(([day, items]) => (
            <section key={day}>
              <h2 className="text-xs tracking-[0.18em] text-subtle uppercase">{day}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {items.map((reading) => (
                  <li key={reading.id}>
                    <ReadingRow
                      reading={reading}
                      onOpen={() => openEntry(reading)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <ReadingDialog
        reading={viewing ? (readings.find((item) => item.id === viewing.id) ?? viewing) : null}
        decks={decks ?? []}
        onClose={() => setViewing(null)}
        onShowCard={(reading) => {
          setViewing(null);
          onReleaseFocus();
          if (reading.cardId > 0 && reading.deckId) {
            setDeck("");
            setCardKey(cardKeyFor(reading));
            return;
          }
          setDeck(reading.deckName || "Unknown deck");
          setCardKey(cardKeyFor(reading));
        }}
      />
    </>
  );
}

function ManualDrawForm({
  decks,
  onCancel,
  onSave,
}: {
  decks: string[];
  onCancel: () => void;
  onSave: (entry: {
    cardId: number;
    cardName: string;
    suit: string;
    rank: string;
    orientation: "upright";
    keywords: string;
    meaningSnapshot: string;
    notes: string;
    question: string;
    deckId: null;
    deckName: string;
    manual: true;
    image: string | null;
    pulledAt: string;
    websiteUrl?: string;
    videoUrl?: string;
    consent?: UploadConsent;
  }) => void;
}) {
  const [deckName, setDeckName] = useState("");
  const [drawnOn, setDrawnOn] = useState(todayKey());
  const [drawnAt, setDrawnAt] = useState(timeKey(new Date().toISOString()));
  const [cardName, setCardName] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [video, setVideo] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [consent, setConsent] = useState<UploadConsent | null>(null);
  const [readingImage, setReadingImage] = useState(false);

  const onPicture = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Choose a picture.");
      return;
    }
    const agreed = await requestUploadConsent();
    if (!agreed) return;
    setReadingImage(true);
    try {
      const url = await fileToDataUrl(file, 960);
      if (url.length > 1_500_000) {
        toast("That picture is too large.");
        return;
      }
      setImage(url);
      setConsent(agreed);
    } catch {
      toast("Could not read that picture.");
    } finally {
      setReadingImage(false);
    }
  };

  const save = () => {
    const name = deckName.trim();
    const title = cardName.trim();
    if (!name || !drawnOn) return;
    if (!title && !image) {
      toast("Name the card or the spread, or add a picture.");
      return;
    }
    const links = readLinks(website, video);
    if (!links.ok) {
      toast(links.message);
      return;
    }
    onSave({
      cardId: 0,
      cardName: title || "Physical draw",
      suit: "",
      rank: "",
      orientation: "upright",
      keywords: "",
      meaningSnapshot: "",
      notes: notes.trim(),
      question: "",
      deckId: null,
      deckName: name,
      manual: true,
      image,
      pulledAt: stampFrom(drawnOn, drawnAt),
      websiteUrl: links.websiteUrl,
      videoUrl: links.videoUrl,
      ...(consent ? { consent } : {}),
    });
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-border"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="font-display text-2xl tracking-tight">A physical draw</p>
      <p className="text-sm leading-relaxed text-muted">
        For a card or spread from a deck in your hands. Digital decks are not listed here.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="physical-date">Date</Label>
        <Input
          id="physical-date"
          type="date"
          value={drawnOn}
          onChange={(event) => setDrawnOn(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="physical-time">Time</Label>
        <Input
          id="physical-time"
          type="time"
          value={drawnAt}
          onChange={(event) => setDrawnAt(event.target.value)}
          required
        />
      </div>
      {decks.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="physical-deck-list">Decks you've logged</Label>
          <select
            id="physical-deck-list"
            value={decks.includes(deckName) ? deckName : ""}
            onChange={(event) => {
              if (event.target.value) setDeckName(event.target.value);
            }}
            className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
          >
            <option value="">Choose one, or type a new name</option>
            {decks.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="physical-deck">Physical deck</Label>
        <Input
          id="physical-deck"
          value={deckName}
          maxLength={80}
          placeholder="Name of the deck in your hands"
          onChange={(event) => setDeckName(event.target.value)}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="physical-card">What you drew</Label>
        <Input
          id="physical-card"
          value={cardName}
          maxLength={160}
          placeholder="A card, or the spread"
          onChange={(event) => setCardName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="physical-picture">Picture</Label>
        {image ? (
          <div className="flex flex-col gap-2">
            <img src={image} alt="" className="max-h-56 w-full rounded-lg object-contain" />
            <Button type="button" variant="secondary" onClick={() => {
              setImage(null);
              setConsent(null);
            }}>
              Remove picture
            </Button>
          </div>
        ) : (
          <FilePicker
            id="physical-picture"
            accept="image/*"
            disabled={readingImage}
            label="Choose picture"
            onFile={(file) => void onPicture(file)}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="physical-notes">Notes</Label>
        <Textarea
          id="physical-notes"
          value={notes}
          className="min-h-24"
          placeholder="Optional"
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <LinkFields id="physical" website={website} video={video} onWebsite={setWebsite} onVideo={setVideo} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!deckName.trim() || !drawnOn || readingImage}>
          Keep this draw
        </Button>
      </div>
    </form>
  );
}

function AppDrawForm({
  deck,
  card,
  onCancel,
  onSave,
}: {
  deck: DeckRecord;
  card: Card;
  onCancel: () => void;
  onSave: (entry: {
    cardId: number;
    cardName: string;
    suit: string;
    rank: string;
    orientation: "upright" | "reversed";
    keywords: string;
    meaningSnapshot: string;
    notes: string;
    question: string;
    deckId: number;
    deckName: string;
    manual: false;
    image: null;
    pulledAt: string;
    websiteUrl?: string;
    videoUrl?: string;
  }) => void;
}) {
  const [drawnOn, setDrawnOn] = useState(todayKey());
  const [drawnAt, setDrawnAt] = useState(timeKey(new Date().toISOString()));
  const [orientation, setOrientation] = useState<"upright" | "reversed">("upright");
  const [notes, setNotes] = useState("");
  const [question, setQuestion] = useState("");
  const [website, setWebsite] = useState("");
  const [video, setVideo] = useState("");

  const save = () => {
    if (!drawnOn) return;
    const links = readLinks(website, video);
    if (!links.ok) {
      toast(links.message);
      return;
    }
    onSave({
      cardId: card.id,
      cardName: card.name,
      suit: card.suit,
      rank: card.rank,
      orientation,
      keywords: card.keywords,
      meaningSnapshot: orientation === "reversed" ? card.reversed : card.upright,
      notes: notes.trim(),
      question: question.trim(),
      deckId: deck.id,
      deckName: deck.name,
      manual: false,
      image: null,
      pulledAt: stampFrom(drawnOn, drawnAt),
      websiteUrl: links.websiteUrl,
      videoUrl: links.videoUrl,
    });
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-border"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <p className="font-display text-2xl tracking-tight">{card.name}</p>
      <p className="text-sm text-muted">{deck.name}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-date">Date</Label>
          <Input id="app-date" type="date" value={drawnOn} onChange={(event) => setDrawnOn(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="app-time">Time</Label>
          <Input id="app-time" type="time" value={drawnAt} onChange={(event) => setDrawnAt(event.target.value)} required />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="app-orientation">Orientation</Label>
        <select
          id="app-orientation"
          value={orientation}
          onChange={(event) => setOrientation(event.target.value === "reversed" ? "reversed" : "upright")}
          className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
        >
          <option value="upright">Upright</option>
          <option value="reversed">Reversed</option>
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="app-question">Question</Label>
        <Input id="app-question" value={question} maxLength={240} placeholder="Optional" onChange={(event) => setQuestion(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="app-notes">Notes</Label>
        <Textarea id="app-notes" value={notes} className="min-h-24" placeholder="Optional" onChange={(event) => setNotes(event.target.value)} />
      </div>
      <LinkFields id="app-entry" website={website} video={video} onWebsite={setWebsite} onVideo={setVideo} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!drawnOn}>Keep this entry</Button>
      </div>
    </form>
  );
}

function DreamJournal({ dreams, focusId }: { dreams: Dream[]; focusId?: string }) {
  const addDream = useJournal((s) => s.addDream);
  const updateDream = useJournal((s) => s.updateDream);
  const deleteDream = useJournal((s) => s.deleteDream);
  const importDreams = useJournal((s) => s.importDreams);
  const labels = useJournal((s) => s.labels);
  const setDreamLabels = useJournal((s) => s.setDreamLabels);
  const [openId, setOpenId] = useState<string | null>(focusId ?? null);
  const [labelId, setLabelId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dreamedOn, setDreamedOn] = useState(todayKey());
  const [dreamedTime, setDreamedTime] = useState(nowTime());
  const [website, setWebsite] = useState("");
  const [video, setVideo] = useState("");
  const [composing, setComposing] = useState(false);

  const filtered = useMemo(
    () =>
      dreams.filter((dream) => {
        if (labelId && !(dream.labelIds ?? []).includes(labelId)) return false;
        return inRange(dream.dreamedOn, from, to);
      }),
    [dreams, labelId, from, to],
  );
  const listed = useMemo(() => {
    if (!focusId || filtered.some((dream) => dream.id === focusId)) return filtered;
    const focused = dreams.find((dream) => dream.id === focusId);
    return focused ? [focused, ...filtered] : filtered;
  }, [filtered, dreams, focusId]);
  const missing = Boolean(focusId) && !dreams.some((dream) => dream.id === focusId);
  const filtering = labelId !== "" || from !== "" || to !== "";

  useEffect(() => {
    if (focusId) setOpenId(focusId);
  }, [focusId]);

  const save = () => {
    if (!body.trim() || !dreamedOn) return;
    const links = readLinks(website, video);
    if (!links.ok) {
      toast(links.message);
      return;
    }
    const dream = addDream({
      title,
      body,
      dreamedOn,
      dreamedTime,
      websiteUrl: links.websiteUrl,
      videoUrl: links.videoUrl,
    });
    setTitle("");
    setBody("");
    setWebsite("");
    setVideo("");
    setDreamedOn(todayKey());
    setDreamedTime(nowTime());
    setOpenId(dream.id);
    setComposing(false);
    toast("Dream kept");
  };

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-2">
        <Button type="button" className="w-full" onClick={() => setComposing((open) => !open)}>
          {composing ? "Close" : "New Journal Entry"}
        </Button>
        <BackupButtons
          className="w-full"
          onExport={() =>
            download("dream-journal.json", {
              kind: "solace-dream-journal",
              labels: catalogForBackup(labels),
              dreams: dreams.map(dreamToBackup),
            })
          }
          onImport={(file) => void restore(file, "solace-dream-journal", "dreams", importDreams, dreamFromBackup)}
        />
      </div>
      {composing ? (
      <form
        className="mt-4 flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-border"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dream-date">Date</Label>
            <Input
              id="dream-date"
              type="date"
              value={dreamedOn}
              onChange={(event) => setDreamedOn(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dream-time">Time</Label>
            <Input
              id="dream-time"
              type="time"
              value={dreamedTime}
              onChange={(event) => setDreamedTime(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dream-title">Title</Label>
          <Input
            id="dream-title"
            value={title}
            maxLength={80}
            placeholder="Optional"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dream-body">The dream</Label>
          <Textarea
            id="dream-body"
            value={body}
            placeholder="Write it as you remember it."
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <LinkFields id="dream-new" website={website} video={video} onWebsite={setWebsite} onVideo={setVideo} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!body.trim() || !dreamedOn}>
            Keep this dream
          </Button>
          <Button type="button" variant="ghost" onClick={() => setComposing(false)}>
            Close
          </Button>
        </div>
      </form>
      ) : null}

      <FilterDrawer active={filtering}>
        <LabelManager />
        <LabelFilter id="dream-label" value={labelId} onChange={setLabelId} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dream-from">From</Label>
            <Input id="dream-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dream-to">To</Label>
            <Input id="dream-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={!filtering}
          onClick={() => {
            setLabelId("");
            setFrom("");
            setTo("");
          }}
        >
          Show all
        </Button>
      </FilterDrawer>

      {dreams.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          {missing ? "That dream is no longer in the journal." : "No dreams written yet."}
        </p>
      ) : listed.length === 0 ? (
        <p className="mt-10 text-sm text-muted">Nothing in that range.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {missing ? <li className="text-sm text-muted">That dream is no longer in the journal.</li> : null}
          {listed.map((dream) => (
            <li key={dream.id}>
              <DreamRow
                dream={dream}
                open={openId === dream.id}
                onToggle={() => setOpenId((id) => (id === dream.id ? null : dream.id))}
                onSave={(patch) => updateDream(dream.id, patch)}
                onLabels={(ids) => setDreamLabels(dream.id, ids)}
                onDelete={() => deleteDream(dream.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RitualJournal({ rituals, focusId }: { rituals: Ritual[]; focusId?: string }) {
  const addRitual = useJournal((s) => s.addRitual);
  const updateRitual = useJournal((s) => s.updateRitual);
  const deleteRitual = useJournal((s) => s.deleteRitual);
  const importRituals = useJournal((s) => s.importRituals);
  const labels = useJournal((s) => s.labels);
  const setRitualLabels = useJournal((s) => s.setRitualLabels);
  const [openId, setOpenId] = useState<string | null>(focusId ?? null);
  const [labelId, setLabelId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [heldOn, setHeldOn] = useState(todayKey());
  const [heldTime, setHeldTime] = useState(nowTime());
  const [image, setImage] = useState<string | null>(null);
  const [consent, setConsent] = useState<UploadConsent | null>(null);
  const [website, setWebsite] = useState("");
  const [video, setVideo] = useState("");
  const [composing, setComposing] = useState(false);
  const [readingImage, setReadingImage] = useState(false);

  const filtered = useMemo(
    () =>
      rituals.filter((ritual) => {
        if (labelId && !(ritual.labelIds ?? []).includes(labelId)) return false;
        return inRange(ritual.heldOn, from, to);
      }),
    [rituals, labelId, from, to],
  );
  const listed = useMemo(() => {
    if (!focusId || filtered.some((ritual) => ritual.id === focusId)) return filtered;
    const focused = rituals.find((ritual) => ritual.id === focusId);
    return focused ? [focused, ...filtered] : filtered;
  }, [filtered, rituals, focusId]);
  const missing = Boolean(focusId) && !rituals.some((ritual) => ritual.id === focusId);
  const filtering = labelId !== "" || from !== "" || to !== "";

  useEffect(() => {
    if (focusId) setOpenId(focusId);
  }, [focusId]);

  const onPicture = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Choose a picture.");
      return;
    }
    const agreed = await requestUploadConsent();
    if (!agreed) return;
    setReadingImage(true);
    try {
      const next = await readJournalImage(file);
      if (next) {
        setImage(next);
        setConsent(agreed);
      }
    } finally {
      setReadingImage(false);
    }
  };

  const save = () => {
    if (!body.trim() || !heldOn) return;
    const links = readLinks(website, video);
    if (!links.ok) {
      toast(links.message);
      return;
    }
    const ritual = addRitual({
      title,
      body,
      heldOn,
      heldTime,
      image,
      websiteUrl: links.websiteUrl,
      videoUrl: links.videoUrl,
      ...(consent ? { consent } : {}),
    });
    setTitle("");
    setBody("");
    setHeldOn(todayKey());
    setHeldTime(nowTime());
    setImage(null);
    setConsent(null);
    setWebsite("");
    setVideo("");
    setOpenId(ritual.id);
    setComposing(false);
    toast("Ritual kept");
  };

  return (
    <>
      <div className="mt-8 grid grid-cols-2 gap-2">
        <Button type="button" className="w-full" onClick={() => setComposing((open) => !open)}>
          {composing ? "Close" : "New Journal Entry"}
        </Button>
        <BackupButtons
          className="w-full"
          onExport={() =>
            download("ritual-journal.json", {
              kind: "solace-ritual-journal",
              labels: catalogForBackup(labels),
              rituals: rituals.map(ritualToBackup),
            })
          }
          onImport={(file) => void restore(file, "solace-ritual-journal", "rituals", importRituals, ritualFromBackup)}
        />
      </div>
      {composing ? (
      <form
        className="mt-4 flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-border"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ritual-date">Date</Label>
            <Input
              id="ritual-date"
              type="date"
              value={heldOn}
              onChange={(event) => setHeldOn(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ritual-time">Time</Label>
            <Input
              id="ritual-time"
              type="time"
              value={heldTime}
              onChange={(event) => setHeldTime(event.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ritual-title">Title</Label>
          <Input
            id="ritual-title"
            value={title}
            maxLength={80}
            placeholder="Optional"
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ritual-body">The working</Label>
          <Textarea
            id="ritual-body"
            value={body}
            placeholder="Write what you did, or what it was for."
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <PictureField
          id="ritual-picture"
          image={image}
          busy={readingImage}
          onPicture={(file) => void onPicture(file)}
          onClear={() => {
            setImage(null);
            setConsent(null);
          }}
        />
        <LinkFields id="ritual-new" website={website} video={video} onWebsite={setWebsite} onVideo={setVideo} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!body.trim() || !heldOn || readingImage}>
            Keep this ritual
          </Button>
          <Button type="button" variant="ghost" onClick={() => setComposing(false)}>
            Close
          </Button>
        </div>
      </form>
      ) : null}

      <FilterDrawer active={filtering}>
        <LabelManager />
        <LabelFilter id="ritual-label" value={labelId} onChange={setLabelId} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ritual-from">From</Label>
            <Input id="ritual-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ritual-to">To</Label>
            <Input id="ritual-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </div>
        </div>
        <Button
          variant="secondary"
          disabled={!filtering}
          onClick={() => {
            setLabelId("");
            setFrom("");
            setTo("");
          }}
        >
          Show all
        </Button>
      </FilterDrawer>

      {rituals.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          {missing ? "That ritual is no longer in the journal." : "No rituals written yet."}
        </p>
      ) : listed.length === 0 ? (
        <p className="mt-10 text-sm text-muted">Nothing in that range.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {missing ? <li className="text-sm text-muted">That ritual is no longer in the journal.</li> : null}
          {listed.map((ritual) => (
            <li key={ritual.id}>
              <RitualRow
                ritual={ritual}
                open={openId === ritual.id}
                onToggle={() => setOpenId((id) => (id === ritual.id ? null : ritual.id))}
                onSave={(patch) => updateRitual(ritual.id, patch)}
                onLabels={(ids) => setRitualLabels(ritual.id, ids)}
                onDelete={() => deleteRitual(ritual.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function SolaceJournal({ conversations, focusId }: { conversations: Conversation[]; focusId?: string }) {
  const importConversations = useJournal((s) => s.importConversations);
  const deleteConversation = useJournal((s) => s.deleteConversation);
  const [openId, setOpenId] = useState<string | null>(focusId ?? null);
  const missing = Boolean(focusId) && !conversations.some((conversation) => conversation.id === focusId);
  useEffect(() => {
    if (focusId) setOpenId(focusId);
  }, [focusId]);

  return (
    <>
      <FilterDrawer active={false}>
        <p className="text-sm text-subtle">Saved conversations have no extra filters.</p>
      </FilterDrawer>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <BackupButtons
          className="w-full"
          onExport={() =>
            download("solace-journal.json", {
              kind: "solace-conversation-journal",
              conversations: conversations.map(conversationToBackup),
            })
          }
          onImport={(file) =>
            void restore(
              file,
              "solace-conversation-journal",
              "conversations",
              importConversations,
              conversationFromBackup,
              false,
            )
          }
        />
        <Button asChild variant="secondary" className="w-full">
          <Link to="/solace">
            <MessageCircle />
            Chat with Solace
          </Link>
        </Button>
      </div>
      {conversations.length === 0 ? (
        <p className="mt-10 text-sm text-muted">
          {missing ? "That chat is no longer in the journal." : "No conversations saved yet. Keep one from the Solace tab."}
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-2">
          {missing ? <li className="text-sm text-muted">That chat is no longer in the journal.</li> : null}
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow
                conversation={conversation}
                open={openId === conversation.id}
                onToggle={() => setOpenId((id) => (id === conversation.id ? null : conversation.id))}
                onDelete={() => deleteConversation(conversation.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function conversationPreview(conversation: Conversation) {
  const first = conversation.turns.find((turn) => turn.role === "user") ?? conversation.turns[0];
  const text = (first?.content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Conversation";
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

function OriginArt({ origin }: { origin: CardOrigin }) {
  const { user } = useCurrentUserState();
  const { data } = useQuery({
    queryKey: ["cards", origin.deckId],
    queryFn: () => listCards({ data: { deckId: origin.deckId } }),
    enabled: user !== null && !origin.imageUrl && origin.deckId != null && origin.cardId > 0,
    staleTime: 60_000,
  });
  const found = data?.find((card) => card.id === origin.cardId);
  const src = origin.imageUrl || found?.imageUrl || null;
  if (src) {
    return (
      <span className={cn("relative inline-block h-24 w-16 shrink-0", origin.orientation === "reversed" && "rotate-180")}>
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-md object-cover" />
        <VelomereBorder src={src} suit={origin.suit} className="rounded-md" />
      </span>
    );
  }
  return (
    <MiniCard
      className="shrink-0"
      card={{
        name: origin.cardName,
        suit: origin.suit || "custom",
        rank: origin.rank,
        keywords: origin.keywords,
        imageUrl: null,
      }}
      orientation={origin.orientation}
    />
  );
}

function OriginThumb({ origin }: { origin: CardOrigin }) {
  const art = <OriginArt origin={origin} />;
  if (origin.cardId > 0 && origin.deckId != null && origin.deckId > 0) {
    if (origin.from === "deck") {
      return (
        <Link
          to="/deck/$deckId"
          params={{ deckId: String(origin.deckId) }}
          search={{ card: origin.cardId }}
          aria-label={origin.cardName}
          className="shrink-0"
        >
          {art}
        </Link>
      );
    }
    return (
      <Link to="/journal" search={{ deck: origin.deckId, card: origin.cardId }} aria-label={origin.cardName} className="shrink-0">
        {art}
      </Link>
    );
  }
  return art;
}

function ConversationRow({
  conversation,
  open,
  onToggle,
  onDelete,
}: {
  conversation: Conversation;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const when = Number.isNaN(new Date(conversation.savedAt).getTime())
    ? conversation.savedAt
    : format(new Date(conversation.savedAt), "EEEE, MMMM d, yyyy · h:mm a");
  const origin = conversation.origin ?? null;
  const resume = () => {
    const sitting = sittingFromOrigin(origin);
    useSolace.getState().continueThread({
      journalId: conversation.id,
      turns: conversation.turns,
      title: sitting?.title,
      detail: sitting?.detail,
      source: origin,
    });
    void navigate({ to: "/solace" });
  };
  const openContinue = () => {
    const state = useSolace.getState();
    if (state.journalId === conversation.id) {
      void navigate({ to: "/solace" });
      return;
    }
    if (threadNeedsSave(state.messages, state.journalId)) {
      setConfirm(true);
      return;
    }
    resume();
  };
  return (
    <article className="rounded-xl bg-surface p-3 shadow-border sm:p-4">
      <div className="flex items-start gap-3">
        {origin?.kind === "card" ? <OriginThumb origin={origin} /> : null}
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm leading-relaxed text-fg">{conversationPreview(conversation)}</p>
            <p className="mt-1 text-xs text-subtle tabular-nums">{when}</p>
            {origin?.kind === "card" ? <p className="mt-0.5 text-xs text-muted">{origin.cardName}</p> : null}
          </div>
          <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {origin?.kind === "dream" ? (
        <Link to="/journal" search={{ dream: origin.entryId }} className="mt-2 inline-block text-xs text-fg underline-offset-2 hover:underline">
          Dream · {origin.title}
        </Link>
      ) : null}
      {origin?.kind === "ritual" ? (
        <Link to="/journal" search={{ ritual: origin.entryId }} className="mt-2 inline-block text-xs text-fg underline-offset-2 hover:underline">
          Ritual · {origin.title}
        </Link>
      ) : null}
      <Button type="button" variant="secondary" className="mt-3 w-full" onClick={openContinue}>
        Continue chat with Solace
      </Button>
      {conversation.vowAt ? (
        <p className="mt-3 text-[10px] leading-snug text-subtle/70">
          Vow of respect toward Solace.{" "}
          {Number.isNaN(new Date(conversation.vowAt).getTime())
            ? conversation.vowAt
            : format(new Date(conversation.vowAt), "MMM d, yyyy · h:mm a")}
        </p>
      ) : null}
      {open ? (
        <div className="mt-4 flex flex-col gap-3">
          {conversation.turns.map((turn, index) => (
            <div key={`${conversation.id}-${index}`} className={cn("flex", turn.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap",
                  turn.role === "user" ? "bg-fg text-bg" : "bg-raised text-fg",
                )}
              >
                {turn.role === "assistant" ? <p className="mb-1 font-display text-base tracking-tight">Solace</p> : null}
                {turn.content}
              </div>
            </div>
          ))}
          <div className="flex justify-end">
            <Button type="button" variant="secondary" size="sm" onClick={onDelete}>
              <Trash2 />
              Remove
            </Button>
          </div>
        </div>
      ) : null}
      <UnsavedChatDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onDiscard={() => {
          setConfirm(false);
          resume();
        }}
        onSave={() => {
          void (async () => {
            const result = await saveCurrentThread();
            if (result === "cancelled") return;
            if (result === "saved") toast("Saved to the journal");
            else if (result === "updated") toast("Journal entry updated");
            setConfirm(false);
            resume();
          })();
        }}
      />
    </article>
  );
}

function ReadingRow({ reading, onOpen }: { reading: Reading; onOpen: () => void }) {
  const suit = reading.suit || "custom";
  const deckName = reading.deckName || "Unknown deck";
  return (
    <article className="rounded-xl bg-surface p-3 shadow-border sm:p-4">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 text-left">
        <EntryArt reading={reading} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl tracking-tight">{reading.cardName}</p>
          <p className="mt-0.5 text-xs text-muted">
            {reading.manual ? "Physical" : reading.orientation === "reversed" ? "Reversed" : "Upright"}
            {suitLabel(suit) ? ` · ${suitLabel(suit)}` : ""}
            {" · "}
            {deckName}
          </p>
          <p className="mt-0.5 text-xs text-subtle tabular-nums">
            {format(new Date(reading.pulledAt), "MMM d, yyyy · h:mm a")}
          </p>
          <LabelDots ids={reading.labelIds} />
        </div>
      </button>
    </article>
  );
}

function EntryArt({ reading }: { reading: Reading }) {
  const { user } = useCurrentUserState();
  const { data } = useQuery({
    queryKey: ["cards", reading.deckId],
    queryFn: () => listCards({ data: { deckId: reading.deckId } }),
    enabled: user !== null && !reading.image && reading.deckId != null && reading.cardId > 0,
    staleTime: 60_000,
  });
  const found = data?.find((card) => card.id === reading.cardId);
  const photo = reading.image;
  const src = photo || found?.imageUrl || null;
  if (src) {
    return (
      <span className={cn("relative inline-block h-24 w-16 shrink-0", !photo && reading.orientation === "reversed" && "rotate-180")}>
        <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full rounded-md object-cover" />
        {!photo ? <VelomereBorder src={src} suit={reading.suit} className="rounded-md" /> : null}
      </span>
    );
  }
  return (
    <MiniCard
      card={{
        name: reading.cardName,
        suit: reading.suit || "custom",
        rank: reading.rank,
        keywords: reading.keywords,
        imageUrl: null,
      }}
      orientation={reading.orientation}
    />
  );
}

function ReadingDialog({
  reading,
  decks,
  onClose,
  onShowCard,
}: {
  reading: Reading | null;
  decks: DeckRecord[];
  onClose: () => void;
  onShowCard: (reading: Reading) => void;
}) {
  const updateReading = useJournal((s) => s.updateReading);
  const deleteReading = useJournal((s) => s.deleteReading);
  const readings = useJournal((s) => s.readings);
  const stored = useJournal((s) =>
    reading ? s.readings.find((item) => item.id === reading.id) : undefined,
  );
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [meaningOpen, setMeaningOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [question, setQuestion] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [meaning, setMeaning] = useState("");
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [website, setWebsite] = useState("");
  const [video, setVideo] = useState("");
  const [cardOpen, setCardOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const { user } = useCurrentUserState();
  const { data: deckCards } = useQuery({
    queryKey: ["cards", reading?.deckId],
    queryFn: () => listCards({ data: { deckId: reading?.deckId ?? 0 } }),
    enabled: user !== null && reading != null && reading.deckId != null && reading.cardId > 0,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!reading) return;
    setEditing(false);
    setMeaningOpen(false);
    setNotes(reading.notes ?? "");
    setQuestion(reading.question ?? "");
    setDay(dayKey(reading.pulledAt));
    setTime(timeKey(reading.pulledAt));
    setMeaning(reading.meaningSnapshot ?? "");
    setLabelIds(reading.labelIds ?? []);
    setWebsite(reading.websiteUrl ?? "");
    setVideo(reading.videoUrl ?? "");
    setCardOpen(false);
    setZoomed(false);
  }, [reading?.id]);

  if (!reading) return null;
  const shown = stored ?? reading;
  const found = resolveDeck(decks, shown);
  const missing = !shown.manual && decks.length > 0 && found == null;
  const sameKey = cardKeyFor(shown);
  const others = readings.filter((item) => item.id !== shown.id && cardKeyFor(item) === sameKey).length;
  const linked = deckCards?.find((card) => card.id === shown.cardId) ?? null;
  const artSrc = shown.image || linked?.imageUrl || null;
  const uprightText = linked?.upright || (shown.orientation !== "reversed" ? shown.meaningSnapshot : "");
  const reversedText = linked?.reversed || (shown.orientation === "reversed" ? shown.meaningSnapshot : "");
  const fill = (source: Reading) => {
    setNotes(source.notes ?? "");
    setQuestion(source.question ?? "");
    setDay(dayKey(source.pulledAt));
    setTime(timeKey(source.pulledAt));
    setMeaning(source.meaningSnapshot ?? "");
    setLabelIds(source.labelIds ?? []);
    setWebsite(source.websiteUrl ?? "");
    setVideo(source.videoUrl ?? "");
  };
  const save = () => {
    const links = readLinks(website, video);
    if (!links.ok) {
      toast(links.message);
      return;
    }
    updateReading(shown.id, {
      notes,
      question: question.trim(),
      pulledAt: stampFrom(day, time),
      meaningSnapshot: meaning,
      labelIds,
      websiteUrl: links.websiteUrl,
      videoUrl: links.videoUrl,
    });
    setEditing(false);
    toast("Entry saved");
  };
  const site = editing ? (cleanWebsite(website) ?? undefined) : shown.websiteUrl;
  const clip = editing ? (cleanYoutube(video) ?? undefined) : shown.videoUrl;

  return (
    <>
    <Dialog open={reading != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onPointerDownOutside={(event) => {
          if (cardOpen || zoomed) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (cardOpen || zoomed) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (!cardOpen && !zoomed) return;
          event.preventDefault();
          if (zoomed) setZoomed(false);
          else setCardOpen(false);
        }}
      >
        <DialogHeader>
          <DialogTitle>{shown.cardName}</DialogTitle>
          <DialogDescription>
            {format(new Date(shown.pulledAt), "MMM d, yyyy · h:mm a")}
            {shown.manual ? " · Physical" : shown.orientation === "reversed" ? " · Reversed" : " · Upright"}
            {shown.deckName ? ` · ${shown.deckName}` : ""}
          </DialogDescription>
        </DialogHeader>
        <PressImage
          label={shown.cardName}
          onOpen={() => setCardOpen(true)}
          onHold={() => setZoomed(true)}
        >
          <EntryArt reading={shown} />
        </PressImage>
        <p className="mt-2 text-xs text-subtle">Tap the card to open it. Hold it to fill the screen.</p>
        {editing ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-date">Date</Label>
                <Input id="entry-date" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entry-time">Time</Label>
                <Input id="entry-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entry-context">Context</Label>
              <Textarea id="entry-context" value={question} onChange={(event) => setQuestion(event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="entry-notes">Notes</Label>
              <Textarea id="entry-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </div>
            <LabelPicker ids={labelIds} onChange={setLabelIds} />
            <LinkFields id="entry" website={website} video={video} onWebsite={setWebsite} onVideo={setVideo} />
            <Disclosure open={meaningOpen} onToggle={() => setMeaningOpen((open) => !open)} label="Standard meaning">
              <Textarea value={meaning} onChange={(event) => setMeaning(event.target.value)} />
            </Disclosure>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            {missing ? (
              <div>
                <p className="text-sm leading-relaxed text-fg">This deck can't be found.</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  Would you like to align a digital card from one of your decks to this pull?
                </p>
                <AlignPull readingId={shown.id} />
              </div>
            ) : null}
            {shown.question ? (
              <div>
                <p className="text-xs tracking-[0.16em] text-subtle uppercase">Context</p>
                <p className="mt-2 text-sm leading-relaxed text-fg">{shown.question}</p>
              </div>
            ) : null}
            {shown.notes ? (
              <div>
                <p className="text-xs tracking-[0.16em] text-subtle uppercase">Notes</p>
                <MeaningText className="mt-2 text-sm leading-relaxed text-fg" text={shown.notes} />
              </div>
            ) : (
              <p className="text-sm text-subtle">No notes yet</p>
            )}
            <LabelDots ids={shown.labelIds} />
            <Disclosure open={meaningOpen} onToggle={() => setMeaningOpen((open) => !open)} label="Standard meaning">
              <MeaningText
                className="text-sm leading-relaxed text-fg"
                text={shown.meaningSnapshot || "No standard meaning was kept."}
              />
            </Disclosure>
            {others > 0 ? (
              <Button type="button" variant="secondary" className="w-full" onClick={() => onShowCard(shown)}>
                Other entries for this card
              </Button>
            ) : null}
          </div>
        )}
        <div className="mt-4">
          <ChatWithSolace
            sitting={cardSitting({
              name: shown.cardName,
              deckName: shown.deckName,
              orientation: shown.orientation,
              suit: shown.suit ? suitLabel(shown.suit) : "",
              rank: shown.rank,
              keywords: shown.keywords,
              question: editing ? question : shown.question,
              notes: editing ? notes : shown.notes,
              meaning: editing ? meaning : shown.meaningSnapshot,
              websiteUrl: site,
              videoUrl: clip,
            })}
            source={{
              kind: "card",
              from: "journal",
              cardName: shown.cardName,
              cardId: shown.cardId,
              deckId: shown.deckId,
              deckName: shown.deckName,
              suit: shown.suit,
              rank: shown.rank,
              orientation: shown.orientation,
              keywords: shown.keywords,
              imageUrl: shown.image,
              pulledAt: shown.pulledAt,
              question: editing ? question : shown.question,
              meaning: editing ? meaning : shown.meaningSnapshot,
              readingId: shown.id,
            }}
          />
        </div>
        <DialogFooter className="mt-4">
          {editing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  fill(shown);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={save}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="ghost" onClick={() => {
                deleteReading(shown.id);
                onClose();
              }}>
                <Trash2 />
                Remove
              </Button>
              {found && shown.cardId > 0 ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    void navigate({
                      to: "/deck/$deckId",
                      params: { deckId: String(found.id) },
                      search: { card: shown.cardId },
                    })
                  }
                >
                  View deck
                </Button>
              ) : null}
              <Button type="button" onClick={() => setEditing(true)}>
                Edit
              </Button>
            </>
          )}
        </DialogFooter>
        {site || clip || shown.consent ? (
          <div className="mt-4 flex flex-col gap-3">
            <EntryMedia websiteUrl={site} videoUrl={clip} />
            <ConsentLine consent={shown.consent} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
    <EntryPicture
      open={cardOpen}
      title={shown.cardName}
      detail={[
        shown.manual ? "Physical" : shown.orientation === "reversed" ? "Reversed" : "Upright",
        shown.suit ? suitLabel(shown.suit) : "",
        shown.rank,
      ]
        .filter(Boolean)
        .join(" · ")}
      src={artSrc}
      reversed={!shown.image && shown.orientation === "reversed"}
      suit={shown.suit}
      keywords={linked?.keywords || shown.keywords}
      upright={uprightText}
      reversedText={reversedText}
      onClose={() => setCardOpen(false)}
      onEnlarge={() => setZoomed(true)}
    />
    {zoomed ? (
      <ArtZoom
        card={{
          name: shown.cardName,
          suit: shown.suit || "custom",
          rank: shown.rank,
          keywords: linked?.keywords || shown.keywords,
          imageUrl: artSrc,
          imageScale: linked?.imageScale ?? 100,
          imageX: linked?.imageX ?? 0,
          imageY: linked?.imageY ?? 0,
          imageRadius: linked?.imageRadius ?? 2,
        }}
        orientation={shown.image ? "upright" : shown.orientation}
        onClose={() => setZoomed(false)}
      />
    ) : null}
    </>
  );
}

function PressImage({
  label,
  onOpen,
  onHold,
  children,
}: {
  label: string;
  onOpen: () => void;
  onHold: () => void;
  children: ReactNode;
}) {
  const press = useRef<{ x: number; y: number; moved: boolean; held: boolean; timer: number } | null>(null);
  const clear = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className="w-fit cursor-pointer select-none"
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const active = { x: event.clientX, y: event.clientY, moved: false, held: false, timer: 0 };
        active.timer = window.setTimeout(() => {
          if (!press.current || press.current.moved) return;
          press.current.held = true;
          onHold();
        }, 360);
        press.current = active;
      }}
      onPointerMove={(event) => {
        const active = press.current;
        if (!active || active.moved) return;
        if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) {
          active.moved = true;
          window.clearTimeout(active.timer);
        }
      }}
      onPointerUp={() => {
        const active = press.current;
        clear();
        if (active && !active.moved && !active.held) onOpen();
      }}
      onPointerCancel={clear}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

function EntryPicture({
  open,
  title,
  detail,
  src,
  reversed,
  suit,
  keywords,
  upright,
  reversedText,
  onClose,
  onEnlarge,
}: {
  open: boolean;
  title: string;
  detail?: string;
  src: string | null;
  reversed?: boolean;
  suit?: string;
  keywords?: string;
  upright?: string;
  reversedText?: string;
  onClose: () => void;
  onEnlarge: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {detail ? <DialogDescription>{detail}</DialogDescription> : null}
        </DialogHeader>
        {src ? (
          <PressImage label={title} onOpen={() => undefined} onHold={onEnlarge}>
            <span className={cn("relative mx-auto block", reversed && "rotate-180")}>
              <img src={src} alt="" draggable={false} className="mx-auto max-h-[40dvh] w-auto max-w-full rounded-md object-contain" />
              <VelomereBorder src={src} suit={suit} className="rounded-md" />
            </span>
          </PressImage>
        ) : null}
        <p className="text-center text-xs text-subtle">Hold the card to enlarge.</p>
        {keywords ? <p className="text-sm leading-relaxed text-muted">{keywords}</p> : null}
        {upright ? (
          <div>
            <p className="text-xs tracking-[0.16em] text-subtle uppercase">Upright</p>
            <MeaningText className="mt-2 text-sm leading-relaxed text-fg" text={upright} />
          </div>
        ) : null}
        {reversedText ? (
          <div>
            <p className="text-xs tracking-[0.16em] text-subtle uppercase">Reversed</p>
            <MeaningText className="mt-2 text-sm leading-relaxed text-fg" text={reversedText} />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DreamRow({
  dream,
  open,
  onToggle,
  onSave,
  onLabels,
  onDelete,
}: {
  dream: Dream;
  open: boolean;
  onToggle: () => void;
  onSave: (patch: {
    title: string;
    body: string;
    dreamedOn: string;
    dreamedTime: string;
    websiteUrl?: string;
    videoUrl?: string;
  }) => void;
  onLabels: (ids: string[]) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(dream.title);
  const [body, setBody] = useState(dream.body);
  const [dreamedOn, setDreamedOn] = useState(dream.dreamedOn);
  const [dreamedTime, setDreamedTime] = useState(dream.dreamedTime ?? "");
  const [website, setWebsite] = useState(dream.websiteUrl ?? "");
  const [video, setVideo] = useState(dream.videoUrl ?? "");
  const site = cleanWebsite(website) ?? undefined;
  const clip = cleanYoutube(video) ?? undefined;
  return (
    <article className="rounded-xl bg-surface p-3 shadow-border sm:p-4">
      <button type="button" onClick={onToggle} className="w-full text-left">
        <p className="font-display text-xl tracking-tight">{dream.title || "Untitled dream"}</p>
        <p className="mt-0.5 text-xs text-muted tabular-nums">
          {whenLabel(dream.dreamedOn, dream.dreamedTime)}
        </p>
        <LabelDots ids={dream.labelIds} />
        {!open && dream.body ? <p className="mt-2 line-clamp-2 text-sm text-muted">{dream.body}</p> : null}
      </button>
      {open ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" aria-label="Date" value={dreamedOn} onChange={(event) => setDreamedOn(event.target.value)} />
            <Input type="time" aria-label="Time" value={dreamedTime} onChange={(event) => setDreamedTime(event.target.value)} />
          </div>
          <Input value={title} maxLength={80} placeholder="Title" onChange={(event) => setTitle(event.target.value)} />
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} />
          <LinkFields id={`dream-${dream.id}`} website={website} video={video} onWebsite={setWebsite} onVideo={setVideo} />
          <LabelPicker ids={dream.labelIds} onChange={onLabels} />
          <ChatWithSolace
            sitting={dreamSitting({
              title,
              dreamedOn,
              dreamedTime,
              body,
              websiteUrl: site,
              videoUrl: clip,
            })}
            source={{ kind: "dream", entryId: dream.id, title: title.trim() || "A dream" }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 />
              Remove
            </Button>
            <Button
              size="sm"
              disabled={!body.trim() || !dreamedOn}
              onClick={() => {
                const links = readLinks(website, video);
                if (!links.ok) {
                  toast(links.message);
                  return;
                }
                onSave({
                  title,
                  body,
                  dreamedOn,
                  dreamedTime,
                  websiteUrl: links.websiteUrl,
                  videoUrl: links.videoUrl,
                });
              }}
            >
              Save
            </Button>
          </div>
          <EntryMedia websiteUrl={site} videoUrl={clip} />
          <ConsentLine consent={dream.consent} />
        </div>
      ) : null}
    </article>
  );
}

function RitualRow({
  ritual,
  open,
  onToggle,
  onSave,
  onLabels,
  onDelete,
}: {
  ritual: Ritual;
  open: boolean;
  onToggle: () => void;
  onSave: (patch: {
    title: string;
    body: string;
    heldOn: string;
    heldTime: string;
    image: string | null;
    websiteUrl?: string;
    videoUrl?: string;
    consent?: UploadConsent;
  }) => void;
  onLabels: (ids: string[]) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(ritual.title);
  const [body, setBody] = useState(ritual.body);
  const [heldOn, setHeldOn] = useState(ritual.heldOn);
  const [heldTime, setHeldTime] = useState(ritual.heldTime ?? "");
  const [image, setImage] = useState<string | null>(ritual.image);
  const [consent, setConsent] = useState<UploadConsent | null>(null);
  const [website, setWebsite] = useState(ritual.websiteUrl ?? "");
  const [video, setVideo] = useState(ritual.videoUrl ?? "");
  const [pictureOpen, setPictureOpen] = useState(false);
  const [pictureZoom, setPictureZoom] = useState(false);
  const [readingImage, setReadingImage] = useState(false);
  const site = cleanWebsite(website) ?? undefined;
  const clip = cleanYoutube(video) ?? undefined;

  const onPicture = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Choose a picture.");
      return;
    }
    const agreed = await requestUploadConsent();
    if (!agreed) return;
    setReadingImage(true);
    try {
      const next = await readJournalImage(file);
      if (next) {
        setImage(next);
        setConsent(agreed);
      }
    } finally {
      setReadingImage(false);
    }
  };

  return (
    <article className="rounded-xl bg-surface p-3 shadow-border sm:p-4">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 text-left">
        {ritual.image ? (
          <img src={ritual.image} alt="" loading="lazy" decoding="async" className="h-16 w-16 shrink-0 rounded-md object-cover" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="block font-display text-xl tracking-tight">{ritual.title || "Untitled ritual"}</span>
          <span className="mt-0.5 block text-xs text-muted tabular-nums">
            {whenLabel(ritual.heldOn, ritual.heldTime)}
          </span>
          <LabelDots ids={ritual.labelIds} />
          {!open && ritual.body ? <span className="mt-2 block line-clamp-2 text-sm text-muted">{ritual.body}</span> : null}
        </span>
      </button>
      {open ? (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" aria-label="Date" value={heldOn} onChange={(event) => setHeldOn(event.target.value)} />
            <Input type="time" aria-label="Time" value={heldTime} onChange={(event) => setHeldTime(event.target.value)} />
          </div>
          <Input value={title} maxLength={80} placeholder="Title" onChange={(event) => setTitle(event.target.value)} />
          <Textarea value={body} onChange={(event) => setBody(event.target.value)} />
          <PictureField
            id={`ritual-picture-${ritual.id}`}
            image={image}
            busy={readingImage}
            onPicture={(file) => void onPicture(file)}
            onClear={() => {
              setImage(null);
              setConsent(null);
            }}
            onOpen={image ? () => setPictureOpen(true) : undefined}
            onHold={image ? () => setPictureZoom(true) : undefined}
          />
          <LinkFields id={`ritual-${ritual.id}`} website={website} video={video} onWebsite={setWebsite} onVideo={setVideo} />
          <LabelPicker ids={ritual.labelIds} onChange={onLabels} />
          <ChatWithSolace
            sitting={ritualSitting({
              title,
              heldOn,
              heldTime,
              body,
              websiteUrl: site,
              videoUrl: clip,
            })}
            source={{ kind: "ritual", entryId: ritual.id, title: title.trim() || "A ritual" }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 />
              Remove
            </Button>
            <Button
              size="sm"
              disabled={!body.trim() || !heldOn || readingImage}
              onClick={() => {
                const links = readLinks(website, video);
                if (!links.ok) {
                  toast(links.message);
                  return;
                }
                onSave({
                  title,
                  body,
                  heldOn,
                  heldTime,
                  image,
                  websiteUrl: links.websiteUrl,
                  videoUrl: links.videoUrl,
                  ...(consent ? { consent } : {}),
                });
              }}
            >
              Save
            </Button>
          </div>
          <EntryMedia websiteUrl={site} videoUrl={clip} />
          <ConsentLine consent={consent ?? ritual.consent} />
        </div>
      ) : null}
      <EntryPicture
        open={pictureOpen}
        title={title.trim() || "Picture"}
        src={image}
        onClose={() => setPictureOpen(false)}
        onEnlarge={() => setPictureZoom(true)}
      />
      {pictureZoom && image ? (
        <ArtZoom
          card={{
            name: title.trim() || "Picture",
            suit: "custom",
            rank: "",
            keywords: "",
            imageUrl: image,
            imageScale: 100,
            imageX: 0,
            imageY: 0,
            imageRadius: 2,
          }}
          orientation="upright"
          onClose={() => setPictureZoom(false)}
        />
      ) : null}
    </article>
  );
}

function BackupButtons({
  onExport,
  onImport,
  className,
  compact = false,
}: {
  onExport: () => void;
  onImport: (file: File) => void;
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={className}>
      <Button
        type="button"
        variant="secondary"
        className={cn("w-full", compact && "h-auto min-h-11 whitespace-normal px-2 text-center text-xs leading-tight")}
        onClick={() => setOpen(true)}
      >
        <ArrowDownUp />
        Export / Import
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export or import</DialogTitle>
            <DialogDescription>Choose what to do with this journal.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                onExport();
              }}
            >
              <Download />
              Export
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                input.current?.click();
              }}
            >
              <Upload />
              Import
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onImport(file);
        }}
      />
    </div>
  );
}

function groupByDay(readings: Reading[]): [string, Reading[]][] {
  const map = new Map<string, Reading[]>();
  for (const reading of readings) {
    const key = format(new Date(reading.pulledAt), "EEEE, MMMM d, yyyy");
    const list = map.get(key);
    if (list) list.push(reading);
    else map.set(key, [reading]);
  }
  return [...map.entries()];
}

function cardKeyFor(reading: Reading) {
  if (reading.cardId > 0 && reading.deckId) return `id:${reading.deckId}:${reading.cardId}`;
  return `name:${reading.deckName || "Unknown deck"}:${reading.cardName}`;
}

async function readJournalImage(file: File | undefined) {
  if (!file) return null;
  if (!file.type.startsWith("image/")) {
    toast("Choose a picture.");
    return null;
  }
  try {
    const url = await fileToDataUrl(file, 960);
    if (url.length > 1_500_000) {
      toast("That picture is too large.");
      return null;
    }
    return url;
  } catch {
    toast("Could not read that picture.");
    return null;
  }
}

function PictureField({
  id,
  image,
  busy,
  onPicture,
  onClear,
  onOpen,
  onHold,
}: {
  id: string;
  image: string | null;
  busy: boolean;
  onPicture: (file: File | undefined) => void;
  onClear: () => void;
  onOpen?: () => void;
  onHold?: () => void;
}) {
  const picture = image ? (
    <img src={image} alt="" draggable={false} className="max-h-56 w-full rounded-lg object-contain" />
  ) : null;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Picture</Label>
      {image ? (
        <div className="flex flex-col gap-2">
          {onOpen && onHold ? (
            <PressImage label="Picture" onOpen={onOpen} onHold={onHold}>
              {picture}
            </PressImage>
          ) : (
            picture
          )}
          <Button type="button" variant="secondary" onClick={onClear}>
            Remove picture
          </Button>
        </div>
      ) : (
        <FilePicker
          id={id}
          accept="image/*"
          disabled={busy}
          label="Choose picture"
          onFile={(file) => onPicture(file)}
        />
      )}
    </div>
  );
}

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function whenLabel(day: string, time: string | undefined) {
  const date = format(new Date(`${day}T12:00:00`), "EEEE, MMMM d, yyyy");
  if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return date;
  const [hours, minutes] = time.split(":").map(Number);
  return `${date} · ${format(new Date(2000, 0, 1, hours, minutes), "h:mm a")}`;
}

function Disclosure({
  open,
  onToggle,
  label,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-lg bg-raised px-3 py-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="text-sm text-fg">{label}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="px-1 pt-3">{children}</div> : null}
    </div>
  );
}

function dayKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function timeKey(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "12:00";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function stampFrom(day: string, time: string) {
  const [year, month, date] = day.split("-").map(Number);
  const [hours, minutes] = (time || "12:00").split(":").map(Number);
  if (!year || !month || !date) return new Date().toISOString();
  const stamped = new Date(year, month - 1, date, hours || 0, minutes || 0, 0, 0);
  return Number.isNaN(stamped.getTime()) ? new Date().toISOString() : stamped.toISOString();
}

function inRange(day: string, from: string, to: string) {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function restore<T>(
  file: File,
  kind: string | readonly string[],
  key: string,
  accept: (items: T[]) => void,
  parse: (value: unknown) => T | null,
  acknowledge = true,
) {
  try {
    const parsed = JSON.parse(await file.text()) as unknown;
    const kinds = typeof kind === "string" ? [kind] : kind;
    const found = parsed && typeof parsed === "object" ? (parsed as { kind?: string }).kind : undefined;
    if (!found || !kinds.includes(found)) {
      throw new Error("That file is not a backup of this journal.");
    }
    const list = (parsed as Record<string, unknown>)[key];
    if (!Array.isArray(list)) throw new Error("That backup has no entries.");
    const items = list.map(parse).filter((item): item is T => item != null);
    if (items.length === 0) throw new Error("That backup has no entries.");
    let next = items;
    if (acknowledge) {
      const consent = await requestUploadConsent();
      if (!consent) return;
      next = items.map((item) => ({ ...item, consent }) as T);
    }
    accept(next);
    const rawLabels = (parsed as Record<string, unknown>).labels;
    if (Array.isArray(rawLabels)) {
      useJournal.getState().importLabels(
        rawLabels.map(labelFromBackup).filter((item): item is JournalLabel => item != null),
      );
    }
    toast(`Restored ${items.length} ${items.length === 1 ? "entry" : "entries"}`);
  } catch (err) {
    toast(err instanceof Error ? err.message : "Could not import that file.");
  }
}

function catalogForBackup(labels: JournalLabel[] | undefined) {
  return (labels ?? [])
    .map((label) => labelFromBackup(label))
    .filter((label): label is JournalLabel => label != null);
}

function resolveDeck(decks: DeckRecord[], reading: Reading) {
  if (reading.deckId != null) {
    const byId = decks.find((deck) => deck.id === reading.deckId);
    if (byId) return byId;
  }
  const name = (reading.deckName ?? "").trim();
  if (!name) return null;
  const named = decks.filter((deck) => deck.name === name);
  return named.length === 1 ? named[0] : null;
}

function LabelManager() {
  const labels = useJournal((s) => s.labels) ?? [];
  const addLabel = useJournal((s) => s.addLabel);
  const deleteLabel = useJournal((s) => s.deleteLabel);
  const [name, setName] = useState("");
  const [color, setColor] = useState(LABEL_COLORS[0]);
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl bg-bg">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-sm text-fg">Labels</span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-subtle">
            {open ? "Hide" : labels.length === 0 ? "None" : String(labels.length)}
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? (
        <div className="px-4 pb-4">
          {labels.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {labels.map((label) => (
                <li key={label.id} className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm">{label.name}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => deleteLabel(label.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">A label can mark a card, a dream, or a ritual.</p>
          )}
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const created = addLabel(name, color);
              if (!created) return;
              setName("");
              toast("Label kept");
            }}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="label-name">New label</Label>
              <Input
                id="label-name"
                value={name}
                maxLength={32}
                placeholder="A name you choose"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Label color">
              {LABEL_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={swatch}
                  aria-pressed={color === swatch}
                  className={cn(
                    "size-8 rounded-full",
                    color === swatch && "outline outline-2 outline-offset-2 outline-fg",
                  )}
                  style={{ backgroundColor: swatch }}
                  onClick={() => setColor(swatch)}
                />
              ))}
            </div>
            <Button type="submit" variant="secondary" disabled={!name.trim()}>
              Add label
            </Button>
          </form>
        </div>
      ) : null}
    </section>
  );
}

function LabelFilter({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const labels = useJournal((s) => s.labels) ?? [];
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Label</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
      >
        <option value="">All labels</option>
        {labels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function LabelDots({ ids }: { ids: string[] | undefined }) {
  const labels = useJournal((s) => s.labels) ?? [];
  const chosen = labels.filter((label) => (ids ?? []).includes(label.id));
  if (chosen.length === 0) return null;
  return (
    <span className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={chosen.map((label) => label.name).join(", ")}>
      {chosen.map((label) => (
        <span
          key={label.id}
          title={label.name}
          className="size-2.5 rounded-full"
          style={{ backgroundColor: label.color }}
        />
      ))}
    </span>
  );
}

function LabelPicker({ ids, onChange }: { ids: string[] | undefined; onChange: (ids: string[]) => void }) {
  const labels = useJournal((s) => s.labels) ?? [];
  if (labels.length === 0) return null;
  const selected = ids ?? [];
  return (
    <div>
      <p className="text-xs tracking-[0.16em] text-subtle uppercase">Labels</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {labels.map((label) => {
          const on = selected.includes(label.id);
          return (
            <button
              key={label.id}
              type="button"
              aria-pressed={on}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm",
                on ? "bg-fg text-bg" : "bg-raised text-fg",
              )}
              onClick={() => onChange(on ? selected.filter((id) => id !== label.id) : [...selected, label.id])}
            >
              <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} />
              {label.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AlignPull({ readingId }: { readingId: string }) {
  const alignReading = useJournal((s) => s.alignReading);
  const { user } = useCurrentUserState();
  const { data: decks } = useQuery({
    queryKey: ["decks"],
    queryFn: () => listDecks(),
    enabled: user !== null,
  });
  const [deckId, setDeckId] = useState("");
  const [cardId, setCardId] = useState("");
  const chosen = deckId ? Number(deckId) : null;
  const { data: cards, isLoading } = useQuery({
    queryKey: ["cards", chosen],
    queryFn: () => listCards({ data: { deckId: chosen } }),
    enabled: user !== null && chosen != null,
  });
  const ordered = useMemo(
    () => [...(cards ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [cards],
  );

  const save = () => {
    const deck = decks?.find((item) => String(item.id) === deckId);
    const card = ordered.find((item) => String(item.id) === cardId);
    if (!deck || !card) return;
    alignReading(readingId, {
      deckId: deck.id,
      deckName: deck.name,
      cardId: card.id,
      cardName: card.name,
      suit: card.suit,
      rank: card.rank,
      keywords: card.keywords,
    });
    toast("Pull aligned");
  };

  if (decks && decks.length === 0) {
    return <p className="mt-3 text-sm text-muted">You don't have a deck to align this with.</p>;
  }

  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`align-deck-${readingId}`}>Your deck</Label>
        <select
          id={`align-deck-${readingId}`}
          value={deckId}
          onChange={(event) => {
            setDeckId(event.target.value);
            setCardId("");
          }}
          className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
        >
          <option value="">Choose a deck</option>
          {(decks ?? []).map((deck) => (
            <option key={deck.id} value={deck.id}>
              {deck.name}
            </option>
          ))}
        </select>
      </div>
      {chosen != null ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`align-card-${readingId}`}>Card</Label>
          <select
            id={`align-card-${readingId}`}
            value={cardId}
            onChange={(event) => setCardId(event.target.value)}
            disabled={isLoading || ordered.length === 0}
            className="h-11 rounded-md bg-raised px-3 text-sm text-fg shadow-border"
          >
            <option value="">{isLoading ? "Loading cards…" : ordered.length === 0 ? "This deck has no cards" : "Choose a card"}</option>
            {ordered.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Button type="submit" disabled={!deckId || !cardId}>
        Align this pull
      </Button>
    </form>
  );
}
