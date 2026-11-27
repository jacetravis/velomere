"use client";

import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { MessageCircle, Settings } from "lucide-react";
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
  { to: "/encounters", label: "Velomere" },
  { to: "/journal", label: "Journals" },
  { to: "/deck", label: "Decks" },
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
          <Link
            to="/settings"
            aria-label="Settings"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-fg"
          >
            <Settings className="size-5" />
          </Link>
          <AccountMark />
        </div>
        <nav className="mx-auto grid max-w-3xl grid-cols-5 px-1 pb-2">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="truncate rounded-full px-1 py-1.5 text-center text-[11px] text-muted transition-colors duration-150 hover:text-fg sm:text-sm"
              activeProps={{ className: "truncate rounded-full bg-fg px-1 py-1.5 text-center text-[11px] text-bg sm:text-sm" }}
              activeOptions={{ exact: item.to === "/" }}
            >
              {item.to === "/solace" ? <MessageCircle className="mr-0.5 inline size-3 shrink-0 align-[-2px]" aria-hidden /> : null}
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className={cn("mx-auto w-full max-w-3xl px-4 pt-5 pb-20")}>{children}</main>
    </div>
  );
}

function AccountMark() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const canSignOut = useCanSignOut();
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!user || user.isDevFallback) return null;
  const email = (user.primaryEmail || user.displayName || "Signed in").trim();
  const initial = email.charAt(0).toUpperCase() || "·";
  return (
    <div ref={root} className="relative z-40">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-fg/10 font-display text-sm text-fg"
        onClick={() => setOpen((value) => !value)}
      >
        {initial}
      </button>
      {open ? (
        <div role="menu" className="account-menu absolute right-0 top-10 w-64 rounded-xl border border-border bg-bg p-2 shadow-lg">
          <p className="break-all px-2 py-2 text-sm text-subtle">{email}</p>
          {canSignOut ? (
            <button
              type="button"
              role="menuitem"
              className="w-full rounded-lg px-2 py-2 text-left text-sm text-fg hover:bg-surface"
              onClick={() => {
                setOpen(false);
                setConfirm(true);
              }}
            >
              Sign out
            </button>
          ) : null}
        </div>
      ) : null}
      <SignOutConfirm open={confirm} onOpenChange={setConfirm} />
    </div>
  );
}

function useCanSignOut() {
  const gateSession = useSyncExternalStore(subscribeToNothing, hasGateSessionMarker, () => false);
  return authEnabled && !gateSession;
}

export function AccountSignOut() {
  const user = useCurrentUser();
  const canSignOut = useCanSignOut();
  const [open, setOpen] = useState(false);
  if (!canSignOut) return null;
  const email = (user?.primaryEmail || user?.displayName || "").trim();
  return (
    <section className="rounded-2xl border border-border p-4">
      <h2 className="font-display text-xl">Account</h2>
      {email ? <p className="mt-1 break-all text-sm text-subtle">{email}</p> : null}
      <Button type="button" className="mt-3" variant="secondary" onClick={() => setOpen(true)}>
        Sign out
      </Button>
      <SignOutConfirm open={open} onOpenChange={setOpen} />
    </section>
  );
}

function SignOutConfirm({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [signingOut, setSigningOut] = useState(false);
  const [exporting, setExporting] = useState(false);
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
    <Dialog open={open} onOpenChange={(next) => !signingOut && onOpenChange(next)}>
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
          <Button type="button" variant="ghost" disabled={signingOut} onClick={() => onOpenChange(false)}>
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
  );
}