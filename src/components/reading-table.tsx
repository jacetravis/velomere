"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { BookOpen, ChevronDown, Lock, LockOpen, PenLine, Shuffle } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/app-shell";
import { ArtZoom } from "@/components/art-zoom";
import { ChatWithSolace, LinkFields } from "@/components/entry-links";
import { toast } from "sonner";
import { DendriteEncounter } from "@/components/dendrite-encounter";
import { SpreadLay, SpreadReadingBar } from "@/components/spread-table";
import { MeaningText } from "@/components/meaning-text";
import { PhysicalCard } from "@/components/tarot-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { listCards, listDecks, updateCardMeaning } from "@/lib/cards/server";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cutCards, sheetsForSplit, shuffleByStyle, shuffleCards, shuffleSplit } from "@/lib/cards/order";
import { edgeLook, paperTone, sheetLean } from "@/lib/cards/edge";
import { cardFrame } from "@/lib/cards/shape";
import { cutDepth, cutPace, cutSections, latchShuffleCount, SHUFFLE_MAX, SHUFFLE_MIN } from "@/lib/cards/shuffle-count";
import { shufflePose } from "@/lib/shuffle-style";
import { DEFAULT_SHUFFLE_ANIMATION, setShuffleAnimation, shuffleAnimation, subscribeShuffleAnimation } from "@/lib/shuffle-animation";
import { suitLabel, type Card } from "@/lib/cards/types";
import labels from "@/lib/cards/d3-labels.json";
import { cn } from "@/lib/utils";
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
import { useSpreads } from "@/lib/spreads/store";
import { FRESH_DECK_BACK } from "@/lib/deck-backs";
import { LIBRARY_LOOK_STAMP } from "@/lib/cards/library";
import { readingHand, setReadingHand, subscribeHands } from "@/lib/table-hands";
import { subscribeTheme, themeById, themeId, DEFAULT_THEME } from "@/lib/themes";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type Phase = "still" | "shuffling" | "cutting" | "ready" | "drawn";
export type CutBeat = "aside" | "drop" | "tuck";

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
  }, [decks, ensureActiveLook, LIBRARY_LOOK_STAMP]);
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
  const room = themeById(useSyncExternalStore(subscribeTheme, themeId, () => DEFAULT_THEME));
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
  const [question, setQuestion] = useState("");
  const [pullLabels, setPullLabels] = useState<string[]>([]);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [descEdit, setDescEdit] = useState(false);
  const [descUpright, setDescUpright] = useState("");
  const [descReversed, setDescReversed] = useState("");
  const [savingMeaning, setSavingMeaning] = useState(false);
  const questionRef = useRef("");
  const reasonField = useRef<HTMLTextAreaElement>(null);
  const labels = useJournal((s) => s.labels) ?? [];
  questionRef.current = question;
  useLayoutEffect(() => {
    const node = reasonField.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${node.scrollHeight}px`;
  }, [question, reasonOpen]);

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
  const hand = useSyncExternalStore(subscribeHands, readingHand, () => "right" as const);
  const [shufflingTimes, setShufflingTimes] = useState(1);
  const [, setShuffleStep] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [panel, setPanel] = useState<"meaning" | "journal" | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [spreadGuides, setSpreadGuides] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("solace-spread-overlay") !== "off";
  });
  useEffect(() => {
    window.localStorage.setItem("solace-spread-overlay", spreadGuides ? "on" : "off");
  }, [spreadGuides]);
  const [pendingSpread, setPendingSpread] = useState<string | null>(null);
  const spreadOverlays = useSpreads((s) => s.overlays);
  const spreadCustom = useSpreads((s) => s.custom);
  const spreadStandardOrder = useSpreads((s) => s.standardOrder);
  const spreadCustomOrder = useSpreads((s) => s.customOrder);
  const queryClient = useQueryClient();
  const orderRef = useRef<Card[]>([]);
  const appliedReturn = useRef<string | null>(null);
  const flyTimer = useRef<number | null>(null);
  const holdWait = useRef<number | null>(null);
  const collectLock = useRef(false);
  const pileRef = useRef<HTMLButtonElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const [flight, setFlight] = useState(0);
  const [returns, setReturns] = useState<{ id: number; x: number; y: number; left: number; top: number }[]>([]);
  const animationChoice = useSyncExternalStore(subscribeShuffleAnimation, shuffleAnimation, () => DEFAULT_SHUFFLE_ANIMATION);
  const returnSeq = useRef(0);
  const [handoff, setHandoff] = useState(false);
  const handing = useRef(false);
  const tableBand = useRef<HTMLDivElement>(null);
  const [tableBandHeight, setTableBandHeight] = useState<number | null>(null);
  const [slip, setSlip] = useState<{ card: Card; left: number; top: number; x: number; y: number; rot: number; spin: number; width: number; landed: boolean } | null>(null);
  useEffect(() => {
    if (!slip) return;
    const body = document.body;
    const previous = body.style.position;
    if (getComputedStyle(body).position === "static") body.style.position = "relative";
    return () => {
      body.style.position = previous;
    };
  }, [slip]);
  orderRef.current = order;

  const clearShuffle = () => {
    for (const id of shuffleTimers.current) window.clearTimeout(id);
    shuffleTimers.current = [];
  };

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

  const liftLead = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 520;

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
        setOrder((current) => shuffleByStyle(animationChoice, current, ratio, Math.random, index + 1));
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

    later(liftLead(), () => play(0));
  };

  const nextSection = (previous: number | null) => {
    const ratios = cutSections(7);
    return ratios.find((ratio) => previous == null || cutDepth(ratio) !== cutDepth(previous)) ?? 0.5;
  };

  const beginHold = () => {
    if (order.length < 2 || phase === "cutting" || slip) return;
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
      const deckBox = tableBand.current?.querySelector("[data-deck]")?.getBoundingClientRect();
      const pileNode = pileRef.current;
      const pileBox = pileNode && getComputedStyle(pileNode).visibility !== "hidden" ? pileNode.getBoundingClientRect() : null;
      const cardW = (deckBox?.width || 140) * 0.46;
      const cardH = cardW / Math.max(0.35, frame.aspect);
      const scrollX = window.scrollX;
      const scrollY = window.scrollY;
      const pageW = document.documentElement.clientWidth;
      const pageH = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      const toPage = (box: DOMRect) => ({
        left: box.left + scrollX,
        right: box.right + scrollX,
        top: box.top + scrollY,
        bottom: box.bottom + scrollY,
        width: box.width,
        height: box.height,
      });
      const deckPage = deckBox ? toPage(deckBox) : null;
      const pilePage = pileBox ? toPage(pileBox) : null;
      const hits = (cx: number, cy: number, box: { left: number; right: number; top: number; bottom: number; width: number } | null) => {
        if (!box || box.width < 8) return false;
        return cx + cardW / 2 > box.left - 16 && cx - cardW / 2 < box.right + 16 && cy + cardH / 2 > box.top - 16 && cy - cardH / 2 < box.bottom + 16;
      };
      let landX = pageW / 2;
      let landY = scrollY + 56;
      for (let attempt = 0; attempt < 28; attempt += 1) {
        const cx = cardW / 2 + 8 + Math.random() * Math.max(8, pageW - cardW - 16);
        const cy = cardH / 2 + 8 + Math.random() * Math.max(8, pageH - cardH - 16);
        if (!hits(cx, cy, deckPage) && !hits(cx, cy, pilePage)) {
          landX = cx;
          landY = cy;
          break;
        }
      }
      const startX = (deckPage?.left ?? scrollX + pageW / 2) + (deckBox?.width ?? cardW) / 2;
      const startY = (deckPage?.top ?? scrollY + pageH * 0.4) + (deckBox?.height ?? cardH) / 2;
      const rot = Math.round((Math.random() * 36 - 18) * 10) / 10;
      const spin = rot + (Math.random() < 0.5 ? -1 : 1) * (64 + Math.random() * 80);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setSlip({ card, left: startX, top: startY, x: landX - startX, y: landY - startY, rot, spin, width: cardW, landed: reduce });
    };

    const play = () => {
      if (shuffleRun.current !== token) return;
      if (!holding.current) {
        settleShuffle();
        return;
      }
      count += 1;
      const wash = animationChoice === "table_wash";
      const speed = Math.min(SHUFFLE_MAX, 8 + (count - 1) * (wash ? 0.4 : 1));
      const opening = count === 1 && animationChoice === "original";
      const washStart = wash ? 1.25 - Math.min(0.25, (count - 1) * 0.02) : 1;
      const pace = Math.round(cutPace(speed) * (opening ? 1.6 : 1) * washStart);
      const step = Math.round(pace / 3);
      if (count >= 14 && !armed) {
        armed = true;
        flyTimer.current = window.setTimeout(launch, 2600 + Math.random() * 3200);
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
        setOrder((current) => shuffleByStyle(animationChoice, current, ratio, Math.random, count));
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

    later(liftLead(), () => play());
  };

  const endHold = () => {
    if (holdWait.current != null) {
      window.clearTimeout(holdWait.current);
      holdWait.current = null;
    }
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
    const lead = cutPreview == null ? liftLead() : 0;
    cutLock.current = true;
    setCutMotion(520);
    setPhase("cutting");
    window.setTimeout(() => {
      setCutPreview(ratio);
      setCutBeat("aside");
    }, lead);
    window.setTimeout(() => setCutBeat("drop"), 560 + lead);
    window.setTimeout(() => setCutBeat("tuck"), 1080 + lead);
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
    }, 1620 + lead);
  };

  const collectNative = (card: Card) => {
    const state = useSpreads.getState();
    const spread = state.effective(state.activeSpreadId);
    if (!spread || spread.positions.length < 2) return false;
    const live = state.session;
    if (live && live.spread.id === spread.id && live.status !== "collecting" && live.status !== "complete") return true;
    if (collectLock.current) return true;
    collectLock.current = true;
    try {
      if (!live || live.spread.id !== spread.id || live.status === "complete") state.begin();
      const current = useSpreads.getState().session;
      if (!current || current.status !== "collecting") return true;
      useSpreads.getState().draw(`draw-${current.id}-v${current.version + 1}`, {
        deckId: active?.id ?? activeDeckId ?? 0,
        deckName: active?.name ?? "Deck",
        cardId: card.id,
        cardName: card.name,
        upright: card.upright,
        reversed: card.reversed,
        imageUrl: card.imageUrl,
        keywords: card.keywords,
        suit: card.suit,
        rank: card.rank,
      });
      setOrder((currentOrder) => {
        const list = currentOrder.length ? currentOrder : deck;
        return list.filter((item) => item.id !== card.id);
      });
      setOrigin(0);
      setFlight((value) => value + 1);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That card stayed in the deck.");
    } finally {
      window.setTimeout(() => {
        collectLock.current = false;
      }, 740);
    }
    return true;
  };

  const reveal = (card: Card) => {
    if (collectNative(card)) return;
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
    if (!card || phase === "shuffling" || phase === "cutting" || phase === "drawn" || slip) return;
    reveal(card);
  };

  const putBack = () => {
    setDrawn(null);
    setFlipped(false);
    setPanel(null);
    setZoomOpen(false);
    setPhase(order.length ? "ready" : "still");
  };

  const returnWaiting = () => {
    if (phase === "shuffling" || phase === "cutting" || slip) return;
    const pile = pileRef.current;
    const slab = tableBand.current;
    const deckNode = slab?.querySelector("[data-deck]");
    if (!pile || !slab || !deckNode) return;
    const cardId = useSpreads.getState().restoreLatest();
    if (cardId == null) return;
    handing.current = false;
    setHandoff(false);
    const card = deck.find((item) => item.id === cardId);
    if (!card) return;
    setOrder((current) => [card, ...current.filter((item) => item.id !== card.id)]);
    setOrigin(0);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const slabBox = slab.getBoundingClientRect();
    const from = pile.getBoundingClientRect();
    const to = deckNode.getBoundingClientRect();
    const id = returnSeq.current + 1;
    returnSeq.current = id;
    setReturns((current) => [
      ...current,
      {
        id,
        left: from.left + from.width / 2 - slabBox.left,
        top: from.top + from.height / 2 - slabBox.top,
        x: to.left + to.width / 2 - (from.left + from.width / 2),
        y: to.top + to.height * 0.46 - (from.top + from.height / 2),
      },
    ]);
  };

  const sized = cardFrame(cardTemplate ?? "tarot", cardWidth ?? 55, cardLength ?? 55);
  const frame = { ...sized, width: `calc((${sized.width}) * 0.8)` };
  const backStyle = {
    transform: `translate(${backX ?? 0}%, ${backY ?? 0}%) rotate(${backRotate ?? 0}deg) scale(${(backScale ?? 100) / 100})`,
  };
  const backSrc = cardBack || ((active?.name ?? "").trim().toLowerCase() === "velomere" ? "/card-back.jpg" : FRESH_DECK_BACK);
  const faceStyle = {
    width: `calc(${frame.width} - 1.8rem)`,
    ["--card-width" as string]: `calc(${frame.width} - 1.8rem)`,
    ["--card-aspect" as string]: String(frame.aspect),
    ["--radius-lg" as string]: `${cardRadius ?? 5}px`,
    aspectRatio: frame.aspect,
  };
  const drawnStyle = faceStyle;

  useLayoutEffect(() => {
    const node = flyRef.current;
    const slab = tableBand.current;
    const pile = pileRef.current;
    if (!flight || !node || !slab || !pile) return;
    const from = slab.getBoundingClientRect();
    const to = pile.getBoundingClientRect();
    const x = to.left + to.width / 2 - (from.left + from.width / 2);
    const y = to.top + to.height / 2 - (from.top + from.height * 0.46);
    node.style.setProperty("--fly-x", `${x}px`);
    node.style.setProperty("--fly-y", `${y}px`);
    node.classList.remove("is-flying");
    void node.offsetWidth;
    node.classList.add("is-flying");
  }, [flight]);

  const spreadSize = useSpreads((s) => s.effective(s.activeSpreadId)?.positions.length ?? 1);
  const spreadId = useSpreads((s) => s.activeSpreadId);
  const session = useSpreads((s) => s.session);
  const spreadLive = session && session.spread.id === spreadId && session.spread.positions.length === spreadSize ? session : null;
  const spreadLaid = spreadSize > 1 && !!spreadLive && (spreadLive.status === "staged" || spreadLive.status === "revealing" || spreadLive.status === "complete");
  const waitingCount = spreadLive?.assignments.filter((item) => item.location === "waiting_stack").length ?? 0;
  const spreadChoices = useMemo(() => {
    const { standard, mine } = useSpreads.getState().list();
    return [...standard, ...mine];
  }, [spreadOverlays, spreadCustom, spreadStandardOrder, spreadCustomOrder]);
  const tableIsFresh = !slip && !drawn && !flipped && phase !== "drawn" && phase !== "shuffling" && phase !== "cutting" && (!spreadLive || (spreadLive.drawnCount === 0 && spreadLive.status === "collecting"));
  const applySpread = (id: string) => {
    useSpreads.getState().discard();
    useSpreads.getState().setActive(id);
    setDrawn(null);
    setFlipped(false);
    setPanel(null);
    setZoomOpen(false);
    setHandoff(false);
    handing.current = false;
    setFlight(0);
    setSlip(null);
    setOrder(deck);
    setOrigin(0);
    setPhase(deck.length ? "ready" : "still");
    setPendingSpread(null);
  };
  const chooseSpread = (id: string) => {
    if (id === spreadId) return;
    if (!tableIsFresh) {
      setPendingSpread(id);
      return;
    }
    applySpread(id);
  };

  useLayoutEffect(() => {
    if (phase === "drawn" || spreadLaid || !tableBand.current) return;
    const next = tableBand.current.offsetHeight;
    if (next > 0) setTableBandHeight(next);
  }, [phase, frame.width, frame.aspect, spreadLaid]);

  useEffect(() => {
    if (!spreadLive) {
      handing.current = false;
      setHandoff(false);
      return;
    }
    if (spreadLive.status !== "collected" || handing.current) return;
    handing.current = true;
    const reason = question.trim();
    if (reason) useSpreads.getState().remember(reason);
    setHandoff(true);
    const id = spreadLive.id;
    window.setTimeout(() => {
      const live = useSpreads.getState().session;
      if (!live || live.id !== id || live.status !== "collected") return;
      try {
        useSpreads.getState().stage(`stage-${id}`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "The spread could not be laid out.");
      }
    }, 860);
  }, [spreadLive, question]);

  return (
    <AppShell>
      <div className="stagger-in flex w-full flex-col items-center">
        <div className="w-full max-w-md">
          {handoff || spreadLaid ? null : (
          <>
          <div className="flex items-start gap-2 rounded-lg bg-surface px-3 py-2 shadow-border">
            <label htmlFor="draw-question" className="shrink-0 pt-2 text-sm text-fg">Reason for pull</label>
            <textarea
              id="draw-question"
              ref={reasonField}
              rows={1}
              value={question}
              maxLength={2000}
              placeholder="Optional text"
              className={cn(
                "min-w-0 flex-1 resize-none overflow-hidden bg-transparent py-2 text-sm leading-6 text-fg placeholder:text-fg/30 focus:outline-none",
                reasonOpen ? "min-h-28" : "min-h-10",
              )}
              onChange={(event) => {
                setQuestion(event.target.value);
                const node = event.currentTarget;
                node.style.height = "0px";
                node.style.height = `${node.scrollHeight}px`;
              }}
            />
            <button
              type="button"
              className="mt-1 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:text-fg"
              aria-expanded={reasonOpen}
              aria-label={reasonOpen ? "Collapse reason" : "Expand reason"}
              onClick={() => setReasonOpen((open) => !open)}
            >
              <ChevronDown className={cn("size-4 transition-transform", reasonOpen && "rotate-180")} />
            </button>
          </div>
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
              <button
                type="button"
                className="self-end text-xs text-subtle underline-offset-2 hover:underline"
                onClick={() => setQuestion("")}
              >
                Clear
              </button>
            </div>
          ) : null}
          </>
          )}
        </div>

        <div
          ref={tableBand}
          className={cn("marble-slab relative mt-6", (handoff || spreadLaid) && "is-opening")}
          style={{
            ...(phase === "cutting" || phase === "shuffling" || cutPreview != null || phase === "drawn" ? { overflow: "visible" } : null),
            ...(spreadLaid || handoff
              ? { minHeight: "72vh", height: "auto" }
              : tableBandHeight
                ? { height: tableBandHeight }
                : null),
          }}
        >
          <img
            src={table.image || room.table}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 z-0 h-full w-full object-cover"
            style={{
              transform: `translate(${table.x}%, ${table.y}%) rotate(${table.rotate}deg) scale(${table.scale / 100})`,
              filter: `hue-rotate(${table.color}deg) saturate(${table.saturation}%) brightness(${table.luminous}%) contrast(${table.contrast}%)`,
            }}
          />
          <div className="table-overhead pointer-events-none absolute inset-0 z-[1]" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background: `radial-gradient(ellipse at center, transparent 46%, rgb(28 22 16 / ${table.vignette / 140}))`,
            }}
          />
          {spreadLaid && spreadLive ? (
            <SpreadLay
              session={spreadLive}
              backSrc={backSrc}
              backStyle={backStyle}
              shape={{ width: frame.width, aspect: frame.aspect, radius: cardRadius ?? 5 }}
              guides={spreadGuides}
            />
          ) : null}
          <div className="relative z-20 flex items-center justify-center py-14">
          {spreadLaid ? null : isError ? (
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
                className="table-lit"
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
              approach
              backSrc={backSrc}
              backStyle={backStyle}
              hand={hand}
              shuffleStyle={animationChoice}
              onPreview={previewCut}
              onCut={cut}
              onTap={draw}
              departing={handoff}
            />
            {slip && typeof document !== "undefined"
              ? createPortal(
                  <button
                    type="button"
                    className={`card-slip${slip.landed ? " is-landed" : ""}`}
                    style={{
                      ["--slip-left" as string]: `${slip.left}px`,
                      ["--slip-top" as string]: `${slip.top}px`,
                      ["--slip-x" as string]: `${slip.x}px`,
                      ["--slip-y" as string]: `${slip.y}px`,
                      ["--slip-rot" as string]: `${slip.rot}deg`,
                      ["--slip-spin" as string]: `${slip.spin}deg`,
                      ["--slip-width" as string]: `${slip.width}px`,
                      aspectRatio: frame.aspect,
                      borderRadius: Math.max(1, (cardRadius ?? 5) * 0.46),
                    }}
                    aria-label="A card slipped out of the shuffle. Tap it to draw it."
                    onAnimationEnd={() => setSlip((current) => (current ? { ...current, landed: true } : current))}
                    onClick={() => {
                      if (!slip.landed) return;
                      const card = slip.card;
                      setSlip(null);
                      reveal(card);
                    }}
                  >
                    <img src={backSrc} alt="" draggable={false} className="h-full w-full rounded-[inherit] object-cover" />
                  </button>,
                  document.body,
                )
              : null}
            </>
          )}
          </div>
          {spreadSize > 1 && !spreadLaid ? (
            <button
              type="button"
              ref={pileRef}
              className="absolute right-3 bottom-3 z-30 disabled:pointer-events-none"
              style={{ width: `calc(${frame.width} * 0.46)`, visibility: waitingCount - (flight > 0 ? 1 : 0) > 0 ? "visible" : "hidden" }}
              aria-label="Return the top card to the deck"
              disabled={waitingCount < 1 || phase === "shuffling" || phase === "cutting" || !!slip}
              onClick={returnWaiting}
            >
              <div className="relative" style={{ aspectRatio: frame.aspect }}>
                {Array.from({ length: Math.max(0, Math.min(waitingCount - (flight > 0 ? 1 : 0), 6)) }, (_, index) => (
                  <div
                    key={index}
                    className="absolute inset-0 overflow-hidden shadow-card"
                    style={{
                      borderRadius: `${Math.max(1, (cardRadius ?? 5) * 0.46)}px`,
                      transform: `translate(${index * 1.2}px, ${index * 1.6}px)`,
                      zIndex: index + 1,
                    }}
                  >
                    <img src={backSrc} alt="" draggable={false} className="h-full w-full object-cover" style={backStyle} />
                  </div>
                ))}
              </div>
            </button>
          ) : null}
          {flight > 0 && spreadSize > 1 && !spreadLaid ? (
            <div
              key={flight}
              ref={flyRef}
              className="pile-flight overflow-hidden shadow-card"
              style={{ width: frame.width, aspectRatio: frame.aspect, borderRadius: `${cardRadius ?? 5}px` }}
              onAnimationEnd={() => setFlight(0)}
            >
              <img src={backSrc} alt="" draggable={false} className="h-full w-full object-cover" style={backStyle} />
            </div>
          ) : null}
          {returns.map((item) => (
            <div
              key={item.id}
              className="pile-return overflow-hidden shadow-card"
              style={{
                width: frame.width,
                aspectRatio: frame.aspect,
                borderRadius: `${cardRadius ?? 5}px`,
                ["--return-left" as string]: `${item.left}px`,
                ["--return-top" as string]: `${item.top}px`,
                ["--return-x" as string]: `${item.x}px`,
                ["--return-y" as string]: `${item.y}px`,
              }}
              onAnimationEnd={() => setReturns((current) => current.filter((flightItem) => flightItem.id !== item.id))}
            >
              <img src={backSrc} alt="" draggable={false} className="h-full w-full object-cover" style={backStyle} />
            </div>
          ))}
        </div>

        {!(spreadLaid && spreadLive) && !(drawn && flipped) ? (
          <div className="mt-3 flex w-full max-w-md flex-col items-center gap-2">
            {spreadSize > 1 ? (
              <p className="text-center text-xs text-subtle">
                {spreadLive?.drawnCount ?? 0} of {spreadSize} cards drawn for {spreadChoices.find((item) => item.id === spreadId)?.name ?? "this spread"}
              </p>
            ) : null}
            <Button
              variant="secondary"
              className="relative w-full touch-pan-y overflow-hidden select-none"
              disabled={deck.length < 2 || !!slip || phase === "cutting" || (phase === "shuffling" && !held)}
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
                  const target = event.currentTarget;
                  const pointerId = event.pointerId;
                  const startX = event.clientX;
                  const startY = event.clientY;
                  if (holdWait.current != null) window.clearTimeout(holdWait.current);
                  const start = () => {
                    holdWait.current = null;
                    if (target.hasPointerCapture?.(pointerId) === false) {
                      try {
                        target.setPointerCapture(pointerId);
                      } catch {
                        /* The finger already left. */
                      }
                    }
                    beginHold();
                  };
                  if (phase === "shuffling") {
                    start();
                    return;
                  }
                  const cancel = () => {
                    if (holdWait.current != null) {
                      window.clearTimeout(holdWait.current);
                      holdWait.current = null;
                    }
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", cancel);
                    window.removeEventListener("pointercancel", cancel);
                  };
                  const move = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointerId) return;
                    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) cancel();
                  };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", cancel);
                  window.addEventListener("pointercancel", cancel);
                  holdWait.current = window.setTimeout(() => {
                    window.removeEventListener("pointermove", move);
                    window.removeEventListener("pointerup", cancel);
                    window.removeEventListener("pointercancel", cancel);
                    start();
                  }, 220);
                }}
                onPointerUp={endHold}
                onPointerCancel={endHold}
              />
            </Button>
            {slip?.landed ? (
              <p className="text-center text-xs text-subtle">A card slipped out. Tap it.</p>
            ) : null}
          </div>
        ) : null}

        <section className="mt-3 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-surface">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={prefsOpen}
            onClick={() => setPrefsOpen((open) => !open)}
          >
            <span>
              <span className="block text-sm">Table Preferences</span>
              <span className="block text-xs text-subtle">
                {hand === "left" ? "Left hand" : "Right hand"} · {spreadChoices.find((item) => item.id === spreadId)?.name ?? "One Card"}
              </span>
            </span>
            <ChevronDown className={cn("size-4 text-muted transition-transform", prefsOpen && "rotate-180")} />
          </button>
          {prefsOpen ? (
            <div className="grid gap-4 border-t border-border px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="reading-hand" className="text-sm text-fg">Shuffle hand</Label>
                <div className="flex shrink-0 items-center gap-2 text-xs tracking-wide text-subtle">
                  <span className={hand === "right" ? "text-fg" : undefined}>Right</span>
                  <Switch
                    id="reading-hand"
                    checked={hand === "left"}
                    onCheckedChange={(on) => setReadingHand(on ? "left" : "right")}
                    aria-label="Shuffle hand"
                  />
                  <span className={hand === "left" ? "text-fg" : undefined}>Left</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="reversals" className="text-sm text-fg">Allow reversed cards</Label>
                <Switch
                  id="reversals"
                  checked={includeReversals}
                  onCheckedChange={setIncludeReversals}
                />
              </div>
              <div>
                <label htmlFor="shuffle-animation" className="text-xs text-subtle">Shuffle style</label>
                <select
                  id="shuffle-animation"
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm"
                  value={animationChoice}
                  disabled={phase === "shuffling" || phase === "cutting"}
                  onChange={(event) => {
                    const next = event.target.value;
                    if (next === "original" || next === "overhand" || next === "riffle_bridge" || next === "hindu" || next === "table_wash" || next === "three_packet_cut") {
                      setShuffleAnimation(next);
                    }
                  }}
                >
                  <option value="original">Original</option>
                  <option value="overhand">Overhand</option>
                  <option value="riffle_bridge">Riffle & Bridge</option>
                  <option value="hindu">Hindu</option>
                  <option value="table_wash">Table Wash (Default)</option>
                  <option value="three_packet_cut">Three-Packet Cut</option>
                </select>
              </div>
              <div>
                <label htmlFor="spread-choice" className="text-xs text-subtle">Spread</label>
                <select
                  id="spread-choice"
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm"
                  value={spreadId}
                  onChange={(event) => chooseSpread(event.target.value)}
                >
                  {spreadChoices.map((spread) => (
                    <option key={spread.id} value={spread.id}>
                      {spread.name} · {spread.positions.length} {spread.positions.length === 1 ? "card" : "cards"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </section>

        {spreadSize > 1 ? (
          <div className="mt-3 flex w-full max-w-md items-center gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => useSpreads.getState().discard()}>
              Clear the table
            </Button>
            <button
              type="button"
              role="switch"
              aria-checked={spreadGuides}
              aria-label={spreadGuides ? "Hide the spread overlay" : "Show the spread overlay"}
              className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-sm"
              onClick={() => setSpreadGuides((on) => !on)}
            >
              <span className={`relative h-5 w-9 rounded-full transition-colors ${spreadGuides ? "bg-fg" : "bg-fg/25"}`}>
                <span className={`absolute top-0.5 size-4 rounded-full bg-bg transition-transform ${spreadGuides ? "left-4" : "left-0.5"}`} />
              </span>
              Overlay
            </button>
          </div>
        ) : null}

        {spreadLaid && spreadLive ? (
          <SpreadReadingBar session={spreadLive} />
        ) : drawn && flipped ? (
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
        ) : meetWith ? (
          <div className="mt-4 flex w-full max-w-md flex-col items-center gap-3">
            <p className="text-center text-sm text-subtle">
              Holding {meetWith.name}. Draw another card to meet it.{" "}
              <button type="button" className="underline" onClick={() => setMeetWith(null)}>
                Forget it
              </button>
            </p>
          </div>
        ) : null}

        <Separator className="my-10" />
      </div>

      <Dialog open={pendingSpread != null} onOpenChange={(open) => !open && setPendingSpread(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change the spread?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted">The table is not at its start. Changing spreads clears the cards and begins again.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPendingSpread(null)}>Keep this table</Button>
            <Button type="button" onClick={() => pendingSpread && applySpread(pendingSpread)}>Clear and change</Button>
          </div>
        </DialogContent>
      </Dialog>
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

export function ShuffleSlider({
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

/** Enough sheets that each edge is a real pixel. A full 78-card stack is thinner than a shadow. */
const STACK_SHEETS = 16;

function splitIndex(count: number, ratio: number) {
  if (count < 2) return 1;
  const clamped = Math.min(1, Math.max(0, ratio));
  return Math.min(count - 1, Math.max(1, Math.ceil(clamped * (count - 1))));
}

export function DeckStack({
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
  shuffleStyle = "original",
  onPreview,
  onCut,
  onTap,
  working = false,
  approach = false,
  departing = false,
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
  shuffleStyle?: string;
  onPreview: (ratio: number | null) => void;
  onCut: (ratio: number) => void;
  onTap: () => void;
  working?: boolean;
  approach?: boolean;
  departing?: boolean;
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
  const sheets = count < 2 ? Math.max(1, count) : Math.min(STACK_SHEETS, count);
  const visualOrigin = sheets < 2 ? 0 : Math.round((origin * sheets) / count) % sheets;
  const split = grouped ? splitIndex(sheets, preview ?? 0.5) : sheets;
  const movingCount =
    shufflingNow && (shuffleStyle === "overhand" || shuffleStyle === "hindu")
      ? Math.max(1, Math.round(sheets * 0.28))
      : shufflingNow && shuffleStyle === "three_packet_cut"
        ? Math.max(1, Math.round(sheets / 3))
        : split;
  const below = Math.max(1, sheets - split);
  const step = (0.62 * (thickness / 75)) / 0.25;
  const cardEdge = Math.max(0.85, step * 0.28);
  const edgePaint = edgeLook(edge, edgeColor, edgeSat, edgeLight).color;
  const gesture = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const [hinduLead, setHinduLead] = useState<"bottom" | "top">("bottom");
  const [overhandTop, setOverhandTop] = useState(0);
  const [riffleRun, setRiffleRun] = useState(0);
  const riffleLock = useRef(false);
  let topPose = "translate3d(0px, 0px, 0px)";
  let bottomPose = "translate3d(0px, 0px, 0px)";
  let topShadow = "translate3d(0px, 14px, 0px)";
  let bottomShadow = "translate3d(0px, 10px, 0px)";
  let topLift = 0;
  let restLift = 0;
  let topZ = 6;
  let bottomZ = 2;
  const originalCycle = useRef(0);
  const originalBeat = useRef<string | null>(null);
  const originalOpening = useRef(false);
  if (shufflingNow && shuffleStyle === "original" && beat === "aside" && originalBeat.current !== "aside") {
    originalCycle.current += 1;
    originalOpening.current = originalBeat.current == null;
  }
  originalBeat.current = beat;

  if (cuttingNow) {
    const seat = below * step * 0.18;
    const seatX = dir * below * step * 0.25;
    const posed = shufflePose(beat ?? "tuck", dir, seat, seatX);
    topPose = posed.top;
    topShadow = posed.shadow;
    topLift = posed.lift;
    bottomShadow = "translate(0px, 12px)";
    topZ = posed.topZ;
    bottomZ = posed.bottomZ;
  } else if (aiming) {
    const ratio = preview ?? 0.5;
    topPose = `translate(${dir * -36}px, ${(-18 - ratio * 36).toFixed(1)}px) rotate(${dir * -3}deg)`;
    bottomPose = `translate(0px, ${(10 + ratio * 16).toFixed(1)}px)`;
    topShadow = `translate(${dir * -30}px, ${(16 + ratio * 14).toFixed(1)}px) rotate(${dir * -1.5}deg) scale(${(1.04 + ratio * 0.12).toFixed(3)})`;
    bottomShadow = `translate(0px, ${(10 + ratio * 8).toFixed(1)}px)`;
    topLift = 0.3 + ratio * 0.45;
  }

  return (
    <div
      className={cn("deck-table", approach && "is-approach", approach && (shuffling || cutting || aiming) && "is-lifted", departing && "is-departing")}
      data-hand={hand}
      data-deck=""
      style={{ width: frame.width, ["--radius-lg" as string]: `${radius}px` }}
    >
      <div className={cn("deck-ground", grouped && "is-split")} style={{ aspectRatio: frame.aspect }} aria-hidden />
      <div
        className={cn(
          "deck-pile",
          drawn && "has-drawn",
          aiming && "is-aiming",
          approach && (shuffling || cutting || aiming) && "is-lifted",
          Boolean(beat) && "is-moving",
          working && "is-working",
          shufflingNow && shuffleStyle === "original" && "is-original",
          shufflingNow && shuffleStyle !== "original" && "is-flow",
          shufflingNow && shuffleStyle === "hindu" && "is-hindu",
          shufflingNow && shuffleStyle === "riffle_bridge" && "is-riffle",
        )}
        data-cut={beat ?? undefined}
        data-pull={shufflingNow && shuffleStyle === "original" ? "bottom" : undefined}
        style={
          {
            aspectRatio: frame.aspect,
            "--cut-pace": `${motion ?? 520}ms`,
            "--shuffle-pace": `${Math.round((motion ?? 520) * 3.25)}ms`,
            "--original-pace": `${Math.round(((motion ?? 520) * 3) / 0.92)}ms`,
            "--pull-out": `${dir * 132}%`,
            "--pull-tilt": `${dir * 7}deg`,
            "--overhand-pace": `${Math.round((motion ?? 520) * 3.25 * 2.15)}ms`,
            "--pull-x": `${dir * 118}%`,
            "--pull-r": `${dir * 8}deg`,
            "--card-edge": `${cardEdge}px`,
          } as CSSProperties
        }
      >
        {grouped && !(shufflingNow && shuffleStyle === "original") ? (
          <div
            className="deck-cast"
            style={{
              transform: bottomShadow,
              opacity: 0.58 - restLift * 0.08,
              filter: `blur(${4 + restLift * 2}px)`,
            }}
          />
        ) : null}
        {grouped && !(shufflingNow && shuffleStyle === "original") ? (
          <div
            className={cn("deck-cast", topLift > 0.2 && "is-high")}
            style={{
              transform: topShadow,
              opacity: 0.52 - topLift * 0.26,
              filter: `blur(${5 + topLift * 7}px)`,
            }}
          />
        ) : null}
        {shufflingNow && shuffleStyle === "original" ? (
          <>
            {(["leave", "stay"] as const).map((role) => {
              const realStay = splitIndex(Math.max(2, count), preview ?? 0.5);
              const realLeave = Math.max(1, Math.max(2, count) - realStay);
              const [staySheets = 1, leaveSheets = 1] = sheetsForSplit([realStay, realLeave], sheets);
              const size = role === "stay" ? staySheets : leaveSheets;
              const start = role === "stay" ? 0 : staySheets;
              const indices = Array.from({ length: size }, (_, local) => start + local).filter((index) => index < sheets);
              const edge = cardEdge;
              const opening = originalOpening.current;
              return (
                <div key={`${role}-${originalCycle.current}`}>
                  <div className={cn("original-shadow", role === "leave" ? "is-leaving" : "is-staying", opening && "is-opening")} />
                  <div className={cn("original-packet", role === "leave" ? "is-leaving" : "is-staying", opening && "is-opening")}>
                    {indices.map((index, local) => (
                      <div
                        key={index}
                        className="deck-card"
                        style={{
                          backgroundColor: paperTone(edgePaint, index),
                          transform: `translate(${dir * local * edge * 0.38}px, ${local * edge}px)`,
                          zIndex: indices.length - local,
                        }}
                      >
                        {local === 0 ? <img src={backSrc} alt="" decoding="sync" style={backStyle} /> : null}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        ) : shufflingNow && shuffleStyle === "hindu" ? (
          <>
            {(["bottom", "top"] as const).map((packet) => {
              const [heldSheets = 1, pulledSheets = 1] = sheetsForSplit(shuffleSplit("hindu", Math.max(2, count)), sheets);
              const moving = packet === hinduLead;
              const indices = Array.from({ length: sheets }, (_, index) => index).filter((index) =>
                packet === "top" ? index < heldSheets : index >= sheets - pulledSheets,
              );
              return (
                <div
                  key={packet}
                  className={cn("hindu-packet", moving ? "is-pulled" : "is-held")}
                  onAnimationEnd={(event) => {
                    if (!moving || event.animationName !== "hindu-pull") return;
                    setHinduLead((lead) => (lead === "bottom" ? "top" : "bottom"));
                  }}
                >
                  {indices.map((index, local) => {
                    const lean = sheetLean(index);
                    return (
                      <div
                        key={index}
                        className="deck-card"
                        style={{
                          backgroundColor: paperTone(edgePaint, index),
                          transform: `translate(${dir * local * cardEdge * 0.38}px, ${local * cardEdge}px) rotate(${lean.tilt * 0.25}deg)`,
                          zIndex: indices.length - local,
                        }}
                      >
                        {local === 0 ? <img src={backSrc} alt="" decoding="sync" style={backStyle} /> : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        ) : shufflingNow && shuffleStyle === "riffle_bridge" ? (
          <>
            {(["left", "right"] as const).map((side) => {
              const [leftSheets = 1] = sheetsForSplit(shuffleSplit("riffle_bridge", Math.max(2, count)), sheets);
              const indices = Array.from({ length: sheets }, (_, index) => index).filter((index) =>
                side === "left" ? index < leftSheets : index >= leftSheets,
              );
              return (
                <div
                  key={`${side}-${riffleRun}`}
                  className={cn("riffle-packet", side === "left" ? "is-left" : "is-right")}
                  onAnimationEnd={(event) => {
                    if (side !== "right" || event.animationName !== "riffle-right" || riffleLock.current) return;
                    riffleLock.current = true;
                    window.setTimeout(() => {
                      riffleLock.current = false;
                      setRiffleRun((run) => run + 1);
                    }, 40);
                  }}
                >
                  {indices.map((index, local) => (
                    <div
                      key={index}
                      className="deck-card"
                      style={{
                        backgroundColor: paperTone(edgePaint, index),
                        zIndex: (side === "right" ? 24 : 8) + local,
                        ["--i" as string]: String(local),
                      }}
                    >
                      <img src={backSrc} alt="" decoding="sync" style={backStyle} />
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        ) : shufflingNow && shuffleStyle === "overhand" ? (
          <>
            {sheetsForSplit(shuffleSplit("overhand", Math.max(2, count)), sheets).map((size, pile, sizes) => {
              const start = sizes.slice(0, pile).reduce((sum, item) => sum + item, 0);
              const indices = Array.from({ length: size }, (_, local) => start + local);
              const peeled = pile === overhandTop;
              return (
                <div
                  key={`overhand-${pile}`}
                  className={cn("flow-packet", peeled ? "is-peeled" : "is-stock")}
                  onAnimationEnd={(event) => {
                    if (peeled || event.animationName !== "overhand-stock") return;
                    setOverhandTop((top) => (top === 0 ? 1 : 0));
                  }}
                >
                  {indices.map((index, local) => (
                    <div
                      key={index}
                      className="deck-card"
                      style={{
                        backgroundColor: paperTone(edgePaint, index),
                        transform: `translate(${dir * local * cardEdge * 0.38}px, ${local * cardEdge}px)`,
                        zIndex: indices.length - local,
                      }}
                    >
                      {local === 0 ? <img src={backSrc} alt="" decoding="sync" style={backStyle} /> : null}
                    </div>
                  ))}
                </div>
              );
            })}
          </>
        ) : shufflingNow && (shuffleStyle === "three_packet_cut" || shuffleStyle === "table_wash") ? (
          <>
            {shuffleStyle === "table_wash"
              ? Array.from({ length: sheets }, (_, index) => {
                  const span = Math.max(1, sheets - 1);
                  const along = index / span;
                  const angle = (-98 + along * 196) * (Math.PI / 180);
                  const reach = 88 + Math.min(count, 78) * 1.15;
                  const gather = index % 4 === 2 ? 0 : index % 4 === 0 ? 1 : index % 4 === 3 ? 2 : 3;
                  return (
                    <div
                      key={`${riffleRun}-${index}`}
                      className="deck-card wash-card"
                      onAnimationEnd={(event) => {
                        if (event.animationName !== "wash-flow" || riffleLock.current) return;
                        riffleLock.current = true;
                        window.setTimeout(() => {
                          riffleLock.current = false;
                          setRiffleRun((run) => run + 1);
                        }, 40);
                      }}
                      style={{
                        backgroundColor: paperTone(edgePaint, index),
                        zIndex: 8 + gather * sheets + index,
                        ["--wx" as string]: `${Math.sin(angle) * reach}%`,
                        ["--wy" as string]: `${6 + (1 - Math.cos(angle)) * 48}%`,
                        ["--wr" as string]: `${Math.sin(angle) * 16}deg`,
                        ["--g" as string]: String(gather + along),
                        ["--i" as string]: String(index),
                      }}
                    >
                      <img src={backSrc} alt="" decoding="sync" style={backStyle} />
                    </div>
                  );
                })
              : sheetsForSplit(shuffleSplit(shuffleStyle, Math.max(2, count)), sheets).map((size, pile, sizes) => {
                  const start = sizes.slice(0, pile).reduce((sum, item) => sum + item, 0);
                  const indices = Array.from({ length: size }, (_, local) => start + local);
                  const role = `is-three-${pile}`;
                  return (
                    <div
                      key={`${shuffleStyle}-${pile}-${riffleRun}`}
                      className={cn("flow-packet", role)}
                      onAnimationEnd={(event) => {
                        if (riffleLock.current) return;
                        const finished = event.animationName === "three-middle";
                        if (!finished) return;
                        riffleLock.current = true;
                        window.setTimeout(() => {
                          riffleLock.current = false;
                          setRiffleRun((run) => run + 1);
                        }, 40);
                      }}
                    >
                      {indices.map((index, local) => (
                        <div
                          key={index}
                          className="deck-card"
                          style={{
                            backgroundColor: paperTone(edgePaint, index),
                            transform: `translate(${dir * local * cardEdge * 0.38}px, ${local * cardEdge}px)`,
                            zIndex: indices.length - local,
                          }}
                        >
                          {local === 0 ? <img src={backSrc} alt="" decoding="sync" style={backStyle} /> : null}
                        </div>
                      ))}
                    </div>
                  );
                })}
          </>
        ) : (
        Array.from({ length: sheets }, (_, index) => {
          const v = (index - visualOrigin + sheets) % sheets;
          const inTop = grouped && v < movingCount;
          const local = grouped ? (inTop ? v : v - movingCount) : v;
          const placed = !grouped ? "" : inTop ? topPose : bottomPose;
          const band = !grouped ? 1 : inTop ? topZ : bottomZ;
          const showFace = local === 0;
          const lean = sheetLean(index);
          return (
            <div
              key={index}
              className="deck-card"
              style={{
                backgroundColor: paperTone(edgePaint, index),
                transform: `${placed} translate(${dir * local * step * 0.25 + lean.slip}px, ${local * step * 0.18}px) rotate(${lean.tilt}deg)`,
                zIndex: band * (sheets + 2) + (sheets - local),
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
        })
        )}
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
