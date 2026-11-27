import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function DeckTabs({ current }: { current: "collection" | "spreads" }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <Link to="/deck" className={cn("flex h-11 items-center justify-center rounded-md text-sm", current === "collection" ? "bg-fg text-bg" : "bg-surface text-muted")}>
        Deck Collection
      </Link>
      <Link to="/deck/spreads" className={cn("flex h-11 items-center justify-center rounded-md text-sm", current === "spreads" ? "bg-fg text-bg" : "bg-surface text-muted")}>
        Spreads
      </Link>
    </div>
  );
}
