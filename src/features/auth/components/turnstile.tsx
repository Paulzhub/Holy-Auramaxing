"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      appearance?: "always" | "execute" | "interaction-only";
      language?: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    // Trusted by the page's nonce through CSP 'strict-dynamic'.
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Cloudflare Turnstile bot check (CLAUDE.md §10). It runs invisibly and only
 * shows a checkbox when Cloudflare is unsure, so most people never see a
 * puzzle (WCAG 3.3.8). The token goes to Supabase Auth, which verifies it.
 *
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY (local development) it renders
 * nothing, and Supabase must have captcha turned off to match.
 *
 * `resetSignal` changes after every submission, because each token works once.
 */
export function Turnstile({ action, resetSignal }: { action: string; resetSignal?: unknown }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const t = useTranslations("auth");
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | undefined>(undefined);
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widget.current = api.render(container.current, {
          sitekey: siteKey,
          action,
          appearance: "interaction-only",
          language: document.documentElement.lang || "auto",
          callback: (value) => {
            setToken(value);
            setFailed(false);
          },
          "expired-callback": () => setToken(""),
          "error-callback": () => {
            setToken("");
            setFailed(true);
          },
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = undefined;
    };
  }, [siteKey, action]);

  useEffect(() => {
    if (resetSignal === undefined || !widget.current) return;
    setToken("");
    window.turnstile?.reset(widget.current);
  }, [resetSignal]);

  if (!siteKey) return null;
  return (
    <>
      <div ref={container} className="auth-turnstile" />
      <input type="hidden" name="captchaToken" value={token} />
      {/* The live region exists from the start, so the message is announced when it appears (WCAG 4.1.3). */}
      <p className="ui-hint" role="status">
        {failed ? t("captchaUnavailable") : null}
      </p>
    </>
  );
}
