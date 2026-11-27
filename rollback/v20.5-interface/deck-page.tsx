"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Lock, LockOpen, Pencil, Plus, RotateCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ArtZoom } from "@/components/art-zoom";
import { CardArtStyle } from "@/components/card-art-style";
import { DeckGeometryButton } from "@/components/deck-geometry";
import { DeckSuits, cardSequence } from "@/components/deck-suits";
import { ChatWithSolace, ConsentLine } from "@/components/entry-links";
import { FilePicker } from "@/components/file-picker";
import { MeaningText } from "@/components/meaning-text";
import { TarotCardFace, VelomereBorder, cardImageSrc } from "@/components/tarot-card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { requestUploadConsent } from "@/components/upload-consent";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { colorName, colorTrack, edgeLook, edgeTrack } from "@/lib/cards/edge";
import { fileToDataUrl, shrinkDataUrl, svgToPng } from "@/lib/cards/image";
import {
  createCard,
  deleteCard,
  listCards,
  listDecks,
  renameDeck,
  reorderCards,
  setActiveDeck,
  updateCard,
} from "@/lib/cards/server";
import { CARD_TEMPLATES, cardFrame, clampDim } from "@/lib/cards/shape";
import {
  SUITS,
  defaultSort,
  isSuit,
  normalizeSuit,
  rankNumber,
  suitLabel,
} from "@/lib/cards/types";
import { unzipSync } from "fflate";
import { CARDS_CSV_TEMPLATE, cardsFromSpreadsheet, readDeckArchive, writeDeckZip } from "@/lib/cards/zip";
import { DEFAULT_LOOK, applyStarterDecks, completeLook, useJournal, type Orientation } from "@/lib/journal/store";
import { cardSitting } from "@/lib/solace/sitting";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: any) {
  return <div className={cn("animate-pulse rounded-md bg-raised", className)} {...props} />;
}
const EMPTY = {
  name: "",
  suit: "custom",
  rank: "",
  keywords: "",
  upright: "",
  reversed: "",
  imageUrl: null,
  imageScale: 100,
  imageX: 0,
  imageY: 0,
  imageRadius: 2,
};
function sameLook(a: any, b: any) {
  return Object.keys(DEFAULT_LOOK).every((key: any) => a[key] === b[key]);
}
function cardText(card: any) {
  return [
    card.id,
    card.name,
    card.suit,
    card.rank,
    card.keywords,
    card.upright,
    card.reversed,
    card.imageUrl ?? "",
    card.sortOrder,
    card.imageScale ?? 100,
    card.imageX ?? 0,
    card.imageY ?? 0,
    card.imageRadius ?? 2,
  ].join("\u0001");
}
function sameCards(a: any, b: any) {
  if (a.length !== b.length) return false;
  return a.every((card: any, index: any) => cardText(card) === cardText(b[index]));
}
function toInput(card: any) {
  return {
    name: card.name,
    suit: card.suit,
    rank: card.rank,
    keywords: card.keywords,
    upright: card.upright,
    reversed: card.reversed,
    imageUrl: card.imageUrl,
    sortOrder: card.sortOrder,
    imageScale: card.imageScale ?? 100,
    imageX: card.imageX ?? 0,
    imageY: card.imageY ?? 0,
    imageRadius: card.imageRadius ?? 2,
  };
}
function withPicture(saved: any, local: any) {
  return { ...saved, imageUrl: saved?.imageUrl || local?.imageUrl || null };
}
async function pictureForSave(next: unknown, prev?: unknown) {
  const image = typeof next === "string" && next.trim() ? next : null;
  if (prev !== undefined) {
    const before = typeof prev === "string" && prev.trim() ? prev : null;
    if (image === before) return null;
  }
  if (image && image.startsWith("data:") && image.length > 180_000) {
    try {
      return await shrinkDataUrl(image, 640);
    } catch {
      return image;
    }
  }
  return image;
}
function fromInput(input: any, id: any, sortOrder: any) {
  return {
    id,
    name: input.name.trim(),
    suit: input.suit,
    rank: input.rank.trim(),
    keywords: input.keywords.trim(),
    upright: input.upright.trim(),
    reversed: input.reversed.trim(),
    imageUrl: input.imageUrl,
    isSeed: false,
    sortOrder: input.sortOrder ?? sortOrder,
    imageScale: input.imageScale ?? 100,
    imageX: input.imageX ?? 0,
    imageY: input.imageY ?? 0,
    imageRadius: input.imageRadius ?? 2,
    createdAt: /* @__PURE__ */ new Date().toISOString(),
  };
}
const EMPTY_LIST: string[] = [];

export function DeckPage({ deckId, focusCardId }: any) {
  const queryClient = useQueryClient();
  const ensureActiveLook = useJournal((s: any) => s.ensureActiveLook);
  const commitDeckLook = useJournal((s: any) => s.commitDeckLook);
  const setActiveDeckId = useJournal((s: any) => s.setActiveDeckId);
  const rememberSuit = useJournal((s: any) => s.rememberSuit);
  const customSuits = useJournal((s: any) => s.customSuits) ?? EMPTY_LIST;
  const suitOrder = useJournal((s: any) => s.suitOrders?.[String(deckId)]) ?? EMPTY_LIST;
  const setSuitOrder = useJournal((s: any) => s.setSuitOrder);
  const deckConsent = useJournal((s: any) => s.deckConsents?.[String(deckId)]);
  const cardConsents = useJournal((s: any) => s.cardConsents);
  const { user } = useCurrentUserState();
  const { data: cards, isLoading } = useQuery({
    queryKey: ["cards", deckId],
    queryFn: () =>
      listCards({
        data: {
          deckId,
        },
      }),
    refetchOnMount: "always",
    enabled: user !== null,
  });
  const { data: decks } = useQuery({
    queryKey: ["decks"],
    queryFn: () => listDecks(),
    enabled: user !== null,
  });
  const deck = decks?.find((item: any) => item.id === deckId);
  const locked = deck?.locked ?? false;
  const [session, setSession] = useState<any>(null);
  const sessionRef = useRef<any>(null);
  sessionRef.current = session;
  const tempId = useRef(-1);
  const [saving, setSaving] = useState(false);
  const [customize, setCustomize] = useState(false);
  const [section, setSection] = useState<any>(null);
  const previewRef = useRef<any>(null);
  const [editing, setEditing] = useState<any>(null);
  const [pendingDelete, setPendingDelete] = useState<any>(null);
  const [previewCard, setPreviewCard] = useState<any>(null);
  const [previewFacing, setPreviewFacing] = useState<"upright" | "reversed">("upright");
  const [geometryView, setGeometryView] = useState<string | null>(null);
  const [cardZoom, setCardZoom] = useState(false);
  const [journalCard, setJournalCard] = useState<any>(null);
  const [arrange, setArrange] = useState(false);
  const [focusSuit, setFocusSuit] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const focused = useRef<any>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportAsk, setExportAsk] = useState(false);
  useEffect(() => {
    if (decks) applyStarterDecks(decks);
    if (!decks || !cards) return;
    const active = decks.find((item: any) => item.active);
    if (active) ensureActiveLook(active.id);
    setSession((current: any) => {
      const isLocked = decks.some((item: any) => item.id === deckId && item.locked);
      if (current?.id === deckId) {
        if (isLocked && !sameCards(current.cards, cards))
          return {
            ...current,
            baseCards: cards,
            cards,
          };
        return current;
      }
      const state = useJournal.getState();
      const isActive = decks.some((item: any) => item.id === deckId && item.active);
      const stored = state.deckLooks[String(deckId)];
      const saved = stored
        ? completeLook(stored)
        : isActive
          ? completeLook({
              edge: state.edge,
              edgeColor: state.edgeColor,
              edgeSat: state.edgeSat,
              edgeLight: state.edgeLight,
              cardThickness: state.cardThickness,
              cardRadius: state.cardRadius,
              cardWidth: state.cardWidth,
              cardLength: state.cardLength,
              cardLocked: state.cardLocked,
              cardTemplate: state.cardTemplate,
              cardBack: state.cardBack,
              backX: state.backX,
              backY: state.backY,
              backScale: state.backScale,
              backRotate: state.backRotate,
              tableImage: state.tableImage,
              tableX: state.tableX,
              tableY: state.tableY,
              tableScale: state.tableScale,
              tableRotate: state.tableRotate,
              tableColor: state.tableColor,
              tableSat: state.tableSat,
              tableLight: state.tableLight,
              tableContrast: state.tableContrast,
              tableVignette: state.tableVignette,
            })
          : DEFAULT_LOOK;
      return {
        id: deckId,
        baseLook: saved,
        look: saved,
        baseCards: cards,
        cards,
      };
    });
  }, [cards, deckId, decks, ensureActiveLook]);
  const ready = session?.id === deckId ? session : null;
  const look = ready?.look ?? DEFAULT_LOOK;
  const shownCards = ready?.cards ?? cards ?? [];
  const browse = cardSequence(shownCards, customSuits ?? [], suitOrder);
  const browseIndex = browse.findIndex((card) => card.id === previewCard?.id);
  const uprightRef = useRef<HTMLDivElement>(null);
  const reversedRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);
  const [uprightHeight, setUprightHeight] = useState(0);
  const [reversedHeight, setReversedHeight] = useState(0);
  const [browseDir, setBrowseDir] = useState(0);
  useLayoutEffect(() => {
    setUprightHeight(uprightRef.current?.offsetHeight ?? 0);
    setReversedHeight(reversedRef.current?.offsetHeight ?? 0);
  }, [previewCard?.id, previewCard?.upright, previewCard?.reversed, previewFacing]);
  const showCard = (card: any, facing: "upright" | "reversed" = "upright") => {
    setCardZoom(false);
    setBrowseDir(0);
    setPreviewFacing(facing);
    setPreviewCard(card);
  };
  const stepCard = (delta: number) => {
    const next = browse[browseIndex + delta];
    if (!next) return;
    setCardZoom(false);
    setBrowseDir(delta);
    setPreviewCard(next);
  };
  useEffect(() => {
    if (focusCardId == null || focused.current === focusCardId) return;
    if (!cards) return;
    focused.current = focusCardId;
    const card = cards.find((item: any) => item.id === focusCardId);
    if (!card) {
      toast("That card isn't in this deck.");
      return;
    }
    setPreviewFacing("upright");
    setPreviewCard(card);
    setFocusSuit(String(card.suit || ""));
    requestAnimationFrame(() => {
      document.getElementById(`deck-card-${card.id}`)?.scrollIntoView({
        block: "center",
      });
    });
  }, [cards, focusCardId]);
  const dirty =
    !!ready &&
    !locked &&
    (!sameLook(ready.look, ready.baseLook) || !sameCards(ready.cards, ready.baseCards));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const patchLook = (patch: any) => {
    setSession((current: any) =>
      current && current.id === deckId
        ? {
            ...current,
            look: {
              ...current.look,
              ...patch,
            },
          }
        : current,
    );
  };
  const edge = look.edge;
  const setEdge = (value: any) =>
    patchLook({
      edge: Math.min(100, Math.max(0, Math.round(value))),
    });
  const edgeColor = look.edgeColor;
  const setEdgeColor = (value: any) =>
    patchLook({
      edgeColor: Math.min(100, Math.max(0, Math.round(value))),
    });
  const edgeSat = look.edgeSat;
  const setEdgeSat = (value: any) =>
    patchLook({
      edgeSat: Math.min(100, Math.max(0, Math.round(value))),
    });
  const edgeLight = look.edgeLight;
  const setEdgeLight = (value: any) =>
    patchLook({
      edgeLight: Math.min(100, Math.max(0, Math.round(value))),
    });
  const cardThickness = look.cardThickness;
  const setCardThickness = (value: any) =>
    patchLook({
      cardThickness: Math.min(200, Math.max(40, Math.round(value))),
    });
  const cardRadius = look.cardRadius;
  const setCardRadius = (value: any) =>
    patchLook({
      cardRadius: Math.min(40, Math.max(0, Math.round(value))),
    });
  const cardWidth = look.cardWidth;
  const setCardWidth = (value: any) =>
    patchLook({
      cardWidth: Math.min(160, Math.max(55, Math.round(value))),
    });
  const cardLength = look.cardLength;
  const setCardLength = (value: any) =>
    patchLook({
      cardLength: Math.min(160, Math.max(55, Math.round(value))),
    });
  const cardLocked = look.cardLocked;
  const setCardLocked = (value: any) =>
    patchLook({
      cardLocked: value,
    });
  const cardTemplate = look.cardTemplate;
  const setCardTemplate = (value: any) =>
    patchLook({
      cardTemplate: value,
      cardWidth: 55,
      cardLength: 55,
      cardLocked: true,
    });
  const cardBack = look.cardBack;
  const setCardBack = (value: any) =>
    patchLook({
      cardBack: value,
      backX: 0,
      backY: 0,
      backScale: 100,
      backRotate: 0,
    });
  const backX = look.backX;
  const backY = look.backY;
  const backScale = look.backScale;
  const backRotate = look.backRotate;
  const setBackPlace = (patch: any) =>
    patchLook({
      backX: patch.x ?? look.backX,
      backY: patch.y ?? look.backY,
      backScale: patch.scale ?? look.backScale,
      backRotate: patch.rotate ?? look.backRotate,
    });
  const resetDeck = () =>
    setSession((current: any) =>
      current && current.id === deckId ? { ...current, look: current.baseLook } : current,
    );
  const discard = () => {
    setSession((current: any) =>
      current && current.id === deckId
        ? {
            ...current,
            look: current.baseLook,
            cards: current.baseCards,
            remaps: [],
          }
        : current,
    );
  };
  const persist = async () => {
    const current = sessionRef.current;
    if (!current || current.id !== deckId || locked) return;
    setSaving(true);
    let base = current.baseCards;
    let draft = current.cards.slice();
    const look = current.look;
    const publish = (nextBase: any, nextDraft: any) => {
      base = nextBase;
      draft = nextDraft;
      const next = {
        id: deckId,
        baseLook: current.baseLook,
        look,
        baseCards: nextBase,
        cards: nextDraft,
        remaps: current.remaps ?? [],
      };
      sessionRef.current = next;
      setSession(next);
    };
    try {
      for (const old of [...base]) {
        if (draft.some((card: any) => card.id === old.id)) continue;
        await deleteCard({
          data: {
            id: old.id,
          },
        });
        publish(
          base.filter((card: any) => card.id !== old.id),
          draft,
        );
      }
      for (const card of [...draft]) {
        if (card.id < 0) continue;
        const prev = base.find((item: any) => item.id === card.id);
        if (!prev || cardText(prev) === cardText(card)) continue;
        const saved = await updateCard({
          data: {
            id: card.id,
            ...toInput(card),
            imageUrl: await pictureForSave(card.imageUrl, prev.imageUrl),
          },
        });
        const kept = withPicture(saved, card);
        publish(
          base.map((item: any) => (item.id === card.id ? kept : item)),
          draft.map((item: any) => (item.id === card.id ? kept : item)),
        );
      }
      for (const card of [...draft]) {
        if (card.id >= 0) continue;
        const saved = await createCard({
          data: {
            ...toInput(card),
            imageUrl: await pictureForSave(card.imageUrl),
            deckId,
          },
        });
        const kept = withPicture(saved, card);
        publish(
          [...base, kept],
          draft.map((item: any) => (item.id === card.id ? kept : item)),
        );
      }
      commitDeckLook(deckId, look);
      for (const remap of current.remaps ?? []) {
        useJournal.getState().remapReadings(deckId, remap.fromIds, remap.next);
      }
      const savedSession = {
        id: deckId,
        baseLook: look,
        look,
        baseCards: draft,
        cards: draft,
        remaps: [],
      };
      sessionRef.current = savedSession;
      setSession(savedSession);
      queryClient.setQueryData(["cards", deckId], draft);
      queryClient.invalidateQueries({
        queryKey: ["cards", "table"],
      });
      toast("Deck saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast(
        message.includes("content-type") ? "That save didn’t go through. Try again." : message || "Could not save this deck.",
      );
      throw err;
    } finally {
      setSaving(false);
    }
  };
  const stageCards = (inputs: any) => {
    setSession((current: any) => {
      if (!current || current.id !== deckId) return current;
      const added = inputs.map((input: any, index: any) =>
        fromInput(input, tempId.current--, input.sortOrder ?? defaultSort(input.suit) + index),
      );
      return {
        ...current,
        cards: [...current.cards, ...added],
      };
    });
  };
  const stageImport = (inputs: any, imported: any, suits: string[] = [], overwrite = false) => {
    for (const suit of suits) rememberSuit(suit);
    for (const card of inputs) {
      if (card?.suit && !isSuit(card.suit)) rememberSuit(card.suit);
    }
    if (!overwrite) {
      stageCards(inputs);
      if (imported) patchLook(imported);
      return;
    }
    setSession((current: any) => {
      if (!current || current.id !== deckId) return current;
      let nextCards = [...current.cards];
      const remaps = [...(current.remaps ?? [])];
      for (const input of inputs) {
        const suit = normalizeSuit(String(input.suit ?? ""));
        const matches = nextCards.filter(
          (card: any) => String(card.name).toLowerCase() === String(input.name).toLowerCase() && card.suit === suit,
        );
        if (matches.length === 0) {
          nextCards.push(fromInput(input, tempId.current--, input.sortOrder ?? nextCards.length));
          continue;
        }
        const keep = matches[0];
        const extras = matches.slice(1);
        const updated = fromInput(
          { ...input, suit, imageUrl: input.imageUrl || keep.imageUrl },
          keep.id,
          keep.sortOrder,
        );
        const drop = new Set(extras.map((card: any) => card.id));
        nextCards = nextCards
          .filter((card: any) => !drop.has(card.id))
          .map((card: any) => (card.id === keep.id ? updated : card));
        const fromIds = [keep.id, ...extras.map((card: any) => card.id)].filter((id: number) => id > 0);
        if (fromIds.length > 0 && keep.id > 0) {
          remaps.push({
            fromIds,
            next: {
              cardId: keep.id,
              cardName: updated.name,
              suit: updated.suit,
              rank: updated.rank,
              keywords: updated.keywords,
            },
          });
        }
      }
      return {
        ...current,
        cards: nextCards,
        remaps,
        ...(imported ? { look: { ...current.look, ...imported } } : null),
      };
    });
  };
  const exportDeck = async () => {
    if (exporting) return;
    setExportAsk(false);
    setExporting(true);
    try {
      const deckCards = shownCards;
      const archive = await verifiedOwnedArchive(deckCards.map((card: { imageUrl?: string | null }) => card.imageUrl));
      if (archive) {
        const blob = new Blob([archive], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const safe = (deck?.name ?? "deck")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        link.href = url;
        link.download = `${safe || "deck"}.zip`;
        link.click();
        URL.revokeObjectURL(url);
        toast("Deck exported");
        return;
      }
      const packed = [];
      for (const [index, card] of deckCards.entries()) {
        const artwork = card.imageUrl ? await loadArtwork(card.imageUrl) : null;
        const imageName = artwork ? artworkName(index, card.name, artwork.ext) : null;
        packed.push({
          name: card.name,
          suit: card.suit,
          rank: card.rank,
          keywords: card.keywords,
          upright: card.upright,
          reversed: card.reversed,
          sortOrder: card.sortOrder,
          imageScale: card.imageScale ?? 100,
          imageX: card.imageX ?? 0,
          imageY: card.imageY ?? 0,
          imageRadius: card.imageRadius ?? 2,
          imageName,
          image: artwork?.bytes ?? null,
        });
      }
      const back = await loadArtwork(look.cardBack || "/card-back-deck.jpg");
      const cardBackName = back ? `card-back.${back.ext}` : null;
      const tableArt = look.tableImage ? await loadArtwork(look.tableImage) : null;
      const tableImageName = tableArt ? `table.${tableArt.ext}` : null;
      const suits = new Set<string>(customSuits);
      for (const card of deckCards) {
        if (card.suit && !isSuit(card.suit)) suits.add(String(card.suit));
      }
      const extras = await ownedSigilExtras(deckCards.map((card: { imageUrl?: string | null }) => card.imageUrl));
      const zipped = writeDeckZip(packed, {
        edge: look.edge,
        edgeColor: look.edgeColor,
        edgeSat: look.edgeSat,
        edgeLight: look.edgeLight,
        cardThickness: look.cardThickness,
        cardRadius: look.cardRadius,
        cardWidth: look.cardWidth,
        cardLength: look.cardLength,
        cardLocked: look.cardLocked,
        cardTemplate: look.cardTemplate,
        backX: look.backX,
        backY: look.backY,
        backScale: look.backScale,
        backRotate: look.backRotate,
        cardBackName,
        cardBack: back?.bytes ?? null,
        customSuits: [...suits],
        tableImageName,
        tableImage: tableArt?.bytes ?? null,
        tableX: look.tableX ?? 0,
        tableY: look.tableY ?? 0,
        tableScale: look.tableScale ?? 100,
        tableRotate: look.tableRotate ?? 0,
        tableColor: look.tableColor ?? 0,
        tableSat: look.tableSat ?? 100,
        tableLight: look.tableLight ?? 100,
        tableContrast: look.tableContrast ?? 100,
        tableVignette: look.tableVignette ?? 18,
      }, extras, Boolean(extras?.["manifest.json"]));
      const blob = new Blob([new Uint8Array(zipped)], {
        type: "application/zip",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safe = (deck?.name ?? "deck")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      link.href = url;
      link.download = `${safe || "deck"}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast("Deck exported");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not export this deck.");
    } finally {
      setExporting(false);
    }
  };
  const writeCard = (id: any, input: any) => {
    const suit = normalizeSuit(String(input.suit ?? ""));
    if (!isSuit(suit)) rememberSuit(suit);
    const next = { ...input, suit };
    setSession((current: any) => {
      if (!current || current.id !== deckId) return current;
      if (id == null)
        return {
          ...current,
          cards: [...current.cards, fromInput(next, tempId.current--, current.cards.length)],
        };
      return {
        ...current,
        cards: current.cards.map((card: any) =>
          card.id === id ? fromInput(next, id, card.sortOrder) : card,
        ),
      };
    });
    setEditing(null);
  };
  const commitOrder = (next: any[]) => {
    const stamped = next.map((card, index) => ({ ...card, sortOrder: index }));
    setSession((current: any) =>
      current && current.id === deckId ? { ...current, cards: stamped } : current,
    );
    if (!locked) return;
    const ids = stamped.filter((card) => card.id > 0).map((card) => card.id);
    if (ids.length === 0) return;
    void reorderCards({ data: { deckId, ids } })
      .then((saved) => {
        const kept = saved.map((card: any) => withPicture(card, stamped.find((item) => item.id === card.id)));
        queryClient.setQueryData(["cards", deckId], kept);
        setSession((current: any) =>
          current && current.id === deckId ? { ...current, cards: kept, baseCards: kept } : current,
        );
      })
      .catch((err) =>
        toast(
          err instanceof Error && err.message.includes("content-type")
            ? "That save didn’t go through. Try again."
            : err instanceof Error
              ? err.message
              : "Could not rearrange this deck.",
        ),
      );
  };
  const sortByName = () => {
    commitOrder([...shownCards].sort((a, b) => String(a.name).localeCompare(String(b.name))));
  };
  const sortByNumber = () => {
    commitOrder(
      [...shownCards].sort((a, b) => {
        const an = rankNumber(String(a.rank ?? ""));
        const bn = rankNumber(String(b.rank ?? ""));
        if (an == null && bn == null) return String(a.name).localeCompare(String(b.name));
        if (an == null) return 1;
        if (bn == null) return -1;
        if (an !== bn) return an - bn;
        return String(a.name).localeCompare(String(b.name));
      }),
    );
  };
  const shouldBlockFn = useCallback(() => dirtyRef.current, []);
  const blockUnload = useCallback(() => dirtyRef.current, []);
  const blocker = useBlocker({
    shouldBlockFn,
    withResolver: true,
    enableBeforeUnload: blockUnload,
    disabled: locked || !dirty,
  });
  const makeDefault = useMutation({
    mutationFn: () =>
      setActiveDeck({
        data: {
          id: deckId,
        },
      }),
    onSuccess: () => {
      setActiveDeckId(deckId);
      queryClient.invalidateQueries({
        queryKey: ["decks"],
      });
      queryClient.invalidateQueries({
        queryKey: ["cards"],
      });
      toast("This is the active deck");
    },
    onError: (err: any) => toast(err.message),
  });
  const rename = useMutation({
    mutationFn: (name: string) => renameDeck({ data: { id: deckId, name } }),
    onSuccess: () => {
      setRenaming(false);
      void queryClient.invalidateQueries({ queryKey: ["decks"] });
      toast("Deck renamed");
    },
    onError: (err: Error) => toast(err.message),
  });
  const deckPreview = (
    <div ref={previewRef} className={cn("scroll-mt-16", locked && "pointer-events-none")}>
      <DeckLivePreview
        frame={cardFrame(cardTemplate ?? "tarot", cardWidth ?? 55, cardLength ?? 55)}
        edgeBackground={
          edgeLook(edge ?? 100, edgeColor ?? 0, edgeSat ?? 0, edgeLight ?? 26).background
        }
        thickness={cardThickness ?? 75}
        radius={cardRadius ?? 5}
        src={cardBack || "/card-back-deck.jpg"}
        backX={backX ?? 0}
        backY={backY ?? 0}
        backScale={backScale ?? 100}
        backRotate={backRotate ?? 0}
        placing={section === "back"}
        onPlace={setBackPlace}
      />
    </div>
  );
  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = draftName.trim();
                if (name) rename.mutate(name);
              }}
            >
              <Input
                value={draftName}
                maxLength={60}
                aria-label="Deck name"
                onChange={(event) => setDraftName(event.target.value)}
              />
              <Button type="submit" disabled={!draftName.trim() || rename.isPending}>
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 truncate font-display text-4xl font-medium tracking-tight">
                {deck?.name ?? "Deck"}
              </h1>
              {locked ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Rename deck"
                  onClick={() => {
                    setDraftName(deck?.name ?? "");
                    setRenaming(true);
                  }}
                >
                  <Pencil />
                </Button>
              )}
            </div>
          )}
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
            {locked
              ? `${deck?.name ?? "This deck"} is locked. You can look through it, and you can make it the active deck.`
              : "Changes stay here until you save. Leaving this page discards them."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={exporting}
            onClick={() => setExportAsk(true)}
          >
            <Download />
            {exporting ? "Exporting…" : "Export zip"}
          </Button>
          {locked ? null : (
            <Fragment>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload />
                Upload cards
              </Button>
              <Button onClick={() => setEditing("new")}>
                <Plus />
                Add a card
              </Button>
            </Fragment>
          )}
        </div>
      </div>
      <label className="mt-8 flex items-center justify-between gap-4 rounded-xl bg-surface p-4 shadow-border">
        <span>
          <span className="block text-sm text-fg">Make Active Deck</span>
          <span className="mt-1 block text-xs text-subtle">
            The table draws from the active deck. Check another deck to switch.
          </span>
        </span>
        <input
          type="checkbox"
          className="size-4 accent-fg"
          checked={deck?.active ?? false}
          disabled={deck?.active || makeDefault.isPending}
          onChange={() => makeDefault.mutate()}
        />
      </label>
      <div className="mt-3 rounded-xl bg-surface shadow-border">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 p-4 text-left"
          aria-expanded={customize}
          onClick={() => {
            setCustomize((open: any) => !open);
            setSection(null);
          }}
        >
          <span className="text-sm text-fg">Customize Deck</span>
          <ChevronDown
            className={cn("size-4 text-muted transition-transform", customize && "rotate-180")}
          />
        </button>
        {customize ? (
          <Fragment>
            <div className="sticky top-28 z-10 border-t border-border bg-surface px-4 py-3">
              {deckPreview}
            </div>
            <Fold
              title="Edge"
              summary={edgeSummary(edge ?? 100, edgeColor ?? 0, edgeSat ?? 0, edgeLight ?? 26)}
              open={section === "edge"}
              onToggle={() => setSection((current: any) => (current === "edge" ? null : "edge"))}
            >
              <div className={cn(locked && "pointer-events-none opacity-60")}>
                <EdgeSlider
                  value={edge ?? 100}
                  color={edgeColor ?? 0}
                  saturation={edgeSat ?? 0}
                  luminous={edgeLight ?? 26}
                  onChange={setEdge}
                  onColor={setEdgeColor}
                  onSaturation={setEdgeSat}
                  onLuminous={setEdgeLight}
                />
              </div>
            </Fold>
            <Fold
              title="Size"
              summary={
                cardTemplate
                  ? CARD_TEMPLATES.find((item: any) => item.id === cardTemplate)?.label
                  : "Deck size"
              }
              open={section === "size"}
              onToggle={() => setSection((current: any) => (current === "size" ? null : "size"))}
            >
              <div className={cn(locked && "pointer-events-none opacity-60")}>
                <DeckShape
                  thickness={cardThickness ?? 75}
                  radius={cardRadius ?? 5}
                  width={cardWidth ?? 55}
                  length={cardLength ?? 55}
                  locked={cardLocked ?? true}
                  template={cardTemplate ?? "tarot"}
                  onThickness={setCardThickness}
                  onRadius={setCardRadius}
                  onWidth={setCardWidth}
                  onLength={setCardLength}
                  onLocked={setCardLocked}
                  onTemplate={setCardTemplate}
                />
              </div>
            </Fold>
            <Fold
              title="Card back"
              summary={cardBack ? "Custom picture" : "Original"}
              open={section === "back"}
              onToggle={() => setSection((current: any) => (current === "back" ? null : "back"))}
            >
              <div className={cn(locked && "pointer-events-none opacity-60")}>
                <CardBackControls
                  deckId={deckId}
                  back={cardBack ?? null}
                  backScale={backScale ?? 100}
                  backRotate={backRotate ?? 0}
                  onBack={setCardBack}
                  onPlace={setBackPlace}
                />
              </div>
            </Fold>
            <Fold
              title="Table"
              summary={look.tableImage ? "Custom picture" : "Marble"}
              open={section === "table"}
              onToggle={() => setSection((current: any) => (current === "table" ? null : "table"))}
            >
              <TableControls
                deckId={deckId}
                image={look.tableImage ?? null}
                x={look.tableX ?? 0}
                y={look.tableY ?? 0}
                scale={look.tableScale ?? 100}
                rotate={look.tableRotate ?? 0}
                color={look.tableColor ?? 0}
                saturation={look.tableSat ?? 100}
                luminous={look.tableLight ?? 100}
                contrast={look.tableContrast ?? 100}
                vignette={look.tableVignette ?? 18}
                onChange={(patch: any) => {
                  const current = sessionRef.current;
                  if (!current || current.id !== deckId) return;
                  const next = { ...DEFAULT_LOOK, ...current.look, ...patch };
                  setSession(
                    current && current.id === deckId
                      ? { ...current, look: next, ...(locked ? { baseLook: next } : null) }
                      : current,
                  );
                  if (locked) useJournal.getState().commitDeckLook(deckId, next);
                }}
              />
            </Fold>
            <Fold
              title="Card Art Style"
              summary="Six scene languages. New readers start on Veiled Luminescence."
              open={section === "art"}
              onToggle={() => setSection((current: any) => (current === "art" ? null : "art"))}
            >
              <CardArtStyle deckId={String(deckId)} />
            </Fold>
            <div
              className={cn(
                "border-t border-border px-4 py-4",
                locked && "pointer-events-none opacity-60",
              )}
            >
              <Button type="button" variant="secondary" className="w-full" onClick={resetDeck}>
                Reset Settings
              </Button>
            </div>
          </Fragment>
        ) : null}
      </div>
      {isLoading ? (
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({
            length: 6,
          }).map((_: any, i: any) => (
            <Skeleton className="aspect-card rounded-lg" key={i} />
          ))}
        </div>
      ) : (
        <>
          {shownCards.length === 0 && (customSuits ?? []).length === 0 ? (
            <p className="mt-10 text-sm leading-relaxed text-muted">This deck has no cards yet.</p>
          ) : (
            <>
              {shownCards.length > 0 ? (
                <div className="mt-8 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant={arrange ? "default" : "secondary"}
                    onClick={() => setArrange((open) => !open)}
                  >
                    {arrange ? "Done arranging" : "Arrange"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={sortByName}>
                    Sort by name
                  </Button>
                  <Button type="button" variant="secondary" onClick={sortByNumber}>
                    Sort by number
                  </Button>
                </div>
              ) : null}
              <DeckSuits
                cards={shownCards}
                customSuits={customSuits ?? []}
                suitOrder={suitOrder}
                arrange={arrange}
                locked={locked}
                focusSuit={focusSuit}
                onCards={commitOrder}
                onSuitOrder={(order) => setSuitOrder(deckId, order)}
                onPreview={(card) => showCard(card)}
                onEdit={setEditing}
                onDelete={setPendingDelete}
              />
            </>
          )}
        </>
      )}
      {deckConsent ? (
        <div className="mt-8">
          <ConsentLine consent={deckConsent} />
        </div>
      ) : null}
      {deck && !locked ? (
        <div className="sticky bottom-4 z-20 mt-10 flex gap-2 rounded-xl bg-bg/90 p-2 backdrop-blur-sm">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={!dirty || saving}
            onClick={discard}
          >
            Discard changes
          </Button>
          <Button
            type="button"
            className="flex-1"
            disabled={!dirty || saving}
            onClick={() => void persist()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      ) : null}
      <ZipImport open={importOpen} onOpenChange={setImportOpen} onStage={stageImport} deckId={deckId} />
      <Dialog open={exportAsk} onOpenChange={setExportAsk}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export this deck</DialogTitle>
            <DialogDescription>
              {`Export a zip of ${deck?.name ?? "this deck"}? This is a simplified deck export. It does not keep Encounter lineage, geometric scores, or companion art, and it is not a complete backup.`}
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void exportDeck();
            }}
          >
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setExportAsk(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={exporting}>
                Export zip
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <CardEditor
        open={editing !== null}
        card={editing === "new" || editing === null ? null : editing}
        pending={false}
        suits={customSuits}
        deckId={deckId}
        frame={{
          imageScale: look.backScale ?? 100,
          imageX: look.backX ?? 0,
          imageY: look.backY ?? 0,
          imageRadius: look.cardRadius ?? 5,
        }}
        onOpenChange={(open: any) => !open && setEditing(null)}
        onSave={(input: any) =>
          writeCard(editing && editing !== "new" ? editing.id : void 0, input)
        }
      />
      <CardJournal
        open={journalCard !== null}
        card={journalCard}
        deckId={deckId}
        deckName={deck?.name ?? "Deck"}
        onOpenChange={(open: boolean) => !open && setJournalCard(null)}
      />
      <Dialog
        open={previewCard !== null}
        onOpenChange={(open: any) => {
          if (!open) {
            setCardZoom(false);
            setPreviewFacing("upright");
            setPreviewCard(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto"
          onPointerDownOutside={(event) => {
            if (cardZoom) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (cardZoom) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (!cardZoom) return;
            event.preventDefault();
            setCardZoom(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>{previewCard?.name ?? "Card"}</DialogTitle>
            <DialogDescription>
              {previewCard
                ? [suitLabel(previewCard.suit), previewCard.rank].filter(Boolean).join(" · ") || "Card"
                : "Card"}
            </DialogDescription>
          </DialogHeader>
          {previewCard ? (
            <div
              className="relative"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                swipeRef.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={(event) => {
                const start = swipeRef.current;
                swipeRef.current = null;
                if (!start) return;
                const dx = event.clientX - start.x;
                const dy = event.clientY - start.y;
                if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
                stepCard(dx < 0 ? 1 : -1);
              }}
              onPointerCancel={() => {
                swipeRef.current = null;
              }}
            >
              <button
                type="button"
                className="absolute top-1/2 left-0 z-10 flex size-8 -translate-y-1/2 items-center justify-center text-subtle disabled:opacity-25"
                aria-label="Previous card"
                disabled={browseIndex <= 0}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => stepCard(-1)}
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                className="absolute top-1/2 right-0 z-10 flex size-8 -translate-y-1/2 items-center justify-center text-subtle disabled:opacity-25"
                aria-label="Next card"
                disabled={browseIndex < 0 || browseIndex >= browse.length - 1}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => stepCard(1)}
              >
                <ChevronRight className="size-5" />
              </button>
              <HoldArt onHold={() => setCardZoom(true)}>
                <div key={previewCard.id} className={cn("overflow-hidden px-8", browseDir > 0 ? "card-step-next" : browseDir < 0 ? "card-step-prev" : "")}>
                  {previewCard.imageUrl ? (
                    <div
                      className="relative mx-auto w-fit transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{ transform: previewFacing === "reversed" ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      <img
                        src={cardImageSrc(geometryView || previewCard.imageUrl)}
                        alt={previewCard.name}
                        draggable={false}
                        className="mx-auto max-h-[40dvh] w-auto max-w-full rounded-md object-contain"
                      />
                      <VelomereBorder src={previewCard.imageUrl} suit={previewCard.suit} className="rounded-md" />
                    </div>
                  ) : (
                    <div
                      className="mx-auto w-full max-w-[12rem] overflow-hidden rounded-md bg-[#f7f3ea] transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                      style={{
                        aspectRatio: "2 / 3",
                        transform: previewFacing === "reversed" ? "rotate(180deg)" : "rotate(0deg)",
                      }}
                    >
                      <TarotCardFace card={previewCard} />
                    </div>
                  )}
                </div>
              </HoldArt>
            </div>
          ) : null}
          {previewCard ? (
            <>
              <button
                type="button"
                className="mx-auto flex items-center gap-1.5 text-xs tracking-wide text-subtle"
                aria-pressed={previewFacing === "reversed"}
                aria-label={previewFacing === "reversed" ? "Turn the card upright" : "Turn the card reversed"}
                onClick={() => setPreviewFacing((current) => (current === "reversed" ? "upright" : "reversed"))}
              >
                <RotateCw className={cn("size-3.5 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", previewFacing === "reversed" && "rotate-180")} />
                {previewFacing === "reversed" ? "Reversed" : "Upright"}
              </button>
              <DeckGeometryButton cardId={Number(previewCard.id)} onGeometry={setGeometryView} />
            </>
          ) : null}
          {previewCard ? (
            <p className="text-center text-xs text-subtle">Hold the card to enlarge.</p>
          ) : null}
          {previewCard ? (
            <div key={`meaning-${previewCard.id}`} className={cn("flex flex-col gap-4", browseDir > 0 ? "card-step-next" : browseDir < 0 ? "card-step-prev" : "")}>
              {previewCard.keywords ? (
                <p className="text-sm leading-relaxed text-muted">{previewCard.keywords}</p>
              ) : null}
              <div>
                <div
                  ref={uprightRef}
                  style={{
                    transform: previewFacing === "reversed" ? `translateY(${reversedHeight + 16}px)` : "translateY(0px)",
                    transition: "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  <p className="text-xs tracking-[0.16em] text-subtle uppercase">Upright</p>
                  <MeaningText
                    className="mt-2 text-sm leading-relaxed text-fg"
                    text={previewCard.upright || "No upright meaning yet."}
                  />
                </div>
                <div
                  ref={reversedRef}
                  className="mt-4"
                  style={{
                    transform: previewFacing === "reversed" ? `translateY(-${uprightHeight + 16}px)` : "translateY(0px)",
                    transition: "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  <p className="text-xs tracking-[0.16em] text-subtle uppercase">Reversed</p>
                  <MeaningText
                    className="mt-2 text-sm leading-relaxed text-fg"
                    text={previewCard.reversed || "No reversed meaning yet."}
                  />
                </div>
              </div>
            </div>
          ) : null}
          {previewCard ? (
            <div className="flex flex-col gap-2">
              <ChatWithSolace
                sitting={cardSitting({
                  name: previewCard.name ?? "",
                  deckName: deck?.name,
                  orientation: previewFacing,
                  suit: suitLabel(previewCard.suit),
                  rank: previewCard.rank,
                  keywords: previewCard.keywords,
                  upright: previewCard.upright,
                  reversed: previewCard.reversed,
                })}
                source={{
                  kind: "card",
                  from: "deck",
                  cardName: previewCard.name || "Card",
                  cardId: typeof previewCard.id === "number" ? previewCard.id : 0,
                  deckId: typeof deckId === "number" ? deckId : null,
                  deckName: deck?.name ?? "",
                  suit: typeof previewCard.suit === "string" ? previewCard.suit : "",
                  rank: typeof previewCard.rank === "string" ? previewCard.rank : "",
                  orientation: previewFacing,
                  keywords: typeof previewCard.keywords === "string" ? previewCard.keywords : "",
                  imageUrl: typeof previewCard.imageUrl === "string" ? previewCard.imageUrl : null,
                  pulledAt: "",
                  question: "",
                  meaning: previewFacing === "reversed" ? previewCard.reversed ?? "" : previewCard.upright ?? "",
                  readingId: null,
                }}
              />
              {previewCard.id > 0 ? (
                <>
                  <Button asChild variant="secondary" className="w-full">
                    <Link
                      to="/journal"
                      search={{
                        deck: deckId,
                        card: previewCard.id,
                      }}
                    >
                      Journal entries for this card
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setJournalCard(previewCard);
                      setPreviewCard(null);
                    }}
                  >
                    Add Journal Entry
                  </Button>
                </>
              ) : null}
              {locked ? null : (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    setEditing(previewCard);
                    setPreviewCard(null);
                  }}
                >
                  <Pencil />
                  Edit
                </Button>
              )}
            </div>
          ) : null}
          {previewCard ? (
            <ConsentLine
              consent={cardConsents?.[`${deckId}:${String(previewCard.name ?? "").trim().toLowerCase()}`]}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {cardZoom && previewCard ? (
        <ArtZoom
          card={previewCard}
          orientation={previewFacing}
          onClose={() => setCardZoom(false)}
          onStep={(delta) => {
            const next = browse[browseIndex + delta];
            if (!next) return false;
            setBrowseDir(delta);
            setPreviewCard(next);
            return true;
          }}
        />
      ) : null}
      <Dialog open={pendingDelete !== null} onOpenChange={(o: any) => !o && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this card?</DialogTitle>
            <DialogDescription>
              {pendingDelete
                ? `${pendingDelete.name} leaves this draft. It stays in the saved deck until you save.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep it
            </Button>
            <Button
              onClick={() => {
                if (!pendingDelete) return;
                const id = pendingDelete.id;
                setSession((current: any) =>
                  current && current.id === deckId
                    ? {
                        ...current,
                        cards: current.cards.filter((card: any) => card.id !== id),
                      }
                    : current,
                );
                setPendingDelete(null);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={blocker.status === "blocked"}
        onOpenChange={(open: any) => {
          if (!open && blocker.status === "blocked") blocker.reset?.();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save changes?</DialogTitle>
            <DialogDescription>
              This deck has changes that are not saved. Leaving discards them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" disabled={saving} onClick={() => blocker.proceed?.()}>
              Discard changes
            </Button>
            <Button
              disabled={saving}
              onClick={() => {
                persist()
                  .then(() => blocker.proceed?.())
                  .catch(() => blocker.reset?.());
              }}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
function HoldArt({ onHold, children }: { onHold: () => void; children: any }) {
  const press = useRef<any>(null);
  const clear = () => {
    const active = press.current;
    if (active) window.clearTimeout(active.timer);
    press.current = null;
  };
  return (
    <div
      className="touch-none select-none"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        const active = { x: event.clientX, y: event.clientY, moved: false, timer: 0 };
        active.timer = window.setTimeout(() => {
          if (!press.current || press.current.moved) return;
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
      onPointerUp={clear}
      onPointerCancel={clear}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}
function edgeSummary(value: any, color: any, saturation: any, luminous: any) {
  const look = edgeLook(value, color, saturation, luminous);
  return color > 0
    ? `${look.name} · ${look.finish} · ${colorName(color)}`
    : `${look.name} · ${look.finish}`;
}
function Fold({ title, summary, open, onToggle, children }: any) {
  return (
    <div className="border-t border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>
          <span className="block text-sm text-fg">{title}</span>
          {summary ? <span className="mt-0.5 block text-xs text-subtle">{summary}</span> : null}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}
function DeckLivePreview({
  frame,
  edgeBackground,
  thickness,
  radius,
  src,
  backX,
  backY,
  backScale,
  backRotate,
  placing,
  onPlace,
}: any) {
  const drag = useRef<any>(null);
  const step = Math.min(2.2, Math.max(0.65, 56 / 78)) * (thickness / 100);
  const spanX = 77 * step * 0.25;
  const spanY = 77 * step * 0.18;
  const slices = 12;
  return (
    <div className="border-t border-border bg-surface px-4 py-8">
      <div
        className={cn(
          "flex justify-center",
          placing && "cursor-grab touch-none active:cursor-grabbing",
        )}
        onPointerDown={(event: any) => {
          if (!placing) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: backX,
            y: backY,
            px: event.clientX,
            py: event.clientY,
          };
        }}
        onPointerMove={(event: any) => {
          const start = drag.current;
          if (!placing || !start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const dx = ((event.clientX - start.px) / Math.max(1, rect.width)) * 100;
          const dy = ((event.clientY - start.py) / Math.max(1, rect.height)) * 100;
          onPlace({
            x: Math.min(80, Math.max(-80, Math.round(start.x + dx))),
            y: Math.min(80, Math.max(-80, Math.round(start.y + dy))),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <div
          className="deck-table"
          style={{
            width: frame.width,
            ["--radius-lg" as string]: `${radius}px`,
          }}
        >
          <div
            className="deck-pile"
            style={{
              aspectRatio: frame.aspect,
            }}
          >
            {Array.from(
              {
                length: slices,
              },
              (_: any, index: any) => {
                const along = index / 11;
                return (
                  <div
                    className="deck-card"
                    style={{
                      background: edgeBackground,
                      transform: `translate(${along * spanX}px, ${along * spanY}px)`,
                      zIndex: slices - index,
                    }}
                    key={index}
                  >
                    {index === 0 ? (
                      <img
                        src={src}
                        alt=""
                        draggable={false}
                        decoding="sync"
                        style={{
                          transform: `translate(${backX}%, ${backY}%) rotate(${backRotate}deg) scale(${backScale / 100})`,
                        }}
                      />
                    ) : null}
                  </div>
                );
              },
            )}
          </div>
        </div>
      </div>
      {placing ? (
        <p className="mt-3 text-center text-xs text-subtle">Drag the deck to place the picture.</p>
      ) : null}
    </div>
  );
}
function FitSlider({ label, value, min, max, onChange }: any) {
  return (
    <label className="mt-5 block">
      <span className="mb-2 flex items-baseline justify-between text-xs tracking-[0.16em] text-subtle uppercase">
        {label}
        <span className="font-display text-sm tracking-normal text-fg tabular-nums">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        aria-valuetext={`${label} ${value}`}
        onChange={(event: any) => onChange(Number(event.target.value))}
        className="edge-range"
        style={{
          background: "linear-gradient(90deg, rgb(242 236 227 / 0.2), rgb(242 236 227 / 0.7))",
        }}
      />
    </label>
  );
}
function DeckShape({
  thickness,
  radius,
  width,
  length,
  locked,
  template,
  onThickness,
  onRadius,
  onWidth,
  onLength,
  onLocked,
  onTemplate,
}: any) {
  const changeWidth = (next: any) => {
    const value = clampDim(next);
    if (!locked) {
      onWidth(value);
      return;
    }
    const ratio = length / Math.max(1, width);
    onWidth(value);
    onLength(clampDim(value * ratio));
  };
  const changeLength = (next: any) => {
    const value = clampDim(next);
    if (!locked) {
      onLength(value);
      return;
    }
    const ratio = width / Math.max(1, length);
    onLength(value);
    onWidth(clampDim(value * ratio));
  };
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        {CARD_TEMPLATES.map((item: any) => (
          <button
            type="button"
            onClick={() => onTemplate(item.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left",
              template === item.id ? "border-fg/40 bg-fg/5" : "border-border",
            )}
            key={item.id}
          >
            <span className="block text-sm text-fg">{item.label}</span>
            <span className="mt-0.5 block text-[11px] text-subtle">{item.detail}</span>
          </button>
        ))}
      </div>
      <FitSlider label="Thickness" value={thickness} min={40} max={200} onChange={onThickness} />
      <FitSlider label="Corners" value={radius} min={0} max={40} onChange={onRadius} />
      <div className="mt-5 flex items-center justify-between">
        <p className="text-xs tracking-[0.16em] text-subtle uppercase">Proportion</p>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-fg"
          onClick={() => {
            if (!locked) onLength(width);
            onLocked(!locked);
          }}
          aria-pressed={locked}
        >
          {locked ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          {locked ? "Ratio locked" : "Ratio unlocked"}
        </button>
      </div>
      {locked ? (
        <FitSlider
          label="Deck Size"
          value={width}
          min={55}
          max={160}
          onChange={(value: any) => {
            const next = clampDim(value);
            onWidth(next);
            onLength(next);
          }}
        />
      ) : (
        <Fragment>
          <FitSlider label="Width" value={width} min={55} max={160} onChange={changeWidth} />
          <FitSlider label="Length" value={length} min={55} max={160} onChange={changeLength} />
        </Fragment>
      )}
    </div>
  );
}
function TableControls({
  deckId,
  image,
  x,
  y,
  scale,
  rotate,
  color,
  saturation,
  luminous,
  contrast,
  vignette,
  onChange,
}: any) {
  const fileRef = useRef<any>(null);
  const drag = useRef<any>(null);
  const src = image || "/marble.jpg";
  const picture = {
    transform: `translate(${x}%, ${y}%) rotate(${rotate}deg) scale(${scale / 100})`,
    filter: `hue-rotate(${color}deg) saturate(${saturation}%) brightness(${luminous}%) contrast(${contrast}%)`,
  };
  return (
    <div>
      <div
        className="relative mb-4 h-36 cursor-grab touch-none overflow-hidden rounded-lg bg-[#cfc8bf] active:cursor-grabbing"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x, y, px: event.clientX, py: event.clientY };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const dx = ((event.clientX - start.px) / Math.max(1, rect.width)) * 100;
          const dy = ((event.clientY - start.py) / Math.max(1, rect.height)) * 100;
          onChange({
            tableX: Math.min(80, Math.max(-80, Math.round(start.x + dx))),
            tableY: Math.min(80, Math.max(-80, Math.round(start.y + dy))),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <img src={src} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={picture} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 42%, rgb(20 16 12 / ${vignette / 100}))`,
          }}
        />
      </div>
      <p className="text-xs text-subtle">Drag the picture to place it. This is the cloth under the deck on the table.</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload />
          Upload
        </Button>
        {image ? (
          <button
            type="button"
            className="text-xs text-muted underline-offset-2 hover:underline"
            onClick={() => onChange({ tableImage: null, tableX: 0, tableY: 0, tableScale: 100, tableRotate: 0 })}
          >
            Use the marble
          </button>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void (async () => {
              const consent = await requestUploadConsent();
              if (!consent) return;
              try {
                const url = await fileToDataUrl(file, 1280);
                if (url.length > 1_500_000) {
                  toast("That picture is too large.");
                  return;
                }
                onChange({ tableImage: url, tableX: 0, tableY: 0, tableScale: 100, tableRotate: 0 });
                useJournal.getState().setDeckConsent(deckId, consent);
              } catch (err) {
                toast(err instanceof Error ? err.message : "Could not read that picture.");
              }
            })();
          }}
        />
      </div>
      <FitSlider label="Scale" value={scale} min={80} max={220} onChange={(value: number) => onChange({ tableScale: value })} />
      <FitSlider label="Rotate" value={rotate} min={-180} max={180} onChange={(value: number) => onChange({ tableRotate: value })} />
      <FitSlider label="Move sideways" value={x} min={-80} max={80} onChange={(value: number) => onChange({ tableX: value })} />
      <FitSlider label="Move depth" value={y} min={-80} max={80} onChange={(value: number) => onChange({ tableY: value })} />
      <FitSlider label="Color" value={color} min={0} max={360} onChange={(value: number) => onChange({ tableColor: value })} />
      <FitSlider label="Saturation" value={saturation} min={0} max={200} onChange={(value: number) => onChange({ tableSat: value })} />
      <FitSlider label="Luminous" value={luminous} min={40} max={180} onChange={(value: number) => onChange({ tableLight: value })} />
      <FitSlider label="Contrast" value={contrast} min={60} max={160} onChange={(value: number) => onChange({ tableContrast: value })} />
      <FitSlider label="Vignette" value={vignette} min={0} max={80} onChange={(value: number) => onChange({ tableVignette: value })} />
    </div>
  );
}
function CardBackControls({ back, backScale, backRotate, onBack, onPlace, deckId }: any) {
  const fileRef = useRef<any>(null);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-subtle">Drag the deck above, then scale or turn the picture.</p>
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload />
          Upload
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event: any) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void (async () => {
              const consent = await requestUploadConsent();
              if (!consent) return;
              try {
                const url = await fileToDataUrl(file, 480);
                onBack(url);
                useJournal.getState().setDeckConsent(deckId, consent);
              } catch (err) {
                toast(err instanceof Error ? err.message : "Could not read that picture.");
              }
            })();
          }}
        />
      </div>
      <FitSlider
        label="Scale"
        value={backScale}
        min={80}
        max={220}
        onChange={(value: any) =>
          onPlace({
            scale: value,
          })
        }
      />
      <FitSlider
        label="Rotate"
        value={backRotate}
        min={-180}
        max={180}
        onChange={(value: any) =>
          onPlace({
            rotate: value,
          })
        }
      />
      {back ? (
        <button
          type="button"
          className="mt-3 text-xs text-muted underline-offset-2 hover:underline"
          onClick={() => onBack(null)}
        >
          Use the original back
        </button>
      ) : null}
    </div>
  );
}
function EdgeSlider({
  value,
  color,
  saturation,
  luminous,
  onChange,
  onColor,
  onSaturation,
  onLuminous,
}: any) {
  const look = edgeLook(value, color, saturation, luminous);
  const place = Math.min(100, Math.max(0, value));
  const hue = Math.min(100, Math.max(0, color));
  return (
    <div>
      <label className="block">
        <span className="sr-only">Deck edge finish</span>
        <input
          type="range"
          min={0}
          max={100}
          value={place}
          aria-valuetext={`${look.name}, ${look.finish}`}
          onChange={(event: any) => onChange(Number(event.target.value))}
          className="edge-range"
          style={{
            background: edgeTrack(),
          }}
        />
      </label>
      <div className="mt-2 flex justify-between text-[10px] tracking-[0.14em] text-subtle uppercase">
        <span>Matte</span>
        <span>Shine</span>
        <span>Metallic</span>
      </div>
      <label className="mt-5 block">
        <span className="mb-2 block text-xs tracking-[0.16em] text-subtle uppercase">Color</span>
        <input
          type="range"
          min={0}
          max={100}
          value={hue}
          aria-valuetext={colorName(hue)}
          onChange={(event: any) => onColor(Number(event.target.value))}
          className="edge-range"
          style={{
            background: colorTrack(),
          }}
        />
      </label>
      <label className="mt-5 block">
        <span className="mb-2 block text-xs tracking-[0.16em] text-subtle uppercase">
          Saturation
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={saturation}
          aria-valuetext={`${saturation}`}
          onChange={(event: any) => onSaturation(Number(event.target.value))}
          className="edge-range"
          style={{
            background: "linear-gradient(90deg, #b7b3ac, #d85a5a)",
          }}
        />
      </label>
      <label className="mt-5 block">
        <span className="mb-2 block text-xs tracking-[0.16em] text-subtle uppercase">Luminous</span>
        <input
          type="range"
          min={0}
          max={100}
          value={luminous}
          aria-valuetext={`${luminous}`}
          onChange={(event: any) => onLuminous(Number(event.target.value))}
          className="edge-range"
          style={{
            background: "linear-gradient(90deg, #2c2926, #f7f3ea)",
          }}
        />
      </label>
    </div>
  );
}
function artworkName(index: any, name: any, ext: any) {
  const stem =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "card";
  return `${String(index + 1).padStart(2, "0")}-${stem}.${ext}`;
}
function extFromMime(type: any, path = "") {
  const hint = `${type} ${path}`.toLowerCase();
  if (hint.includes("svg")) return "svg";
  if (hint.includes("png")) return "png";
  if (hint.includes("webp")) return "webp";
  if (hint.includes("gif")) return "gif";
  return "jpg";
}
async function sha256Hex(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ownedRoot(urls: Array<string | null | undefined>) {
  const hit = urls.find((url) => typeof url === "string" && /^\/cards\/owned\/[a-f0-9]{32}\//.test(url));
  return hit ? /^(\/cards\/owned\/[a-f0-9]{32})\//.exec(hit)?.[1] : undefined;
}

async function verifiedOwnedArchive(urls: Array<string | null | undefined>) {
  const root = ownedRoot(urls);
  if (!root) return null;
  const response = await fetch(`${root}/deck.zip`);
  if (!response.ok) return null;
  const bytes = new Uint8Array(await response.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return null;
  }
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) return null;
  let hashes: Record<string, string> = {};
  try {
    const parsed = JSON.parse(new TextDecoder().decode(manifestBytes)) as { files_sha256?: unknown };
    if (!parsed.files_sha256 || typeof parsed.files_sha256 !== "object") return null;
    hashes = parsed.files_sha256 as Record<string, string>;
  } catch {
    return null;
  }
  const required = [
    "cards.csv",
    "canonical_cards.csv",
    "archetype_blueprints.csv",
    "deck_contexts.json",
    "recipe.json",
    "provenance.json",
    "deck.json",
    "back/card-back.svg",
    "back/card-back.jpg",
  ];
  for (const name of required) {
    if (!entries[name]) return null;
  }
  const svgs = Object.keys(entries).filter((name) => /^svg\/\d{2}-[a-z0-9-]+\.svg$/.test(name));
  if (svgs.length !== 78) return null;
  for (const [name, expected] of Object.entries(hashes)) {
    const file = entries[name];
    if (!file || (await sha256Hex(file)) !== expected) return null;
  }
  return bytes;
}

async function ownedSigilExtras(urls: Array<string | null | undefined>) {
  const root = ownedRoot(urls);
  if (!root) return undefined;
  const extras: Record<string, Uint8Array> = {};
  const allowed = /^(svg\/[a-z0-9-]+\.svg|back\/card-back\.(svg|jpg)|provenance\/renderer-and-seed\.json|provenance\.json|manifest\.json|canonical_cards\.csv|archetype_blueprints\.csv|deck_contexts\.json|recipe\.json|deck\.json|cards\.csv)$/;
  const take = async (rel: string) => {
    if (!allowed.test(rel) || extras[rel]) return;
    const response = await fetch(`${root}/${rel}`);
    if (!response.ok) return;
    extras[rel] = new Uint8Array(await response.arrayBuffer());
  };
  await take("manifest.json");
  const listed = extras["manifest.json"];
  if (!listed) return extras;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(listed)) as {
      files?: unknown;
      files_sha256?: unknown;
    };
    const named = [
      ...(Array.isArray(parsed.files) ? parsed.files : []),
      ...(parsed.files_sha256 && typeof parsed.files_sha256 === "object" ? Object.keys(parsed.files_sha256) : []),
    ];
    for (const rel of named) {
      if (typeof rel === "string") await take(rel);
    }
    const hashes = parsed.files_sha256 && typeof parsed.files_sha256 === "object"
      ? (parsed.files_sha256 as Record<string, string>)
      : {};
    for (const name of Object.keys(hashes)) {
      if (!extras[name]) {
        delete extras["manifest.json"];
        break;
      }
    }
  } catch {
    delete extras["manifest.json"];
  }
  return extras;
}
async function loadArtwork(url: any) {
  if (url.startsWith("data:")) {
    const base64 = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]*)$/.exec(url);
    if (base64) {
      const binary = atob(base64[2]);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      const head = new TextDecoder().decode(bytes.subarray(0, 240)).trimStart().toLowerCase();
      return exportedImage(bytes, head.startsWith("<?xml") || head.startsWith("<svg") ? "svg" : extFromMime(base64[1] ?? ""));
    }
    const plain = /^data:([^;,]+)?(?:;charset=[^;,]+)?,(.*)$/s.exec(url);
    if (!plain) return null;
    const bytes = new TextEncoder().encode(decodeURIComponent(plain[2]));
    const head = new TextDecoder().decode(bytes.subarray(0, 240)).trimStart().toLowerCase();
    return exportedImage(bytes, head.startsWith("<?xml") || head.startsWith("<svg") ? "svg" : extFromMime(plain[1] ?? ""));
  }
  const response = await fetch(url);
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  const bytes = new Uint8Array(await response.arrayBuffer());
  const head = new TextDecoder().decode(bytes.subarray(0, 240)).trimStart().toLowerCase();
  const ext =
    head.startsWith("<?xml") || head.startsWith("<svg")
      ? "svg"
      : type
        ? extFromMime(type, path)
        : path.endsWith(".png")
          ? "png"
          : path.endsWith(".webp")
            ? "webp"
            : path.endsWith(".gif")
              ? "gif"
              : path.endsWith(".svg")
                ? "svg"
                : "jpg";
  return exportedImage(bytes, ext);
}
async function exportedImage(bytes: Uint8Array, ext: string) {
  if (ext !== "svg") return { bytes, ext };
  return { bytes: await svgToPng(bytes), ext: "png" };
}
function ZipImport({ open, onOpenChange, onStage, deckId }: any) {
  const [working, setWorking] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<any>(null);
  const [overwrite, setOverwrite] = useState(false);
  useEffect(() => {
    if (!open) {
      setWorking(null);
      setResult(null);
      setError(null);
      setOverwrite(false);
    }
  }, [open]);
  const downloadTemplate = () => {
    const blob = new Blob([CARDS_CSV_TEMPLATE], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cards.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const onFile = async (file: any) => {
    if (!file || working) return;
    setError(null);
    setResult(null);
    try {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".zip") && !lower.endsWith(".csv")) {
        throw new Error("Choose a .zip or a .csv spreadsheet.");
      }
      if (file.size > 83886080) throw new Error("That file is larger than 80 MB.");
      const consent = await requestUploadConsent();
      if (!consent) return;
      const stamp = (cards: { name?: string }[]) => {
        const journal = useJournal.getState();
        journal.setDeckConsent(deckId, consent);
        for (const card of cards) journal.setCardConsent(deckId, String(card.name ?? ""), consent);
      };
      if (lower.endsWith(".csv")) {
        setWorking("Reading the spreadsheet");
        const drafts = cardsFromSpreadsheet(await file.text());
        if (drafts.length === 0) throw new Error("No cards in that spreadsheet.");
        const prepared = drafts.map((draft) => ({
          name: draft.name,
          suit: draft.suit,
          rank: draft.rank,
          keywords: draft.keywords,
          upright: draft.upright,
          reversed: draft.reversed,
          imageUrl: null,
          sortOrder: draft.sortOrder,
          imageScale: draft.imageScale,
          imageX: draft.imageX,
          imageY: draft.imageY,
          imageRadius: draft.imageRadius,
        }));
        const suits = [...new Set(prepared.map((card) => card.suit).filter((suit) => suit && !isSuit(suit)))];
        onStage(prepared, null, suits, overwrite);
        stamp(prepared);
        setResult({ created: prepared.length, updated: 0, warnings: [] });
        setWorking(null);
        return;
      }
      setWorking("Reading the archive");
      const archive = await readDeckArchive(new Uint8Array(await file.arrayBuffer()));
      const drafts = archive.cards;
      if (drafts.length === 0)
        throw new Error("No cards in that zip. Add a cards.csv, or pictures of the cards.");
      const prepared = [];
      const warnings = [];
      for (let i = 0; i < drafts.length; i += 1) {
        const draft = drafts[i];
        setWorking(`Preparing ${i + 1} of ${drafts.length}`);
        let imageUrl = null;
        if (draft.image)
          try {
            imageUrl = await fileToDataUrl(
              new File([draft.image.bytes], draft.image.name, {
                type: draft.image.type,
              }),
            );
          } catch {
            warnings.push(`${draft.name}: could not read ${draft.image.name}`);
          }
        else if (draft.imageName)
          warnings.push(`${draft.name}: missing picture ${draft.imageName}`);
        prepared.push({
          name: draft.name,
          suit: draft.suit,
          rank: draft.rank,
          keywords: draft.keywords,
          upright: draft.upright,
          reversed: draft.reversed,
          imageUrl,
          sortOrder: draft.sortOrder,
          imageScale: draft.imageScale,
          imageX: draft.imageX,
          imageY: draft.imageY,
          imageRadius: draft.imageRadius,
        });
      }
      let imported = null;
      let importedSuits: string[] = [];
      if (archive.settings) {
        let cardBack = null;
        let tableImage: string | null = null;
        if (archive.settings.cardBack)
          try {
            cardBack = await fileToDataUrl(
              new File([archive.settings.cardBack.bytes], archive.settings.cardBack.name, {
                type: archive.settings.cardBack.type,
              }),
            );
          } catch {
            warnings.push("The card back picture could not be read.");
          }
        if (archive.settings.tableImage)
          try {
            tableImage = await fileToDataUrl(
              new File([archive.settings.tableImage.bytes], archive.settings.tableImage.name, {
                type: archive.settings.tableImage.type,
              }),
              1280,
            );
          } catch {
            warnings.push("The table picture could not be read.");
          }
        const {
          cardBack: _file,
          tableImage: _table,
          customSuits: suits,
          ...settings
        } = archive.settings;
        importedSuits = suits ?? [];
        imported = {
          ...settings,
          cardBack,
          tableImage,
        };
      }
      onStage(prepared, imported, importedSuits, overwrite);
      stamp(prepared);
      setResult({
        created: prepared.length,
        updated: 0,
        warnings,
      });
      setWorking(null);
    } catch (err) {
      setWorking(null);
      setError(err instanceof Error ? err.message : "Could not import that zip.");
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next: any) => {
        if (!next && working) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload cards</DialogTitle>
          <DialogDescription>
            A spreadsheet on its own, or a zip that also holds the pictures.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted">
          <p>
            Include <span className="text-fg">cards.csv</span> with columns{" "}
            <span className="text-fg">
              name, suit, rank, keywords, upright, reversed, image, image_scale, image_x, image_y,
              image_radius
            </span>
            . Put a line break inside a quoted cell, or type \\n, for a new line. Start a line with
            - for a bullet. A zip can also bring settings, custom suits, the card back, and the table.
          </p>
          <Button type="button" variant="secondary" onClick={downloadTemplate}>
            Download a blank spreadsheet
          </Button>
          <label className="flex items-start gap-3 text-fg">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-fg"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
            />
            <span>
              Overwrite current content
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                A card with the same name and suit replaces the one already here. Extra copies are
                removed, and journal entries for those copies follow the card that remains. Leave
                this off to add the rows alongside the cards you have.
              </span>
            </span>
          </label>
          <FilePicker
            id="deck-zip"
            accept=".zip,.csv,application/zip,text/csv"
            disabled={working !== null}
            label="Choose file"
            onFile={(file) => void onFile(file)}
          />
          {working ? <p className="text-fg">{working}</p> : null}
          {error ? <p className="text-fg">{error}</p> : null}
          {result ? (
            <div className="flex flex-col gap-2">
              <p className="text-fg">
                {result.created} added to this draft. Save the deck to keep them.
              </p>
              {result.warnings.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs text-subtle">
                  {result.warnings.slice(0, 6).map((warning: any) => (
                    <li key={warning}>{warning}</li>
                  ))}
                  {result.warnings.length > 6 ? (
                    <li>And {result.warnings.length - 6} more.</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={working !== null}
            onClick={() => onOpenChange(false)}
          >
            {result ? "Done" : "Cancel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function CardEditor({ open, card, pending, suits, frame, deckId, onOpenChange, onSave }: any) {
  const [form, setForm] = useState<any>(EMPTY);
  const [otherSuit, setOtherSuit] = useState("");
  const uploadConsent = useRef<any>(null);
  useEffect(() => {
    if (!open) return;
    setOtherSuit("");
    uploadConsent.current = null;
    if (card)
      setForm({
        name: card.name,
        suit: card.suit,
        rank: card.rank,
        keywords: card.keywords,
        upright: card.upright,
        reversed: card.reversed,
        imageUrl: card.imageUrl,
        sortOrder: card.sortOrder,
        imageScale: card.imageScale ?? 100,
        imageX: card.imageX ?? 0,
        imageY: card.imageY ?? 0,
        imageRadius: card.imageRadius ?? 2,
      });
    else
      setForm({
        ...EMPTY,
        imageScale: frame?.imageScale ?? 100,
        imageX: frame?.imageX ?? 0,
        imageY: frame?.imageY ?? 0,
        imageRadius: frame?.imageRadius ?? 2,
      });
  }, [open, card]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{card ? "Edit card" : "Add a card"}</DialogTitle>
          <DialogDescription>
            Name, meaning, and an optional picture of the card you made.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e: any) => {
            e.preventDefault();
            const suit =
              form.suit === "__other" ? normalizeSuit(otherSuit) : normalizeSuit(String(form.suit ?? ""));
            const agreed = uploadConsent.current;
            if (agreed && form.imageUrl) {
              useJournal.getState().setCardConsent(deckId, String(form.name ?? ""), agreed);
            }
            onSave({ ...form, suit });
          }}
        >
          <Field label="Name" htmlFor="card-name">
            <Input
              id="card-name"
              required
              value={form.name}
              onChange={(e: any) =>
                setForm({
                  ...form,
                  name: e.target.value,
                })
              }
              placeholder="The Lantern"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Suit" htmlFor="card-suit">
              <Select
                value={form.suit === "__other" ? "__other" : form.suit}
                onValueChange={(value: any) =>
                  setForm({
                    ...form,
                    suit: value,
                  })
                }
              >
                <SelectTrigger id="card-suit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUITS.filter((suit) => suit !== "custom").map((suit) => (
                    <SelectItem value={suit} key={suit}>
                      {suitLabel(suit)}
                    </SelectItem>
                  ))}
                  {(suits ?? [])
                    .filter((suit: string) => suit && !isSuit(suit))
                    .map((suit: string) => (
                      <SelectItem value={suit} key={suit}>
                        {suitLabel(suit)}
                      </SelectItem>
                    ))}
                  {form.suit &&
                  form.suit !== "__other" &&
                  form.suit !== "custom" &&
                  !isSuit(form.suit) &&
                  !(suits ?? []).includes(form.suit) ? (
                    <SelectItem value={form.suit}>{suitLabel(form.suit)}</SelectItem>
                  ) : null}
                  {form.suit === "custom" ? (
                    <SelectItem value="custom">{suitLabel("custom")}</SelectItem>
                  ) : null}
                  <SelectItem value="__other">Other…</SelectItem>
                </SelectContent>
              </Select>
              {form.suit === "__other" ? (
                <Input
                  className="mt-2"
                  value={otherSuit}
                  onChange={(e: any) => setOtherSuit(e.target.value)}
                  placeholder="Name this suit"
                  aria-label="Custom suit"
                />
              ) : null}
            </Field>
            <Field label="Rank" htmlFor="card-rank">
              <Input
                id="card-rank"
                value={form.rank}
                onChange={(e: any) =>
                  setForm({
                    ...form,
                    rank: e.target.value,
                  })
                }
                placeholder="XIV"
              />
            </Field>
          </div>
          <Field label="Keywords" htmlFor="card-keywords">
            <Input
              id="card-keywords"
              value={form.keywords}
              onChange={(e: any) =>
                setForm({
                  ...form,
                  keywords: e.target.value,
                })
              }
              placeholder="threshold, night, asking"
            />
          </Field>
          <Field label="Upright meaning" htmlFor="card-upright">
            <Textarea
              id="card-upright"
              className="min-h-24"
              value={form.upright}
              onChange={(e: any) =>
                setForm({
                  ...form,
                  upright: e.target.value,
                })
              }
            />
            <p className="text-xs text-subtle">A new line is a break. Start a line with - for a bullet.</p>
          </Field>
          <Field label="Reversed meaning" htmlFor="card-reversed">
            <Textarea
              id="card-reversed"
              className="min-h-24"
              value={form.reversed}
              onChange={(e: any) =>
                setForm({
                  ...form,
                  reversed: e.target.value,
                })
              }
            />
            <p className="text-xs text-subtle">A new line is a break. Start a line with - for a bullet.</p>
          </Field>
          <Field label="Card image" htmlFor="card-image">
            <FilePicker
              id="card-image"
              accept="image/*"
              label="Choose picture"
              onFile={(file) => {
                void (async () => {
                  const consent = await requestUploadConsent();
                  if (!consent) return;
                  try {
                    const url = await fileToDataUrl(file);
                    const name = String(form.name ?? "");
                    uploadConsent.current = consent;
                    setForm((prev: any) => ({
                      ...prev,
                      imageUrl: url,
                    }));
                    const journal = useJournal.getState();
                    journal.setDeckConsent(deckId, consent);
                    journal.setCardConsent(deckId, name, consent);
                  } catch {
                    toast("Could not read that image.");
                  }
                })();
              }}
            />
            {form.imageUrl ? (
              <div
                className="relative mt-3 h-40 w-28 overflow-hidden bg-[#f7f3ea] shadow-card"
                style={{ borderRadius: `${form.imageRadius ?? 2}px` }}
              >
                <img
                  src={cardImageSrc(form.imageUrl)}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    transform: `translate(${form.imageX ?? 0}%, ${form.imageY ?? 0}%) scale(${(form.imageScale ?? 100) / 100})`,
                  }}
                />
                <VelomereBorder src={form.imageUrl} suit={form.suit} />
              </div>
            ) : null}
            <FitSlider
              label="Scale"
              value={form.imageScale ?? 100}
              min={40}
              max={220}
              onChange={(value: number) => setForm({ ...form, imageScale: value })}
            />
            <FitSlider
              label="Move across"
              value={form.imageX ?? 0}
              min={-80}
              max={80}
              onChange={(value: number) => setForm({ ...form, imageX: value })}
            />
            <FitSlider
              label="Move down"
              value={form.imageY ?? 0}
              min={-80}
              max={80}
              onChange={(value: number) => setForm({ ...form, imageY: value })}
            />
            <FitSlider
              label="Corners"
              value={form.imageRadius ?? 2}
              min={0}
              max={40}
              onChange={(value: number) => setForm({ ...form, imageRadius: value })}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !form.name.trim()}>
              {card ? "Update card" : "Add card"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Field({ label, htmlFor, children }: any) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function CardJournal({ open, card, deckId, deckName, onOpenChange }: any) {
  const addReading = useJournal((s: any) => s.addReading);
  const [orientation, setOrientation] = useState<Orientation>("upright");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (!open) return;
    setOrientation("upright");
    setNotes("");
  }, [open, card?.id]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Journal Entry</DialogTitle>
          <DialogDescription>
            {card?.name ?? "Card"}
            {orientation === "reversed" ? " · reversed" : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="deck-entry-orientation">Orientation</Label>
            <button
              id="deck-entry-orientation"
              type="button"
              className="text-sm text-fg"
              onClick={() =>
                setOrientation((current) => (current === "upright" ? "reversed" : "upright"))
              }
            >
              {orientation === "reversed" ? "Reversed" : "Upright"}
            </button>
          </div>
          <Field label="What did this card bring up?" htmlFor="deck-entry-notes">
            <Textarea
              id="deck-entry-notes"
              className="min-h-32"
              value={notes}
              onChange={(event: any) => setNotes(event.target.value)}
              placeholder="A feeling, a question, a sentence you do not want to lose."
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!card}
              onClick={() => {
                if (!card) return;
                const meaning = orientation === "reversed" ? card.reversed : card.upright;
                addReading({
                  cardId: card.id,
                  cardName: card.name,
                  suit: card.suit,
                  rank: card.rank,
                  orientation,
                  keywords: card.keywords,
                  meaningSnapshot: meaning,
                  deckId,
                  deckName: deckName || "Deck",
                  notes,
                  question: "",
                  manual: false,
                });
                toast("Saved to the journal");
                onOpenChange(false);
              }}
            >
              Keep this entry
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
