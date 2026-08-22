<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Repository guidance

- Use npm with the committed `package-lock.json`; do not introduce another package manager's lockfile.
- This is a single-package Next.js App Router app. The root route starts at `app/page.tsx`; `app/layout.tsx` owns metadata, fonts, and global styles; static assets live in `public/`.
- There is currently no `src/`, API route, server-action, domain, or persistence layer. Keep new structure consistent with the App Router until the architecture changes.
- TypeScript is strict and uses the `@/*` alias for the repository root. Tailwind CSS 4 is loaded through `app/globals.css` and `postcss.config.mjs`.
- Run `npm run lint` for focused validation; run `npm run build` for production-build validation. Use `npm run dev` for local work and `npm run start` only after a successful build.
- `CLAUDE.md` delegates to this file; update `AGENTS.md`, not a duplicate set of instructions.
