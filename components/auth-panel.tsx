"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

type AuthUser = { id: string; email?: string; user_metadata?: Record<string, unknown> };
export type AuthState = { userId: string | null; isAdmin: boolean };

const ALIAS_MIN = 2;
const ALIAS_MAX = 24;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const AVATAR_BUCKET = "avatars";

function getExt(file: File): string {
  const byType = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const extFromName = file.name.split(".").pop()?.toLowerCase();
  if (extFromName === "png" || extFromName === "webp" || extFromName === "jpg" || extFromName === "jpeg") return extFromName === "jpeg" ? "jpg" : extFromName;
  return byType;
}

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

  // Perfil editable
  const [profileAlias, setProfileAlias] = useState<string>("");
  const [avatarUrlState, setAvatarUrlState] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [aliasSaving, setAliasSaving] = useState(false);
  const [aliasMessage, setAliasMessage] = useState("");
  const [aliasError, setAliasError] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateUser = useCallback(async (nextUser: AuthUser | null) => {
    setUser(nextUser);
    setRole(null);
    if (!nextUser) {
      setProfileAlias("");
      setAvatarUrlState(null);
      setAliasDraft("");
      setAliasMessage("");
      setAliasError("");
      setAvatarPreview(null);
      onAuthChange?.({ userId: null, isAdmin: false });
      return;
    }
    const client = supabase;
    if (!client) {
      // fallback a metadata
      const meta = nextUser.user_metadata ?? {};
      const metaName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
      const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url.trim() : "";
      setProfileAlias(metaName);
      setAvatarUrlState(metaAvatar || null);
      onAuthChange?.({ userId: nextUser.id, isAdmin: false });
      return;
    }
    try {
      const { data } = await client.from("profiles").select("role, display_name, avatar_url").eq("id", nextUser.id).maybeSingle();
      const meta = nextUser.user_metadata ?? {};
      const metaName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
      const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url.trim() : "";
      const dbName = typeof data?.display_name === "string" ? data.display_name.trim() : "";
      const dbAvatar = typeof data?.avatar_url === "string" ? data.avatar_url.trim() : "";
      setRole(data?.role ?? null);
      setProfileAlias(dbName || metaName || "");
      setAvatarUrlState(dbAvatar || metaAvatar || null);
      onAuthChange?.({ userId: nextUser.id, isAdmin: data?.role === "admin" });
    } catch {
      const meta = nextUser.user_metadata ?? {};
      const metaName = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
      const metaAvatar = typeof meta.avatar_url === "string" ? meta.avatar_url.trim() : "";
      setProfileAlias(metaName);
      setAvatarUrlState(metaAvatar || null);
      onAuthChange?.({ userId: nextUser.id, isAdmin: false });
    }
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

  // Sincronizar draft al abrir
  useEffect(() => {
    if (open && user) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza draft controlado al abrir, requerido por spec 2A
      setAliasDraft(profileAlias || "");
      setAliasMessage("");
      setAliasError("");
    }
  }, [open, user, profileAlias]);

  // Cleanup preview url
  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    if (normalizedEmail !== email) setEmail(normalizedEmail);
    if (normalizedPassword !== password) setPassword(normalizedPassword);
    if (!normalizedEmail || !normalizedPassword) {
      setError("Completá email y contraseña sin espacios al inicio o final.");
      return;
    }
    setLoading(true);
    setError("");
    setSuccess("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password: normalizedPassword });
    if (signInError) setError("No se pudo iniciar sesión. Verificá tu email y contraseña.");
    else { setOpen(false); setPassword(""); }
    setLoading(false);
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setError("");
    setSuccess("");
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const normalizedConfirmPassword = confirmPassword.trim();
    const normalizedDisplayName = displayName.trim();
    if (normalizedEmail !== email) setEmail(normalizedEmail);
    if (normalizedPassword !== password) setPassword(normalizedPassword);
    if (normalizedConfirmPassword !== confirmPassword) setConfirmPassword(normalizedConfirmPassword);
    if (normalizedDisplayName !== displayName) setDisplayName(normalizedDisplayName);
    if (!normalizedEmail) {
      setError("Ingresá un email válido sin espacios al inicio o final.");
      return;
    }
    if (normalizedPassword.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres sin contar espacios al inicio o final.");
      return;
    }
    if (normalizedPassword !== normalizedConfirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (normalizedDisplayName && (normalizedDisplayName.length < ALIAS_MIN || normalizedDisplayName.length > ALIAS_MAX)) {
      setError(`El alias debe tener entre ${ALIAS_MIN} y ${ALIAS_MAX} caracteres.`);
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: normalizedPassword,
      options: { emailRedirectTo: `${window.location.origin}/`, data: { display_name: normalizedDisplayName || undefined } },
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

  async function handleAliasSave() {
    if (!supabase || !user) return;
    const aliasTrim = aliasDraft.trim();
    setAliasError("");
    setAliasMessage("");
    if (aliasTrim.length < ALIAS_MIN || aliasTrim.length > ALIAS_MAX) {
      setAliasError(`El alias debe tener entre ${ALIAS_MIN} y ${ALIAS_MAX} caracteres.`);
      return;
    }
    setAliasSaving(true);
    try {
      // warning si duplicado (case-insensitive) 2A no bloquea
      let duplicateWarning = "";
      try {
        const { data: dup } = await supabase.from("profiles").select("id").ilike("display_name", aliasTrim).neq("id", user.id).limit(1);
        if (dup && dup.length > 0) duplicateWarning = "Otro miembro ya usa ese alias, ¿querés usarlo igual?";
      } catch {
        // si falla ilike (ej schema sin datos) ignorar warning
      }
      const { error: updErr } = await supabase.from("profiles").update({ display_name: aliasTrim }).eq("id", user.id);
      if (updErr) throw updErr;
      try { await supabase.auth.updateUser({ data: { display_name: aliasTrim } }); } catch { /* compat */ }
      setProfileAlias(aliasTrim);
      if (duplicateWarning) setAliasMessage(duplicateWarning);
      else setAliasMessage("Alias guardado.");
      // refrescar estado user para que header tome alias
      await updateUser({ ...user, user_metadata: { ...(user.user_metadata ?? {}), display_name: aliasTrim } });
    } catch (e) {
      setAliasError(e instanceof Error ? e.message : "No se pudo guardar el alias.");
    } finally {
      setAliasSaving(false);
    }
  }

  async function handleAvatarChange(file: File | null) {
    if (!file || !supabase || !user) return;
    setAliasError("");
    setAliasMessage("");
    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      setAliasError("Formato no permitido. Usá JPG, PNG o WebP.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAliasError("La foto debe pesar menos de 2MB.");
      return;
    }
    // preview local
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    const previewUrl = URL.createObjectURL(file);
    setAvatarPreview(previewUrl);
    setAvatarUploading(true);
    try {
      const ext = getExt(file);
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      const { error: updErr } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id);
      if (updErr) throw updErr;
      try { await supabase.auth.updateUser({ data: { avatar_url: publicUrl } }); } catch { /* compat */ }
      setAvatarUrlState(publicUrl);
      setAliasMessage("Foto actualizada.");
      await updateUser({ ...user, user_metadata: { ...(user.user_metadata ?? {}), avatar_url: publicUrl } });
    } catch (e) {
      setAliasError(e instanceof Error ? e.message : "No se pudo subir la foto.");
      if (avatarPreview) URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
    }
  }

  if (!supabaseConfigured) return <span className="rounded-full bg-[var(--soft)] px-3 py-2 text-xs font-semibold text-[var(--muted)]" data-testid="auth-local-status">Modo local</span>;
  if (user) {
    const metadata = user.user_metadata ?? {};
    const metadataName = typeof metadata.display_name === "string" ? metadata.display_name.trim() : "";
    const metadataAvatar = typeof metadata.avatar_url === "string" ? metadata.avatar_url.trim() : "";
    const alias = profileAlias || metadataName || "";
    const name = alias || "Usuario";
    const effectiveAvatar = avatarPreview || avatarUrlState || metadataAvatar || null;
    const initials = name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";
    return (
      <div className="relative">
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="dialog" aria-label={`Abrir menú de ${name}`} className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-left transition hover:bg-[var(--soft)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-xs font-bold text-white">
            {effectiveAvatar ? <img src={effectiveAvatar} alt="" className="h-full w-full object-cover" /> : initials}
          </span>
          <span className="hidden max-w-[150px] sm:block">
            <span className="block truncate text-xs font-semibold text-[var(--ink)]">{name}</span>
            <span className="block truncate text-[10px] text-[var(--muted)]">{role === "admin" ? "Administrador" : "Usuario"}</span>
          </span>
          <span aria-hidden="true" className="hidden text-xs text-[var(--muted)] sm:inline">⌄</span>
        </button>
        {open ? (
          <div role="dialog" aria-label="Información de la cuenta" className="absolute right-0 top-12 z-50 w-[min(88vw,320px)] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-left shadow-2xl">
            <div className="flex items-center gap-3">
              <label className="group relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[var(--accent)] text-sm font-bold text-white focus-within:outline-2 focus-within:outline-[var(--accent)]" title="Cambiar foto (JPG/PNG/WebP, máx 2MB)">
                {effectiveAvatar ? <img src={effectiveAvatar} alt="" className="h-full w-full object-cover" /> : initials}
                <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-[10px] font-semibold text-white group-hover:flex">{avatarUploading ? "..." : "Cambiar"}</span>
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void handleAvatarChange(e.target.files?.[0] ?? null)} />
              </label>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{name}</p>
                <p className="truncate text-xs text-[var(--muted)]">Rol: <span className="text-[var(--ink)] font-semibold">{role === "admin" ? "Administrador" : "Usuario"}</span></p>
              </div>
            </div>

            {/* Alias editor */}
            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold text-[var(--muted)]">Alias (2–24 caracteres)</label>
              <div className="flex gap-2">
                <input value={aliasDraft} onChange={(e) => setAliasDraft(e.target.value)} maxLength={ALIAS_MAX} placeholder="Tu alias" aria-label="Alias" className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]" />
                <button type="button" onClick={() => void handleAliasSave()} disabled={aliasSaving || avatarUploading} className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{aliasSaving ? "Guardando..." : "Guardar"}</button>
              </div>
              {aliasError ? <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-1.5 text-xs text-rose-600">{aliasError}</p> : null}
              {aliasMessage ? <p role="status" className={`rounded-lg px-3 py-1.5 text-xs ${aliasMessage.includes("Otro miembro") ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-400/30" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}>{aliasMessage}</p> : null}
            </div>

            <button type="button" onClick={() => { setOpen(false); void signOut(); }} className="mt-4 w-full rounded-lg bg-[var(--secondary)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:bg-[var(--soft)]">Salir</button>
          </div>
        ) : null}
      </div>
    );
  }
  const inputClass = "mt-1 w-full rounded-lg border border-[var(--line)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]";
  const isRegistering = mode === "register";
  const passwordType = showPassword ? "text" : "password";
  const confirmPasswordType = showConfirmPassword ? "text" : "password";
  return (
    <div className="relative">
      <button type="button" onClick={() => { setOpen(true); setError(""); setSuccess(""); }} className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90">Iniciar sesión</button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-labelledby="auth-title" className="absolute right-0 top-12 z-50 w-[min(88vw,340px)] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-left shadow-2xl">
          <div className="flex items-center justify-between"><h2 id="auth-title" className="text-base font-semibold text-[var(--ink)]">{isRegistering ? "Crear cuenta" : "Iniciar sesión"}</h2><button type="button" onClick={() => setOpen(false)} aria-label="Cerrar autenticación" className="text-xl text-[var(--muted)]">×</button></div>
          <form onSubmit={isRegistering ? register : signIn} className="mt-4 space-y-3">
            <label className="block text-xs font-semibold text-[var(--muted)]">Email<input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></label>
            {isRegistering ? <label className="block text-xs font-semibold text-[var(--muted)]">Alias <span className="font-normal">(opcional, 2–24)</span><input type="text" autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={ALIAS_MAX} placeholder="Tu alias" className={inputClass} /></label> : null}
            <label className="block text-xs font-semibold text-[var(--muted)]">Contraseña<div className="relative mt-1"><input type={passwordType} required autoComplete={isRegistering ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} mt-0 pr-10`} /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] transition hover:bg-[var(--soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{showPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}</button></div></label>
            {isRegistering ? <label className="block text-xs font-semibold text-[var(--muted)]">Confirmar contraseña<div className="relative mt-1"><input type={confirmPasswordType} required autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={`${inputClass} mt-0 pr-10`} /><button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"} title={showConfirmPassword ? "Ocultar confirmación de contraseña" : "Mostrar confirmación de contraseña"} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--muted)] transition hover:bg-[var(--soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">{showConfirmPassword ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}</button></div></label> : null}
            {error ? <p role="alert" className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-600">{error}</p> : null}
            {success ? <p role="status" className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">{success}</p> : null}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-[var(--accent)] px-3 py-2.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{loading ? (isRegistering ? "Creando cuenta..." : "Ingresando...") : (isRegistering ? "Crear cuenta" : "Ingresar")}</button>
          </form>
          <button type="button" onClick={() => { setMode(isRegistering ? "login" : "register"); setError(""); setSuccess(""); }} className="mt-3 w-full text-center text-xs font-semibold text-[var(--accent)] hover:underline">{isRegistering ? "Ya tengo una cuenta" : "Crear una cuenta"}</button>
        </div>
      ) : null}
    </div>
  );
}
