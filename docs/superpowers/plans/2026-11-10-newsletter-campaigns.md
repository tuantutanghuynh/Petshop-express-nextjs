# Newsletter campaigns Implementation Plan

**Goal:** Admin writes, tests, schedules and sends newsletters through Brevo SMTP, with a report.
**Spec:** docs/superpowers/specs/2026-11-10-newsletter-campaigns-design.md
**Architecture:** Two new tables; a per-minute in-process worker claims campaigns and deliveries with
conditional UPDATEs; email HTML rendered on the backend; admin UI on the existing admin patterns.

## Global constraints
- Backend Express 5 + Prisma 7.9.1 (CommonJS, tsx). Responses via sendSuccess, errors via ApiError.
- Every state change: conditional UPDATE with expected state in WHERE. Money Int VND. Times UTC.
- No `any`, no `@ts-ignore`, no empty catch. Code / comments English, UI Vietnamese.
- Migration additive only; the user runs it on dev / test / live. Claude never runs migrations on live.
- Secrets only via config/env.ts; `.env.example` updated; values never printed.
- One commit per wave, plain one-line message, after the user's "ok".

## Wave 1 — data, rendering, sending (backend)
### Task 1.1 Dependencies + import check
- `npm install --save-exact marked@18.0.12 sanitize-html@2.18.1` and `-D @types/sanitize-html@2.16.2` in backend.
- Check `import { marked } from 'marked'` works under tsx and the test runner (marked 18 is ESM-only;
  Node ≥ 22.12 loads it via require(esm)). If not: stop and ask (fallback: an older marked with CJS).
### Task 1.2 Schema + migration
- `prisma/schema.prisma`: enums NewsletterCampaignStatus, NewsletterDeliveryStatus; models
  NewsletterCampaign, NewsletterDelivery (spec "Data"); relation fields on NewsletterSubscriber.
- `prisma/migrations/20261110120000_add_newsletter_campaigns/migration.sql` written by hand from
  `prisma migrate diff`; rollback SQL in the ADR. User runs `npx prisma migrate dev` (dev) and the
  test DB setup.
### Task 1.3 Config
- `config/env.ts`: `newsletterSmtp { host, port, user, pass, from, dailyLimit, batchSize }`,
  `publicApiUrl` for the one-click link (`PUBLIC_API_URL`); not production-required (feature refuses
  to schedule without it). `.env.example`. Tests in `test/config.*`.
### Task 1.4 Email rendering (TDD) — `services/newsletterEmail.service.ts`
- `renderCampaignEmail({ subject, preheader, content, isAdvertising, featured, shop, unsubscribeUrl })
  → { subject, html, text }`; `markdownToEmailHtml(md)` (sanitize allow-list + inline styles).
- `test/newsletterEmail.test.ts`: escaping, script / javascript: stripped, styles inline, [QC],
  preheader hidden, cards (price VND), text part has the unsubscribe URL.
### Task 1.5 Transport — `services/email.service.ts`
- `newsletterTransport()` (Brevo SMTP; dev console; test swap) and
  `sendNewsletterMessage({ to, subject, html, text, headers })`; `isNewsletterMailConfigured()`.
### Task 1.6 Campaign sending service (TDD, DB) — `services/newsletterCampaign.service.ts`
- `claimDueCampaigns(now)`, `sendBatch(now)`, `finishCampaigns(now)`, `resetStuckDeliveries(now)`,
  `purgeOldDeliveries(now)`, `runNewsletterTick(now)`.
- `test/db/newsletter.campaign.send.test.ts`: snapshot only CONFIRMED, batch size, daily limit,
  retry transient / fail permanent, stuck reset, cancel stops, finish, purge after 90 days.
### Task 1.7 Worker — `workers/sendNewsletters.ts` + `bin/www.ts` start / stop.
### Task 1.8 Race tests (skill transaction-race-test) — `test/db/newsletter.campaign.race.test.ts`
- two ticks in parallel → each delivery sent exactly once; cancel vs claim.
### Verify wave 1: typecheck, DB-free tests, DB tests. Commit "add newsletter campaign sending".

## Wave 2 — API + unsubscribe (backend)
### Task 2.1 Validation + routes — `routes/newsletter.route.ts` (`/campaigns`, factory rules)
### Task 2.2 Controller + service CRUD / schedule / cancel / test (conditional UPDATEs, 409 CAMPAIGN_LOCKED, 409 NEWSLETTER_NOT_CONFIGURED)
### Task 2.3 Unsubscribe by delivery token + re-subscribe guard + `POST /one-click`
### Task 2.4 Tests: `test/db/newsletter.campaign.api.test.ts`, `authz.test.ts` (new routes 401/403), validation 422
### Verify wave 2; commit "add newsletter campaign api".

## Wave 3 — admin UI (frontend)
### Task 3.1 `lib/adminNewsletter.ts` (TDD): types, limits, form ↔ body, VN time ↔ UTC, tabs, list query
### Task 3.2 `components/admin/newsletter/{CampaignsManager,CampaignCard,CampaignForm,FeaturedPicker,CampaignReport}.tsx`
### Task 3.3 `app/admin/ban-tin/{page,moi/page,[id]/page}.tsx`; admin nav item "Bản tin"; types in lib/types.ts
### Task 3.4 Verify: typecheck, lint, tests, build, browser 320/390/768/1024 (script with env credentials)
### Task 3.5 ADR-025, PROGRESS; guide: Brevo account + sender, Render env, cron-job.org ping, live migration.
Commit "add newsletter campaigns admin".

## Risks
- Deliverability without own domain (Gmail sender via Brevo → spam / Brevo may require a domain).
- marked ESM-only in a CommonJS backend (checked in Task 1.1).
- Render Free sleep: mitigated by the pinger; overdue campaigns go out on wake.
- Brevo free 300/day: daily limit spreads larger lists over several days.
