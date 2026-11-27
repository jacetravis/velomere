import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ArtPreferences } from "@/components/art-preferences";
import { ArtZoom } from "@/components/art-zoom";
import { DeckSuits } from "@/components/deck-suits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listPersonalVelomereDeck } from "@/lib/encounters/server";

export const Route = createFileRoute("/encounters/personal")({
  component: PersonalVelomerePage,
});

type PersonalCard = {
  id: number;
  index: number;
  name: string;
  suit: string;
  rank: string;
  keywords: string;
  upright: string;
  reversed: string;
  imageUrl: string | null;
  geometryUrl?: string | null;
};

function PersonalVelomerePage() {
  const deck = useQuery({ queryKey: ["personal-velomere"], queryFn: () => listPersonalVelomereDeck() });
  const hash = useRouterState({ select: (state) => state.location.hash });
  const stylize = hash === "style" || hash === "#style";
  const cards = (deck.data?.cards ?? []) as PersonalCard[];
  const [preview, setPreview] = useState<PersonalCard | null>(null);
  const [geometry, setGeometry] = useState(false);
  const [zoom, setZoom] = useState(false);
  return (
    <AppShell>
      <h1 className="font-display text-4xl">Velomere</h1>
      {stylize ? (
        <section id="personal-style" className="mt-6">
          <h2 className="font-display text-2xl">Stylize art</h2>
          <p className="mt-1 text-sm text-subtle">This sets the style used when a Velomere card is stylized. Collected cards stay as they are until you stylize one.</p>
          <div className="mt-4">
            <ArtPreferences embedded />
          </div>
        </section>
      ) : (
        <section id="personal-cards" className="mt-6">
          <p className="text-sm text-subtle">Cards drawn on the Velomere table. Nothing else can add one.</p>
          {deck.isLoading ? <p className="mt-4 text-sm text-subtle">Opening the deck…</p> : null}
          {!deck.isLoading && cards.length === 0 ? <p className="mt-4 text-sm text-subtle">This deck is empty.</p> : null}
          <DeckSuits
            cards={cards}
            customSuits={[]}
            suitOrder={[]}
            arrange={false}
            locked
            focusSuit={null}
            onCards={() => undefined}
            onSuitOrder={() => undefined}
            onPreview={(card) => {
              setGeometry(false);
              setZoom(false);
              setPreview(card as PersonalCard);
            }}
            onEdit={() => undefined}
            onDelete={() => undefined}
          />
        </section>
      )}
      <Dialog open={preview != null} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          {preview ? (
            <>
              <DialogHeader>
                <DialogTitle>{preview.name}</DialogTitle>
              </DialogHeader>
              {preview.imageUrl || (geometry && preview.geometryUrl) ? (
                <img
                  src={geometry && preview.geometryUrl ? preview.geometryUrl : preview.imageUrl || ""}
                  alt=""
                  className="mx-auto w-full max-w-xs rounded-xl"
                />
              ) : null}
              <p className="text-xs text-subtle">{[preview.suit, preview.rank].filter(Boolean).join(" · ")}</p>
              {preview.keywords ? <p className="text-sm text-subtle">{preview.keywords}</p> : null}
              {preview.upright ? <p className="text-sm"><span className="text-subtle">Upright. </span>{preview.upright}</p> : null}
              {preview.reversed ? <p className="text-sm"><span className="text-subtle">Shadow. </span>{preview.reversed}</p> : null}
              <div className="flex flex-wrap gap-2">
                {preview.geometryUrl ? (
                  <Button type="button" variant="secondary" onClick={() => setGeometry((open) => !open)}>
                    {geometry ? "Return to Artwork" : "Show Original Geometry"}
                  </Button>
                ) : null}
                {preview.imageUrl ? (
                  <Button type="button" variant="secondary" onClick={() => setZoom(true)}>Fullscreen</Button>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      {zoom && preview?.imageUrl ? (
        <ArtZoom
          card={{
            name: preview.name,
            suit: preview.suit || "Velomere",
            rank: preview.rank || "",
            keywords: preview.keywords,
            imageUrl: geometry && preview.geometryUrl ? preview.geometryUrl : preview.imageUrl,
            imageScale: 100,
            imageX: 0,
            imageY: 0,
            imageRadius: 2,
          }}
          orientation="upright"
          onClose={() => setZoom(false)}
        />
      ) : null}
    </AppShell>
  );
}
