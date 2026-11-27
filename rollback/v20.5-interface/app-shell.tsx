"use client";

import { Link } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { SignInScreen } from "@/components/sign-in-screen";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { SignInGate } from "@/lib/auth/gates";
import { useCurrentUser, useCurrentUserState } from "@/lib/auth/use-current-user";
import { UploadConsentHost } from "@/components/upload-consent";
import { FlipSaveHost } from "@/components/flip-save";
import { buildArchive } from "@/lib/archive";
import { useLibraryReady } from "@/lib/journal/sync";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Table" },
  { to: "/encounters", label: "Encounters" },
  { to: "/journal", label: "Journals" },
  { to: "/deck", label: "Decks" },
  { to: "/guide", label: "Guide" },
  { to: "/settings", label: "Settings" },
  { to: "/solace", label: "Solace" },
] as const;

const subscribeToNothing = () => () => {};

export function AppShell({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <img src="/emblem.jpg" alt="" className="size-12 rounded-full opacity-80" />
      </div>
    );
  }
  return (
    <SignInGate fallback={<SignInScreen />}>
      <PrivateShell>{children}</PrivateShell>
    </SignInGate>
  );
}

function PrivateShell({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  const ready = useLibraryReady(user?.id ?? null);
  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <img src="/emblem.jpg" alt="" className="size-12 rounded-full opacity-80" />
      </div>
    );
  }
  return (
    <div className="min-h-dvh bg-bg text-fg">
      <UploadConsentHost />
      <FlipSaveHost />
      <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
          <Link to="/" className="flex min-w-0 flex-1 items-center gap-2.5">
            <img
              src="/emblem.jpg"
              alt=""
              className="size-8 shrink-0 rounded-full outline outline-1 -outline-offset-1 outline-fg/10"
            />
            <span className="truncate font-display text-lg tracking-tight">The Threshold of Solace</span>
          </Link>
          <AccountMark />
        </div>
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-1 px-3 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors duration-150 hover:text-fg"
              activeProps={{ className: "bg-fg text-bg" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.label}
            </Link>
          ))}
          <SignOutItem />
        </nav>
      </header>
      <main className={cn("mx-auto w-full max-w-3xl px-4 pt-5 pb-20")}>{children}</main>
    </div>
  );
}

function AccountMark() {
  const user = useCurrentUser();
  if (!user || user.isDevFallback) return null;
  const source = (user.displayName ?? user.primaryEmail ?? "").trim();
  const initial = source.charAt(0).toUpperCase() || "·";
  return (
    <span
      aria-label="Account"
      className="grid size-8 shrink-0 place-items-center rounded-full bg-fg/10 font-display text-sm text-fg"
    >
      {initial}
    </span>
  );
}

function SignOutItem() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [exporting, setExporting] = useState(false);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    () => false,
  );
  if (!authEnabled || gateSession) return null;
  const download = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const zipped = await buildArchive();
      const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "threshold-of-solace.zip";
      link.click();
      URL.revokeObjectURL(url);
      toast("Backup exported");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not export a backup.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <button
        type="button"
        className="rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors duration-150 hover:text-fg"
        onClick={() => setOpen(true)}
      >
        Sign out
      </button>
      <Dialog open={open} onOpenChange={(next) => !signingOut && setOpen(next)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              A backup can help if an update doesn’t keep everything while you are signed out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={exporting || signingOut} onClick={() => void download()}>
              {exporting ? "Preparing backup…" : "Export backup"}
            </Button>
            <Button type="button" variant="ghost" disabled={signingOut} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={signingOut}
              onClick={() => {
                setSigningOut(true);
                void signOut().catch(() => {
                  setSigningOut(false);
                  toast("Could not sign out.");
                });
              }}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}