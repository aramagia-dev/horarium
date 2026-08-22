This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and set the public project URL and anon key.
4. Create the first user in Supabase Authentication > Users.
5. Promote that user with `update public.profiles set role = 'admin' where id = 'USER-UUID';`. After promotion, sign in again: the `Administración` navigation item appears and opens the authenticated CRUD panel.

The app remains in local-first mode when the public variables are absent. Never put a Supabase service-role key in browser code or `NEXT_PUBLIC_*` variables.

## Admin schedule workflow

Subjects are unique catalog entities. Professors and rooms belong to each schedule session, so one subject can have several sessions with different assignments. After connecting Supabase and opening the administrator panel, use `Importar horario local (11 sesiones)` while the shared schedule is empty. The import resolves the existing subject, professor, and room catalogs before issuing one insert request; if any exact mapping is missing, it inserts nothing. Later, use `Asignaciones por materia` and `Editar asignación` to change the professor or room for one session without recreating its subject.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
