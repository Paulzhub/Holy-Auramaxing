"use client";

import { Footprints, HeartHandshake, MessageCircle, Phone, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

import {
  alertPartnersAction,
  askGroupAction,
  countWaveAction,
  sosContextAction,
  type SosResult,
} from "../server/actions";
import type { SosContext } from "../server/queries";
import type { Announce } from "./sos-tools";

type Failure = Extract<SosResult, { ok: false }>["error"];

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * The private tally of waves ridden out (§7.9, D-106). It only ever counts
 * up; offline, a wave waits on the device and is counted when the connection
 * returns, while this page is still open.
 */
export function useWaves(initial: number, announce: Announce) {
  const t = useTranslations("sos.tally");
  const [counted, setCounted] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const pendingRef = useRef(0);
  const [note, setNote] = useState<string | null>(null);

  const addPending = useCallback((n: number) => {
    pendingRef.current = Math.max(0, pendingRef.current + n);
    setPending(pendingRef.current);
  }, []);

  const send = useCallback(async (times: number) => {
    let ok = 0;
    for (let i = 0; i < times; i++) {
      try {
        const result = await countWaveAction();
        if (!result.ok || result.kind !== "wave") break;
        setCounted(result.waves);
        ok++;
      } catch {
        break;
      }
    }
    return ok;
  }, []);

  // Back online: send what waited.
  useEffect(() => {
    const flush = () => {
      const times = pendingRef.current;
      if (!times) return;
      addPending(-times);
      void send(times).then((ok) => addPending(times - ok));
    };
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [send, addPending]);

  async function count() {
    if (!navigator.onLine) {
      addPending(1);
      setNote(t("offline"));
      announce(t("offline"));
      return;
    }
    const ok = await send(1);
    const words = ok ? t("saved") : t("failed");
    if (!ok) addPending(1);
    setNote(words);
    announce(words);
  }

  return { waves: Math.max(counted ?? 0, initial) + pending, note, count };
}

export function Tally({ waves, note, onCount }: { waves: number; note: string | null; onCount: () => void }) {
  const t = useTranslations("sos.tally");
  const [busy, startTransition] = useTransition();
  return (
    <div className="sos-tally">
      <Button variant="primary" loading={busy} onClick={() => startTransition(async () => onCount())}>
        {t("made")}
      </Button>
      <p className="text-muted" data-testid="sos-tally">
        {t("count", { count: waves })}
      </p>
      {note ? <p className="sos-gentle">{note}</p> : null}
    </div>
  );
}

/** Call my partner, let them know, ask my group to pray, go for a walk. */
export function QuickActions({
  context,
  announce,
  onWalk,
  onClose,
}: {
  context: SosContext | null | "loading";
  announce: Announce;
  onWalk: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("sos.actions");
  const online = useOnline();
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, startTransition] = useTransition();
  const ids = { group: useId(), text: useId(), hint: useId() };

  function report(key: string, result: SosResult | null) {
    const words = !result
      ? t("errors.failed")
      : result.ok
        ? result.kind === "partners"
          ? t("alerted")
          : t("prayed")
        : t(`errors.${result.error as Failure}`);
    setDone((d) => ({ ...d, [key]: words }));
    announce(words);
  }

  const partners = context && context !== "loading" ? context.partners : [];
  const groups = context && context !== "loading" ? context.groups : [];
  const canAlert = partners.some((p) => p.iAllowAlerts);

  return (
    <section className="sos-section" aria-labelledby="sos-actions-title">
      <h3 id="sos-actions-title" className="sos-section__title">
        {t("heading")}
      </h3>
      {!online ? <p className="sos-gentle">{t("offline")}</p> : null}
      {context === "loading" ? <p className="text-muted">{t("loading")}</p> : null}

      {context && context !== "loading" ? (
        <>
          <div className="sos-action">
            <h4 className="sos-action__title">
              <Phone aria-hidden="true" /> {t("callHeading")}
            </h4>
            {partners.length === 0 ? (
              <p className="text-muted">
                {t("noPartners")}{" "}
                <Link href="/groups" className="text-link" onClick={onClose}>
                  {t("openGroups")}
                </Link>
              </p>
            ) : (
              <ul className="sos-partners">
                {partners.map((p) => (
                  <li key={`${p.groupId}:${p.partnerId}`}>
                    {p.phone ? (
                      <div className="sos-buttons">
                        <a className="ui-button ui-button--secondary" href={`tel:${p.phone.tel}`}>
                          <Phone aria-hidden="true" /> {t("call", { name: p.name })}
                        </a>
                        <a
                          className="ui-button ui-button--ghost"
                          href={`https://wa.me/${p.phone.whatsapp}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle aria-hidden="true" /> {t("whatsapp", { name: p.name })}
                        </a>
                      </div>
                    ) : (
                      <p className="text-muted">{t("noNumber", { name: p.name })}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {partners.length > 0 ? (
              canAlert ? (
                <div className="sos-action__more">
                  <Button
                    variant="secondary"
                    loading={busy}
                    disabled={!online || Boolean(done.partners && done.partners === t("alerted"))}
                    onClick={() =>
                      startTransition(async () => report("partners", await alertPartnersAction().catch(() => null)))
                    }
                  >
                    <HeartHandshake aria-hidden="true" /> {t("alertPartners")}
                  </Button>
                  <p className="ui-hint">{t("alertHint")}</p>
                </div>
              ) : (
                <p className="text-muted">{t("alertNone")}</p>
              )
            ) : null}
            {done.partners ? <p className="sos-gentle">{done.partners}</p> : null}
          </div>

          <div className="sos-action">
            <h4 className="sos-action__title">
              <Users aria-hidden="true" /> {t("prayHeading")}
            </h4>
            {groups.length === 0 ? (
              <p className="text-muted">{t("noGroups")}</p>
            ) : done.group && done.group === t("prayed") ? (
              <p className="sos-gentle">{done.group}</p>
            ) : (
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const groupId = String(form.get("groupId") ?? "");
                  const body = String(form.get("body") ?? "");
                  startTransition(async () => report("group", await askGroupAction(groupId, body).catch(() => null)));
                }}
              >
                {groups.length > 1 ? (
                  <div className="ui-field">
                    <label className="ui-label" htmlFor={ids.group}>
                      {t("prayGroup")}
                    </label>
                    <select id={ids.group} name="groupId" className="ui-input">
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input type="hidden" name="groupId" value={groups[0]!.id} />
                )}
                <div className="ui-field">
                  <label className="ui-label" htmlFor={ids.text}>
                    {t("prayText")}
                  </label>
                  <p className="ui-hint" id={ids.hint}>
                    {t("prayHint")}
                  </p>
                  <textarea
                    id={ids.text}
                    name="body"
                    className="ui-input"
                    rows={2}
                    maxLength={500}
                    defaultValue={t("prayDefault")}
                    aria-describedby={ids.hint}
                  />
                </div>
                <div>
                  <Button type="submit" variant="secondary" loading={busy} disabled={!online}>
                    {t("praySend")}
                  </Button>
                </div>
                {done.group ? <p className="sos-gentle">{done.group}</p> : null}
              </form>
            )}
          </div>
        </>
      ) : null}

      <div className="sos-action">
        <h4 className="sos-action__title">
          <Footprints aria-hidden="true" /> {t("walkHeading")}
        </h4>
        <p>{t("walkBody")}</p>
        <div>
          <Button variant="secondary" onClick={onWalk}>
            {t("walkStart")}
          </Button>
        </div>
      </div>
      <p>
        <Link href="/resources" className="text-link" onClick={onClose}>
          {t("moreHelp")}
        </Link>
      </p>
    </section>
  );
}

/** Loads the quick actions' data when the sheet opens (never on every page). */
export function useSosContext(): SosContext | null | "loading" {
  const [context, setContext] = useState<SosContext | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    // Never call the server while offline: a server action that can't reach
    // the server makes Next.js reload the page, which would close the sheet.
    const load = () => {
      if (!navigator.onLine) {
        if (!cancelled) setContext((c) => (c === undefined ? null : c));
        return;
      }
      sosContextAction()
        .then((c) => {
          if (!cancelled) setContext(c);
        })
        .catch(() => {
          if (!cancelled) setContext((c) => (c === undefined ? null : c));
        });
    };
    const timer = window.setTimeout(load, 0);
    window.addEventListener("online", load);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", load);
    };
  }, []);
  return context === undefined ? "loading" : context;
}
