"use client";

import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { UnsavedChatDialog } from "@/components/unsaved-chat";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { UploadConsent } from "@/lib/consent";
import { cleanWebsite, youtubeId } from "@/lib/links";
import { useSolace } from "@/lib/solace/store";
import type { Sitting } from "@/lib/solace/sitting";
import { cleanOrigin, sameOrigin, type ConversationOrigin } from "@/lib/solace/origin";
import { saveCurrentThread, threadNeedsSave } from "@/lib/solace/thread";
import { cn } from "@/lib/utils";

export function LinkFields({
  id = "entry",
  website,
  video,
  onWebsite,
  onVideo,
}: {
  id?: string;
  website: string;
  video: string;
  onWebsite: (value: string) => void;
  onVideo: (value: string) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-website`}>Website</Label>
        <Input
          id={`${id}-website`}
          value={website}
          inputMode="url"
          placeholder="https://"
          onChange={(event) => onWebsite(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-video`}>YouTube</Label>
        <Input
          id={`${id}-video`}
          value={video}
          inputMode="url"
          placeholder="https://www.youtube.com/watch?v="
          onChange={(event) => onVideo(event.target.value)}
        />
      </div>
    </div>
  );
}

export function EntryMedia({ websiteUrl, videoUrl }: { websiteUrl?: string; videoUrl?: string }) {
  const site = websiteUrl ? cleanWebsite(websiteUrl) : null;
  const id = videoUrl ? youtubeId(videoUrl) : null;
  if (!site && !id) return null;
  return (
    <div className="flex flex-col gap-3">
      {site ? (
        <a href={site} target="_blank" rel="noopener noreferrer" className="text-sm text-fg underline-offset-2 hover:underline">
          {site.replace(/^https?:\/\//, "")}
        </a>
      ) : null}
      {id ? (
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          <iframe
            title="YouTube video"
            src={`https://www.youtube-nocookie.com/embed/${id}`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : null}
    </div>
  );
}

export function ConsentLine({ consent }: { consent?: UploadConsent | null }) {
  if (!consent) return null;
  const date = new Date(consent.at);
  const when = Number.isNaN(date.getTime()) ? consent.at : format(date, "MMM d, yyyy · h:mm a");
  return (
    <p className="text-[10px] leading-snug text-subtle/70">
      Terms of use accepted. Ownership, physical copy, rights, and permissions acknowledged. {when}
    </p>
  );
}

export function ChatWithSolace({
  sitting,
  source,
  className,
}: {
  sitting: Sitting;
  source?: ConversationOrigin | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const go = () => {
    useSolace.getState().openWith({ ...sitting, source: source ?? sitting.source ?? null });
    void navigate({ to: "/solace" });
  };
  const open = () => {
    const state = useSolace.getState();
    const title = sitting.title.slice(0, 120);
    const detail = sitting.detail.slice(0, 6000);
    const nextSource = cleanOrigin(source ?? sitting.source);
    const same =
      state.shared?.title === title &&
      state.shared?.detail === detail &&
      sameOrigin(state.shared?.source, nextSource);
    if (same || !threadNeedsSave(state.messages, state.journalId)) {
      go();
      return;
    }
    setConfirm(true);
  };
  return (
    <>
      <Button type="button" variant="secondary" className={cn("w-full", className)} onClick={open}>
        Chat with Solace
      </Button>
      <UnsavedChatDialog
        open={confirm}
        onCancel={() => setConfirm(false)}
        onDiscard={() => {
          setConfirm(false);
          go();
        }}
        onSave={() => {
          void (async () => {
            const result = await saveCurrentThread();
            if (result === "cancelled") return;
            if (result === "saved") toast("Saved to the journal");
            else if (result === "updated") toast("Journal entry updated");
            setConfirm(false);
            go();
          })();
        }}
      />
    </>
  );
}
