"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TarotCardFace, VelomereBorder, cardImageSrc, placedArtStyle } from "@/components/tarot-card";
import { SUITS, isSuit, suitLabel } from "@/lib/cards/types";
import { cn } from "@/lib/utils";

const DWELL_MS = 280;

function orderedSuits(cards: any[], _customSuits: string[], saved: string[]) {
  const present = new Set<string>();
  for (const card of cards) {
    if (card?.suit) present.add(String(card.suit));
  }
  const list = [...present];
  if (saved.length === 0) {
    return [
      ...SUITS.filter((suit) => list.includes(suit)),
      ...list.filter((suit) => !(SUITS as readonly string[]).includes(suit)).sort(),
    ];
  }
  const known = saved.filter((suit) => list.includes(suit));
  const rest = list.filter((suit) => !known.includes(suit));
  return [
    ...known,
    ...SUITS.filter((suit) => rest.includes(suit)),
    ...rest.filter((suit) => !(SUITS as readonly string[]).includes(suit)).sort(),
  ];
}

function flatten(order: string[], cards: any[]) {
  const next: any[] = [];
  for (const suit of order) {
    for (const card of cards) if (card.suit === suit) next.push(card);
  }
  for (const card of cards) if (!order.includes(card.suit)) next.push(card);
  return next;
}

export function cardSequence(cards: any[], customSuits: string[], saved: string[]) {
  return flatten(orderedSuits(cards, customSuits, saved), cards);
}

export function DeckSuits({
  cards,
  customSuits,
  suitOrder,
  arrange,
  locked,
  focusSuit,
  aspect = 2 / 3,
  onCards,
  onSuitOrder,
  onPreview,
  onEdit,
  onDelete,
}: {
  cards: any[];
  customSuits: string[];
  suitOrder: string[];
  arrange: boolean;
  locked: boolean;
  focusSuit: string | null;
  aspect?: number;
  onCards: (cards: any[]) => void;
  onSuitOrder: (order: string[]) => void;
  onPreview: (card: any) => void;
  onEdit: (card: any) => void;
  onDelete: (card: any) => void;
}) {
  const [open, setOpen] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef(cards);
  const orderRef = useRef<string[]>([]);
  const order = orderedSuits(cards, customSuits, suitOrder);
  cardsRef.current = cards;
  orderRef.current = order;

  useEffect(() => {
    if (focusSuit) setOpen([focusSuit]);
  }, [focusSuit]);

  const commitSuits = (nextOrder: string[], nextCards = cards) => {
    onSuitOrder(nextOrder);
    onCards(flatten(nextOrder, nextCards));
  };

  const moveSuit = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    commitSuits(next);
  };

  const moveCard = (suit: string, index: number, delta: number) => {
    const group = cards.filter((card) => card.suit === suit);
    const to = index + delta;
    if (to < 0 || to >= group.length) return;
    const nextGroup = [...group];
    const [item] = nextGroup.splice(index, 1);
    nextGroup.splice(to, 0, item);
    const rebuilt: any[] = [];
    for (const name of order) {
      const chunk = name === suit ? nextGroup : cards.filter((card) => card.suit === name);
      rebuilt.push(...chunk);
    }
    onCards(rebuilt);
  };

  const placeCard = (cardId: number, targetId: number) => {
    const current = cardsRef.current;
    const moving = current.find((card) => card.id === cardId);
    const target = current.find((card) => card.id === targetId);
    if (!moving || !target || moving.id === target.id) return;
    const updated = current.map((card) => (card.id === cardId ? { ...card, suit: target.suit } : card));
    const moved = updated.find((card) => card.id === cardId);
    const rest = updated.filter((card) => card.id !== cardId);
    const at = rest.findIndex((card) => card.id === targetId);
    rest.splice(at < 0 ? rest.length : at, 0, moved);
    onCards(rest);
  };

  const placeCardInSuit = (cardId: number, suit: string) => {
    const current = cardsRef.current;
    const moving = current.find((card) => card.id === cardId);
    if (!moving || moving.suit === suit) return;
    const updated = current.map((card) => (card.id === cardId ? { ...card, suit } : card));
    onCards(flatten(orderRef.current, updated));
  };

  const onCardPointerDown = (event: ReactPointerEvent<HTMLLIElement>, cardId: number) => {
    if (!arrange || event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const row = event.currentTarget;
    let mode: "pending" | "drag" = "pending";
    let timer: number | null = window.setTimeout(() => {
      timer = null;
      mode = "drag";
      const rect = row.getBoundingClientRect();
      setDragId(`card:${cardId}`);
      const node = floatRef.current;
      if (node) {
        node.style.width = `${rect.width}px`;
        node.style.height = `${rect.height}px`;
        node.style.transform = `translate3d(${rect.left}px, ${rect.top - 10}px, 0) rotate(-1.5deg)`;
        node.style.opacity = "1";
        node.textContent = row.querySelector("[data-card-name]")?.textContent ?? "";
      }
    }, 180);
    let dwell: number | null = null;
    let over = "";
    const clearDwell = () => {
      if (dwell != null) window.clearTimeout(dwell);
      dwell = null;
    };
    const stop = () => {
      if (timer != null) window.clearTimeout(timer);
      clearDwell();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragId(null);
      if (floatRef.current) floatRef.current.style.opacity = "0";
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId || mode !== "drag") {
        if (mode === "pending" && Math.hypot(ev.clientX - startX, ev.clientY - startY) > 28) {
          if (timer != null) window.clearTimeout(timer);
          timer = null;
          mode = "pending";
          stop();
        }
        return;
      }
      ev.preventDefault();
      const node = floatRef.current;
      if (node) {
        node.style.transform = `translate3d(${ev.clientX - 28}px, ${ev.clientY - 28}px, 0) rotate(${Math.max(-6, Math.min(6, (ev.clientX - startX) * 0.03))}deg) scale(1.03)`;
      }
      let next = "";
      const cardHit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-card-id]");
      const suitHit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-suit-id]");
      if (cardHit) next = `card:${cardHit.getAttribute("data-card-id")}`;
      else if (suitHit) next = `suit:${suitHit.getAttribute("data-suit-id")}`;
      if (next === over) return;
      over = next;
      clearDwell();
      if (!next || next === `card:${cardId}`) return;
      dwell = window.setTimeout(() => {
        if (next.startsWith("card:")) placeCard(cardId, Number(next.slice(5)));
        else placeCardInSuit(cardId, next.slice(5));
      }, DWELL_MS);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      stop();
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onSuitPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, suit: string) => {
    if (!arrange || event.button !== 0) return;
    event.preventDefault();
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let timer: number | null = window.setTimeout(() => {
      timer = null;
      dragging = true;
      setDragId(`suit:${suit}`);
    }, 180);
    let dwell: number | null = null;
    let over = "";
    const stop = () => {
      if (timer != null) window.clearTimeout(timer);
      if (dwell != null) window.clearTimeout(dwell);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragId(null);
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 28) {
          if (timer != null) window.clearTimeout(timer);
          stop();
        }
        return;
      }
      ev.preventDefault();
      const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-suit-id]");
      const next = hit?.getAttribute("data-suit-id") ?? "";
      if (!next || next === over) return;
      over = next;
      if (dwell != null) window.clearTimeout(dwell);
      dwell = window.setTimeout(() => {
        const currentOrder = orderRef.current;
        const from = currentOrder.indexOf(suit);
        const to = currentOrder.indexOf(next);
        if (from < 0 || to < 0 || from === to) return;
        const nextOrder = [...currentOrder];
        nextOrder.splice(from, 1);
        nextOrder.splice(to, 0, suit);
        commitSuits(nextOrder, cardsRef.current);
      }, DWELL_MS);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const wasDrag = dragging;
      stop();
      if (!wasDrag) {
        setOpen((current) => (current.includes(suit) ? current.filter((item) => item !== suit) : [...current, suit]));
      }
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  if (order.length === 0) return null;

  return (
    <div ref={listRef} className="mt-10 flex flex-col gap-3">
      {order.filter((suit) => cards.some((card) => card.suit === suit)).map((suit, index) => {
        const group = cards.filter((card) => card.suit === suit);
        const expanded = arrange || open.includes(suit);
        return (
          <section key={suit} data-suit-id={suit} className="rounded-xl bg-surface shadow-border">
            <div className="flex items-center gap-1 pr-2">
              {arrange ? (
                <div className="flex shrink-0 flex-col py-1 pl-1">
                  <Button type="button" variant="ghost" size="icon" className="size-9" disabled={index === 0} aria-label={`Move ${suitLabel(suit)} up`} onClick={() => moveSuit(index, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-9" disabled={index === order.length - 1} aria-label={`Move ${suitLabel(suit)} down`} onClick={() => moveSuit(index, 1)}>
                    <ArrowDown />
                  </Button>
                </div>
              ) : null}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between gap-3 px-4 py-3 text-left select-none"
                aria-expanded={expanded}
                onPointerDown={(event) => onSuitPointerDown(event, suit)}
                onClick={() => {
                  if (arrange) return;
                  setOpen((current) => (current.includes(suit) ? current.filter((item) => item !== suit) : [...current, suit]));
                }}
                onContextMenu={(event) => event.preventDefault()}
              >
                <span>
                  <span className="block font-display text-2xl tracking-tight">{suitLabel(suit)}</span>
                  <span className="text-xs text-subtle">
                    {group.length} {group.length === 1 ? "card" : "cards"}
                    {arrange ? " · hold to move this section" : ""}
                  </span>
                </span>
                <ChevronDown className={cn("size-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
              </button>
            </div>
            {expanded ? (
              group.length === 0 ? (
                <p className="border-t border-border px-4 py-4 text-sm text-muted">No cards in this suit yet.</p>
              ) : (
                <ul className="flex flex-col gap-2 border-t border-border p-3">
                  {group.map((card, cardIndex) => (
                    <li
                      key={card.id}
                      id={`deck-card-${card.id}`}
                      data-card-id={card.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl bg-raised p-3 select-none",
                        dragId === `card:${card.id}` && "opacity-40",
                      )}
                      onPointerDown={(event) => onCardPointerDown(event, card.id)}
                      onContextMenu={(event) => event.preventDefault()}
                    >
                      {arrange ? (
                        <div className="flex shrink-0 flex-col" onPointerDown={(event) => event.stopPropagation()}>
                          <Button type="button" variant="ghost" size="icon" className="size-9" disabled={cardIndex === 0} aria-label={`Move ${card.name} up`} onClick={() => moveCard(suit, cardIndex, -1)}>
                            <ArrowUp />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="size-9" disabled={cardIndex === group.length - 1} aria-label={`Move ${card.name} down`} onClick={() => moveCard(suit, cardIndex, 1)}>
                            <ArrowDown />
                          </Button>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className="relative w-16 shrink-0 overflow-hidden rounded-md bg-[#f7f3ea] shadow-card"
                        style={{ aspectRatio: aspect }}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          onPreview(card);
                        }}
                        aria-label={`Preview ${card.name}`}
                      >
                        {card.imageUrl ? (
                          <img src={cardImageSrc(card.imageUrl)} alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" style={placedArtStyle(card.imageScale ?? 100, card.imageX ?? 0, card.imageY ?? 0)} />
                        ) : (
                          <TarotCardFace card={card} />
                        )}
                        <VelomereBorder src={card.imageUrl} suit={card.suit} />
                      </button>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          if (!arrange) onPreview(card);
                        }}
                      >
                        <p data-card-name className="truncate font-display text-lg leading-tight tracking-tight">
                          {card.name}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted">{card.keywords || suitLabel(suit)}</p>
                      </button>
                      {locked || arrange ? null : (
                        <div className="flex shrink-0 flex-col" onPointerDown={(event) => event.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="size-10" onClick={() => onEdit(card)} aria-label={`Edit ${card.name}`}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon" className="size-10" onClick={() => onDelete(card)} aria-label={`Remove ${card.name}`}>
                            <Trash2 />
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </section>
        );
      })}
      <div
        ref={floatRef}
        className="pointer-events-none fixed top-0 left-0 z-50 flex items-center rounded-xl bg-surface px-4 text-sm text-fg opacity-0 shadow-[0_24px_40px_-18px_rgba(0,0,0,0.7)]"
      />
    </div>
  );
}
