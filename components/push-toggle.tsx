"use client";

import { useEffect, useState } from "react";

import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push-client";

export function PushToggle() {
  const [state, setState] = useState<PushState | "loading" | "working">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading" || state === "unsupported") return null;
  const on = state === "on";
  const busy = state === "working";

  async function toggle() {
    setError(null);
    setState("working");
    if (on) {
      await disablePush();
      setState(await getPushState());
      return;
    }
    const res = await enablePush();
    if (!res.ok) {
      setError(res.reason);
      setState(await getPushState());
    } else {
      setState("on");
    }
  }

  return (
    <div className="border-b border-[var(--line)] px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--ink)]">Notificaciones push</p>
          <p className="text-[11px] leading-4 text-[var(--muted)]">
            {state === "denied"
              ? "Bloqueadas en el navegador — permitilas en ajustes del sitio."
              : on
                ? "Llegan al celu aunque la app esté cerrada."
                : "Avisos en el celu aunque el navegador esté cerrado."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Notificaciones push"
          disabled={busy || state === "denied"}
          onClick={() => void toggle()}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
            on ? "bg-emerald-500 text-white hover:opacity-90" : "bg-[var(--accent)] text-white hover:opacity-90"
          }`}
        >
          {busy ? "…" : on ? "Activadas" : "Activar"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-rose-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}
