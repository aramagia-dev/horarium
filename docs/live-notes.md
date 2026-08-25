# Apuntes en vivo (Google Docs colaborativo — MVP A)

Colaboración en tiempo real sin reinventar el editor: un **Google Doc por materia**, dueño **Service Account (SA)**, **max-1-live (4 h)**, `anyone-with-link` **writer** (fuera de expiry el link persiste; no se convierte a editor del Drive del alumno).

## TL;DR

- **Crear:** CTA «Apuntes en vivo» en `SubjectModal` y `NotesBoard` → `POST /api/drive/live-note { subjectId }`
- **Ver:** `GET /api/drive/live-note?subjectId=` → tarjeta **EN VIVO** pineada arriba con dot rojo `animate-pulse`, título `Materia — fecha`, botones **Abrir en Drive** (external `_blank`, no iframe) + **Copiar link**
- **Notificación:** `live_note` con icono `FileText` ámbar, click abre `drive_web_view_link` en pestaña nueva (body = url), dot no leído
- **Expiración:** `expires_at = created_at + LIVE_NOTE_DURATION_HOURS (default 4h)`, lazy `GET` filtra `status='live' AND expires_at > now()`, `POST /api/cron/archive-live-notes` archiva (`status='archived'`)
- **Folder:** `subject_drive_folders(subject_id → folder_id)` **manual** (no auto-create). Si falta → `422 FOLDER_NOT_CONFIGURED`
- **Permisos:** SA dueño; `permissions.create role=writer type=anyone allowFileDiscovery:false`. Si falla, se **borra el file huérfano** (no queda Doc suelto).
- **Rate limit:** 5/min global + 1/60s por materia, `429 Retry-After`
- **Concursos:** `POST` hace `409 {existing:true, url}` si ya existe live (antes y tras `23505 live_one_per_subject`). El cliente **redirige** al existente.
- **Rollback:** desactivar con `LIVE_NOTES_ENABLED=false` oculta CTA/card; blur flag `NEXT_PUBLIC_LIVE_NOTES_ENABLED=false` para client

## Variables

```bash
# Server-only (no NEXT_PUBLIC) — nunca exponer al cliente
GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON="<base64 JSON SA>"  # ver .env.example: cat sa.json | base64 -w0
SUPABASE_SERVICE_ROLE_KEY="..."
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
CRON_SECRET="..."                       # para /api/cron/archive-live-notes
LIVE_NOTE_DURATION_HOURS=4              # opcional, default 4
LIVE_NOTES_ENABLED=true                 # flag server para desactivar feature
NEXT_PUBLIC_LIVE_NOTES_ENABLED=true     # espejo client (si es false, oculta CTA/card)
```

> **Leak check:** `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_JSON` y `SUPABASE_SERVICE_ROLE_KEY` son **server-only**. Nunca llevan prefijo `NEXT_PUBLIC`, nunca se importan en componentes cliente. Ver `lib/google-drive.ts: isGoogleDriveConfigured()` + `app/api/drive/live-note/route.ts: server-only`.

## SQL (idempotente)

`supabase/live-notes.sql`:

- `subject_drive_folders(subject_id PK, folder_id unique, folder_name)`
- `live_notes(id uuid, subject_id, created_by, title, drive_file_id unique, drive_web_view_link, folder_id, status live|archived, expires_at, archived_at)`
- `live_one_per_subject` — partial unique `(subject_id) WHERE status='live'`
- RLS: **solo `select` para `authenticated`**, sin `insert/update/delete` (solo `service_role` vía API)
- `notifications_type_check` incluye `live_note`

## Flujo

```
Cliente CTA → POST /api/drive/live-note {subjectId}
  401 si no auth
  429 rate-limit (retryable)
  409 si live vigente → cliente window.open(existing url) + clipboard
  422 FOLDER_NOT_CONFIGURED → toast admin
  502 si Drive 403/429/5xx (retryable, sin insert)
  201 → {id, url, expires_at} → window.open(url,'_blank','noopener,noreferrer') + navigator.clipboard.writeText(url) + dispatch horarium:live-notes-changed + fan-out notifications (server, batched 100, crea live_note {title:"Apuntes en vivo: {Materia}", body:url})
```

`GET /api/drive/live-note?subjectId` → `{live: ...|null, history: archived[]}` (filtra expirados).

Cron `POST /api/cron/archive-live-notes` con `x-cron-secret: $CRON_SECRET` (o `Authorization: Bearer $CRON_SECRET`) → archiva `status live && expires_at <= now()` → `{archived: n}` (idempotente).

## Verificación

```bash
# 1. Migración
psql < supabase/live-notes.sql

# 2. Carpetas manuales (no auto-create): crear Horarium/{Materia} en Drive, compartir con SA email como Editor, insertar:
insert into subject_drive_folders (subject_id, folder_id, folder_name)
values ('subject-red','<folderId>','Horarium/Redes de Datos'), ...

# 3. Verificar mapeos vs Drive
node scripts/verify-drive-folders.mjs
# espera: [OK] cada subject, o [FAIL]/[WARN] con guidance

# 4. Admin o manual: scripts/verify-drive-folders.mjs es usado por admin-board o manual

# 5. Tests
npm run test         # lib/__tests__/live-notes*  (getLiveDocName/expiry/rate-limit, 409/422/orphan/RLS/lazy/cron)
npm run test:e2e     # tests/e2e/live-notes.spec.ts  (pinned EN VIVO + 409 redirect + bell external)

# 6. Build + leak
npm run build
grep -R "NEXT_PUBLIC.*GOOGLE_SERVICE_ACCOUNT" app lib components  # debe dar 0
grep -R "NEXT_PUBLIC.*SUPABASE_SERVICE_ROLE" app lib  # 0
```

## Diseño

- **External link siempre** (no iframe): Drive no se incrusta, link persiste tras expiry con permiso writer
- **Pinned top:** `NotesBoard` renderiza live card **antes** de `SubjectModal workspace`; `NotesBoard` excluye live de `localStorage` (`readLocalNotes` no mezcla)
- **Max-1 redirect:** `POST` hace early `409` si existe; si hay carrera y `insert` choca con `23505`, borra huérfano y vuelve a `409` con link vigente
- **Anyone-with-link persiste:** `setAnyoneWriter(fileId)` una vez; archivar no revoca
- **Manual folders:** evita crear carpetas automáticas en Drive del SA (gobernanza explícita)
- **Pulse:** `motion` presets si se quiere animar dot, pero base es `animate-pulse` (Tailwind) + `bg-red-500` para baja fricción
- **Flag:** `LIVE_NOTES_ENABLED` hides CTA/card (server + client mirror)

## Archivos clave

- `app/api/drive/live-note/route.ts` — GET (lazy expiry) + POST (rate-limit, 409, 422, orphan, fan-out)
- `app/api/cron/archive-live-notes/route.ts` — cron archiva expirados (idempotente, CRON_SECRET)
- `lib/google-drive.ts` — SA singleton, `getLiveDocName`, `getLiveNoteExpiry`, `createLiveDoc`, `setAnyoneWriter`, `deleteFile`, `resolveFolderId`
- `lib/rate-limit.ts` — 5/min global + 1/60s per subject
- `components/subject-modal.tsx` — CTA con 401/429/409/422/502, retry toast, loading, disabled si !auth, `window.open + clipboard`
- `components/notes-board.tsx` — fetch GET per subject, pin EN VIVO dot, Abrir en Drive + Copiar link, excluye localStorage, history en archivadas
- `components/notifications-bell.tsx` + `lib/notifications.ts` — `live_note` FileText ámbar, click abre body url en new tab
- `scripts/verify-drive-folders.mjs` — verifica mapping vs Drive
- `supabase/live-notes.sql` — schema + RLS + índices
```

