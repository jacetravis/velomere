import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { SignInScreen } from "@/components/sign-in-screen";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [mounted, setMounted] = useState(false);
  const { user, isPending } = useCurrentUserState();
  useEffect(() => setMounted(true), []);
  if (!mounted || isPending) {
    return (
      <div className="grid min-h-dvh place-items-center bg-bg">
        <img src="/emblem.jpg" alt="" className="size-12 rounded-full opacity-80" />
      </div>
    );
  }
  if (user) return <Navigate to="/" />;
  return <SignInScreen />;
}
