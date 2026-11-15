# Newsletter signup (double opt-in) — design

Date: 2026-11-07 · Level: LARGE (migration, new public endpoints, personal data) · ADR-021

## Goal

Collect email addresses of people who want shop tips and offers, with proof of consent, so a
newsletter can be sent later from an external service (Brevo, Mailchimp…) using the CSV export.

**In scope:** signup form in the footer band, confirmation email (double opt-in), welcome email with
an unsubscribe link, unsubscribe page, purge of unconfirmed signups, admin list / filter / search /
CSV export / delete.

**Out of scope:** composing or sending newsletters, signup checkboxes in registration or checkout,
signup statistics dashboard.

## Decisions (agreed 2026-11-07)

| Question | Choice |
|---|---|
| Footer band | Always shows the email form; Zalo / social buttons below it when the shop has them. Never hidden. |
| Other signup places | Footer only. Signed-in customers get their email prefilled; they still confirm by email. |
| Admin | Paginated list, status filter, email search, CSV export (confirmed only), delete one. |
| Link protection | Random tokens, only their SHA-256 hash stored (same as `PasswordResetToken`). |

Rejected: HMAC-signed stateless tokens (a single link cannot be revoked); single opt-in (anyone can
subscribe someone else's address, and fake addresses damage the sending domain's reputation).

## Data — migration `add_newsletter_subscribers` (adds one table, no data loss)

```prisma
enum NewsletterStatus {
  PENDING
  CONFIRMED
  UNSUBSCRIBED
}

model NewsletterSubscriber {
  id                   String           @id @default(uuid())
  email                String           @unique // stored trimmed and lower-cased
  status               NewsletterStatus @default(PENDING)
  confirmTokenHash     String?          @unique
  confirmExpiresAt     DateTime?
  confirmSentAt        DateTime?        // throttles resending
  unsubscribeTokenHash String?          @unique // set on confirm, sent in the welcome email
  consentText          String           // the exact sentence shown next to the form
  consentAt            DateTime
  confirmedAt          DateTime?
  unsubscribedAt       DateTime?
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  @@index([status, createdAt])
}
```

Rollback: a down migration that drops the table and the enum (only newsletter data is lost).

## Flow

1. **Subscribe** — `POST /api/v1/newsletter/subscribe { email, consent: true }`.
   Always answers 200 with the same message ("Kiểm tra hộp thư để xác nhận đăng ký"), so nobody can
   learn which addresses are subscribed. The email is sent without the response waiting for it
   (same as password reset), so timing does not leak either.
   - New address, or `UNSUBSCRIBED` → `PENDING`, new confirm token (48 h), new consent text and time,
     confirmation email sent.
   - `PENDING` → a new confirm token and email, but at most once per 10 minutes (`confirmSentAt`);
     inside that window nothing is sent.
   - `CONFIRMED` → nothing is sent.
   - Written as one upsert on the unique `email`, so two simultaneous signups for the same address
     create one row.
2. **Confirm** — the email links to `/xac-nhan-dang-ky?token=…`. The page posts the token to
   `POST /api/v1/newsletter/confirm { token }` → `CONFIRMED`, `confirmedAt` set, confirm token
   cleared (single use), a new unsubscribe token generated (only its hash is stored, so the raw
   token exists only in the welcome email). Unknown or expired token → 400 `INVALID_TOKEN`. A welcome email with the
   unsubscribe link is sent.
3. **Unsubscribe** — welcome email links to `/huy-dang-ky?token=…`. The page shows a button; only the
   click calls `POST /api/v1/newsletter/unsubscribe { token }` (mail scanners open links on their
   own and must not unsubscribe people). → `UNSUBSCRIBED`, `unsubscribedAt` set. Calling it again
   still answers 200. Unknown token → 400 `INVALID_TOKEN`.
4. **Purge** — a new sweeper `workers/purgePendingSubscribers.ts`, started in `bin/www.ts` like
   `startExpiredOrderSweeper`, deletes `PENDING` rows whose `consentAt` is older than 7 days, every
   hour (`consentAt`, not `createdAt`: a re-subscription keeps the old `createdAt`): no address is kept
   for someone who never agreed.

Each confirmation issues a new unsubscribe token, so only the latest welcome email's link works.
Newsletters themselves will be sent from an external service with its own unsubscribe link. The admin delete removes the row entirely (a customer's erasure request, Decree 13/2023).

## API

Routes in `routes/newsletter.route.ts` (mounted at `/newsletter`, as every feature route), logic in
`services/newsletter.service.ts`, validation with express-validator (422 `VALIDATION_ERROR`).

| Method & path | Access | Notes |
|---|---|---|
| `POST /newsletter/subscribe` | public, own limiter 5 / 15 min / IP | `email` valid and ≤ 254 chars, `consent` must be `true` |
| `POST /newsletter/confirm` | public, limiter 10 / 15 min / IP | `token` string |
| `POST /newsletter/unsubscribe` | public, limiter 10 / 15 min / IP | `token` string |
| `GET /newsletter/subscribers?status=&q=&page=&pageSize=` | admin | `pageSize` default 20, max 100; newest first, `id` tie-breaker; `q` 2–100 chars, contains, case-insensitive |
| `GET /newsletter/subscribers/export` | admin | `CONFIRMED` only, `{ filename, csv }` |
| `DELETE /newsletter/subscribers/:id` | admin | 204; unknown id → 404 |

Admin endpoints use `authenticate` + `requireRole('admin')` and `select` only the listed columns
(never token hashes). Newsletter is not brand-scoped: no `resolveBrand`.

**CSV** — returned inside the standard envelope as `data: { filename: "newsletter-YYYY-MM-DD.csv",
csv }`, so the admin client reuses `authFetch` (token refresh included) and saves it as a Blob. The
text starts with a UTF-8 BOM so Excel shows Vietnamese correctly. Columns:
`email,confirmedAt,consentAt`. Every cell quoted; a cell starting with `= + - @` (or tab / CR) is
prefixed with `'` against CSV injection.

**Emails** — `newsletterConfirmEmail(link)` and `newsletterWelcomeEmail(unsubscribeLink)` in
`services/email.service.ts`, pure functions like `passwordResetEmail`, links built from `siteUrl`.

## Frontend

- **BFF** — `app/api/newsletter/{subscribe,confirm,unsubscribe}/route.ts` via `relayPublic`
  (origin check, X-Client-IP, request id).
- **`components/layout/CommunityBand.tsx`** — stays a Server Component; always rendered. Holds the
  heading, a new client component `components/layout/NewsletterForm.tsx`, and the Zalo / social
  buttons when `communityLinks(shop)` is not empty.
- **`NewsletterForm`** — label (visually hidden) + `type="email"`, `autoComplete="email"`,
  `enterKeyHint="send"`, input ≥ 16px and ≥ 44px tall; submit `w-full md:w-auto`, disabled while
  sending; field error under the input with `aria-describedby`; success message replaces the form
  (`role="status"`). Consent sentence under the button: *"Bằng việc đăng ký, bạn đồng ý nhận email
  mẹo chăm sóc và ưu đãi từ Siêu thị của chó mèo. Huỷ bất cứ lúc nào."* The client never sends this
  text: the backend stores its own copy (`NEWSLETTER_CONSENT_TEXT` in `constants/`) as `consentText`,
  and the frontend shows the same sentence from `lib/newsletter.ts`; each copy carries a comment
  naming the other (backend and frontend are separate packages, nothing can import across).
  Signed-in customers: on the first focus of an empty input the form calls `/api/auth/me` (as the
  quote prefill does) and fills the email. Not on page load: the band is on every page, and most
  visitors are not signed in.
- **Pages** `app/xac-nhan-dang-ky/page.tsx`, `app/huy-dang-ky/page.tsx` — `robots: noindex`,
  `referrer: 'no-referrer'`, added to `PRIVATE_PATHS` in `lib/seo/robots.ts`. Confirm page confirms
  on load and shows success / invalid-link states; unsubscribe page shows a button, then success.
  Both wrap `useSearchParams` in `<Suspense>`.
- **Admin** `app/admin/dang-ky-nhan-tin/page.tsx` + `components/admin/newsletter/*`, client side
  with `authFetch`: status filter, email search, cards on mobile / table from `md`, pagination,
  "Xuất CSV" (`authFetch`, then a Blob download), "Xoá" after `window.confirm` (as the contacts page). Added to
  the admin menu. Loading, empty, error states.

## Errors

| Case | Answer |
|---|---|
| Bad email / missing consent | 422 `VALIDATION_ERROR`, field details |
| Too many requests | 429 |
| Bad or expired token | 400 `INVALID_TOKEN` |
| SMTP down | subscribe still 200; logged with `logger.error` without the link or token |
| Admin delete unknown id | 404 `NOT_FOUND` |

## Testing

- **DB-free (Vitest):** email builders (link present, HTML escaped); CSV builder (BOM, quoting,
  injection prefix); validation 422s; admin endpoints 401 without token, 403 for a customer.
- **DB (testcontainers):** subscribe → confirm → unsubscribe end to end; same body for known and
  unknown addresses; resend throttle; expired and reused confirm token; resubscribe after
  unsubscribe; 429 after 5 signups; purge removes `PENDING` > 7 days and keeps the rest; list filter
  / search / pagination; CSV holds only `CONFIRMED`; delete; two concurrent signups for one address
  → one row, both 200.
- **Frontend (Vitest):** form validation, BFF routes relay to the backend.
- **Browser:** footer band at 320 / 360 / 390 / 430 / 768 / 1024 px; confirm and unsubscribe pages;
  admin page on mobile and desktop.

## Documentation

- ADR-021: handling of subscriber personal data
  (consent proof, 7-day purge of unconfirmed, hard delete on request).
- `docs/PROGRESS.md` entry when done. No new environment variables (SMTP and PUBLIC_SITE_URL exist).
