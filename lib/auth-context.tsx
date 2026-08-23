"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };

type AuthContextValue = {
  userId: string | null;
  user: AuthUser | null;
  role: string | null;
  isAdmin: boolean;
  loading: boolean;
  profileAlias: string;
  avatarUrl: string | null;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [profileAlias, setProfileAlias] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  const syncProfile = useCallback(async (nextUser: AuthUser | null) => {
    setUser(nextUser);
    if (!nextUser) {
      setRole(null);
      setProfileAlias("");
      setAvatarUrl(null);
      setLoading(false);
      return;
    }
    if (!supabase) {
      const meta = nextUser.user_metadata ?? {};
      const metaName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
      const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url.trim() : "";
      setRole(null);
      setProfileAlias(metaName);
      setAvatarUrl(metaAvatar || null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await supabase.from("profiles").select("role, display_name, avatar_url").eq("id", nextUser.id).maybeSingle();
      const meta = nextUser.user_metadata ?? {};
      const metaName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
      const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url.trim() : "";
      const dbName = typeof (data as { display_name?: string | null } | null)?.display_name === "string" ? String((data as { display_name?: string | null }).display_name).trim() : "";
      const dbAvatar = typeof (data as { avatar_url?: string | null } | null)?.avatar_url === "string" ? String((data as { avatar_url?: string | null }).avatar_url).trim() : "";
      setRole((data as { role?: string | null } | null)?.role ?? null);
      setProfileAlias(dbName || metaName || "");
      setAvatarUrl(dbAvatar || metaAvatar || null);
    } catch {
      const meta = nextUser.user_metadata ?? {};
      const metaName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
      const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url.trim() : "";
      setRole(null);
      setProfileAlias(metaName);
      setAvatarUrl(metaAvatar || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      void syncProfile((data.session?.user as AuthUser | null) ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      void syncProfile((session?.user as AuthUser | null) ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [syncProfile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { userId?: string } | undefined;
      const targetId = detail?.userId;
      if (targetId && targetId !== user?.id) return;
      if (!user?.id || !supabase) return;
      void supabase.from("profiles").select("role, display_name, avatar_url").eq("id", user.id).maybeSingle().then(({ data }) => {
        if (!data) return;
        const meta = user.user_metadata ?? {};
        const metaName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
        const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url.trim() : "";
        const dbName = typeof (data as { display_name?: string | null }).display_name === "string" ? String((data as { display_name?: string | null }).display_name).trim() : "";
        const dbAvatar = typeof (data as { avatar_url?: string | null }).avatar_url === "string" ? String((data as { avatar_url?: string | null }).avatar_url).trim() : "";
        setRole((data as { role?: string | null }).role ?? null);
        setProfileAlias(dbName || metaName || "");
        setAvatarUrl(dbAvatar || metaAvatar || null);
      });
    };
    window.addEventListener("profile-updated", handler as EventListener);
    return () => window.removeEventListener("profile-updated", handler as EventListener);
  }, [user]);

  const refresh = useCallback(async () => {
    if (!supabase) {
      await syncProfile(user);
      return;
    }
    const { data } = await supabase.auth.getSession();
    await syncProfile((data.session?.user as AuthUser | null) ?? null);
  }, [syncProfile, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      userId: user?.id ?? null,
      user,
      role,
      isAdmin: role === "admin",
      loading,
      profileAlias,
      avatarUrl,
      refresh,
    }),
    [user, role, loading, profileAlias, avatarUrl, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
