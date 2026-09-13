# صيانة | Apartment Maintenance Marketplace

Arabic-first maintenance marketplace for property owners, tenants, workers, and administrators. Built with Next.js 16, Better Auth, Prisma, and PostgreSQL.

## Local development

```powershell
docker compose up -d db mailcatcher
Copy-Item .env.example .env
npx prisma migrate dev --name init
npm run dev
```

Open `http://localhost:3000` (Arabic) or `http://localhost:3000/en` (English). Mailcatcher is available at `http://localhost:1080`.

## Vercel + Neon deployment

1. Create a Neon PostgreSQL project and copy its pooled connection string into `DATABASE_URL`.
2. Create a Vercel project connected to this repository.
3. Add these environment variables in Vercel for **Production**, **Preview**, and **Development**:
   - `DATABASE_URL` — Neon pooled connection string.
   - `BETTER_AUTH_SECRET` — a long random secret.
   - `BETTER_AUTH_URL` — the deployed Vercel URL (for example `https://your-project.vercel.app`).
4. Run the first migration against Neon from a trusted machine:

```powershell
$env:DATABASE_URL="your-neon-connection-string"
npx prisma migrate deploy
```

Vercel uses `npm run build`, which generates Prisma Client before compiling Next.js. Do not commit `.env` files or database credentials.
