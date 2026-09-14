"use client";

/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import {
  deserializeEnrollments,
  loadLocalEnrollments,
  saveLocalEnrollments,
  serializeEnrollments,
  type EnrollmentMap,
} from "@/lib/enrollments";

const LOCAL_SYNC_KEY = "horarium:enrollments:local";

export function useEnrollments(userId: string | null) {
  const [enrollments, setEnrollments] = useState<EnrollmentMap>(() => new Map());
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setEnrollments(new Map());
      return;
    }
    if (!supabaseConfigured || !supabase) {
      setEnrollments(loadLocalEnrollments());
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from("user_enrollments").select("subject_id, comision_id").eq("user_id", userId);
      if (error) {
        // fallback to local
        setEnrollments(loadLocalEnrollments());
        return;
      }
      const map = new Map<string, string>();
      for (const row of (data ?? []) as Array<{ subject_id: string; comision_id: string }>) {
        if (row.subject_id && row.comision_id) map.set(row.subject_id, row.comision_id);
      }
      setEnrollments(map);
      // mirror to local for offline? keep local copy in sync but don't overwrite local when we have supabase data separately
      try {
        if (typeof window !== "undefined") window.localStorage.setItem(LOCAL_SYNC_KEY, JSON.stringify(serializeEnrollments(map)));
      } catch {
        // ignore
      }
    } catch {
      setEnrollments(loadLocalEnrollments());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // listen to local changes (multi-tab)
  useEffect(() => {
    if (!userId) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key === LOCAL_SYNC_KEY) {
        if (!supabaseConfigured || !supabase) {
          try {
            const parsed = e.newValue ? JSON.parse(e.newValue) : null;
            setEnrollments(deserializeEnrollments(parsed));
          } catch {
            // ignore
          }
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  const saveEnrollment = useCallback(
    async (subjectId: string, comisionId: string) => {
      if (!subjectId || !comisionId) return;
      // optimistic update
      setEnrollments((prev) => {
        const next = new Map(prev);
        next.set(subjectId, comisionId);
        if (!supabaseConfigured || !supabase || !userId) {
          saveLocalEnrollments(next);
        }
        return next;
      });

      if (!supabaseConfigured || !supabase || !userId) return;

      try {
        const { error } = await supabase.from("user_enrollments").upsert(
          { user_id: userId, subject_id: subjectId, comision_id: comisionId },
          { onConflict: "user_id,subject_id" },
        );
        if (error) throw error;
      } catch (e) {
        // rollback? keep optimistic but log
        console.warn("[horarium] saveEnrollment failed", e);
      }
    },
    [userId],
  );

  const clearEnrollments = useCallback(async () => {
    setEnrollments(new Map());
    if (!supabaseConfigured || !supabase || !userId) {
      saveLocalEnrollments(new Map());
      return;
    }
    try {
      const { error } = await supabase.from("user_enrollments").delete().eq("user_id", userId);
      if (error) throw error;
      try {
        if (typeof window !== "undefined") window.localStorage.removeItem(LOCAL_SYNC_KEY);
      } catch {
        // ignore
      }
    } catch (e) {
      console.warn("[horarium] clearEnrollments failed", e);
    }
  }, [userId]);

  const removeEnrollment = useCallback(
    async (subjectId: string) => {
      if (!subjectId) return;
      setEnrollments((prev) => {
        const next = new Map(prev);
        next.delete(subjectId);
        if (!supabaseConfigured || !supabase || !userId) {
          saveLocalEnrollments(next);
        } else {
          try {
            if (typeof window !== "undefined")
              window.localStorage.setItem(LOCAL_SYNC_KEY, JSON.stringify(serializeEnrollments(next)));
          } catch {
            // ignore
          }
        }
        return next;
      });

      if (!supabaseConfigured || !supabase || !userId) return;

      try {
        const { error } = await supabase.from("user_enrollments").delete().eq("user_id", userId).eq("subject_id", subjectId);
        if (error) throw error;
      } catch (e) {
        console.warn("[horarium] removeEnrollment failed", e);
      }
    },
    [userId],
  );

  return { enrollments, loading: loading && !!userId, saveEnrollment, clearEnrollments, removeEnrollment, refresh };
}
