"use client";

import { useState } from "react";
import { GROK_PROVIDERS, signIn } from "@/lib/auth/client";

export function SignInScreen() {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = (providerId: string) => {
    if (pending) return;
    setError(null);
    setPending(providerId);
    void signIn(providerId, { callbackURL: "/" }).catch((err: unknown) => {
      setPending(null);
      setError(err instanceof Error ? err.message : "Sign-in did not finish.");
    });
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-6 text-fg">
      <img src="/emblem.jpg" alt="" className="size-14 rounded-full" />
      <h1 className="mt-6 max-w-[16rem] text-center font-display text-4xl leading-tight tracking-tight">
        The Threshold of Solace
      </h1>
      <p className="mt-3 max-w-sm text-center text-sm leading-relaxed text-muted">
        Sign in to keep your decks, settings, and journals with your account. Other people
        cannot open or change them.
      </p>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-2">
        {GROK_PROVIDERS.map((provider) => (
          <button
            key={provider.providerId}
            type="button"
            disabled={pending !== null}
            onClick={() => start(provider.providerId)}
            className="h-12 rounded-md bg-fg text-sm text-bg disabled:opacity-60"
          >
            {pending === provider.providerId ? "Opening…" : `Continue with ${provider.label}`}
          </button>
        ))}
      </div>
      <p className="mt-4 max-w-sm text-center text-xs leading-relaxed text-subtle">
        Gmail uses your Google account. Grok uses the X account you sign in to Grok with.
      </p>
      {error ? <p className="mt-4 max-w-sm text-center text-sm text-fg">{error}</p> : null}
    </div>
  );
}
