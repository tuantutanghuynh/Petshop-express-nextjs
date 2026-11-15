# Newsletter Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitors subscribe from the footer with double opt-in, can unsubscribe, and the admin can list, search, export (CSV) and delete subscribers.

**Architecture:** One new table `NewsletterSubscriber`. Logic in `backend/services/newsletter.service.ts` (token hashing, conditional updates so concurrent requests stay consistent); thin controller and routes with their own rate limiters; an hourly purge worker. Frontend: three BFF relays, a client `NewsletterForm` inside the footer band, two private pages, one admin page.

**Tech Stack:** Express 5, Prisma 7 + Postgres 15, express-validator, express-rate-limit, nodemailer (existing), Next.js 16 App Router, React 19, Tailwind 4, Vitest + supertest + testcontainers.

Spec: `docs/superpowers/specs/2026-11-07-newsletter-signup-design.md`.

## Global Constraints

- Brand name exactly "Siêu thị của chó mèo".
- Consent sentence exactly: `Bằng việc đăng ký, bạn đồng ý nhận email mẹo chăm sóc và ưu đãi từ Siêu thị của chó mèo. Huỷ bất cứ lúc nào.`
- Subscribe answer, every case: `Kiểm tra hộp thư để xác nhận đăng ký.`
- Confirm link 48 h; resend at most once per 10 min; purge `PENDING` with `consentAt` older than 7 days, hourly.
- Limiters per visitor IP (`ipBucket`), 15 min window: subscribe 5, confirm 10, unsubscribe 10; 429 `RATE_LIMITED`.
- Admin list `pageSize` default 20, max 100; `q` 2–100 chars.
- Tokens: `crypto.randomBytes(32).toString('hex')`, stored as SHA-256 hex only. Never log a token or a link.
- No `any`, no `eslint-disable`, no empty `catch`. Code and comments in English, comment style of the file being edited.
- No new dependency. Claude does not run migrations against the dev database; the user runs `npx prisma migrate dev`.
- Commits: one short plain line, no attribution, proposed to the user and made only after "ok".

## File map

| File | Role |
|---|---|
| `backend/prisma/schema.prisma` (modify) | enum + model |
| `backend/prisma/migrations/20261107120000_add_newsletter_subscribers/migration.sql` (create) | the table |
| `backend/constants/newsletter.ts` (create) | consent text, durations, limits, messages |
| `backend/utils/csv.ts` (create) | CSV building with injection guard |
| `backend/services/email.service.ts` (modify) | two email builders + senders |
| `backend/services/newsletter.service.ts` (create) | subscribe / confirm / unsubscribe / purge / admin queries |
| `backend/controllers/newsletter.controller.ts` (create) | HTTP ↔ service |
| `backend/routes/newsletter.route.ts` (create), `backend/routes/index.ts` (modify) | routes, validation, limiters |
| `backend/workers/purgePendingSubscribers.ts` (create), `backend/bin/www.ts` (modify) | hourly purge |
| `frontend-petshop/lib/newsletter.ts` (create) | consent text, validation, BFF body pickers, admin URL state |
| `frontend-petshop/lib/forms.ts` (modify) | export `emailError` |
| `frontend-petshop/app/api/newsletter/{subscribe,confirm,unsubscribe}/route.ts` (create) | BFF relays |
| `frontend-petshop/components/layout/NewsletterForm.tsx` (create), `CommunityBand.tsx`, `SiteFooter.tsx` (modify) | footer band |
| `frontend-petshop/components/newsletter/{ConfirmSubscription,UnsubscribeButton}.tsx` (create) | page bodies |
| `frontend-petshop/app/{xac-nhan-dang-ky,huy-dang-ky}/page.tsx` (create), `lib/seo/robots.ts` (modify) | private pages |
| `frontend-petshop/components/admin/newsletter/{SubscribersManager,SubscriberCard}.tsx`, `app/admin/dang-ky-nhan-tin/page.tsx` (create), `lib/adminNav.ts`, `lib/types.ts` (modify) | admin |

---

### Task 1: Table and migration

**Files:**
- Modify: `backend/prisma/schema.prisma` (append after `InventoryMovement`)
- Create: `backend/prisma/migrations/20261107120000_add_newsletter_subscribers/migration.sql`

**Interfaces:** Produces Prisma model `newsletterSubscriber` and enum `NewsletterStatus` (`PENDING | CONFIRMED | UNSUBSCRIBED`).

- [ ] **Step 1: Add to schema.prisma**

```prisma
// Newsletter signups (spec 2026-11-07). Double opt-in: a row is PENDING until the emailed link is
// opened. Only SHA-256 hashes of the confirm / unsubscribe tokens are stored. consentText and
// consentAt are the proof of consent (Decree 13/2023); PENDING rows are purged after 7 days.
enum NewsletterStatus {
  PENDING
  CONFIRMED
  UNSUBSCRIBED
}

model NewsletterSubscriber {
  id                   String           @id @default(uuid())
  email                String           @unique // trimmed, lower-cased
  status               NewsletterStatus @default(PENDING)
  confirmTokenHash     String?          @unique
  confirmExpiresAt     DateTime?
  confirmSentAt        DateTime?
  unsubscribeTokenHash String?          @unique // set on confirm, sent in the welcome email
  consentText          String
  consentAt            DateTime
  confirmedAt          DateTime?
  unsubscribedAt       DateTime?
  createdAt            DateTime         @default(now())
  updatedAt            DateTime         @updatedAt

  @@index([status, createdAt])
}
```

- [ ] **Step 2: Write migration.sql** (what `prisma migrate dev` generates for the model)

```sql
-- CreateEnum
CREATE TYPE "NewsletterStatus" AS ENUM ('PENDING', 'CONFIRMED', 'UNSUBSCRIBED');

-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "NewsletterStatus" NOT NULL DEFAULT 'PENDING',
    "confirmTokenHash" TEXT,
    "confirmExpiresAt" TIMESTAMP(3),
    "confirmSentAt" TIMESTAMP(3),
    "unsubscribeTokenHash" TEXT,
    "consentText" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_email_key" ON "NewsletterSubscriber"("email");
CREATE UNIQUE INDEX "NewsletterSubscriber_confirmTokenHash_key" ON "NewsletterSubscriber"("confirmTokenHash");
CREATE UNIQUE INDEX "NewsletterSubscriber_unsubscribeTokenHash_key" ON "NewsletterSubscriber"("unsubscribeTokenHash");
CREATE INDEX "NewsletterSubscriber_status_createdAt_idx" ON "NewsletterSubscriber"("status", "createdAt");
```

Rollback (kept in the plan, not a file): `DROP TABLE "NewsletterSubscriber"; DROP TYPE "NewsletterStatus";` and delete the migration row.

- [ ] **Step 3: Regenerate the client and check the schema matches the SQL**

Run (backend): `npx prisma generate && npx prisma validate`
Expected: no error. The DB suite (Task 4) replays migrations in a container and fails if SQL and schema drift.

- [ ] **Step 4: User applies to the dev DB**

User runs (backend, Docker up): `npx prisma migrate dev` → expected "Applied migration 20261107120000_add_newsletter_subscribers" and no new migration created (a newly generated one would mean the SQL drifts from the schema).

---

### Task 2: Pure pieces — constants, CSV, emails

**Files:**
- Create: `backend/constants/newsletter.ts`, `backend/utils/csv.ts`
- Modify: `backend/services/email.service.ts` (append builders and senders)
- Test: `backend/test/csv.test.ts` (create), `backend/test/email.service.test.ts` (append)

**Interfaces — produces:**
- `NEWSLETTER_CONSENT_TEXT: string`, `SUBSCRIBE_MESSAGE: string`, `CONFIRM_LINK_VALID_HOURS = 48`, `RESEND_AFTER_MINUTES = 10`, `PENDING_KEPT_DAYS = 7`, `ADMIN_PAGE_SIZE = 20`, `ADMIN_MAX_PAGE_SIZE = 100`
- `csvCell(value: string): string`, `toCsv(header: string[], rows: string[][]): string`
- `newsletterConfirmEmail(link)`, `newsletterWelcomeEmail(unsubscribeLink)` → `{ subject, text, html }`; `sendNewsletterConfirm(to, link)`, `sendNewsletterWelcome(to, unsubscribeLink)` → `Promise<void>`

- [ ] **Step 1: Failing tests**

`backend/test/csv.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from '../utils/csv';

// Subscriber export (spec 2026-11-07): opens in Excel with Vietnamese intact, and a cell can never
// run as a formula when the file is opened (CSV injection).
describe('csvCell', () => {
  it('quotes every cell and doubles inner quotes', () => {
    expect(csvCell('an@example.com')).toBe('"an@example.com"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])('neutralises %j', (value) => {
    expect(csvCell(value)).toBe(`"'${value}"`);
  });
});

describe('toCsv', () => {
  it('starts with a UTF-8 BOM and uses CRLF lines', () => {
    expect(toCsv(['email'], [['an@example.com']])).toBe('﻿"email"\r\n"an@example.com"\r\n');
  });
});
```

Append to `backend/test/email.service.test.ts`:
```ts
import { newsletterConfirmEmail, newsletterWelcomeEmail, sendNewsletterConfirm } from '../services/email.service';

const CONFIRM = 'https://shop.example/xac-nhan-dang-ky?token=abc&x=1';
const UNSUB = 'https://shop.example/huy-dang-ky?token=def&x=1';

describe('newsletter emails', () => {
  it('confirmation carries the link, its lifetime and the shop name', () => {
    const mail = newsletterConfirmEmail(CONFIRM);
    expect(mail.subject).toMatch(/xác nhận/i);
    expect(mail.text).toContain(CONFIRM);
    expect(mail.text).toContain('48 giờ');
    expect(mail.text).toContain('Siêu thị của chó mèo');
    expect(mail.html).toContain('href="https://shop.example/xac-nhan-dang-ky?token=abc&amp;x=1"');
  });

  it('welcome carries the unsubscribe link', () => {
    const mail = newsletterWelcomeEmail(UNSUB);
    expect(mail.text).toContain(UNSUB);
    expect(mail.html).toContain('href="https://shop.example/huy-dang-ky?token=def&amp;x=1"');
  });

  it('sends the confirmation to the subscriber', async () => {
    const sent: MailMessage[] = [];
    setMailTransportForTests({ sendMail: async (m) => { sent.push(m); } });
    await sendNewsletterConfirm('an@example.com', CONFIRM);
    expect(sent.map((m) => m.to)).toEqual(['an@example.com']);
  });
});
```
(Merge the new import names into the file's existing import from `../services/email.service`.)

- [ ] **Step 2: Run, expect failure**

Run (backend): `npx vitest run test/csv.test.ts test/email.service.test.ts`
Expected: FAIL — modules / exports missing.

- [ ] **Step 3: Implement**

`backend/constants/newsletter.ts`:
```ts
// Newsletter signup (spec 2026-11-07). The consent sentence is stored with each signup as proof of
// what the visitor agreed to; the footer shows the same words (frontend-petshop/lib/newsletter.ts).
// Change both together, and only for new signups: stored rows keep the sentence they agreed to.
export const NEWSLETTER_CONSENT_TEXT =
  'Bằng việc đăng ký, bạn đồng ý nhận email mẹo chăm sóc và ưu đãi từ Siêu thị của chó mèo. Huỷ bất cứ lúc nào.';

// One answer for every address, so the form cannot be used to learn who is subscribed.
export const SUBSCRIBE_MESSAGE = 'Kiểm tra hộp thư để xác nhận đăng ký.';

export const CONFIRM_LINK_VALID_HOURS = 48;
export const RESEND_AFTER_MINUTES = 10; // a second signup inside this window sends nothing
export const PENDING_KEPT_DAYS = 7; // unconfirmed addresses are deleted after this

export const ADMIN_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 100;
```

`backend/utils/csv.ts`:
```ts
// CSV for spreadsheet programs. Every cell is quoted. A cell starting with = + - @ (or tab / CR)
// is prefixed with ' so Excel shows it as text instead of running it as a formula: subscriber
// emails are typed by visitors. The BOM makes Excel read the file as UTF-8 (Vietnamese).
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: string[][]): string {
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}
```

Append to `backend/services/email.service.ts` (import `CONFIRM_LINK_VALID_HOURS` from `../constants/newsletter`):
```ts
// Newsletter (spec 2026-11-07): the double opt-in link, then a welcome with the unsubscribe link.
export function newsletterConfirmEmail(link: string): { subject: string; text: string; html: string } {
  const subject = `Xác nhận đăng ký nhận tin — ${SHOP_NAME}`;
  const text = [
    'Xin chào,',
    '',
    'Bạn (hoặc ai đó) vừa đăng ký nhận email mẹo chăm sóc và ưu đãi bằng địa chỉ này. Mở link sau để xác nhận:',
    link,
    '',
    `Link có hiệu lực trong ${CONFIRM_LINK_VALID_HOURS} giờ. Nếu bạn không đăng ký, hãy bỏ qua email này — bạn sẽ không nhận thêm thư nào.`,
    '',
    SHOP_NAME,
  ].join('\n');
  const href = escapeHtml(link);
  const html = `<p>Xin chào,</p>
<p>Bạn (hoặc ai đó) vừa đăng ký nhận email mẹo chăm sóc và ưu đãi bằng địa chỉ này.</p>
<p><a href="${href}">Xác nhận đăng ký</a></p>
<p>Nếu nút không mở được, chép link này vào trình duyệt:<br>${href}</p>
<p>Link có hiệu lực trong ${CONFIRM_LINK_VALID_HOURS} giờ. Nếu bạn không đăng ký, hãy bỏ qua email này — bạn sẽ không nhận thêm thư nào.</p>
<p>${SHOP_NAME}</p>`;
  return { subject, text, html };
}

export function newsletterWelcomeEmail(unsubscribeLink: string): { subject: string; text: string; html: string } {
  const subject = `Đăng ký nhận tin thành công — ${SHOP_NAME}`;
  const text = [
    'Cảm ơn bạn đã đăng ký!',
    '',
    'Bạn sẽ nhận mẹo chăm sóc thú cưng và ưu đãi mới từ chúng tôi.',
    'Muốn ngừng nhận thư, mở link sau:',
    unsubscribeLink,
    '',
    SHOP_NAME,
  ].join('\n');
  const href = escapeHtml(unsubscribeLink);
  const html = `<p>Cảm ơn bạn đã đăng ký!</p>
<p>Bạn sẽ nhận mẹo chăm sóc thú cưng và ưu đãi mới từ chúng tôi.</p>
<p>Muốn ngừng nhận thư: <a href="${href}">huỷ đăng ký</a>.</p>
<p>${SHOP_NAME}</p>`;
  return { subject, text, html };
}

export async function sendNewsletterConfirm(to: string, link: string): Promise<void> {
  await transport().sendMail({ from: smtp.from ?? DEV_SENDER, to, ...newsletterConfirmEmail(link) });
}

export async function sendNewsletterWelcome(to: string, unsubscribeLink: string): Promise<void> {
  await transport().sendMail({ from: smtp.from ?? DEV_SENDER, to, ...newsletterWelcomeEmail(unsubscribeLink) });
}
```
Also update the file's top comment: "Outgoing email (password reset, newsletter)".

- [ ] **Step 4: Run, expect pass**

Run (backend): `npx vitest run test/csv.test.ts test/email.service.test.ts && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Propose commit** `add newsletter emails and csv helper`

---

### Task 3: Service

**Files:**
- Create: `backend/services/newsletter.service.ts`
- Test: in Task 4 (it needs the database)

**Interfaces — produces:**
```ts
type SubscribeOutcome = { send: false } | { send: true; confirmToken: string };
subscribe(email: string, now?: Date): Promise<SubscribeOutcome>
confirm(token: string, now?: Date): Promise<{ email: string; unsubscribeToken: string }>   // ApiError 400 INVALID_TOKEN
unsubscribe(token: string, now?: Date): Promise<void>                                       // ApiError 400 INVALID_TOKEN
purgePending(now?: Date): Promise<number>
listSubscribers(q: { status?: NewsletterStatus; q?: string; take: number; skip: number }): Promise<{ items: SubscriberRow[]; total: number }>
exportConfirmed(now?: Date): Promise<{ filename: string; csv: string }>
deleteSubscriber(id: string): Promise<void>                                                 // ApiError 404 NOT_FOUND
type SubscriberRow = { id; email; status; consentAt; confirmedAt; unsubscribedAt; createdAt }
```

- [ ] **Step 1: Implement**

```ts
import crypto from 'crypto';
import { Prisma, type NewsletterStatus } from '@prisma/client';
import prisma from './prisma';
import ApiError from '../utils/ApiError';
import { toCsv } from '../utils/csv';
import { CONFIRM_LINK_VALID_HOURS, NEWSLETTER_CONSENT_TEXT, PENDING_KEPT_DAYS, RESEND_AFTER_MINUTES } from '../constants/newsletter';

// Newsletter signups (spec 2026-11-07). Tokens are random and only their SHA-256 hash is stored, so a
// database leak does not hand out working links. Every state change is a conditional UPDATE (the
// expected state is in the WHERE), never read-then-write: two signups or two clicks at the same
// moment cannot both win, and the loser simply finds nothing to change.

const MINUTE = 60 * 1000;
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('hex');
const invalidToken = () => new ApiError(400, 'INVALID_TOKEN', 'Link không hợp lệ hoặc đã hết hạn');

export type SubscribeOutcome = { send: false } | { send: true; confirmToken: string };

// New address → PENDING row; UNSUBSCRIBED, or PENDING whose last email is older than the resend
// window → back to PENDING with a fresh token and consent; CONFIRMED, or PENDING inside the window →
// nothing. The caller answers the same in every case.
export async function subscribe(email: string, now = new Date()): Promise<SubscribeOutcome> {
  const confirmToken = newToken();
  const fresh = {
    status: 'PENDING' as const,
    confirmTokenHash: hash(confirmToken),
    confirmExpiresAt: new Date(now.getTime() + CONFIRM_LINK_VALID_HOURS * 60 * MINUTE),
    confirmSentAt: now,
    consentText: NEWSLETTER_CONSENT_TEXT,
    consentAt: now,
  };
  const { count } = await prisma.newsletterSubscriber.updateMany({
    where: {
      email,
      OR: [{ status: 'UNSUBSCRIBED' }, { status: 'PENDING', confirmSentAt: { lt: new Date(now.getTime() - RESEND_AFTER_MINUTES * MINUTE) } }],
    },
    data: { ...fresh, unsubscribedAt: null },
  });
  if (count === 1) return { send: true, confirmToken };
  try {
    await prisma.newsletterSubscriber.create({ data: { email, ...fresh } });
    return { send: true, confirmToken };
  } catch (err) {
    // The row exists: CONFIRMED, inside the resend window, or created a moment ago by a concurrent
    // signup for the same address (which sends the email). Nothing to do.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return { send: false };
    throw err;
  }
}

// Single use: the token is cleared by the same UPDATE that confirms, and a new unsubscribe token is
// issued — its raw value exists only in the welcome email the caller sends.
export async function confirm(token: string, now = new Date()): Promise<{ email: string; unsubscribeToken: string }> {
  const confirmTokenHash = hash(token);
  const row = await prisma.newsletterSubscriber.findUnique({ where: { confirmTokenHash }, select: { id: true, email: true } });
  if (!row) throw invalidToken();
  const unsubscribeToken = newToken();
  const { count } = await prisma.newsletterSubscriber.updateMany({
    where: { id: row.id, confirmTokenHash, status: 'PENDING', confirmExpiresAt: { gt: now } },
    data: { status: 'CONFIRMED', confirmedAt: now, confirmTokenHash: null, confirmExpiresAt: null, unsubscribeTokenHash: hash(unsubscribeToken) },
  });
  if (count !== 1) throw invalidToken();
  return { email: row.email, unsubscribeToken };
}

// Repeating it is fine (200 again): the token stays valid for an already unsubscribed row.
export async function unsubscribe(token: string, now = new Date()): Promise<void> {
  const unsubscribeTokenHash = hash(token);
  const row = await prisma.newsletterSubscriber.findUnique({ where: { unsubscribeTokenHash }, select: { id: true } });
  if (!row) throw invalidToken();
  await prisma.newsletterSubscriber.updateMany({
    where: { id: row.id, status: 'CONFIRMED' },
    data: { status: 'UNSUBSCRIBED', unsubscribedAt: now },
  });
}

// consentAt, not createdAt: a re-subscription keeps the original createdAt and must get its 7 days.
export async function purgePending(now = new Date()): Promise<number> {
  const { count } = await prisma.newsletterSubscriber.deleteMany({
    where: { status: 'PENDING', consentAt: { lt: new Date(now.getTime() - PENDING_KEPT_DAYS * 24 * 60 * MINUTE) } },
  });
  return count;
}

const ROW = { id: true, email: true, status: true, consentAt: true, confirmedAt: true, unsubscribedAt: true, createdAt: true } as const;
export type SubscriberRow = Prisma.NewsletterSubscriberGetPayload<{ select: typeof ROW }>;

export async function listSubscribers(q: { status?: NewsletterStatus; q?: string; take: number; skip: number }): Promise<{ items: SubscriberRow[]; total: number }> {
  const where: Prisma.NewsletterSubscriberWhereInput = {
    ...(q.status && { status: q.status }),
    ...(q.q && { email: { contains: q.q.toLowerCase() } }), // emails are stored lower-cased
  };
  const [items, total] = await Promise.all([
    prisma.newsletterSubscriber.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: q.skip, take: q.take, select: ROW }),
    prisma.newsletterSubscriber.count({ where }),
  ]);
  return { items, total };
}

// Only people who confirmed: the file is what gets imported into the sending service.
export async function exportConfirmed(now = new Date()): Promise<{ filename: string; csv: string }> {
  const rows = await prisma.newsletterSubscriber.findMany({
    where: { status: 'CONFIRMED' },
    orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
    select: { email: true, confirmedAt: true, consentAt: true },
  });
  const csv = toCsv(['email', 'confirmedAt', 'consentAt'], rows.map((r) => [r.email, r.confirmedAt?.toISOString() ?? '', r.consentAt.toISOString()]));
  return { filename: `newsletter-${now.toISOString().slice(0, 10)}.csv`, csv };
}

// A customer's erasure request: the row is gone, not just marked.
export async function deleteSubscriber(id: string): Promise<void> {
  const { count } = await prisma.newsletterSubscriber.deleteMany({ where: { id } });
  if (count === 0) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy người đăng ký');
}
```

- [ ] **Step 2: Type-check**

Run (backend): `npm run typecheck` — Expected: clean.

(Tests for this file are written first in Task 4, Step 1; run them to see failures before wiring the routes.)

---

### Task 4: Routes, controller, worker + tests

**Files:**
- Create: `backend/controllers/newsletter.controller.ts`, `backend/routes/newsletter.route.ts`, `backend/workers/purgePendingSubscribers.ts`
- Modify: `backend/routes/index.ts` (mount `/newsletter`), `backend/bin/www.ts` (start / stop the purge timer next to `sweeper`)
- Test: `backend/test/newsletter.test.ts` (DB-free), `backend/test/db/newsletter.test.ts` (DB)

**Interfaces — consumes:** Task 2 and 3 exports. **Produces:** HTTP endpoints of the spec; `startPendingSubscriberPurge(): NodeJS.Timeout`.

- [ ] **Step 1: Failing DB-free tests** `backend/test/newsletter.test.ts`

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app';
import { bearer, freshIp, tokenFor } from './helpers';

// Newsletter (spec 2026-11-07), the parts that never reach the database: input rules and who may
// use the admin endpoints. Each request uses its own IP so the 5-per-IP limiter stays out of the way.
const post = (path: string, body: unknown) => request(app).post(`/api/v1/newsletter${path}`).set('X-Forwarded-For', freshIp()).send(body as object);

describe('subscribe input', () => {
  it.each([
    ['no consent', { email: 'an@example.com' }],
    ['consent not true', { email: 'an@example.com', consent: 'yes' }],
    ['bad email', { email: 'an@', consent: true }],
    ['email as array', { email: ['an@example.com'], consent: true }],
    ['email too long', { email: `${'a'.repeat(250)}@x.vn`, consent: true }],
  ])('refuses %s with 422', async (_label, body) => {
    const res = await post('/subscribe', body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('token input', () => {
  it.each(['/confirm', '/unsubscribe'])('%s refuses a missing or non-string token with 422', async (path) => {
    expect((await post(path, {})).status).toBe(422);
    expect((await post(path, { token: ['x'] })).status).toBe(422);
  });
});

describe('admin endpoints', () => {
  const admin = [
    ['get', '/api/v1/newsletter/subscribers'],
    ['get', '/api/v1/newsletter/subscribers/export'],
    ['delete', '/api/v1/newsletter/subscribers/abc'],
  ] as const;

  it.each(admin)('%s %s needs a token', async (method, url) => {
    expect((await request(app)[method](url)).status).toBe(401);
  });

  it.each(admin)('%s %s is admin only', async (method, url) => {
    expect((await request(app)[method](url).set(bearer(tokenFor('customer')))).status).toBe(403);
  });

  it('refuses an unknown status filter with 422', async () => {
    const res = await request(app).get('/api/v1/newsletter/subscribers?status=ALL').set(bearer(tokenFor('admin')));
    expect(res.status).toBe(422);
  });
});
```

- [ ] **Step 2: Failing DB tests** `backend/test/db/newsletter.test.ts`

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { siteUrl } from '../../config/env';
import { setMailTransportForTests, type MailMessage } from '../../services/email.service';
import { purgePending } from '../../services/newsletter.service';
import prisma from '../../services/prisma';
import { NEWSLETTER_CONSENT_TEXT } from '../../constants/newsletter';
import { call } from './helpers/http';
import { createAdmin } from './helpers/factories';

// Newsletter signup end to end (spec 2026-11-07). Emails go out without the answer waiting, so the
// test transport tells each test when one has arrived.

const subscribe = (email: string, ip?: string) => {
  const req = call('post', '/api/v1/newsletter/subscribe', { brand: null });
  return (ip ? req.set('X-Forwarded-For', ip) : req).send({ email, consent: true });
};
const confirmToken = (token: string) => call('post', '/api/v1/newsletter/confirm', { brand: null }).send({ token });
const unsubscribeToken = (token: string) => call('post', '/api/v1/newsletter/unsubscribe', { brand: null }).send({ token });
const row = (email: string) => prisma.newsletterSubscriber.findUnique({ where: { email } });
const settle = () => new Promise((r) => setTimeout(r, 100));
const tokenIn = (m: MailMessage) => new URL(/https?:\/\/\S+/.exec(m.text)?.[0] ?? '').searchParams.get('token') ?? '';

function captureMail() {
  const sent: MailMessage[] = [];
  const waiters: (() => void)[] = [];
  setMailTransportForTests({ sendMail: async (m) => { sent.push(m); waiters.splice(0).forEach((w) => w()); } });
  const nth = (n: number) => new Promise<MailMessage>((resolve) => {
    const check = () => (sent.length >= n ? resolve(sent[n - 1]) : waiters.push(check));
    check();
  });
  return { sent, nth };
}

afterEach(() => setMailTransportForTests(null));

describe('double opt-in', () => {
  it('subscribe → confirm → unsubscribe', async () => {
    const mail = captureMail();
    expect((await subscribe('An@Example.com ')).status).toBe(200);
    const confirmMail = await mail.nth(1);
    expect(confirmMail.to).toBe('an@example.com');
    expect(confirmMail.text).toContain(`${siteUrl}/xac-nhan-dang-ky?token=`);
    expect((await row('an@example.com'))?.status).toBe('PENDING');
    expect((await row('an@example.com'))?.consentText).toBe(NEWSLETTER_CONSENT_TEXT);

    expect((await confirmToken(tokenIn(confirmMail))).status).toBe(200);
    const welcome = await mail.nth(2);
    expect(welcome.text).toContain(`${siteUrl}/huy-dang-ky?token=`);
    expect((await row('an@example.com'))?.status).toBe('CONFIRMED');

    expect((await unsubscribeToken(tokenIn(welcome))).status).toBe(200);
    expect((await unsubscribeToken(tokenIn(welcome))).status).toBe(200);
    expect((await row('an@example.com'))?.status).toBe('UNSUBSCRIBED');
  });

  it('answers the same for a new, a pending and a confirmed address', async () => {
    const mail = captureMail();
    const first = await subscribe('b@example.com');
    const m = await mail.nth(1);
    await confirmToken(tokenIn(m));
    await mail.nth(2);
    const confirmed = await subscribe('b@example.com');
    const fresh = await subscribe('c@example.com');
    await mail.nth(3);
    const pending = await subscribe('c@example.com');
    await settle();
    expect([confirmed.body, fresh.body, pending.body]).toEqual([first.body, first.body, first.body]);
    expect(mail.sent).toHaveLength(3); // nothing for the confirmed one, nothing for the quick repeat
  });

  it('resends after 10 minutes with a new link; the old one stops working', async () => {
    const mail = captureMail();
    await subscribe('d@example.com');
    const old = await mail.nth(1);
    await prisma.newsletterSubscriber.update({ where: { email: 'd@example.com' }, data: { confirmSentAt: new Date(Date.now() - 11 * 60 * 1000) } });
    await subscribe('d@example.com');
    const fresh = await mail.nth(2);
    expect((await confirmToken(tokenIn(old))).body.error.code).toBe('INVALID_TOKEN');
    expect((await confirmToken(tokenIn(fresh))).status).toBe(200);
  });

  it('refuses an expired link and a used one', async () => {
    const mail = captureMail();
    await subscribe('e@example.com');
    const m = await mail.nth(1);
    await prisma.newsletterSubscriber.update({ where: { email: 'e@example.com' }, data: { confirmExpiresAt: new Date(Date.now() - 1000) } });
    expect((await confirmToken(tokenIn(m))).body.error.code).toBe('INVALID_TOKEN');

    await subscribe('f@example.com');
    const ok = await mail.nth(2);
    expect((await confirmToken(tokenIn(ok))).status).toBe(200);
    expect((await confirmToken(tokenIn(ok))).body.error.code).toBe('INVALID_TOKEN');
    expect((await unsubscribeToken('not-a-real-token')).body.error.code).toBe('INVALID_TOKEN');
  });

  it('lets someone who unsubscribed subscribe again', async () => {
    const mail = captureMail();
    await subscribe('g@example.com');
    await confirmToken(tokenIn(await mail.nth(1)));
    await unsubscribeToken(tokenIn(await mail.nth(2)));
    await subscribe('g@example.com');
    await confirmToken(tokenIn(await mail.nth(3)));
    expect((await row('g@example.com'))?.status).toBe('CONFIRMED');
  });

  it('creates one row for two signups at the same moment', async () => {
    const mail = captureMail();
    const answers = await Promise.all([subscribe('h@example.com'), subscribe('h@example.com')]);
    await settle();
    expect(answers.map((r) => r.status)).toEqual([200, 200]);
    expect(await prisma.newsletterSubscriber.count({ where: { email: 'h@example.com' } })).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  it('limits signups to 5 per 15 minutes per visitor IP', async () => {
    captureMail();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await subscribe(`r${i}@example.com`, '203.0.113.90')).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });
});

describe('purge', () => {
  it('deletes unconfirmed signups older than 7 days and nothing else', async () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const base = { consentText: NEWSLETTER_CONSENT_TEXT };
    await prisma.newsletterSubscriber.createMany({
      data: [
        { ...base, email: 'old-pending@example.com', status: 'PENDING', consentAt: old },
        { ...base, email: 'new-pending@example.com', status: 'PENDING', consentAt: new Date() },
        { ...base, email: 'old-confirmed@example.com', status: 'CONFIRMED', consentAt: old },
      ],
    });
    expect(await purgePending()).toBe(1);
    expect((await prisma.newsletterSubscriber.findMany({ select: { email: true }, orderBy: { email: 'asc' } })).map((r) => r.email)).toEqual([
      'new-pending@example.com',
      'old-confirmed@example.com',
    ]);
  });
});

describe('admin', () => {
  async function seed() {
    const base = { consentText: NEWSLETTER_CONSENT_TEXT, consentAt: new Date() };
    await prisma.newsletterSubscriber.createMany({
      data: [
        { ...base, email: 'p1@example.com', status: 'PENDING' },
        { ...base, email: 'c1@example.com', status: 'CONFIRMED', confirmedAt: new Date() },
        { ...base, email: '=cmd@example.com', status: 'CONFIRMED', confirmedAt: new Date() },
        { ...base, email: 'u1@example.com', status: 'UNSUBSCRIBED' },
      ],
    });
    return (await createAdmin()).token;
  }

  it('lists with a status filter, search and pagination, without token hashes', async () => {
    const token = await seed();
    const confirmed = await call('get', '/api/v1/newsletter/subscribers?status=CONFIRMED', { token, brand: null });
    expect(confirmed.body.data.map((r: { email: string }) => r.email).sort()).toEqual(['=cmd@example.com', 'c1@example.com']);
    expect(confirmed.body.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
    expect(JSON.stringify(confirmed.body)).not.toMatch(/TokenHash/);
    const search = await call('get', '/api/v1/newsletter/subscribers?q=P1', { token, brand: null });
    expect(search.body.data.map((r: { email: string }) => r.email)).toEqual(['p1@example.com']);
    const paged = await call('get', '/api/v1/newsletter/subscribers?pageSize=1&page=2', { token, brand: null });
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta.total).toBe(4);
  });

  it('exports only confirmed people, formula-safe', async () => {
    const token = await seed();
    const res = await call('get', '/api/v1/newsletter/subscribers/export', { token, brand: null });
    expect(res.body.data.filename).toMatch(/^newsletter-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = (res.body.data.csv as string).replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('"email","confirmedAt","consentAt"');
    expect(lines.slice(1).map((l) => l.split(',')[0]).sort()).toEqual(['"\'=cmd@example.com"', '"c1@example.com"']);
  });

  it('deletes one subscriber, 404 for an unknown id', async () => {
    const token = await seed();
    const target = await row('u1@example.com');
    expect((await call('delete', `/api/v1/newsletter/subscribers/${target?.id}`, { token, brand: null })).status).toBe(204);
    expect(await row('u1@example.com')).toBeNull();
    expect((await call('delete', `/api/v1/newsletter/subscribers/${target?.id}`, { token, brand: null })).status).toBe(404);
  });
});
```

- [ ] **Step 3: Run both, expect failure**

Run (backend): `npx vitest run test/newsletter.test.ts` → FAIL (404 for every route).
Run (backend): `npm run test:db -- test/db/newsletter.test.ts` → FAIL (404).

- [ ] **Step 4: Implement controller** `backend/controllers/newsletter.controller.ts`

```ts
import type { Request, Response } from 'express';
import type { NewsletterStatus } from '@prisma/client';
import { siteUrl } from '../config/env';
import { ADMIN_MAX_PAGE_SIZE, ADMIN_PAGE_SIZE, SUBSCRIBE_MESSAGE } from '../constants/newsletter';
import { sendNewsletterConfirm, sendNewsletterWelcome } from '../services/email.service';
import * as newsletter from '../services/newsletter.service';
import asyncHandler from '../utils/asyncHandler';
import { logger } from '../utils/logger';
import parsePagination from '../utils/pagination';
import sendSuccess from '../utils/ApiResponse';

// Newsletter signup (spec 2026-11-07). Emails go out without the answer waiting for them: if it
// waited for SMTP, a new address would answer measurably slower than a subscribed one. A failure is
// logged by error name only — the links in these emails act on the subscription.
const logMailFailure = (what: string) => (err: unknown) => {
  logger.error({ errorName: err instanceof Error ? err.name : 'unknown error' }, `${what} email failed`);
};

export const subscribe = asyncHandler(async (req: Request, res: Response) => {
  const email = req.body.email as string;
  const outcome = await newsletter.subscribe(email);
  if (outcome.send) {
    void sendNewsletterConfirm(email, `${siteUrl}/xac-nhan-dang-ky?token=${outcome.confirmToken}`).catch(logMailFailure('newsletter confirm'));
  }
  sendSuccess(res, { message: SUBSCRIBE_MESSAGE });
});

export const confirm = asyncHandler(async (req: Request, res: Response) => {
  const { email, unsubscribeToken } = await newsletter.confirm(req.body.token as string);
  void sendNewsletterWelcome(email, `${siteUrl}/huy-dang-ky?token=${unsubscribeToken}`).catch(logMailFailure('newsletter welcome'));
  sendSuccess(res, { confirmed: true });
});

export const unsubscribe = asyncHandler(async (req: Request, res: Response) => {
  await newsletter.unsubscribe(req.body.token as string);
  sendSuccess(res, { unsubscribed: true });
});

export const list = asyncHandler(async (req: Request, res: Response) => {
  const { page, take, skip } = parsePagination(req.query, ADMIN_PAGE_SIZE, ADMIN_MAX_PAGE_SIZE);
  const status = req.query.status ? (req.query.status as NewsletterStatus) : undefined;
  const q = typeof req.query.q === 'string' && req.query.q !== '' ? req.query.q : undefined;
  const { items, total } = await newsletter.listSubscribers({ status, q, take, skip });
  sendSuccess(res, items, { page, pageSize: take, total });
});

export const exportCsv = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await newsletter.exportConfirmed());
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await newsletter.deleteSubscriber(req.params.id as string);
  res.status(204).end();
});
```
(Check how other controllers answer 204 — `grep -rn "status(204)" backend/controllers` — and use the same form.)

- [ ] **Step 5: Implement routes** `backend/routes/newsletter.route.ts`

```ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { body, query } from 'express-validator';
import { ipBucket } from '../middlewares/rateLimitKeys';
import authenticate from '../middlewares/authenticate';
import requireRole from '../middlewares/requireRole';
import validate from '../middlewares/validate';
import ApiError from '../utils/ApiError';
import * as ctrl from '../controllers/newsletter.controller';

const router = Router();

// Each public endpoint has its own bucket per visitor IP (the BFF relays the real IP): signups send
// an email, so they get the tightest limit; confirm / unsubscribe only guard against token guessing.
const limiter = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipBucket,
    handler: (_req, _res, next) => {
      next(new ApiError(429, 'RATE_LIMITED', 'Bạn thử quá nhiều lần. Vui lòng thử lại sau 15 phút.'));
    },
  });

// Lower-cased and trimmed, but not normalizeEmail(): that strips Gmail dots and "+tags", and the
// address someone typed is the one they expect mail at.
const emailRule = body('email')
  .not().isArray().withMessage('Email không hợp lệ').bail()
  .isString().withMessage('Email không hợp lệ').bail()
  .trim().toLowerCase()
  .isLength({ max: 254 }).withMessage('Email không hợp lệ').bail()
  .isEmail().withMessage('Email không hợp lệ');
const consentRule = body('consent').custom((v) => v === true).withMessage('Cần đồng ý nhận email');
const tokenRule = body('token').isString().withMessage('Link không hợp lệ').bail().isLength({ min: 1, max: 200 }).withMessage('Link không hợp lệ');

router.post('/subscribe', limiter(5), [emailRule, consentRule, validate], ctrl.subscribe);
router.post('/confirm', limiter(10), [tokenRule, validate], ctrl.confirm);
router.post('/unsubscribe', limiter(10), [tokenRule, validate], ctrl.unsubscribe);

router.use('/subscribers', authenticate, requireRole('admin'));
router.get(
  '/subscribers',
  [
    query('status').optional({ values: 'falsy' }).isIn(['PENDING', 'CONFIRMED', 'UNSUBSCRIBED']).withMessage('Trạng thái không hợp lệ'),
    query('q').optional({ values: 'falsy' }).isString().trim().isLength({ min: 2, max: 100 }).withMessage('Từ khoá 2–100 ký tự'),
    validate,
  ],
  ctrl.list,
);
router.get('/subscribers/export', ctrl.exportCsv);
router.delete('/subscribers/:id', ctrl.remove);

export default router;
```

Mount in `backend/routes/index.ts`: `import newsletterRoute from './newsletter.route';` and `router.use('/newsletter', newsletterRoute);` after `/contact`.

Note: express-validator writes sanitized values back to `req.body`/`req.query` only where Express allows it; Express 5 `req.query` is a getter. If `q` arrives untrimmed in the controller, trim it there (`req.query.q.trim()`); check with the search test.

- [ ] **Step 6: Implement the purge worker** `backend/workers/purgePendingSubscribers.ts`

```ts
import { purgePending } from '../services/newsletter.service';
import { logger } from '../utils/logger';

// Deletes newsletter signups nobody confirmed within 7 days (spec 2026-11-07): an address is not
// kept for someone who never agreed. Hourly is plenty — the limit is in days. Same shape as
// startExpiredOrderSweeper: errors are logged, never thrown out of the timer (that would kill the
// process), and unref() lets scripts exit.
const PURGE_INTERVAL_MINUTES = 60;

export function startPendingSubscriberPurge(): NodeJS.Timeout {
  const run = () => {
    purgePending()
      .then((n) => {
        if (n > 0) logger.info({ purged: n }, `[newsletter] Đã xoá ${n} đăng ký chưa xác nhận`);
      })
      .catch((err: Error) => logger.error({ err }, '[newsletter] Lỗi khi xoá đăng ký chưa xác nhận'));
  };
  run();
  const timer = setInterval(run, PURGE_INTERVAL_MINUTES * 60 * 1000);
  timer.unref();
  return timer;
}

export default { startPendingSubscriberPurge };
```

In `backend/bin/www.ts`: import it, `const newsletterPurge = startPendingSubscriberPurge();` next to `const sweeper = …`, and `clearInterval(newsletterPurge);` next to `clearInterval(sweeper);`.

- [ ] **Step 7: Run, expect pass**

Run (backend): `npm run typecheck && npm test && npm run test:db`
Expected: clean; all DB-free tests pass (290 + new); all DB tests pass (329 + new).

- [ ] **Step 8: Propose commit** `add newsletter signup api` (Tasks 1–4 files together: schema, migration, constants, csv, email, service, controller, route, worker, tests)

---

### Task 5: Frontend lib + BFF relays

**Files:**
- Modify: `frontend-petshop/lib/forms.ts` (line ~29: `function emailError` → `export function emailError`)
- Create: `frontend-petshop/lib/newsletter.ts`, `frontend-petshop/app/api/newsletter/subscribe/route.ts`, `.../confirm/route.ts`, `.../unsubscribe/route.ts`
- Modify: `frontend-petshop/lib/types.ts` (add `NewsletterSubscriber`)
- Test: `frontend-petshop/test/newsletter.test.ts`

**Interfaces — produces:**
```ts
NEWSLETTER_CONSENT_TEXT: string
validateNewsletter(v: { email: string }): FieldErrors
subscribeBody(b: Record<string, unknown>): { email: unknown; consent: true }
tokenBody(b: Record<string, unknown>): { token: unknown }
NEWSLETTER_TABS, type NewsletterTab, type NewsletterQuery = { tab; q; page }
parseNewsletterQuery(sp: URLSearchParams): NewsletterQuery
newsletterHref(s: Partial<NewsletterQuery>): string
newsletterApiPath(s: NewsletterQuery): string
NEWSLETTER_PAGE_SIZE = 20
// lib/types.ts
interface NewsletterSubscriber { id: string; email: string; status: 'PENDING' | 'CONFIRMED' | 'UNSUBSCRIBED'; consentAt: string; confirmedAt: string | null; unsubscribedAt: string | null; createdAt: string }
```

- [ ] **Step 1: Failing test** `frontend-petshop/test/newsletter.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { newsletterApiPath, newsletterHref, parseNewsletterQuery, subscribeBody, tokenBody, validateNewsletter } from '../lib/newsletter';

describe('validateNewsletter', () => {
  it('needs a plausible email', () => {
    expect(validateNewsletter({ email: '' })).toEqual({ email: 'Nhập email' });
    expect(validateNewsletter({ email: 'an@' })).toEqual({ email: 'Email không hợp lệ' });
    expect(validateNewsletter({ email: ' an@example.com ' })).toEqual({});
  });
});

describe('BFF bodies', () => {
  it('relays only the email and always sends consent: the form shows the sentence', () => {
    expect(subscribeBody({ email: 'an@example.com', role: 'admin' })).toEqual({ email: 'an@example.com', consent: true });
  });

  it('relays only the token', () => {
    expect(tokenBody({ token: 'abc', email: 'x' })).toEqual({ token: 'abc' });
  });
});

describe('admin URL state', () => {
  it('defaults to confirmed, page 1, no search', () => {
    expect(parseNewsletterQuery(new URLSearchParams())).toEqual({ tab: 'confirmed', q: '', page: 1 });
    expect(newsletterHref({ tab: 'confirmed', page: 1 })).toBe('/admin/dang-ky-nhan-tin');
  });

  it('round-trips tab, search and page', () => {
    const q = parseNewsletterQuery(new URLSearchParams('tab=pending&q=gmail&page=3'));
    expect(q).toEqual({ tab: 'pending', q: 'gmail', page: 3 });
    expect(newsletterHref(q)).toBe('/admin/dang-ky-nhan-tin?tab=pending&q=gmail&page=3');
    expect(newsletterApiPath(q)).toBe('/newsletter/subscribers?page=3&pageSize=20&status=PENDING&q=gmail');
  });

  it('drops a one-letter search (the backend wants 2+) and unknown tabs', () => {
    const q = parseNewsletterQuery(new URLSearchParams('tab=x&q=a'));
    expect(newsletterApiPath(q)).toBe('/newsletter/subscribers?page=1&pageSize=20&status=CONFIRMED');
    expect(newsletterApiPath({ tab: 'all', q: '', page: 1 })).toBe('/newsletter/subscribers?page=1&pageSize=20');
  });
});
```

- [ ] **Step 2: Run, expect failure** — (frontend) `npx vitest run test/newsletter.test.ts` → FAIL, module missing.

- [ ] **Step 3: Implement** `frontend-petshop/lib/newsletter.ts`

```ts
import { emailError, type FieldErrors } from './forms';

// Newsletter signup (spec 2026-11-07, test/newsletter.test.ts).

// Shown under the footer form. The backend keeps its own copy as proof of consent
// (backend/constants/newsletter.ts NEWSLETTER_CONSENT_TEXT): change both together.
export const NEWSLETTER_CONSENT_TEXT =
  'Bằng việc đăng ký, bạn đồng ý nhận email mẹo chăm sóc và ưu đãi từ Siêu thị của chó mèo. Huỷ bất cứ lúc nào.';

export function validateNewsletter(v: { email: string }): FieldErrors {
  const email = emailError(v.email);
  return email ? { email } : {};
}

// What the BFF relays: nothing beyond the fields the backend reads. Consent is the act of
// submitting the form that shows the sentence, so the relay states it.
export const subscribeBody = (b: Record<string, unknown>) => ({ email: b.email, consent: true as const });
export const tokenBody = (b: Record<string, unknown>) => ({ token: b.token });

// /admin/dang-ky-nhan-tin URL state.
export const NEWSLETTER_TABS = [
  { key: 'confirmed', label: 'Đã xác nhận', status: 'CONFIRMED' },
  { key: 'pending', label: 'Chờ xác nhận', status: 'PENDING' },
  { key: 'unsubscribed', label: 'Đã huỷ', status: 'UNSUBSCRIBED' },
  { key: 'all', label: 'Tất cả', status: null },
] as const;
export type NewsletterTab = (typeof NEWSLETTER_TABS)[number]['key'];
export type NewsletterQuery = { tab: NewsletterTab; q: string; page: number };
export const NEWSLETTER_PAGE_SIZE = 20;
const BASE = '/admin/dang-ky-nhan-tin';

export function parseNewsletterQuery(sp: URLSearchParams): NewsletterQuery {
  const page = Number(sp.get('page'));
  return {
    tab: NEWSLETTER_TABS.find((t) => t.key === sp.get('tab'))?.key ?? 'confirmed',
    q: (sp.get('q') ?? '').trim().slice(0, 100),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function newsletterHref(s: Partial<NewsletterQuery>): string {
  const p = new URLSearchParams();
  if (s.tab && s.tab !== 'confirmed') p.set('tab', s.tab);
  if (s.q) p.set('q', s.q);
  if (s.page && s.page > 1) p.set('page', String(s.page));
  const qs = p.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function newsletterApiPath(s: NewsletterQuery): string {
  const p = new URLSearchParams({ page: String(s.page), pageSize: String(NEWSLETTER_PAGE_SIZE) });
  const status = NEWSLETTER_TABS.find((t) => t.key === s.tab)?.status;
  if (status) p.set('status', status);
  if (s.q.length >= 2) p.set('q', s.q);
  return `/newsletter/subscribers?${p}`;
}
```

BFF route `frontend-petshop/app/api/newsletter/subscribe/route.ts`:
```ts
import { relayPublic } from '../../../../lib/bff/session';
import { subscribeBody } from '../../../../lib/newsletter';
import { badRequest, readJson, rejectCrossOrigin, requestContext, sessionJar, toResponse } from '../../../../lib/server/bff';

// Footer newsletter form. The backend answers the same for every address and limits signups per
// visitor IP (5 / 15 min), which reaches it through relayPublic's X-Client-IP.
export async function POST(request: Request) {
  const blocked = rejectCrossOrigin(request);
  if (blocked) return blocked;
  const b = await readJson(request);
  if (b === null || typeof b !== 'object') return badRequest();
  return toResponse(await relayPublic(await sessionJar(), { path: '/newsletter/subscribe', method: 'POST', body: subscribeBody(b as Record<string, unknown>) }, await requestContext()));
}
```
`confirm/route.ts` and `unsubscribe/route.ts`: the same file with `tokenBody`, path `/newsletter/confirm` / `/newsletter/unsubscribe`, and the comment "Opened from the emailed link; only the token is relayed."

Add to `lib/types.ts` the `NewsletterSubscriber` interface from the Interfaces block.

- [ ] **Step 4: Run, expect pass** — (frontend) `npx vitest run test/newsletter.test.ts test/forms.test.ts && npm run typecheck && npm run lint` → PASS, clean.

---

### Task 6: Footer form

**Files:**
- Create: `frontend-petshop/components/layout/NewsletterForm.tsx`
- Modify: `frontend-petshop/components/layout/CommunityBand.tsx` (whole component body), `frontend-petshop/components/layout/SiteFooter.tsx` (the `<footer className=…>` gradient condition)

**Interfaces — consumes:** `validateNewsletter`, `NEWSLETTER_CONSENT_TEXT`, `bffFetch`, `fieldErrors`, `focusFirstError`, `TextField`, `Customer`.

- [ ] **Step 1: Implement** `NewsletterForm.tsx`

```tsx
'use client';

import { useRef, useState, type FormEvent } from 'react';
import { bffFetch } from '../../lib/bffClient';
import { fieldErrors, focusFirstError, type FieldErrors } from '../../lib/forms';
import { NEWSLETTER_CONSENT_TEXT, validateNewsletter } from '../../lib/newsletter';
import type { Customer } from '../../lib/types';

// Footer signup (spec 2026-11-07). A signed-in customer's email is filled in on the first focus of
// the empty input — not on page load: the band is on every page and most visitors are not signed in.
export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const askedMe = useRef(false);

  async function prefill() {
    if (askedMe.current || email) return;
    askedMe.current = true;
    const me = await bffFetch<Customer>('/api/auth/me');
    if (me.ok) setEmail((current) => current || me.data.email);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    const clientErrors = validateNewsletter({ email });
    setErrors(clientErrors);
    setAlert(null);
    if (Object.keys(clientErrors).length > 0) return focusFirstError(formEl, clientErrors);
    setSubmitting(true);
    const res = await bffFetch<{ message: string }>('/api/newsletter/subscribe', { method: 'POST', body: { email: email.trim() } });
    setSubmitting(false);
    if (res.ok) return setDone(res.data.message);
    if (res.error.code === 'VALIDATION_ERROR') {
      const serverErrors = fieldErrors(res.error.details);
      setErrors(serverErrors);
      focusFirstError(formEl, serverErrors);
    } else setAlert(res.error.message ?? 'Chưa đăng ký được, vui lòng thử lại.');
  }

  if (done) return <p role="status" className="rounded-card bg-white/15 px-4 py-3 font-bold text-white">{done} Không thấy thư? Kiểm tra cả mục Thư rác / Quảng cáo.</p>;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 md:flex-row">
        <label htmlFor="f-newsletter-email" className="sr-only">Email nhận tin</label>
        <input
          id="f-newsletter-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="send"
          placeholder="Email của bạn"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => void prefill()}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'f-newsletter-email-error' : 'newsletter-consent'}
          className="min-h-12 w-full min-w-0 rounded-full border-0 px-5 text-base text-ink md:w-72"
        />
        <button type="submit" disabled={submitting} className="min-h-12 w-full shrink-0 whitespace-nowrap rounded-full bg-yellow px-6 font-bold text-ink hover:brightness-95 active:brightness-90 disabled:opacity-60 md:w-auto">
          {submitting ? 'Đang gửi…' : 'Đăng ký'}
        </button>
      </div>
      {errors.email && <p id="f-newsletter-email-error" className="text-sm font-bold text-yellow">{errors.email}</p>}
      {alert && <p role="alert" className="text-sm font-bold text-yellow">{alert}</p>}
      <p id="newsletter-consent" className="text-sm text-white/85">{NEWSLETTER_CONSENT_TEXT}</p>
    </form>
  );
}
```
(Check `focusFirstError` finds the input by `name` — `grep -n "focusFirstError" -A8 lib/forms.ts`; if it looks up `#f-<name>`, the id above matches only when name is `newsletter-email`: then use `name="newsletter-email"`… no — keep `name="email"` (the server error path is `email`) and confirm the lookup is by `[name=…]`; adjust the id to `f-email` if it is by id.)

- [ ] **Step 2: Rewrite the body of `CommunityBand`** (keep `socialName`, `communityLinks`)

```tsx
// Wireframe's newsletter band (spec 2026-11-07): always shown, with the email signup; the shop's
// Zalo / social pages follow as smaller buttons when set.
export function CommunityBand({ shop }: { shop: ShopInfo }) {
  const links = communityLinks(shop);
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6">
      <section aria-labelledby="community-title" className="grid items-center gap-4 rounded-panel bg-brand-ink p-6 text-white md:grid-cols-[120px_1fr] md:p-8 lg:grid-cols-[120px_1fr_auto]">
        <span aria-hidden="true" className="hidden aspect-square place-items-center rounded-card bg-white/20 text-5xl md:row-span-2 md:grid lg:row-span-1">🐾</span>
        <div>
          <h2 id="community-title" className="text-xl leading-[1.3] font-extrabold text-white">Gia nhập cộng đồng yêu thú cưng!</h2>
          <p className="mt-1 text-white/90">Nhận mẹo chăm sóc và ưu đãi mới nhất qua email.</p>
        </div>
        <div className="flex flex-col gap-3">
          <NewsletterForm />
          {links.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Theo dõi cửa hàng">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-full border border-white/60 px-4 text-sm font-bold text-white hover:bg-white/10">{l.label}</a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
```
Replace the file's top comment ("There is no newsletter API … Hidden when none is set.") with the one above; import `NewsletterForm`.

In `SiteFooter.tsx`, the band is now always there: replace the conditional `className` with the gradient one and drop the now-unused `communityLinks` import:
```tsx
    // The mint starts halfway down the community band (wireframe).
    <footer className="mt-12 bg-[linear-gradient(to_bottom,var(--surface)_3.5rem,var(--mint-soft)_3.5rem)]">
```

- [ ] **Step 3: Check** — (frontend) `npm run typecheck && npm run lint && npm test` → clean / pass. Browser check in Task 9.

---

### Task 7: Confirm and unsubscribe pages

**Files:**
- Create: `frontend-petshop/components/newsletter/ConfirmSubscription.tsx`, `frontend-petshop/components/newsletter/UnsubscribeButton.tsx`, `frontend-petshop/app/xac-nhan-dang-ky/page.tsx`, `frontend-petshop/app/huy-dang-ky/page.tsx`
- Modify: `frontend-petshop/lib/seo/robots.ts:6` (`PRIVATE_PATHS` += `'/xac-nhan-dang-ky', '/huy-dang-ky'`)
- Test: `frontend-petshop/test/seo.test.ts` (append, or wherever `PRIVATE_PATHS` / `buildRobots` is asserted — `grep -rn "dat-lai-mat-khau" test`)

- [ ] **Step 1: Failing test** — next to the existing robots assertion:
```ts
it('keeps the newsletter confirm / unsubscribe pages out of search', () => {
  expect(PRIVATE_PATHS).toEqual(expect.arrayContaining(['/xac-nhan-dang-ky', '/huy-dang-ky']));
});
```
Run (frontend) the file → FAIL.

- [ ] **Step 2: Implement**

`ConfirmSubscription.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { bffFetch } from '../../lib/bffClient';

type State = 'working' | 'done' | 'invalid' | 'error';

// Confirms on arrival: opening the emailed link is the confirmation. The ref keeps React's
// development double-run from spending the single-use token twice.
export function ConfirmSubscription({ token }: { token: string }) {
  const [state, setState] = useState<State>(token ? 'working' : 'invalid');
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    bffFetch('/api/newsletter/confirm', { method: 'POST', body: { token } }).then((res) => {
      setState(res.ok ? 'done' : res.error.code === 'INVALID_TOKEN' || res.error.code === 'VALIDATION_ERROR' ? 'invalid' : 'error');
    });
  }, [token]);

  if (state === 'working') return <p aria-busy="true" className="text-muted">Đang xác nhận…</p>;
  if (state === 'done') return (
    <div role="status" className="flex flex-col gap-3 rounded-panel bg-mint p-5 text-brand-deep">
      <p className="font-bold">Đăng ký thành công! Bạn sẽ nhận mẹo chăm sóc và ưu đãi qua email.</p>
      <Link href="/" className="inline-flex min-h-11 items-center self-start font-bold text-brand-ink underline">Về trang chủ</Link>
    </div>
  );
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-panel bg-pink-bg p-5 text-pink-ink">
      <p className="font-bold">{state === 'invalid' ? 'Link không hợp lệ hoặc đã hết hạn (48 giờ).' : 'Chưa xác nhận được, vui lòng tải lại trang.'}</p>
      {state === 'invalid' && <p className="text-sm">Bạn có thể đăng ký lại bằng ô email ở cuối trang.</p>}
    </div>
  );
}
```

`UnsubscribeButton.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { bffFetch } from '../../lib/bffClient';

// A click, not the page load, unsubscribes: mail scanners open links in emails on their own and
// must not unsubscribe people.
export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'invalid' | 'error'>(token ? 'idle' : 'invalid');

  async function onClick() {
    setState('working');
    const res = await bffFetch('/api/newsletter/unsubscribe', { method: 'POST', body: { token } });
    setState(res.ok ? 'done' : res.error.code === 'INVALID_TOKEN' || res.error.code === 'VALIDATION_ERROR' ? 'invalid' : 'error');
  }

  if (state === 'done') return <p role="status" className="rounded-panel bg-mint p-5 font-bold text-brand-deep">Bạn đã huỷ đăng ký. Chúng tôi sẽ không gửi thêm email nhận tin.</p>;
  if (state === 'invalid') return <p role="alert" className="rounded-panel bg-pink-bg p-5 font-bold text-pink-ink">Link huỷ đăng ký không hợp lệ.</p>;
  return (
    <div className="flex flex-col gap-3">
      <p>Bạn sẽ không nhận email mẹo chăm sóc và ưu đãi nữa.</p>
      {state === 'error' && <p role="alert" className="text-sm font-bold text-pink-ink">Chưa huỷ được, vui lòng thử lại.</p>}
      <button type="button" onClick={() => void onClick()} disabled={state === 'working'} className="min-h-12 w-full rounded-full bg-brand-ink px-6 font-bold text-white hover:bg-brand-deep disabled:opacity-60 md:w-auto md:self-start">
        {state === 'working' ? 'Đang huỷ…' : 'Huỷ đăng ký'}
      </button>
    </div>
  );
}
```

`app/xac-nhan-dang-ky/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { ConfirmSubscription } from '../../components/newsletter/ConfirmSubscription';

// Private page reached from the confirmation email. The token is in the URL: no Referer leaves the
// page and it stays out of search results.
export const metadata: Metadata = { title: 'Xác nhận đăng ký nhận tin', robots: { index: false, follow: false }, referrer: 'no-referrer' };

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function ConfirmSubscriptionPage({ searchParams }: Props) {
  const { token } = await searchParams;
  return (
    <main id="main" className="mx-auto w-full max-w-md px-4 py-8 md:px-6">
      <h1 className="mb-6 text-2xl leading-[1.3] font-extrabold">Xác nhận đăng ký nhận tin</h1>
      <ConfirmSubscription token={typeof token === 'string' ? token : ''} />
    </main>
  );
}
```
`app/huy-dang-ky/page.tsx`: same shape, title "Huỷ đăng ký nhận tin", comment "…reached from the welcome email…", body `<UnsubscribeButton token={…} />`.

(The reset page reads `searchParams` in a Server Component, so no `<Suspense>` is needed here either.)

- [ ] **Step 3: Run** — (frontend) `npm test && npm run typecheck && npm run lint` → pass.

- [ ] **Step 4: Propose commit** `add newsletter form and pages` (Tasks 5–7 files)

---

### Task 8: Admin page

**Files:**
- Create: `frontend-petshop/components/admin/newsletter/SubscribersManager.tsx`, `frontend-petshop/components/admin/newsletter/SubscriberCard.tsx`, `frontend-petshop/app/admin/dang-ky-nhan-tin/page.tsx`
- Modify: `frontend-petshop/lib/adminNav.ts` (`ADMIN_NAV`, after "Tin nhắn liên hệ")
- Test: `frontend-petshop/test/adminNav.test.ts` (append)

- [ ] **Step 1: Failing test** (append to adminNav.test.ts)
```ts
it('lists the newsletter page and owns its URL', () => {
  expect(isNavReady('/admin/dang-ky-nhan-tin')).toBe(true);
  expect(activeNavItem('/admin/dang-ky-nhan-tin')?.label).toBe('Đăng ký nhận tin');
});
```
Run → FAIL.

- [ ] **Step 2: Implement**

`lib/adminNav.ts`, after the contacts entry:
```ts
  { href: '/admin/dang-ky-nhan-tin', label: 'Đăng ký nhận tin', icon: '📮', ready: true },
```

`SubscriberCard.tsx`:
```tsx
'use client';

import type { NewsletterSubscriber } from '../../../lib/types';

const STATUS = { PENDING: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', UNSUBSCRIBED: 'Đã huỷ' } as const;
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

// One subscriber. The email is typed by the visitor: shown as text, broken anywhere so a long
// address never widens the page.
export function SubscriberCard({ s, busy, onDelete }: { s: NewsletterSubscriber; busy: boolean; onDelete: (s: NewsletterSubscriber) => void }) {
  return (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <h2 className="text-base leading-[1.4] font-extrabold break-all">{s.email}</h2>
        <p className="text-sm text-muted">
          <b className="text-ink">{STATUS[s.status]}</b> · Đồng ý {date(s.consentAt)}
          {s.confirmedAt && ` · Xác nhận ${date(s.confirmedAt)}`}
          {s.unsubscribedAt && ` · Huỷ ${date(s.unsubscribedAt)}`}
        </p>
      </div>
      <button type="button" disabled={busy} onClick={() => onDelete(s)} className="inline-flex min-h-11 shrink-0 items-center self-start rounded-full border border-pink-ink px-4 text-sm font-bold text-pink-ink disabled:opacity-60 md:self-auto">Xoá</button>
    </article>
  );
}
```
(A card list at every width, as the contacts inbox: three short fields fit a row from `md`, so no separate table.)

`SubscribersManager.tsx`:
```tsx
'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { authFetch } from '../../../lib/adminAuth';
import { NEWSLETTER_PAGE_SIZE, NEWSLETTER_TABS, newsletterApiPath, newsletterHref, parseNewsletterQuery, type NewsletterTab } from '../../../lib/newsletter';
import type { NewsletterSubscriber, PageMeta } from '../../../lib/types';
import { Pagination } from '../../ui/Pagination';
import { AdminTabs } from '../AdminTabs';
import { SubscriberCard } from './SubscriberCard';

type Page = { state: 'loading' } | { state: 'error' } | { state: 'ready'; rows: NewsletterSubscriber[]; total: number };

async function loadList(key: string): Promise<{ key: string; page: Page }> {
  const res = await authFetch<NewsletterSubscriber[]>(newsletterApiPath(parseNewsletterQuery(new URLSearchParams(key))));
  const page: Page = res.error || !res.data ? { state: 'error' } : { state: 'ready', rows: res.data, total: (res.meta as PageMeta | null)?.total ?? res.data.length };
  return { key, page };
}

// /admin/dang-ky-nhan-tin (spec 2026-11-07): subscribers by status, email search, CSV export of the
// confirmed ones for the sending service, delete on a customer's request.
export function SubscribersManager() {
  const router = useRouter();
  const key = useSearchParams().toString();
  const query = parseNewsletterQuery(new URLSearchParams(key));
  const [list, setList] = useState<{ key: string; page: Page } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    loadList(key).then((next) => active && setList(next));
    return () => {
      active = false;
    };
  }, [key]);

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = String(new FormData(e.currentTarget).get('q') ?? '').trim();
    router.push(newsletterHref({ ...query, q, page: 1 }), { scroll: false });
  }

  async function onExport() {
    setBusy(true);
    const res = await authFetch<{ filename: string; csv: string }>('/newsletter/subscribers/export');
    setBusy(false);
    if (res.error || !res.data) return setNotice({ ok: false, text: res.error?.message || 'Chưa xuất được danh sách.' });
    const url = URL.createObjectURL(new Blob([res.data.csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onDelete(s: NewsletterSubscriber) {
    if (!window.confirm(`Xoá ${s.email} khỏi danh sách nhận tin? Không hoàn tác được.`)) return;
    setBusy(true);
    const res = await authFetch(`/newsletter/subscribers/${s.id}`, { method: 'DELETE' });
    setBusy(false);
    if (res.error) return setNotice({ ok: false, text: res.error.message || 'Chưa xoá được.' });
    setNotice({ ok: true, text: `Đã xoá ${s.email}.` });
    setList(await loadList(key));
  }

  const page: Page = list && list.key === key ? list.page : { state: 'loading' };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl leading-[1.3] font-extrabold">Đăng ký nhận tin</h1>
        <button type="button" disabled={busy} onClick={() => void onExport()} className="inline-flex min-h-11 items-center rounded-full bg-brand-ink px-5 font-bold text-white disabled:opacity-60">Xuất CSV (đã xác nhận)</button>
      </div>
      <AdminTabs label="Lọc theo trạng thái" tabs={NEWSLETTER_TABS.map((t) => ({ key: t.key, label: t.label }))} current={query.tab} onSelect={(tab) => router.push(newsletterHref({ ...query, tab: tab as NewsletterTab, page: 1 }), { scroll: false })} />
      <form onSubmit={onSearch} role="search" className="flex flex-col gap-2 md:flex-row">
        <label htmlFor="f-q" className="sr-only">Tìm email</label>
        <input id="f-q" name="q" type="search" defaultValue={query.q} key={query.q} placeholder="Tìm email (từ 2 ký tự)" enterKeyHint="search" className="min-h-11 w-full rounded-full border border-line px-4 text-base md:w-80" />
        <button type="submit" className="min-h-11 rounded-full border border-brand-ink px-5 font-bold text-brand-ink">Tìm</button>
      </form>
      {notice && <p role="status" className={notice.ok ? 'text-sm font-bold text-brand-ink' : 'rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink'}>{notice.text}</p>}
      {page.state === 'loading' && <div aria-busy="true" aria-label="Đang tải danh sách" className="h-48 animate-pulse rounded-card bg-surface" />}
      {page.state === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card bg-pink-bg px-4 py-3 text-sm text-pink-ink">
          Chưa tải được danh sách.
          <button type="button" onClick={() => loadList(key).then(setList)} className="min-h-11 rounded-full border border-pink-ink px-4 font-bold">Thử lại</button>
        </div>
      )}
      {page.state === 'ready' &&
        (page.rows.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-4 text-muted">{query.q ? 'Không có email nào khớp.' : 'Chưa có ai trong mục này. Khách đăng ký ở khối cuối trang.'}</p>
        ) : (
          <div className="flex flex-col gap-3">{page.rows.map((s) => <SubscriberCard key={s.id} s={s} busy={busy} onDelete={(x) => void onDelete(x)} />)}</div>
        ))}
      <Pagination page={query.page} totalPages={Math.ceil((page.state === 'ready' ? page.total : 0) / NEWSLETTER_PAGE_SIZE)} hrefFor={(p) => newsletterHref({ ...query, page: p })} />
    </div>
  );
}
```
(No `X-Brand-Slug`: newsletter is not brand-scoped. Confirm `AdminTabs` and `Pagination` props match their use in `ContactsManager`.)

`app/admin/dang-ky-nhan-tin/page.tsx`:
```tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SubscribersManager } from '../../../components/admin/newsletter/SubscribersManager';

export const metadata: Metadata = { title: 'Đăng ký nhận tin' };

// useSearchParams needs a Suspense boundary for the static shell (Next 16).
export default function AdminNewsletterPage() {
  return (
    <Suspense fallback={<div aria-busy="true" aria-label="Đang tải danh sách" className="h-60 animate-pulse rounded-card bg-surface" />}>
      <SubscribersManager />
    </Suspense>
  );
}
```

- [ ] **Step 3: Run** — (frontend) `npm test && npm run typecheck && npm run lint` → pass.

- [ ] **Step 4: Propose commit** `add newsletter admin page`

---

### Task 9: Verify in the browser, docs

- [ ] **Step 1: Full checks** — backend `npm run typecheck && npm test && npm run test:db`; frontend `npm run typecheck && npm run lint && npm test && npm run build`. All pass.
- [ ] **Step 2: Restart the running dev backend and production frontend** (after the user applied the migration), then in the browser:
  - Footer band at 320 / 360 / 390 / 430 / 768 / 1024 px: no horizontal scroll, input ≥ 16px, button ≥ 44px, consent text readable, social buttons wrap.
  - Subscribe as a visitor → dev console prints the confirmation email → open link → success → welcome email printed → open unsubscribe link → page does nothing until the button → click → done.
  - Signed in as the test customer: focusing the empty input fills the email.
  - Bad email → field error; 6th signup from the same IP → rate-limit message.
  - `/admin/dang-ky-nhan-tin` on mobile and desktop: tabs, search, export downloads a CSV that opens with Vietnamese intact, delete with confirm.
  - `curl -s <host>/robots.txt` lists both new paths; both pages carry `noindex` and `referrer no-referrer`.
- [ ] **Step 3: Docs (gitignored)** — ADR-021 in `docs/DECISIONS.md` (subscriber data: consent proof, 7-day purge, hard delete, CSV inside the envelope); entry in `docs/PROGRESS.md`.
- [ ] **Step 4: Report** with `git status` / `git diff --stat` (expected files only) and the Definition of Done checklist.
