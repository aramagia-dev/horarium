"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadPublicSchedule, type PublicScheduleState } from "@/lib/public-schedule";

type ScheduleContextValue = {
  publicData: PublicScheduleState | null;
  loading: boolean;
  refresh: () => void;
};

const ScheduleContext = createContext<ScheduleContextValue | undefined>(undefined);

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const [publicData, setPublicData] = useState<PublicScheduleState | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const mounted = useRef(true);

  const refresh = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    void loadPublicSchedule().then((data) => {
      if (!mounted.current || id !== requestId.current) return;
      setPublicData(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const value = useMemo(() => ({ publicData, loading, refresh }), [publicData, loading, refresh]);

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleContextValue {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error("useSchedule must be used within ScheduleProvider");
  return ctx;
}
