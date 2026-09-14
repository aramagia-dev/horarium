"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadPublicSchedule, type PublicScheduleState } from "@/lib/public-schedule";
import { useEnrollments } from "@/lib/use-enrollments";
import { useAuth } from "@/lib/auth-context";
import type { EnrollmentMap } from "@/lib/enrollments";

type ScheduleContextValue = {
  publicData: PublicScheduleState | null;
  loading: boolean;
  refresh: () => void;
  enrollments: EnrollmentMap;
  enrollmentsLoading: boolean;
  saveEnrollment: (subjectId: string, comisionId: string) => Promise<void>;
  clearEnrollments: () => Promise<void>;
  removeEnrollment: (subjectId: string) => Promise<void>;
  refreshEnrollments: () => Promise<void>;
};

const ScheduleContext = createContext<ScheduleContextValue | undefined>(undefined);

export function ScheduleProvider({ children, initialData }: { children: React.ReactNode; initialData?: PublicScheduleState | null }) {
  const [publicData, setPublicData] = useState<PublicScheduleState | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const requestId = useRef(0);
  const mounted = useRef(true);
  const { userId } = useAuth();
  const { enrollments, loading: enrollmentsLoading, saveEnrollment, clearEnrollments, removeEnrollment, refresh: refreshEnrollments } = useEnrollments(userId);

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
    if (!initialData) refresh();
    return () => {
      mounted.current = false;
    };
  }, [initialData, refresh]);

  const value = useMemo(
    () => ({ publicData, loading, refresh, enrollments, enrollmentsLoading, saveEnrollment, clearEnrollments, removeEnrollment, refreshEnrollments }),
    [publicData, loading, refresh, enrollments, enrollmentsLoading, saveEnrollment, clearEnrollments, removeEnrollment, refreshEnrollments],
  );

  return <ScheduleContext.Provider value={value}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): ScheduleContextValue {
  const ctx = useContext(ScheduleContext);
  if (!ctx) throw new Error("useSchedule must be used within ScheduleProvider");
  return ctx;
}
