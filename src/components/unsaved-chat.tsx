"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function UnsavedChatDialog({
  open,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save this chat?</DialogTitle>
          <DialogDescription>
            A new chat replaces this one. Save it to the Solace journal first, or start the new chat without saving.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={onDiscard}>
            Start without saving
          </Button>
          <Button type="button" onClick={onSave}>
            Save to journal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
