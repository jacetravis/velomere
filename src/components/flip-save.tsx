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
import { finishFlipSave, flipSaveOpen, subscribeFlipSave } from "@/lib/solace/flip-prompt";

export function FlipSaveHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => setOpen(flipSaveOpen());
    const stop = subscribeFlipSave(sync);
    sync();
    return () => {
      stop();
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && finishFlipSave(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this pull?</DialogTitle>
          <DialogDescription>
            There is no card journal for this draw. Save the chat and a card entry, or save only the chat.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => finishFlipSave(null)}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={() => finishFlipSave("chat")}>
            Save the chat only
          </Button>
          <Button type="button" onClick={() => finishFlipSave("both")}>
            Save chat and card entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
