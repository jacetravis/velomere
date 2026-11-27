"use client";

import { useEffect, useState } from "react";

export function CompanionProgress({ active, cards = 1 }: { active: boolean; cards?: number }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }
    const started = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 400);
    return () => window.clearInterval(timer);
  }, [active]);
  if (!active) return null;
  const low = Math.max(30, cards * 35);
  const high = low + 10;
  const noun = cards === 1 ? "card" : "cards";
  return (
    <div role="status" aria-live="polite" className="grid gap-2">
      <p className="text-sm">Applying style to {cards} {noun}… {seconds}s</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-bg">
        <div className="companion-progress h-full rounded-full bg-accent" />
      </div>
      <p className="text-xs text-subtle">The geometric score stays on the card. {low}s - {high}s.</p>
    </div>
  );
}
