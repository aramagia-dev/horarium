"use client";

import { motion } from "framer-motion";

export default function Loading() {
  return (
    <main className="min-h-screen bg-[var(--background)]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }} className="h-[72px] border-b border-[var(--line)] bg-[var(--surface)]" />
      <div className="flex min-h-[calc(100vh-72px)]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, delay: 0.04 }} className="hidden w-[220px] shrink-0 border-r border-[var(--line)] bg-[var(--sidebar)] p-4 lg:block">
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            className="h-4 w-24 rounded bg-[var(--line)]"
          />
          <div className="mt-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
                className="h-3 w-full rounded bg-[var(--line)]"
              />
            ))}
          </div>
        </motion.div>
        <div className="flex flex-1 items-center justify-center p-8">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }} className="mx-auto w-full max-w-5xl">
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-8" aria-live="polite">
              <motion.div animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} className="space-y-4">
                <div className="h-5 w-40 rounded bg-[var(--line)]" />
                <div className="h-3 w-full rounded bg-[var(--line)]" />
                <div className="h-3 w-3/4 rounded bg-[var(--line)]" />
                <div className="grid gap-3 pt-4 sm:grid-cols-2">
                  <div className="h-24 rounded-xl bg-[var(--line)]" />
                  <div className="h-24 rounded-xl bg-[var(--line)]" />
                </div>
              </motion.div>
              <p className="mt-6 text-sm text-[var(--muted)]">Cargando horario…</p>
            </div>
          </motion.div>
        </div>
      </div>
    </main>
  );
}
