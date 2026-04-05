"use client";

import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Mail, Loader2, CheckCircle, AlertCircle } from "lucide-react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const err = searchParams.get("error");

  return (
    <div className="w-full max-w-sm animate-slide-up">
      {/* Mobile brand header (hidden on lg) */}
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <img src="/logo.png" alt="Omni Email" width={36} height={36} className="rounded-lg" />
        <span className="text-lg font-bold text-text-primary">Omni Email</span>
      </div>

      <div className="space-y-6 rounded-2xl border border-border bg-surface-1 p-5 shadow-md sm:p-7">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Welcome back</h1>
          <p className="mt-1 text-sm text-text-muted">
            Sign in with a magic link sent to your email.
          </p>
        </div>

        {err && (
          <div className="rounded-lg border border-danger/30 bg-danger-muted px-3 py-2.5 text-sm text-danger">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div>
                {err.toLowerCase().includes("pkce") || err.toLowerCase().includes("code verifier") ? (
                  <>
                    <p className="font-medium">Magic link opened on a different device</p>
                    <p className="mt-1 text-xs text-danger/80">
                      For security, magic links can only be opened on the same device where they were requested. Enter your email below to get a new link for this device.
                    </p>
                  </>
                ) : (
                  <p>{err}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {success ? (
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success-muted px-3 py-2.5 text-sm text-success">
            <CheckCircle size={16} className="shrink-0" />
            Check your email for the login link.
          </div>
        ) : status && !success ? (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-muted px-3 py-2.5 text-sm text-danger">
            <AlertCircle size={16} className="shrink-0" />
            {status}
          </div>
        ) : null}

        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setStatus(null);
            setSuccess(false);
            setLoading(true);
            const supabase = createClient();
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const { error } = await supabase.auth.signInWithOtp({
              email: email.trim(),
              options: { emailRedirectTo: `${origin}/auth/callback` },
            });
            setLoading(false);
            if (error) {
              setStatus(error.message);
              return;
            }
            setSuccess(true);
          }}
        >
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-secondary">
              Email address
            </label>
            <div className="relative">
              <Mail
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                type="email"
                required
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="w-full rounded-lg border border-border bg-surface-0 py-2.5 pl-10 pr-3 text-sm text-text-primary placeholder:text-text-muted transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-accent-text shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : null}
            {loading ? "Sending..." : "Send magic link"}
          </button>
        </form>
      </div>
    </div>
  );
}
