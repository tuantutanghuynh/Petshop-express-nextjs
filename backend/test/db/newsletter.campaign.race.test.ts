import { afterEach, describe, expect, it } from 'vitest';
import { NEWSLETTER_CONSENT_TEXT } from '../../constants/newsletter';
import { setMailTransportForTests, type MailMessage } from '../../services/email.service';
import { runNewsletterTick } from '../../services/newsletterSend.service';
import prisma from '../../services/prisma';
import { ITER, runConcurrently } from './helpers/concurrency';
import { countRows } from './helpers/db';

// =============================================================================================
// Race tests for newsletter sending (skill: transaction-race-test).
//
// WRITE-PATH INVENTORY
// | Write path                       | File:function                                   | Risk | Pattern                                    |
// |----------------------------------|-------------------------------------------------|------|--------------------------------------------|
// | Start a due campaign + snapshot  | newsletterSend.service.ts:claimDueCampaigns     | HIGH | conditional UPDATE in $transaction  ✔      |
// | Claim one delivery to send       | newsletterSend.service.ts:sendBatch (raw SQL)   | HIGH | conditional UPDATE … FROM campaign  ✔      |
// | Mark sent / failed + counters    | newsletterSend.service.ts:sendBatch             | MED  | conditional UPDATE + increment in tx  ✔    |
// | Close finished campaigns         | newsletterSend.service.ts:finishCampaigns       | MED  | single UPDATE … NOT EXISTS  ✔              |
// | Email to the SMTP server         | sendBatch                                       | HIGH | outside any transaction  ✔ (no tx held)    |
//
// INVARIANTS (read from the tables / the captured mail, never from return values)
//   N1  every subscriber gets a campaign at most once (no address twice in the mail log);
//   N2  the snapshot is taken once: deliveries = recipientCount = confirmed subscribers;
//   N3  sentCount = SENT deliveries = emails actually handed to SMTP;
//   N4  after a stop (CANCELLED), no delivery is claimed again;
//   N5  no tick fails with an error (a P2002 here would mean two workers snapshotted).
// =============================================================================================

const NOW = new Date('2026-11-10T01:00:00.000Z');
const SUBSCRIBERS = 30;

async function seed(n = SUBSCRIBERS) {
  await prisma.newsletterSubscriber.createMany({
    data: Array.from({ length: n }, (_, i) => ({ email: `r${i}@example.com`, status: 'CONFIRMED' as const, consentText: NEWSLETTER_CONSENT_TEXT, consentAt: NOW, confirmedAt: NOW })),
  });
  return prisma.newsletterCampaign.create({ data: { subject: 'Race', content: 'x', status: 'SCHEDULED', scheduledAt: new Date(NOW.getTime() - 60_000) } });
}

// The SMTP call yields to the event loop, so the other workers' queries really interleave with it.
function slowMail(onSend?: (m: MailMessage) => Promise<void>) {
  const sent: MailMessage[] = [];
  setMailTransportForTests({
    sendMail: async (m) => {
      await new Promise((r) => setImmediate(r));
      await onSend?.(m);
      sent.push(m);
    },
  });
  return sent;
}
afterEach(() => setMailTransportForTests(null));

describe('L3: several workers tick at the same moment', () => {
  for (let i = 0; i < ITER; i++) {
    it(`10 parallel ticks send each email exactly once — run ${i + 1}`, async () => {
      const c = await seed();
      const sent = slowMail();
      const { errors } = await runConcurrently(10, () => runNewsletterTick(NOW, { dailyLimit: 1000, batchSize: 50 }));
      expect(errors).toEqual([]); // N5
      // Whatever is left (a worker may have lost every claim) goes out on later ticks.
      for (let t = 1; t <= 3; t++) await runNewsletterTick(new Date(NOW.getTime() + t * 60_000), { dailyLimit: 1000, batchSize: 50 });

      const to = sent.map((m) => m.to);
      expect(new Set(to).size).toBe(to.length); // N1
      expect(to).toHaveLength(SUBSCRIBERS);
      const after = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: c.id } });
      expect(after).toMatchObject({ status: 'SENT', recipientCount: SUBSCRIBERS, sentCount: SUBSCRIBERS, failedCount: 0 }); // N2, N3
      expect(await countRows('NewsletterDelivery', `"campaignId" = $1`, [c.id])).toBe(SUBSCRIBERS); // N2
      expect(await countRows('NewsletterDelivery', `"campaignId" = $1 AND status = 'SENT'`, [c.id])).toBe(SUBSCRIBERS); // N3
    });
  }
});

describe('L2: a stop while a batch is in flight', () => {
  for (let i = 0; i < ITER; i++) {
    it(`cancelling during the first email claims nothing after it — run ${i + 1}`, async () => {
      const c = await seed(5);
      let stopped = false;
      // The stop lands while the first email is being handed to SMTP: that one completes, the rest
      // of the batch must lose its claim (the campaign is no longer SENDING).
      const sent = slowMail(async () => {
        if (stopped) return;
        stopped = true;
        const { count } = await prisma.newsletterCampaign.updateMany({ where: { id: c.id, status: 'SENDING' }, data: { status: 'CANCELLED', finishedAt: NOW } });
        expect(count).toBe(1);
      });
      await runNewsletterTick(NOW, { dailyLimit: 1000, batchSize: 50 });
      await runNewsletterTick(new Date(NOW.getTime() + 60_000), { dailyLimit: 1000, batchSize: 50 });

      expect(sent).toHaveLength(1); // N4
      expect(await countRows('NewsletterDelivery', `"campaignId" = $1 AND status IN ('SENDING', 'SENT')`, [c.id])).toBe(1);
      const after = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: c.id } });
      expect(after).toMatchObject({ status: 'CANCELLED', sentCount: 1 });
    });
  }
});

describe('L2: a stop racing the claim of a due campaign', () => {
  for (let i = 0; i < ITER; i++) {
    it(`either the campaign never starts, or it starts and is stopped — never both, never half — run ${i + 1}`, async () => {
      const c = await seed(5);
      const sent = slowMail();
      const stop = () => prisma.newsletterCampaign.updateMany({ where: { id: c.id, status: { in: ['SCHEDULED', 'SENDING'] } }, data: { status: 'CANCELLED', finishedAt: NOW } });
      const [, stopResult] = await Promise.all([runNewsletterTick(NOW, { dailyLimit: 1000, batchSize: 50 }), stop()]);
      const after = await prisma.newsletterCampaign.findUniqueOrThrow({ where: { id: c.id } });
      const deliveries = await countRows('NewsletterDelivery', `"campaignId" = $1`, [c.id]);
      if (stopResult.count === 1) {
        expect(after.status).toBe('CANCELLED');
        // Started first → full snapshot; stopped first → no snapshot at all.
        expect([0, 5]).toContain(deliveries);
        expect(after.recipientCount).toBe(deliveries);
      } else {
        // The tick finished the whole campaign before the stop could see it.
        expect(after.status).toBe('SENT');
        expect(sent).toHaveLength(5);
      }
      expect(after.sentCount).toBe(sent.length); // N3
    });
  }
});
