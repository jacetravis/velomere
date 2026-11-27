"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { UploadConsent } from "@/lib/consent";

type Waiter = (value: UploadConsent | null) => void;

let waiter: Waiter | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function requestUploadConsent(): Promise<UploadConsent | null> {
  if (waiter) waiter(null);
  return new Promise((resolve) => {
    waiter = resolve;
    emit();
  });
}

export function ConsentChecks({
  terms,
  rights,
  onTerms,
  onRights,
}: {
  terms: boolean;
  rights: boolean;
  onTerms: (value: boolean) => void;
  onRights: (value: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-muted">
        The Threshold of Solace, its owner, and anyone other than you cannot be held responsible for content you upload.
      </p>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-fg">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-fg"
          checked={terms}
          onChange={(event) => onTerms(event.target.checked)}
        />
        <span>I agree to the terms of use.</span>
      </label>
      <label className="flex items-start gap-3 text-sm leading-relaxed text-fg">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-fg"
          checked={rights}
          onChange={(event) => onRights(event.target.checked)}
        />
        <span>
          I am the owner of this content. I own a physical copy of any deck art, imagery, descriptions, and explanations,
          and I have the rights and permissions needed for anything I upload or edit.
        </span>
      </label>
    </div>
  );
}

export function UploadConsentHost() {
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState(false);
  const [rights, setRights] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(waiter != null);
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTerms(false);
      setRights(false);
    }
  }, [open]);

  const finish = (value: UploadConsent | null) => {
    const resolve = waiter;
    waiter = null;
    setOpen(false);
    setTerms(false);
    setRights(false);
    resolve?.(value);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finish(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Before this upload</DialogTitle>
          <DialogDescription>Both boxes are required. They are kept with what you upload.</DialogDescription>
        </DialogHeader>
        <ConsentChecks terms={terms} rights={rights} onTerms={setTerms} onRights={setRights} />
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => finish(null)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!terms || !rights}
            onClick={() => finish({ terms: true, rights: true, at: new Date().toISOString() })}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
