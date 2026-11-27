"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { BookOpen, ChevronDown, Lock, LockOpen, PenLine, Repeat, Shuffle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ArtZoom } from "@/components/art-zoom";
import { ChatWithSolace, LinkFields } from "@/components/entry-links";
import { FilePicker } from "@/components/file-picker";
import { DendriteEncounter } from "@/components/dendrite-encounter";
import { MeaningText } from "@/components/meaning-text";
import { PhysicalCard } from "@/components/tarot-card";
import { requestUploadConsent } from "@/components/upload-consent";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { listCards, listDecks, updateCardMeaning } from "@/lib/cards/server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cutCards, shuffleCards } from "@/lib/cards/order";
import { edgeLook } from "@/lib/cards/edge";
import { cardFrame } from "@/lib/cards/shape";
import { cutDepth, cutPace, cutSections, latchShuffleCount, SHUFFLE_MAX, SHUFFLE_MIN } from "@/lib/cards/shuffle-count";
import { suitLabel, type Card } from "@/lib/cards/types";
import labels from "@/lib/cards/d3-labels.json";
import { cn } from "@/lib/utils";
import { buildArchive, restoreArchive } from "@/lib/archive";
import { readLinks } from "@/lib/links";
import { cardSitting } from "@/lib/solace/sitting";
import {
  clearTableReturn,
  markTableReturnShown,
  noteTableReturnMounted,
  noteTableReturnUnmounted,
  peekTableReturn,
  tableReturnShownKey,
} from "@/lib/table-return";
import { applyStarterDecks, useJournal, type Orientation, type Reading } from "@/lib/journal/store";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Phase = "still" | "shuffling" | "cutting" | "ready" | "drawn";
type CutBeat = "aside" | "drop" | "tuck";

function cutRatio(event: ReactPointerEvent<HTMLButtonElement>) {
  const button = event.currentTarget;
  const face = button.parentElement?.querySelector(".deck-top");
  const localY = event.nativeEvent.offsetY;
  if (face instanceof HTMLElement && face.offsetHeight > 0) {
    const faceTop = face.offsetTop - button.offsetTop;
    const y = (localY - faceTop) / face.offsetHeight;
    const clamped = Math.min(1, Math.max(0, y));
    if (clamped <= 0.03) return 0;
    if (clamped >= 0.9) return 1;
    return clamped;
  }
  return Math.min(1, Math.max(0, localY / Math.max(button.offsetHeight, 1)));
}

function storyNumber(name: string) {
  const index = labels.findIndex((row) => row.name === name);
  return index + 1;
}

export function ReadingTable() {
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const activeDeckId = useJournal((s) => s.activeDeckId);
  const ensureActiveLook = useJournal((s) => s.ensureActiveLook);
  const { data: decks } = useQuery({
    queryKey: ["decks"],
    queryFn: () => listDecks(),
    enabled: user !== null,
  });
  useEffect(() => {
    if (!decks) return;
    applyStarterDecks(decks);
    const active = decks.find((item) => item.active);
    if (active) ensureActiveLook(active.id);
  }, [decks, ensureActiveLook]);
  const active =
    decks?.find((item) => item.active) ?? decks?.find((item) => item.id === activeDeckId);
  const { data: cards, isLoading, isError, refetch } = useQuery({
    queryKey: ["cards", "table", activeDeckId],
    queryFn: () => listCards({ data: { deckId: activeDeckId } }),
    refetchOnMount: "always",
    enabled: user !== null,
  });
  const includeReversals = useJournal((s) => s.includeReversals);
  const setIncludeReversals = useJournal((s) => s.setIncludeReversals);
  const savedLook = useJournal((s) => {
    const id = s.activeDeckId;
    return id != null ? s.deckLooks[String(id)] : undefined;
  });
  const flatEdge = useJournal((s) => s.edge);
  const flatEdgeColor = useJournal((s) => s.edgeColor);
  const flatEdgeSat = useJournal((s) => s.edgeSat);
  const flatEdgeLight = useJournal((s) => s.edgeLight);
  const flatThickness = useJournal((s) => s.cardThickness);
  const flatRadius = useJournal((s) => s.cardRadius);
  const flatWidth = useJournal((s) => s.cardWidth);
  const flatLength = useJournal((s) => s.cardLength);
  const flatTemplate = useJournal((s) => s.cardTemplate);
  const flatBack = useJournal((s) => s.cardBack);
  const flatBackX = useJournal((s) => s.backX);
  const flatBackY = useJournal((s) => s.backY);
  const flatBackScale = useJournal((s) => s.backScale);
  const flatBackRotate = useJournal((s) => s.backRotate);
  const edge = savedLook?.edge ?? flatEdge;
  const edgeColor = savedLook?.edgeColor ?? flatEdgeColor;
  const edgeSat = savedLook?.edgeSat ?? flatEdgeSat;
  const edgeLight = savedLook?.edgeLight ?? flatEdgeLight;
  const cardThickness = savedLook?.cardThickness ?? flatThickness;
  const cardRadius = savedLook?.cardRadius ?? flatRadius;
  const cardWidth = savedLook?.cardWidth ?? flatWidth;
  const cardLength = savedLook?.cardLength ?? flatLength;
  const cardTemplate = savedLook?.cardTemplate ?? flatTemplate;
  const cardBack = savedLook?.cardBack ?? flatBack;
  const backX = savedLook?.backX ?? flatBackX;
  const backY = savedLook?.backY ?? flatBackY;
  const backScale = savedLook?.backScale ?? flatBackScale;
  const backRotate = savedLook?.backRotate ?? flatBackRotate;
  const flatTableImage = useJournal((s) => s.tableImage);
  const flatTableX = useJournal((s) => s.tableX);
  const flatTableY = useJournal((s) => s.tableY);
  const flatTableScale = useJournal((s) => s.tableScale);
  const flatTableRotate = useJournal((s) => s.tableRotate);
  const flatTableColor = useJournal((s) => s.tableColor);
  const flatTableSat = useJournal((s) => s.tableSat);
  const flatTableLight = useJournal((s) => s.tableLight);
  const flatTableContrast = useJournal((s) => s.tableContrast);
  const flatTableVignette = useJournal((s) => s.tableVignette);
  const table = {
    image: savedLook?.tableImage ?? flatTableImage,
    x: savedLook?.tableX ?? flatTableX,
    y: savedLook?.tableY ?? flatTableY,
    scale: savedLook?.tableScale ?? flatTableScale,
    rotate: savedLook?.tableRotate ?? flatTableRotate,
    color: savedLook?.tableColor ?? flatTableColor,
    saturation: savedLook?.tableSat ?? flatTableSat,
    luminous: savedLook?.tableLight ?? flatTableLight,
    contrast: savedLook?.tableContrast ?? flatTableContrast,
    vignette: savedLook?.tableVignette ?? flatTableVignette,
  };
  const addReading = useJournal((s) => s.addReading);
  const shuffleLocked = useJournal((s) => s.shuffleLocked);
  const setShuffleLocked = useJournal((s) => s.setShuffleLocked);
  const [question, setQuestion] = useState("");
  const [pullLabels, setPullLabels] = useState<string[]>([]);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [descEdit, setDescEdit] = useState(false);
  const [descUpright, setDescUpright] = useState("");
  const [descReversed, setDescReversed] = useState("");
  const [savingMeaning, setSavingMeaning] = useState(false);
  const questionRef = useRef("");
  const labels = useJournal((s) => s.labels) ?? [];
  questionRef.current = question;

  const deck = useMemo(() => cards ?? [], [cards]);

  const [phase, setPhase] = useState<Phase>("still");
  const [order, setOrder] = useState<Card[]>([]);
  const [origin, setOrigin] = useState(0);
  const [cutPreview, setCutPreview] = useState<number | null>(null);
  const [cutBeat, setCutBeat] = useState<CutBeat | null>(null);
  const cutLock = useRef(false);
  const shuffleRun = useRef(0);
  const shuffleTimers = useRef<number[]>([]);
  const holding = useRef(false);
  const runKind = useRef<"count" | "hold" | null>(null);
  const [held, setHeld] = useState(false);
  const [worked, setWorked] = useState(false);
  const [cutMotion, setCutMotion] = useState<number | null>(null);
  const [drawn, setDrawn] = useState<{
    card: Card;
    orientation: Orientation;
    pulledAt: string;
    question: string;
    reading: Reading | null;
  } | null>(null);
  const [meetWith, setMeetWith] = useState<{ number: number; name: string } | null>(null);
  const [shuffleCount, setShuffleCount] = useState(3);
  const [hand, setHand] = useState<"right" | "left">("right");
  const [shufflingTimes, setShufflingTimes] = useState(1);
  const [shuffleStep, setShuffleStep] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [panel, setPanel] = useState<"meaning" | "journal" | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [backedUp, setBackedUp] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const queryClient = useQueryClient();
  const orderRef = useRef<Card[]>([]);
  const appliedReturn = useRef<string | null>(null);
  const flyTimer = useRef<number | null>(null);
  const [launching, setLaunching] = useState(false);
  orderRef.current = order;

  const clearShuffle = () => {
    for (const id of shuffleTimers.current) window.clearTimeout(id);
    shuffleTimers.current = [];
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("lumen-hand");
    if (saved === "left" || saved === "right") setHand(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("lumen-hand", hand);
  }, [hand]);

  useEffect(() => {
    noteTableReturnMounted();
    return () => noteTableReturnUnmounted();
  }, []);

  useEffect(() => {
    const request = peekTableReturn();
    const shown = tableReturnShownKey();
    if (request && activeDeckId === request.deckId) {
      if (deck.length === 0) return;
      const card = deck.find((item) => item.id === request.cardId);
      const key = `${request.deckId}:${request.cardId}:${request.pulledAt}`;
      if (!card) {
        clearTableReturn();
        toast("That card is no longer in this deck.");
      } else if (appliedReturn.current !== key) {
        appliedReturn.current = key;
        markTableReturnShown(key);
        const reading = request.readingId
          ? (useJournal.getState().readings ?? []).find((item) => item.id === request.readingId) ?? null
          : null;
        setOrder([card, ...deck.filter((item) => item.id !== card.id)]);
        setOrigin(0);
        setDrawn({
          card,
          orientation: request.orientation,
          pulledAt: request.pulledAt || new Date().toISOString(),
          question: request.question ?? "",
          reading,
        });
        setPhase("drawn");
        setFlipped(false);
        window.setTimeout(() => setFlipped(true), 80);
        setCutPreview(null);
        setCutBeat(null);
        setCutMotion(null);
        holding.current = false;
        runKind.current = null;
        setHeld(false);
        setWorked(false);
        return;
      } else {
        return;
      }
    }
    if (shown && shown.startsWith(`${activeDeckId}:`)) return;
    shuffleRun.current += 1;
    clearShuffle();
    setOrder(shuffleCards(deck));
    setOrigin(0);
    setDrawn(null);
    setFlipped(false);
    setPhase("still");
    setCutPreview(null);
    setCutBeat(null);
    setCutMotion(null);
    holding.current = false;
    runKind.current = null;
    setHeld(false);
    setWorked(false);
  }, [deck, activeDeckId]);

  useEffect(() => {
    return () => {
      shuffleRun.current += 1;
      for (const id of shuffleTimers.current) window.clearTimeout(id);
    };
  }, []);

  const settleShuffle = () => {
    setCutPreview(null);
    setCutBeat(null);
    setCutMotion(null);
    cutLock.current = false;
    holding.current = false;
    runKind.current = null;
    setHeld(false);
    setPhase("ready");
  };

  const openShuffle = (token: number) => {
    clearShuffle();
    setDrawn(null);
    setFlipped(false);
    setPanel(null);
    setCutPreview(null);
    setCutBeat(null);
    setPhase("shuffling");
    const later = (ms: number, run: () => void) => {
      const id = window.setTimeout(() => {
        if (shuffleRun.current !== token) return;
        run();
      }, ms);
      shuffleTimers.current.push(id);
    };
    return later;
  };

  const shuffle = (times = shuffleCount) => {
    if (order.length < 2 || phase === "shuffling" || phase === "cutting") return;
    const passes = Math.min(SHUFFLE_MAX, Math.max(SHUFFLE_MIN, Math.round(times)));
    const ratios = cutSections(passes);
    const pace = cutPace(passes);
    const step = Math.round(pace / 3);
    const token = shuffleRun.current + 1;
    shuffleRun.current = token;
    runKind.current = "count";
    holding.current = false;
    setHeld(false);
    setWorked(true);
    const later = openShuffle(token);
    setShufflingTimes(passes);
    setCutMotion(Math.max(32, Math.round(step * 0.92)));

    const play = (index: number) => {
      if (shuffleRun.current !== token) return;
      if (index >= ratios.length) {
        settleShuffle();
        return;
      }
      const ratio = ratios[index] ?? 0.5;
      cutLock.current = true;
      setShuffleStep(index + 1);
      setCutPreview(ratio);
      setCutBeat("aside");
      later(step, () => setCutBeat("drop"));
      later(step * 2, () => {
        setCutBeat("tuck");
        setOrder((current) => cutCards(shuffleCards(current), ratio));
      });
      later(step * 3, () => {
        setOrigin((value) => {
          const size = order.length;
          if (size < 2) return value;
          return (value + splitIndex(size, ratio)) % size;
        });
        play(index + 1);
      });
    };

    play(0);
  };

  const nextSection = (previous: number | null) => {
    const ratios = cutSections(7);
    return ratios.find((ratio) => previous == null || cutDepth(ratio) !== cutDepth(previous)) ?? 0.5;
  };

  const beginHold = () => {
    if (order.length < 2 || phase === "cutting") return;
    if (phase === "shuffling") {
      if (runKind.current === "hold") {
        holding.current = true;
        setHeld(true);
      }
      return;
    }
    const token = shuffleRun.current + 1;
    shuffleRun.current = token;
    runKind.current = "hold";
    holding.current = true;
    setHeld(true);
    setWorked(true);
    const later = openShuffle(token);
    let previous: number | null = null;
    let count = 0;
    let armed = false;

    const clearFly = () => {
      if (flyTimer.current != null) {
        window.clearTimeout(flyTimer.current);
        flyTimer.current = null;
      }
    };

    const launch = () => {
      if (shuffleRun.current !== token || !holding.current) return;
      const current = orderRef.current;
      if (current.length === 0) return;
      holding.current = false;
      shuffleRun.current += 1;
      clearShuffle();
      clearFly();
      const index = Math.floor(Math.random() * current.length);
      const card = current[index];
      if (!card) return;
      setOrder([card, ...current.filter((_, item) => item !== index)]);
      setOrigin(0);
      setCutPreview(null);
      setCutBeat(null);
      setCutMotion(null);
      cutLock.current = false;
      setHeld(false);
      setPhase("ready");
      setLaunching(true);
      window.setTimeout(() => {
        setLaunching(false);
        reveal(card);
      }, 680);
    };

    const play = () => {
      if (shuffleRun.current !== token) return;
      if (!holding.current) {
        settleShuffle();
        return;
      }
      count += 1;
      const speed = Math.min(SHUFFLE_MAX, 1 + (count - 1) * 2);
      const pace = cutPace(speed);
      const step = Math.round(pace / 3);
      if (speed >= SHUFFLE_MAX && !armed) {
        armed = true;
        flyTimer.current = window.setTimeout(launch, 420 + Math.random() * 1800);
      }
      const ratio = nextSection(previous);
      previous = ratio;
      cutLock.current = true;
      setShuffleStep(count);
      setShufflingTimes(count);
      setCutMotion(Math.max(32, Math.round(step * 0.92)));
      setCutPreview(ratio);
      setCutBeat("aside");
      later(step, () => setCutBeat("drop"));
      later(step * 2, () => {
        setCutBeat("tuck");
        setOrder((current) => cutCards(shuffleCards(current), ratio));
      });
      later(step * 3, () => {
        setOrigin((value) => {
          const size = order.length;
          if (size < 2) return value;
          return (value + splitIndex(size, ratio)) % size;
        });
        play();
      });
    };

    play();
  };

  const endHold = () => {
    holding.current = false;
    if (flyTimer.current != null) {
      window.clearTimeout(flyTimer.current);
      flyTimer.current = null;
    }
  };

  const previewCut = (ratio: number | null) => {
    if (ratio == null && cutLock.current) return;
    setCutPreview(ratio);
  };

  const cut = (ratio: number) => {
    if (order.length < 2 || phase === "shuffling" || phase === "cutting" || phase === "drawn") {
      return;
    }
    cutLock.current = true;
    setCutPreview(ratio);
    setCutMotion(520);
    setCutBeat("aside");
    setPhase("cutting");
    window.setTimeout(() => setCutBeat("drop"), 560);
    window.setTimeout(() => setCutBeat("tuck"), 1080);
    window.setTimeout(() => {
      const size = order.length;
      if (size > 1) {
        setOrigin((value) => (value + splitIndex(size, ratio)) % size);
      }
      setOrder((current) => cutCards(current, ratio));
      cutLock.current = false;
      setCutPreview(null);
      setCutBeat(null);
      setPhase("ready");
    }, 1620);
  };

  const reveal = (card: Card) => {
    const orientation: Orientation =
      includeReversals && Math.random() < 0.5 ? "reversed" : "upright";
    const asked = questionRef.current.trim();
    setZoomOpen(false);
    setDrawn({
      card,
      orientation,
      pulledAt: new Date().toISOString(),
      question: asked,
      reading: null,
    });
    setPhase("drawn");
    window.setTimeout(() => setFlipped(true), 80);
  };

  const draw = () => {
    const current = order.length > 0 ? order : deck;
    const card = current[0];
    if (!card || phase === "shuffling" || phase === "cutting" || phase === "drawn" || launching) return;
    reveal(card);
  };

  const putBack = () => {
    setDrawn(null);
    setFlipped(false);
    setPanel(null);
    setZoomOpen(false);
    setPhase(order.length ? "ready" : "still");
  };

  const frame = cardFrame(cardTemplate ?? "tarot", cardWidth ?? 55, cardLength ?? 55);
  const backStyle = {
    transform: `translate(${backX ?? 0}%, ${backY ?? 0}%) rotate(${backRotate ?? 0}deg) scale(${(backScale ?? 100) / 100})`,
  };
  const backSrc = cardBack || "/card-back-deck.jpg";
  const faceStyle = {
    width: `calc(${frame.width} - 1.8rem)`,
    ["--card-width" as string]: `calc(${frame.width} - 1.8rem)`,
    ["--card-aspect" as string]: String(frame.aspect),
    ["--radius-lg" as string]: `${cardRadius ?? 5}px`,
    aspectRatio: frame.aspect,
  };
  const drawnStyle = {
    width: "min(11rem, 42vw)",
    ["--card-width" as string]: "min(11rem, 42vw)",
    ["--card-aspect" as string]: String(frame.aspect),
    ["--radius-lg" as string]: `${cardRadius ?? 7}px`,
    aspectRatio: frame.aspect,
  };

  const downloadArchive = async () => {
    if (archiving) return;
    setArchiving(true);
    try {
      const zipped = await buildArchive();
      const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "threshold-of-solace.zip";
      link.click();
      URL.revokeObjectURL(url);
      setBackedUp(true);
      toast("Backup exported");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not export a backup.");
    } finally {
      setArchiving(false);
    }
  };
  const uploadArchive = async (file: File) => {
    if (archiving) return;
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast("Choose a .zip file.");
      return;
    }
    if (file.size > 80_000_000) {
      toast("That backup is too large.");
      return;
    }
    const consent = await requestUploadConsent();
    if (!consent) return;
    setArchiving(true);
    try {
      await restoreArchive(new Uint8Array(await file.arrayBuffer()));
      const state = useJournal.getState();
      const deckIds = new Set<string>();
      for (const id of state.deckOrder ?? []) deckIds.add(String(id));
      for (const id of Object.keys(state.deckLooks ?? {})) deckIds.add(id);
      if (state.activeDeckId != null) deckIds.add(String(state.activeDeckId));
      const deckConsents = { ...(state.deckConsents ?? {}) };
      for (const id of deckIds) deckConsents[id] = consent;
      useJournal.setState({
        readings: state.readings.map((reading) => ({ ...reading, consent })),
        dreams: (state.dreams ?? []).map((dream) => ({ ...dream, consent })),
        rituals: (state.rituals ?? []).map((ritual) => ({ ...ritual, consent })),
        deckConsents,
      });
      const savedHand = window.localStorage.getItem("lumen-hand");
      if (savedHand === "left" || savedHand === "right") setHand(savedHand);
      await queryClient.invalidateQueries();
      toast("Backup restored");
      setArchiveOpen(false);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not import that backup.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <AppShell>
      <div className="stagger-in flex w-full flex-col items-center">
        <div className="w-full max-w-md">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 rounded-lg bg-surface px-4 py-3 text-left shadow-border"
            aria-expanded={reasonOpen}
            onClick={() => setReasonOpen((open) => !open)}
          >
            <span className="text-sm text-fg">Reason for pull</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-subtle">{reasonOpen ? "Hide" : "Optional"}</span>
              <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", reasonOpen && "rotate-180")} />
            </span>
          </button>
          {reasonOpen ? (
            <div className="mt-3 flex flex-col gap-3">
              {labels.length === 0 ? (
                <p className="text-sm text-muted">Add labels in Journals, then they can be checked here.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {labels.map((label) => {
                    const on = pullLabels.includes(label.id);
                    return (
                      <label key={label.id} className="flex items-center gap-2 text-sm text-fg">
                        <input
                          type="checkbox"
                          className="size-4 accent-fg"
                          checked={on}
                          onChange={() =>
                            setPullLabels((current) =>
                              on ? current.filter((id) => id !== label.id) : [...current, label.id],
                            )
                          }
                        />
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} />
                        {label.name}
                      </label>
                    );
                  })}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="draw-question">Context</Label>
                <button
                  type="button"
                  className="text-xs text-subtle underline-offset-2 hover:underline"
                  onClick={() => setQuestion("")}
                >
                  Clear
                </button>
              </div>
              <Textarea
                id="draw-question"
                value={question}
                maxLength={2000}
                rows={3}
                className="min-h-24"
                placeholder="Anything you want kept with this pull."
                onChange={(event) => setQuestion(event.target.value)}
              />
            </div>
          ) : null}
        </div>

        <div className="marble-slab relative mt-6">
          <img
            src={table.image || "/marble.jpg"}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
            style={{
              transform: `translate(${table.x}%, ${table.y}%) rotate(${table.rotate}deg) scale(${table.scale / 100})`,
              filter: `hue-rotate(${table.color}deg) saturate(${table.saturation}%) brightness(${table.luminous}%) contrast(${table.contrast}%)`,
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background: `radial-gradient(ellipse at center, transparent 46%, rgb(28 22 16 / ${table.vignette / 140}))`,
            }}
          />
          <div className="relative z-20 flex items-center justify-center py-14">
          {isError ? (
            <div className="text-center">
              <p className="text-sm text-muted">The deck could not be opened.</p>
              <Button className="mt-4" variant="secondary" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : !isLoading && deck.length === 0 ? (
            <div className="max-w-sm text-center">
              <p className="font-display text-2xl">An empty table</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Add the cards of your deck, then come back to draw.
              </p>
              <Button asChild className="mt-5">
                <Link to="/deck">Open decks</Link>
              </Button>
            </div>
          ) : drawn ? (
            <DrawnFace
              onReturn={putBack}
              onHold={() => {
                if (flipped) setZoomOpen(true);
              }}
            >
              <PhysicalCard
                art
                flipped={flipped}
                card={drawn.card}
                orientation={drawn.orientation}
                style={drawnStyle}
                frame={{
                  scale: drawn.card.imageScale,
                  x: drawn.card.imageX,
                  y: drawn.card.imageY,
                  radius: cardRadius ?? 7,
                }}
                backSrc={backSrc}
                backStyle={backStyle}
              />
            </DrawnFace>
          ) : (
            <>
            <DeckStack
              phase={phase}
              preview={cutPreview}
              beat={cutBeat}
              motion={cutMotion}
              count={order.length || 78}
              origin={origin}
              edge={edge ?? 100}
              edgeColor={edgeColor ?? 0}
              edgeSat={edgeSat ?? 0}
              edgeLight={edgeLight ?? 26}
              thickness={cardThickness ?? 75}
              radius={cardRadius ?? 5}
              frame={frame}
              backSrc={backSrc}
              backStyle={backStyle}
              hand={hand}
              onPreview={previewCut}
              onCut={cut}
              onTap={draw}
            />
            {launching ? (
              <div className="card-launch" style={faceStyle}>
                <img src={backSrc} alt="" draggable={false} className="h-full w-full rounded-[var(--radius-lg)] object-cover" />
              </div>
            ) : null}
            </>
          )}
          </div>
        </div>

        {drawn && flipped ? (
          <div className="stagger-in mt-2 flex w-full max-w-md flex-col items-center text-center">
            <p className="text-xs tracking-[0.18em] text-muted uppercase">
              {drawn.orientation === "reversed" ? "Reversed" : "Upright"} ·{" "}
              {suitLabel(drawn.card.suit)}
            </p>
            <h2 className="mt-1 font-display text-3xl font-medium tracking-tight">
              {drawn.card.name}
            </h2>
            {storyNumber(drawn.card.name) > 0 ? (
              <Link
                to="/guide"
                search={{ card: drawn.card.name }}
                className="mt-2 text-sm text-subtle underline decoration-border underline-offset-4"
              >
                Living Meanings
              </Link>
            ) : null}
            {drawn.card.keywords ? (
              <p className="mt-2 text-sm text-muted">{drawn.card.keywords}</p>
            ) : null}
            <p className="mt-3 text-xs text-subtle tabular-nums">
              Drawn {format(new Date(drawn.pulledAt), "MMM d, yyyy · h:mm a")}
            </p>
            <div className="mt-6 w-full rounded-xl bg-surface text-left shadow-border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3"
                aria-expanded={descOpen}
                onClick={() => {
                  setDescOpen((open) => !open);
                  setDescEdit(false);
                }}
              >
                <span className="flex items-center gap-2 text-sm">
                  <BookOpen className="size-4" />
                  View Current Description
                </span>
                <ChevronDown className={cn("size-4 text-muted transition-transform", descOpen && "rotate-180")} />
              </button>
              {descOpen ? (
                <div className="border-t border-border px-4 py-4">
                  {descEdit ? (
                    <div className="flex flex-col gap-3">
                      <Label htmlFor="desc-upright">Upright</Label>
                      <Textarea id="desc-upright" value={descUpright} onChange={(event) => setDescUpright(event.target.value)} />
                      <Label htmlFor="desc-reversed">Reversed</Label>
                      <Textarea id="desc-reversed" value={descReversed} onChange={(event) => setDescReversed(event.target.value)} />
                      <p className="text-xs text-subtle">A new line is a break. Start a line with - for a bullet.</p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          disabled={savingMeaning}
                          onClick={() => {
                            if (!drawn) return;
                            setSavingMeaning(true);
                            void updateCardMeaning({
                              data: { id: drawn.card.id, upright: descUpright, reversed: descReversed },
                            })
                              .then((saved) => {
                                setDrawn({
                                  ...drawn,
                                  card: { ...drawn.card, upright: saved.upright, reversed: saved.reversed },
                                });
                                setDescEdit(false);
                                void queryClient.invalidateQueries({ queryKey: ["cards"] });
                                toast("Description saved");
                              })
                              .catch((err: unknown) =>
                                toast(err instanceof Error ? err.message : "Could not save that description."),
                              )
                              .finally(() => setSavingMeaning(false));
                          }}
                        >
                          {savingMeaning ? "Saving…" : "Save"}
                        </Button>
                        <Button type="button" variant="ghost" onClick={() => setDescEdit(false)}>
                          Discard
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {(() => {
                        const shown = splitMeaning(
                          drawn.orientation === "reversed" ? drawn.card.reversed : drawn.card.upright,
                        );
                        return (
                          <>
                            <p className="text-xs tracking-[0.16em] text-subtle uppercase">Canonical</p>
                            <MeaningText
                              className="mt-2 text-sm leading-relaxed text-fg"
                              text={shown.canon || "No description written yet."}
                            />
                            {shown.proposal ? (
                              <>
                                <p className="mt-4 text-xs tracking-[0.16em] text-subtle uppercase">
                                  Proposed context · affinity {shown.affinity} · draft
                                </p>
                                <MeaningText className="mt-2 text-sm leading-relaxed text-fg" text={shown.proposal} />
                                <p className="mt-2 text-xs text-subtle">The original meaning stays canonical.</p>
                              </>
                            ) : null}
                          </>
                        );
                      })()}
                      <Button
                        type="button"
                        variant="secondary"
                        className="mt-4"
                        onClick={() => {
                          setDescUpright(drawn.card.upright ?? "");
                          setDescReversed(drawn.card.reversed ?? "");
                          setDescEdit(true);
                        }}
                      >
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
            <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => setPanel("journal")}>
                <PenLine />
                Add Journal Entry
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  void navigate({
                    to: "/journal",
                    search: {
                      ...(active?.id || activeDeckId ? { deck: (active?.id ?? activeDeckId) as number } : {}),
                      ...(drawn.card.id > 0 ? { card: drawn.card.id } : {}),
                    },
                  })
                }
              >
                Past entries
              </Button>
            </div>
            <ChatWithSolace
              className="mt-2"
              sitting={cardSitting({
                name: drawn.card.name,
                deckName: active?.name,
                orientation: drawn.orientation,
                suit: suitLabel(drawn.card.suit),
                rank: drawn.card.rank,
                keywords: drawn.card.keywords,
                question: drawn.question,
                upright: drawn.card.upright,
                reversed: drawn.card.reversed,
                pulledAt: drawn.pulledAt,
              })}
              source={{
                kind: "card",
                from: "flip",
                cardName: drawn.card.name,
                cardId: drawn.card.id,
                deckId: active?.id ?? activeDeckId ?? null,
                deckName: active?.name ?? "",
                suit: drawn.card.suit,
                rank: drawn.card.rank,
                orientation: drawn.orientation,
                keywords: drawn.card.keywords,
                imageUrl: drawn.card.imageUrl,
                pulledAt: drawn.pulledAt,
                question: drawn.question,
                meaning: drawn.orientation === "reversed" ? drawn.card.reversed : drawn.card.upright,
                readingId: drawn.reading?.id ?? null,
              }}
            />
            <Button variant="secondary" className="mt-2" onClick={() => setZoomOpen(true)}>
              Full screen
            </Button>
            <Button
              variant="ghost"
              className="mt-3"
              onClick={putBack}
            >
              Return the card
            </Button>
            {storyNumber(drawn.card.name) > 0 && meetWith && meetWith.number !== storyNumber(drawn.card.name) ? (
              <DendriteEncounter embedded initialFirst={meetWith.number} initialSecond={storyNumber(drawn.card.name)} />
            ) : null}
            {storyNumber(drawn.card.name) > 0 ? (
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  setMeetWith({ number: storyNumber(drawn.card.name), name: drawn.card.name });
                  putBack();
                }}
              >
                Hold, then draw the card it meets
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mt-4 flex w-full max-w-md flex-col items-center gap-3">
            {meetWith ? (
              <p className="text-center text-sm text-subtle">
                Holding {meetWith.name}. Draw another card to meet it.{" "}
                <button type="button" className="underline" onClick={() => setMeetWith(null)}>
                  Forget it
                </button>
              </p>
            ) : null}
            <div className="flex w-full gap-2">
              <Button
                variant="secondary"
                className="relative flex-1 touch-none overflow-hidden select-none"
                disabled={deck.length < 2 || launching || phase === "cutting" || (phase === "shuffling" && !held)}
                onContextMenu={(event) => event.preventDefault()}
                onKeyDown={(event) => {
                  if (event.key !== " " && event.key !== "Enter") return;
                  event.preventDefault();
                  if (!event.repeat) beginHold();
                }}
                onKeyUp={(event) => {
                  if (event.key === " " || event.key === "Enter") endHold();
                }}
              >
                <Shuffle className="pointer-events-none" />
                <span className="pointer-events-none select-none">Hold to Shuffle</span>
                <span
                  className="absolute inset-0 z-10"
                  aria-hidden
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    beginHold();
                  }}
                  onPointerUp={endHold}
                  onPointerCancel={endHold}
                />
              </Button>
              <Button
                className="flex-1"
                disabled={launching || phase === "shuffling" || phase === "cutting" || deck.length === 0}
                onClick={draw}
              >
                Flip Card
              </Button>
            </div>
            <ShuffleSlider
              value={shuffleCount}
              locked={shuffleLocked}
              onToggleLock={() => setShuffleLocked(!shuffleLocked)}
              disabled={launching || phase === "shuffling" || phase === "cutting" || deck.length < 2}
              onChange={setShuffleCount}
              onCommit={shuffle}
            />
            <Button
              variant="secondary"
              className="w-full"
              disabled={launching || phase === "shuffling" || phase === "cutting" || deck.length < 2}
              onClick={() => shuffle(shuffleCount)}
            >
              <Repeat />
              Shuffle {shuffleCount}
            </Button>
            <p className="text-center text-xs text-subtle">
              {phase === "shuffling"
                ? held
                  ? `Cut ${shuffleStep}.`
                  : shufflingTimes === 1
                    ? "Shuffling once."
                    : `Cut ${shuffleStep} of ${shufflingTimes}.`
                : phase === "cutting"
                  ? "Cutting where you chose."
                  : phase === "ready"
                    ? "The deck is waiting."
                    : "Hold the button to shuffle, or set a count below."}
            </p>
          </div>
        )}

        <Separator className="my-10" />

        <div className="flex w-full max-w-md items-center justify-between gap-4">
          <div>
            <Label htmlFor="reversals" className="text-sm text-fg">
              Allow reversed cards
            </Label>
            <p className="mt-1 text-xs text-subtle">
              Half of draws may arrive inverted.
            </p>
          </div>
          <Switch
            id="reversals"
            checked={includeReversals}
            onCheckedChange={setIncludeReversals}
          />
        </div>
        <div className="mt-6 flex w-full max-w-md items-center justify-between gap-4">
          <div>
            <Label htmlFor="hand" className="text-sm text-fg">
              Shuffle hand
            </Label>
            <p className="mt-1 text-xs text-subtle">
              {hand === "left"
                ? "Left hand lifts the left side."
                : "Right hand lifts the right side."}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs tracking-wide text-subtle">
            <span className={hand === "right" ? "text-fg" : undefined}>Right</span>
            <Switch
              id="hand"
              checked={hand === "left"}
              onCheckedChange={(on) => setHand(on ? "left" : "right")}
              aria-label="Shuffle with the left hand"
            />
            <span className={hand === "left" ? "text-fg" : undefined}>Left</span>
          </div>
        </div>
        <div className="mt-16 flex w-full max-w-md flex-col items-center gap-3 pb-6">
          <button
            type="button"
            className="text-xs text-subtle underline-offset-2 hover:underline disabled:opacity-50"
            disabled={archiving}
            onClick={() => void downloadArchive()}
          >
            {archiving ? "Preparing backup…" : "Export all"}
          </button>
          <button
            type="button"
            className="text-xs text-subtle underline-offset-2 hover:underline"
            onClick={() => {
              setBackedUp(false);
              setArchiveOpen(true);
            }}
          >
            Import all
          </button>
        </div>
        <section className="mb-8 w-full max-w-md border-t border-border pt-6 text-left">
          <h2 className="font-display text-lg text-fg">Photo anatomy</h2>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            June 8, 2000. The sentences decide the bodies. A second pass finishes those same bodies with the crystal photographs. It does not move them, and it is not a path tracer. Saved decks are not changed.
          </p>
          <img className="mt-4 w-full" src="/velomere-photo/sheet-pilots.jpg" alt="Pilots at card size. Neutral and Dance for The Velomere, Three of Sigils, Fire, and The Null." />
          <ul className="mt-3 flex flex-col gap-2 text-sm text-fg">
            <li><a className="underline decoration-border underline-offset-4" href="/velomere-photo/sheet-pilots.jpg">Pilots at card size</a></li>
            <li><a className="underline decoration-border underline-offset-4" href="/velomere-photo/sheet-stages.jpg">Skeleton, clay, mineral, finished</a></li>
            <li><a className="underline decoration-border underline-offset-4" href="/velomere-photo/sheet-pairs.jpg">All 78, Neutral beside Dance</a></li>
            <li><a className="underline decoration-border underline-offset-4" href="/velomere-photo/sheet-finish-pairs.jpg">Finish beside the structural plate</a></li>
            <li><a className="underline decoration-border underline-offset-4" href="/velomere-photo/sheet-finish-causal.jpg">Photo swap and ablation</a></li>
          </ul>
        </section>
        <section className="mb-8 w-full max-w-md border-t border-border pt-6 text-left">
          <h2 className="font-display text-lg text-fg">Full build</h2>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            The production build of this app, in one zip.
          </p>
          <a
            className="mt-3 inline-block text-sm text-fg underline decoration-border underline-offset-4"
            href="/downloads/velomere-full-build.zip"
            download="velomere-full-build.zip"
          >
            Download velomere-full-build.zip
          </a>
        </section>
        <section className="mb-8 w-full max-w-md border-t border-border pt-6 text-left">
          <h2 className="font-display text-lg text-fg">Deck process</h2>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            The whole Create path, in writing and in the files that draw it. Sources, recipe, operators, and every file a deck writes.
          </p>
          <a
            className="mt-3 inline-block text-sm text-fg underline decoration-border underline-offset-4"
            href="/downloads/velomere-deck-process.zip"
            download="velomere-deck-process.zip"
          >
            Download velomere-deck-process.zip
          </a>
        </section>
        <section className="mb-8 w-full max-w-md border-t border-border pt-6 text-left">
          <h2 className="font-display text-lg text-fg">v9 neutral deck</h2>
          <p className="mt-2 text-xs leading-relaxed text-subtle">
            One full deck drawn 2026-11-12, affinity 0, with relational-encounter-9-open-field. The whole face is available. Seventy-eight pictures, their drawings, traces, sources, and the Dendrite back. Saved decks are not replaced by this file.
          </p>
          <a
            className="mt-3 inline-block text-sm text-fg underline decoration-border underline-offset-4"
            href="/downloads/velomere-v9-neutral-deck.zip"
            download="velomere-v9-neutral-deck.zip"
          >
            Download velomere-v9-neutral-deck.zip
          </a>
          <p className="mt-4 text-xs leading-relaxed text-subtle">
            The same date with a guest. Affinity 2 is The Velomere, 3 is The Homarch, 14 is The Dance. Each archive carries the pictures and the traces.
          </p>
          <div className="mt-2 flex flex-col gap-2 text-sm">
            <a className="text-fg underline decoration-border underline-offset-4" href="/downloads/velomere-v9-affinity-2.zip" download="velomere-v9-affinity-2.zip">Affinity 2</a>
            <a className="text-fg underline decoration-border underline-offset-4" href="/downloads/velomere-v9-affinity-3.zip" download="velomere-v9-affinity-3.zip">Affinity 3</a>
            <a className="text-fg underline decoration-border underline-offset-4" href="/downloads/velomere-v9-affinity-14.zip" download="velomere-v9-affinity-14.zip">Affinity 14</a>
          </div>
        </section>
      </div>

      <Sheet open={panel !== null} onOpenChange={(open) => !open && setPanel(null)}>
        <SheetContent>
          {drawn && panel === "meaning" ? (
            <MeaningPanel card={drawn.card} orientation={drawn.orientation} />
          ) : null}
          {drawn && panel === "journal" ? (
            <JournalPanel
              card={drawn.card}
              orientation={drawn.orientation}
              pulledAt={drawn.pulledAt}
              question={question}
              labelIds={pullLabels}
              reading={drawn.reading}
              deckId={active?.id ?? activeDeckId}
              deckName={active?.name ?? "Deck"}
              onKept={(reading) => setDrawn({ ...drawn, reading })}
            />
          ) : null}
        </SheetContent>
      </Sheet>
      {zoomOpen && drawn ? (
        <ArtZoom
          card={drawn.card}
          orientation={drawn.orientation}
          onClose={() => setZoomOpen(false)}
        />
      ) : null}
      <Dialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (!open && archiving) return;
          setArchiveOpen(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Replace everything?</DialogTitle>
            <DialogDescription>
              Import overwrites your journals, settings, and decks with the file. Locked decks stay,
              including Rider-Waite-Smith. Custom decks are replaced.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Button type="button" variant="secondary" disabled={archiving} onClick={() => void downloadArchive()}>
              {archiving ? "Preparing backup…" : "Export a backup first"}
            </Button>
            {backedUp ? (
              <label className="flex flex-col gap-1.5 text-sm text-muted">
                Backup file
                <FilePicker
                  id="archive-file"
                  accept=".zip,application/zip"
                  disabled={archiving}
                  label="Choose backup"
                  onFile={(file) => void uploadArchive(file)}
                />
              </label>
            ) : (
              <Button type="button" variant="ghost" onClick={() => setBackedUp(true)}>
                I have backed up
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={archiving} onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

const SHUFFLE_INSET = 16;

function rawShuffleValue(track: HTMLElement, clientX: number) {
  const rect = track.getBoundingClientRect();
  const span = Math.max(1, rect.width - SHUFFLE_INSET * 2);
  const t = (clientX - rect.left - SHUFFLE_INSET) / span;
  return SHUFFLE_MIN + Math.min(1, Math.max(0, t)) * (SHUFFLE_MAX - SHUFFLE_MIN);
}

function ShuffleSlider({
  value,
  disabled,
  locked,
  onToggleLock,
  onChange,
  onCommit,
}: {
  value: number;
  disabled?: boolean;
  locked?: boolean;
  onToggleLock: () => void;
  onChange: (count: number) => void;
  onCommit: (count: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const drag = useRef<{ lastRaw: number; lastTime: number; velocity: number } | null>(null);
  valueRef.current = value;
  const place = ((value - SHUFFLE_MIN) / (SHUFFLE_MAX - SHUFFLE_MIN)) * 100;
  const quiet = disabled || locked;

  const moveTo = (clientX: number) => {
    const track = trackRef.current;
    const motion = drag.current;
    if (!track || !motion) return;
    const raw = rawShuffleValue(track, clientX);
    const now = performance.now();
    const dt = Math.max(16, now - motion.lastTime);
    const instant = ((raw - motion.lastRaw) / dt) * 1000;
    motion.velocity = motion.velocity * 0.45 + instant * 0.55;
    motion.lastRaw = raw;
    motion.lastTime = now;
    const next = latchShuffleCount(valueRef.current, raw, motion.velocity);
    if (next !== valueRef.current) {
      valueRef.current = next;
      onChange(next);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs tracking-[0.16em] text-subtle uppercase">Shuffles</span>
        <span className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center text-muted"
            aria-pressed={locked === true}
            aria-label={locked ? "Unlock the shuffle count" : "Lock the shuffle count"}
            onClick={onToggleLock}
          >
            {locked ? <Lock className="size-4" /> : <LockOpen className="size-4" />}
          </button>
          <span className="font-display text-lg tabular-nums text-fg">{value}</span>
        </span>
      </div>
      <div
        ref={trackRef}
        role="slider"
        aria-label="Number of shuffles"
        aria-valuemin={SHUFFLE_MIN}
        aria-valuemax={SHUFFLE_MAX}
        aria-valuenow={value}
        aria-disabled={quiet || undefined}
        tabIndex={quiet ? -1 : 0}
        className={cn(
          "relative flex h-12 w-full touch-none items-center select-none outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-fg/30",
          quiet ? "cursor-default opacity-50" : "cursor-pointer",
        )}
        onPointerDown={(event) => {
          if (quiet || !trackRef.current) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const raw = rawShuffleValue(trackRef.current, event.clientX);
          drag.current = { lastRaw: raw, lastTime: performance.now(), velocity: 0 };
          const next = latchShuffleCount(valueRef.current, raw, 0);
          valueRef.current = next;
          onChange(next);
        }}
        onPointerMove={(event) => {
          if (!drag.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          moveTo(event.clientX);
        }}
        onPointerUp={(event) => {
          if (!drag.current || quiet) return;
          moveTo(event.clientX);
          drag.current = null;
          onCommit(valueRef.current);
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (quiet) return;
          const step = event.key === "ArrowRight" || event.key === "ArrowUp" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowDown" ? -1 : 0;
          if (!step && event.key !== "Home" && event.key !== "End") return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? SHUFFLE_MIN
              : event.key === "End"
                ? SHUFFLE_MAX
                : Math.min(SHUFFLE_MAX, Math.max(SHUFFLE_MIN, valueRef.current + step));
          valueRef.current = next;
          onChange(next);
        }}
        onKeyUp={(event) => {
          if (quiet) return;
          if (
            event.key === "ArrowRight" ||
            event.key === "ArrowLeft" ||
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "Home" ||
            event.key === "End"
          ) {
            onCommit(valueRef.current);
          }
        }}
      >
        <span className="absolute right-4 left-4 h-px bg-border" />
        <span
          className="absolute left-4 h-px bg-fg/50"
          style={{ width: `calc((100% - 2rem) * ${place / 100})` }}
        />
        <span
          className="absolute h-4 w-4 rounded-full border border-fg/25 bg-paper shadow-card"
          style={{
            left: `calc(1rem + (100% - 2rem) * ${place / 100})`,
            transform: "translateX(-50%)",
          }}
        />
      </div>
      <div className="flex justify-between px-3 text-[10px] tracking-[0.14em] text-subtle uppercase">
        <span>1</span>
        <span>{locked ? "Locked" : "Release to shuffle"}</span>
        <span>20</span>
      </div>
    </div>
  );
}

const stackStep = (count: number) => (count <= 1 ? 0 : Math.min(2.2, Math.max(0.65, 56 / count)));

function splitIndex(count: number, ratio: number) {
  if (count < 2) return 1;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(count - 1, Math.max(1, Math.ceil(clamped * (count - 1))));
}

function DeckStack({
  phase,
  preview,
  beat,
  motion,
  count,
  origin,
  edge,
  edgeColor,
  edgeSat,
  edgeLight,
  thickness,
  radius,
  frame,
  backSrc,
  backStyle,
  hand,
  onPreview,
  onCut,
  onTap,
}: {
  phase: Phase;
  preview: number | null;
  beat: CutBeat | null;
  motion: number | null;
  count: number;
  origin: number;
  edge: number;
  edgeColor: number;
  edgeSat: number;
  edgeLight: number;
  thickness: number;
  radius: number;
  frame: { width: string; aspect: number };
  backSrc: string;
  backStyle: CSSProperties;
  hand: "right" | "left";
  onPreview: (ratio: number | null) => void;
  onCut: (ratio: number) => void;
  onTap: () => void;
}) {
  const shuffling = phase === "shuffling";
  const cutting = phase === "cutting";
  const drawn = phase === "drawn";
  const busy = shuffling || cutting || drawn;
  const dir = hand === "left" ? -1 : 1;
  const cuttingNow = cutting && beat != null && preview != null;
  const aiming = preview != null && beat == null && !shuffling && !cutting;
  const shufflingNow = shuffling && beat != null && preview != null;
  const grouped = cuttingNow || aiming || shufflingNow;
  const split = grouped ? splitIndex(count, preview ?? 0.5) : count;
  const below = Math.max(1, count - split);
  const step = stackStep(count) * (thickness / 100);
  const edgePaint = edgeLook(edge, edgeColor, edgeSat, edgeLight).background;
  const gesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  let topPose = "translate(0px, 0px)";
  let bottomPose = "translate(0px, 0px)";
  let topZ = 6;
  let bottomZ = 2;

  if (cuttingNow || shufflingNow) {
    const seat = below * step * 0.18;
    const seatX = dir * below * step * 0.25;
    topPose =
      beat === "aside"
        ? `translate(${dir * -112}%, -8px) rotate(${dir * -4}deg)`
        : beat === "drop"
          ? `translate(${dir * -112}%, ${seat}px) translate(${seatX}px, 0px) rotate(${dir * -1}deg)`
          : `translate(${seatX}px, ${seat}px)`;
    topZ = beat === "tuck" ? 2 : 6;
    bottomZ = beat === "tuck" ? 8 : 3;
  } else if (aiming) {
    const ratio = preview ?? 0.5;
    topPose = `translate(${dir * -36}px, ${(-18 - ratio * 36).toFixed(1)}px) rotate(${dir * -3}deg)`;
    bottomPose = `translate(0px, ${(10 + ratio * 16).toFixed(1)}px)`;
  }

  return (
    <div
      className="deck-table"
      data-hand={hand}
      style={{ width: frame.width, ["--radius-lg" as string]: `${radius}px` }}
    >
      <div
        className={cn(
          "deck-pile",
          drawn && "has-drawn",
          aiming && "is-aiming",
          Boolean(beat) && "is-moving",
        )}
        data-cut={beat ?? undefined}
        style={
          {
            aspectRatio: frame.aspect,
            "--cut-pace": `${motion ?? 520}ms`,
            "--card-step": `${step}px`,
          } as CSSProperties
        }
      >
        {Array.from({ length: count }, (_, index) => {
          const v = (index - origin + count) % count;
          const inTop = grouped && v < split;
          const local = grouped ? (inTop ? v : v - split) : v;
          const pose = !grouped ? "" : inTop ? topPose : bottomPose;
          const band = !grouped ? 1 : inTop ? topZ : bottomZ;
          const showFace = local === 0;
          return (
            <div
              key={index}
              className="deck-card"
              style={{
                background: edgePaint,
                transform: `${pose} translate(${dir * local * step * 0.25}px, ${local * step * 0.18}px)`,
                zIndex: band * (count + 2) + (count - local),
              }}
            >
              {showFace ? (
                <img
                  src={backSrc}
                  alt=""
                  decoding="sync"
                  fetchPriority="high"
                  style={backStyle}
                />
              ) : null}
            </div>
          );
        })}
        <button
          type="button"
          className="deck-side"
          aria-label="Tap the deck to flip the top card. Drag to cut."
          disabled={busy}
          onPointerDown={(event) => {
            if (busy) return;
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // The cut still follows the pointer if capture is unavailable.
            }
            gesture.current = { x: event.clientX, y: event.clientY, dragged: false };
          }}
          onPointerMove={(event) => {
            const active = gesture.current;
            if (busy || !active) return;
            const dragging =
              event.buttons > 0 || event.currentTarget.hasPointerCapture?.(event.pointerId);
            if (!dragging) return;
            const distance = Math.hypot(event.clientX - active.x, event.clientY - active.y);
            if (distance > 10) active.dragged = true;
            if (active.dragged) onPreview(cutRatio(event));
          }}
          onPointerUp={(event) => {
            if (busy) return;
            const active = gesture.current;
            gesture.current = null;
            if (active?.dragged) onCut(cutRatio(event));
            else onTap();
            onPreview(null);
          }}
          onPointerCancel={() => {
            gesture.current = null;
            onPreview(null);
          }}
          onPointerLeave={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) onPreview(null);
          }}
          onClick={(event) => {
            if (event.detail === 0) onTap();
          }}
        >
          {preview != null && !cutting && !shuffling && !drawn ? (
            <span className="deck-cut-line" style={{ top: `${preview * 100}%` }} />
          ) : null}
        </button>
      </div>
    </div>
  );
}

function DrawnFace({
  children,
  onReturn,
  onHold,
}: {
  children: ReactNode;
  onReturn: () => void;
  onHold: () => void;
}) {
  const press = useRef<{ x: number; y: number; moved: boolean; held: boolean; timer: number } | null>(null);
  const clear = () => {
    const active = press.current;
    if (active) window.clearTimeout(active.timer);
    press.current = null;
  };
  return (
    <div
      className="relative touch-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const active = {
          x: event.clientX,
          y: event.clientY,
          moved: false,
          held: false,
          timer: 0,
        };
        active.timer = window.setTimeout(() => {
          if (!press.current || press.current.moved) return;
          press.current.held = true;
          onHold();
        }, 360);
        press.current = active;
      }}
      onPointerMove={(event) => {
        const active = press.current;
        if (!active) return;
        if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > 8) active.moved = true;
      }}
      onPointerUp={() => {
        const active = press.current;
        clear();
        if (active && !active.moved && !active.held) onReturn();
      }}
      onPointerCancel={clear}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

function splitMeaning(text: string | null | undefined) {
  const raw = text ?? "";
  const match = raw.match(/\n\n\[PERSONALIZED (CONTEXT|COUNTERREADING) — ([^\]]+)\]\n([\s\S]*)$/);
  if (!match || match.index == null) return { canon: raw, proposal: "", affinity: null as string | null };
  return {
    canon: raw.slice(0, match.index).trim(),
    proposal: match[3].trim(),
    affinity: match[2].trim(),
  };
}

function MeaningPanel({
  card,
  orientation,
}: {
  card: Card;
  orientation: Orientation;
}) {
  const primary = splitMeaning(orientation === "reversed" ? card.reversed : card.upright);
  const other = splitMeaning(orientation === "reversed" ? card.upright : card.reversed);
  const otherLabel = orientation === "reversed" ? "Upright" : "Reversed";
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <SheetHeader>
        <SheetTitle>{card.name}</SheetTitle>
        <SheetDescription>
          {orientation === "reversed" ? "Reversed" : "Upright"} · {suitLabel(card.suit)}
        </SheetDescription>
      </SheetHeader>
      <p className="mt-6 text-xs tracking-[0.16em] text-subtle uppercase">Canonical</p>
      <p className="mt-2 text-sm leading-relaxed text-fg whitespace-pre-wrap">{primary.canon || "No meaning written yet."}</p>
      {primary.proposal ? (
        <div className="mt-6">
          <p className="text-xs tracking-[0.16em] text-subtle uppercase">
            Proposed context · affinity {primary.affinity} · draft
          </p>
          <p className="mt-2 text-sm leading-relaxed text-fg whitespace-pre-wrap">{primary.proposal}</p>
          <p className="mt-2 text-xs text-subtle">The original meaning above stays canonical. This proposal is not a replacement.</p>
        </div>
      ) : null}
      {other.canon ? (
        <div className="mt-8">
          <p className="text-xs tracking-[0.16em] text-subtle uppercase">{otherLabel} · canonical</p>
          <p className="mt-2 text-sm leading-relaxed text-muted whitespace-pre-wrap">{other.canon}</p>
          {other.proposal ? (
            <>
              <p className="mt-4 text-xs tracking-[0.16em] text-subtle uppercase">
                {otherLabel} proposal · affinity {other.affinity} · draft
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted whitespace-pre-wrap">{other.proposal}</p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function JournalPanel({
  card,
  orientation,
  pulledAt,
  question,
  labelIds,
  reading,
  deckId,
  deckName,
  onKept,
}: {
  card: Card;
  orientation: Orientation;
  pulledAt: string;
  question: string;
  labelIds: string[];
  reading: Reading | null;
  deckId: number | null;
  deckName: string;
  onKept: (reading: Reading) => void;
}) {
  const addReading = useJournal((s) => s.addReading);
  const updateReading = useJournal((s) => s.updateReading);
  const [notes, setNotes] = useState(reading?.notes ?? "");
  const [website, setWebsite] = useState(reading?.websiteUrl ?? "");
  const [video, setVideo] = useState(reading?.videoUrl ?? "");
  useEffect(() => {
    setNotes(reading?.notes ?? "");
    setWebsite(reading?.websiteUrl ?? "");
    setVideo(reading?.videoUrl ?? "");
  }, [reading?.id, card.id]);
  const save = useMutation({
    mutationFn: async (links: { websiteUrl?: string; videoUrl?: string }) => {
      if (reading) {
        updateReading(reading.id, { notes, question, labelIds, websiteUrl: links.websiteUrl, videoUrl: links.videoUrl });
        return { ...reading, notes, question, labelIds, websiteUrl: links.websiteUrl, videoUrl: links.videoUrl };
      }
      const meaning = orientation === "reversed" ? card.reversed : card.upright;
      return addReading({
        cardId: card.id,
        cardName: card.name,
        suit: card.suit,
        rank: card.rank,
        orientation,
        keywords: card.keywords,
        meaningSnapshot: meaning,
        deckId,
        deckName,
        notes,
        question,
        labelIds,
        pulledAt,
        manual: false,
        websiteUrl: links.websiteUrl,
        videoUrl: links.videoUrl,
      });
    },
    onSuccess: (saved) => {
      onKept(saved);
      toast("Saved to the journal");
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <SheetHeader>
          <SheetTitle>Add Journal Entry</SheetTitle>
          <SheetDescription>
            {card.name}
            {orientation === "reversed" ? " · reversed" : ""} ·{" "}
            {format(new Date(pulledAt), "MMM d, h:mm a")}
          </SheetDescription>
        </SheetHeader>
        <Label htmlFor="notes" className="mt-6">
          What did this card bring up?
        </Label>
        <Textarea
          id="notes"
          className="mt-2 min-h-36"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          onFocus={(event) => {
            const field = event.currentTarget;
            window.setTimeout(() => field.scrollIntoView({ block: "center", behavior: "smooth" }), 280);
          }}
          placeholder="A feeling, a question, a sentence you do not want to lose."
        />
        <div className="mt-4">
          <LinkFields id="table-entry" website={website} video={video} onWebsite={setWebsite} onVideo={setVideo} />
        </div>
      </div>
      <Button
        className="mt-2 shrink-0"
        onClick={() => {
          const links = readLinks(website, video);
          if (!links.ok) {
            toast(links.message);
            return;
          }
          save.mutate(links);
        }}
        disabled={save.isPending}
      >
        Keep this entry
      </Button>
    </div>
  );
}
