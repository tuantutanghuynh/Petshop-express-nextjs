# Newsletter campaigns: write, schedule, send — design (2026-11-10)

## Goal
The admin writes a newsletter (subject, preheader, rich text content, up to 6 posts / products),
sends a test to themself, schedules it (or sends now), can edit / reschedule / cancel before it goes,
stop it while sending, and sees a report afterwards. Today the shop only collects subscribers
(ADR-021) and exports CSV.

## Decisions (agreed 2026-11-10)
- Channel: Brevo SMTP through the existing nodemailer, on its own settings (`NEWSLETTER_SMTP_*`,
  `NEWSLETTER_MAIL_FROM`). Order / password emails stay on the current SMTP (Gmail).
- Scheduling: in-process worker every minute (like the two existing workers) + an external free
  pinger (cron-job.org → `/health` every 10 min) so Render Free does not sleep. Overdue campaigns are
  sent when the server wakes.
- Scope v1: test send, featured posts / products, send stats, edit / reschedule / cancel.
- No open / click tracking (needs a tracking pixel and consent).
- New backend dependencies: `marked`, `sanitize-html` (+ `@types/sanitize-html`) — same as frontend.

## Data (migration `add_newsletter_campaigns`, additive only)
`NewsletterCampaign`
- `id` uuid, `subject` (≤150), `preheader` (≤150, optional), `content` Markdown (≤20 000),
  `featured` Json `[{ type: 'post' | 'product', id }]` (≤6), `isAdvertising` Boolean default true
  (subject gets "[QC] "),
- `status` enum `NewsletterCampaignStatus`: DRAFT | SCHEDULED | SENDING | SENT | CANCELLED,
- `scheduledAt`, `startedAt`, `finishedAt` (UTC, nullable),
- counters `recipientCount`, `sentCount`, `failedCount`, `unsubscribeCount` (Int default 0) —
  kept on the campaign so the report survives subscriber erasure and delivery purge,
- `createdAt`, `updatedAt`; index `(status, scheduledAt)`.

`NewsletterDelivery` — one row per recipient
- `id`, `campaignId` (cascade), `subscriberId` (cascade: erasure removes it), `email`,
- `status` enum `NewsletterDeliveryStatus`: PENDING | SENDING | SENT | FAILED, `attempts` Int,
  `error` (≤300, no content), `sentAt`,
- `unsubscribeTokenHash` unique (SHA-256 of a random token, raw value only in that email),
  `unsubscribedAt`,
- unique `(campaignId, subscriberId)`; index `(campaignId, status)`, `(status, sentAt)`.

Rollback: `DROP TABLE "NewsletterDelivery"; DROP TABLE "NewsletterCampaign"; DROP TYPE …` — nothing
existing is altered. Deliveries of finished campaigns are deleted 90 days after `finishedAt` (the
hourly purge worker), counters stay.

## State machine (every change is a conditional UPDATE with the expected state in WHERE)
- DRAFT → SCHEDULED: `schedule` (`scheduledAt` now…now+90 days; empty = now). Needs subject and
  content, and newsletter SMTP configured in production (else 409 `NEWSLETTER_NOT_CONFIGURED`).
- SCHEDULED → SCHEDULED: reschedule; SCHEDULED → DRAFT: `cancel` before it starts.
- SCHEDULED → SENDING: the worker claims it when `scheduledAt <= now` and snapshots CONFIRMED
  subscribers into PENDING deliveries in the same transaction (`recipientCount`).
- SENDING → CANCELLED: `cancel` while sending (stop): the rest of the deliveries are not sent.
- SENDING → SENT: no PENDING / retryable FAILED delivery left.
- Edit (PATCH) only in DRAFT / SCHEDULED; delete only DRAFT. Otherwise 409 `CAMPAIGN_LOCKED`.

## Sending (worker, every minute)
1. Claim due campaigns (above).
2. For SENDING campaigns, up to `NEWSLETTER_BATCH_SIZE` (default 20) deliveries per tick, limited by
   `NEWSLETTER_DAILY_LIMIT` (default 300) minus deliveries SENT in the last 24 h.
3. Each delivery: claim PENDING → SENDING with a conditional UPDATE that also requires the campaign
   to be SENDING; render; send; SENT (+ `sentCount`) or back to PENDING with `attempts + 1`
   (transient: no SMTP code or 4xx) / FAILED (5xx or 3rd attempt, + `failedCount`).
   A delivery stuck in SENDING for > 10 min (crash mid-send) goes back to PENDING.
4. Finish campaigns with nothing left.
Two workers at once never send one delivery twice (race test).

## Email
- Markdown → HTML with `marked` + `sanitize-html` (same allow-list as `frontend-petshop/lib/sanitize.ts`),
  inline styles added per tag (Gmail strips `<style>`), table layout, max 600px, logo, brand colours,
  hidden preheader, plain-text part.
- Featured cards resolved at send time: published posts (`/blog/<slug>`), active products
  (`/san-pham/<slug>`, image, lowest variant price in VND). Missing / hidden ones are skipped.
- Footer: shop name, contact from settings, why they receive it, unsubscribe link
  `${PUBLIC_SITE_URL}/huy-dang-ky?token=<delivery token>`.
- Headers `List-Unsubscribe: <https://<api>/api/v1/newsletter/one-click?token=…>, <mailto…>` (mailto
  only if configured) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058).
- "[QC] " prefix when `isAdvertising` (Nghị định 91/2020 — owner to confirm the exact rule).
- Test send: to the signed-in admin's email, subject prefixed "[Thử] ", unsubscribe link inert,
  5 per 15 min.

## Unsubscribe
- `POST /newsletter/unsubscribe` accepts a subscriber token (welcome email, as today) or a delivery
  token. A delivery token unsubscribes only if the subscriber is CONFIRMED and confirmed before that
  delivery was created (an old link cannot undo a later re-subscription); first use sets
  `unsubscribedAt` and increments `unsubscribeCount`.
- `POST /newsletter/one-click?token=…` (form body from mail providers, no JS, own looser rate limit).

## API (admin: authenticate + requireRole('admin'))
- `GET /newsletter/campaigns?status&page&pageSize` (pageSize ≤ 50), `POST /newsletter/campaigns`
- `GET | PATCH | DELETE /newsletter/campaigns/:id`
- `POST /newsletter/campaigns/:id/schedule { scheduledAt? }`, `POST …/cancel`, `POST …/test`
- Responses via `sendSuccess`; validation 422; locked 409; unknown 404.

## Admin UI `/admin/ban-tin`
- List: tabs Nháp / Đã hẹn / Đang gửi / Đã gửi / Đã huỷ, cards on mobile, pagination.
- Form `/admin/ban-tin/moi`, `/admin/ban-tin/[id]`: subject (+ counter), preheader, `[QC]` checkbox,
  content with `MarkdownField` (Tiptap), featured picker (search posts / products, ≤6, reorder /
  remove), send time (Vietnam time, empty = now). Buttons: Lưu nháp · Gửi thử cho tôi · Hẹn giờ
  (or Gửi ngay) · Huỷ hẹn. A SENDING / SENT / CANCELLED campaign opens as a read-only report:
  recipients, sent, failed, unsubscribed, times, "Dừng gửi" while SENDING.
- Admin nav gets "Bản tin". All pages `noindex` (already for /admin).

## Testing
- Unit: email rendering (escape, sanitize, inline styles, featured cards, [QC], preheader), plain
  text, limit / batch maths, config.
- DB: API happy paths + 401 / 403 / 404 / 409 / 422; worker claim, snapshot, finish, retry, stuck
  reset, daily limit; unsubscribe with delivery token and the re-subscribe guard; purge.
- Race (`transaction-race-test`): two workers in parallel → each delivery sent once; cancel during
  sending stops new sends; schedule vs cancel at the same time.
- Frontend: lib helpers (form ↔ body, VN time), browser check 320 / 390 / 768 / 1024.
- ADR-025.
