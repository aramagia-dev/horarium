"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };
export type AuthState = { userId: string | null; isAdmin: boolean };

export function AuthPanel({ onAuthChange }: { onAuthChange?: (state: AuthState) => void }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const updateUser = useCallback(async (nextUser: AuthUser | null) => {
    setUser(nextUser);
    setRole(null);
    const client = supabase;
    if (!nextUser || !client) {
      onAuthChange?.({ userId: null, isAdmin: false });
      return;
    }
    const { data } = await client.from("profiles").select("role").eq("id", nextUser.id).maybeSingle();
    setRole(data?.role ?? null);
    onAuthChange?.({ userId: nextUser.id, isAdmin: data?.role === "admin" });
  }, [onAuthChange]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      onAuthChange?.({ userId: null, isAdmin: false });
      return;
    }
    let active = true;
    async function loadSession() {
      const { data } = await client!.auth.getSession();
      if (active) await updateUser(data.session?.user ?? null);
    }
    const { data: listener } = client!.auth.onAuthStateChange((_event, session) => void updateUser(session?.user ?? null));
    void loadSession();
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [onAuthChange, updateUser]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError("");
    setSuccess("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError("No se pudo iniciar sesión. Verificá tu email y contraseña.");
    else { setOpen(false); setPassword(""); }
    setLoading(false);
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    setSuccess("");
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/`, data: { display_name: displayName.trim() || undefined } },
    });
    if (signUpError) {
      setError("No se pudo crear la cuenta. Verificá los datos e intentá de nuevo.");
    } else if (data.session) {
      setOpen(false);
      setPassword("");
      setConfirmPassword("");
    } else {
      setSuccess("Cuenta creada. Revisá tu email para confirmar la cuenta antes de ingresar.");
      setPassword("");
      setConfirmPassword("");
    }
    setLoading(false);
  }

  async function signOut() { if (supabase) await supabase.auth.signOut(); }

  if (!supabaseConfigured) return <span className="rounded-full bg-[var(--soft)] px-3 py-2 text-xs font-semibold text-[var(--muted)]" data-testid="auth-local-status">Modo local</span>;
  if (user) {
    const email = user.email ?? "";
    const metadata = user.user_metadata ?? {};
    const metadataName = typeof metadata.display_name === "string" ? metadata.display_name.trim() : "";
    const name = metadataName || email || "Usuario";
    const avatarUrl = typeof metadata.avatar_url === "string" && metadata.avatar_url.trim() ? metadata.avatar_url : null;
    const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
    return <div className="relative"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" aria-label={`Abrir menú de ${name}`} className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-left transition hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"><span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-xs font-bold text-white">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}</span><span className="hidden max-w-[150px] sm:block"><span className="block truncate text-xs font-semibold text-[var(--ink)]">{name}</span><span className="block truncate text-[10px] text-[var(--muted)]">{role === "admin" ? "Administrador" : "Usuario"}</span></span><span aria-hidden="true" className="hidden text-xs text-[var(--muted)] sm:inline">⌄</span></button>{open ? <div role="dialog" aria-label="Información de la cuenta" className="absolute right-0 top-12 z-50 w-[min(88vw,280px)] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-2xl"><div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-sm font-bold text-white">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}</span><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--ink)]">{name}</p><p className="truncate text-xs text-[var(--muted)]">{email || "Sin email disponible"}</p></div></div><p className="mt-3 rounded-lg bg-[var(--soft)] px-3 py-2 text-xs font-semibold text-[var(--muted)]">Rol: <span className="text-[var(--ink)]">{role === "admin" ? "Administrador" : "Usuario"}</span></p><button type="button" onClick={() => { setOpen(false); void signOut(); }} className="mt-3 w-full rounded-lg bg-[var(--secondary)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--soft)]">Salir</button></div> : null}</div>;
  }
  const inputClass = "mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";
  const isRegistering = mode === "register";
  const passwordType = showPassword ? "text" : "password";
  const confirmPasswordType = showConfirmPassword ? "text" : "password";
  return <div className="relative"><button type="button" onClick={() => { setOpen(true); setError(""); setSuccess(""); }} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90">Iniciar sesión</button>{open ? <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="absolute right-0 top-12 z-50 w-[min(88vw,340px)] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-left shadow-2xl"><div className="flex items-center justify-between"><h2 id="auth-title" className="text-base font-semibold text-[var(--ink)]">{isRegistering ? "Crear cuenta" : "Iniciar sesión"}</h2><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar autenticación" className="text-xl text-[var(--muted)]">×</button></div><form onSubmit={isRegistering ? register : signIn} className="mt-4 space-y-3"><label className="block text-xs font-semibold text-[var(--muted)]">Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>{isRegistering ? <label className="block text-xs font-semibold text-[var(--muted)]">Nombre visible <span className="font-normal">(opcional)</span><input type="text" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClass} /></label> : null}<label className="block text-xs font-semibold text-[var(--muted)]">Contraseña<div className="relative mt-1"><input type={passwordType} required autoComplete={isRegistering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} mt-0 pr-10`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] transition hover:bg-[var(--soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{showPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}</button></div></label>{isRegistering ? <label className="block text-xs font-semibold text-[var(--muted)]">Confirmar contraseña<div className="relative mt-1"><input type={confirmPasswordType} required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={`${inputClass} mt-0 pr-10`} /><button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"} title={showConfirmPassword ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] transition hover:bg-[var(--soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{showConfirmPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}</button></div></label> : null}{error ? <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{error}</p> : null}{success ? <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{success}</p> : null}<button type="submit" disabled={loading} className="w-full rounded-lg bg-[var(--accent)] px-3 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{loading ? (isRegistering ? "Creando cuenta..." : "Ingresando...") : (isRegistering ? "Crear cuenta" : "Ingresar")}</button></form><button type="button" onClick={() => { setMode(isRegistering ? "login" : "register"); setError(""); setSuccess(""); }} className="mt-3 w-full text-center text-xs font-semibold text-[var(--accent)] hover:underline">{isRegistering ? "Ya tengo una cuenta" : "Crear una cuenta"}</button></div> : null}</div>;
}
