# Apartment Maintenance Marketplace — Claude Code Execution Plan

## Current baseline

The repository started as a Next.js 16 scaffold. The Prisma domain model and Better Auth server route were present, but the required dependencies, local environment documentation, public product surface, and authentication UI were missing.

## P0 — foundation (complete)

- [x] Install and lock Better Auth, next-intl, and Prisma 6 dependencies.
- [x] Validate and generate the Prisma client for the existing PostgreSQL schema.
- [x] Replace the starter screen with an Arabic-first bilingual marketplace landing page.
- [x] Add email/password sign-in and registration UI wired to Better Auth.
- [x] Add `.env.example` and local PostgreSQL/Mailcatcher startup configuration.
- [x] Keep locale-aware navigation and the existing domain model as the source of truth.

## P1 — first usable workflows

- [x] Add authenticated session guard and role-aware dashboard shell.
- [x] Add owner building/unit creation and tenant join-request workflow.
- [x] Add worker profile submission (including immutable submission snapshots).
- [x] Add maintenance request creation, authorized status transitions, and basic comments.
- [x] Add admin review queue for worker profile submissions.
- [ ] Add worker evidence uploads.
- [ ] Add maintenance attachments.
- [ ] Add procurement rounds, offers, award flow, work-order completion, and tenant feedback.

## P2 — operational readiness

- [ ] Add notification and audit-event services around every state transition.
- [x] Add idempotent seed data for service categories and areas.
- [ ] Add focused integration tests for authorization and state-machine transitions.
- [ ] Add local runbook, migration scripts, and production environment validation.

## Local P0 runbook

```bash
docker compose up -d db mailcatcher
copy .env.example .env
npx prisma migrate dev --name init
npm run dev
```

Open `http://localhost:3000`. The default locale is Arabic; `/en` switches to English.
