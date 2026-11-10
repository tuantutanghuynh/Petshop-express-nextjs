-- Newsletter campaigns (spec 2026-11-10, ADR-025). Additive: two enums and two tables only.
-- Rollback: DROP TABLE "NewsletterDelivery"; DROP TABLE "NewsletterCampaign";
--           DROP TYPE "NewsletterDeliveryStatus"; DROP TYPE "NewsletterCampaignStatus";
-- CreateEnum
CREATE TYPE "NewsletterCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NewsletterDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "NewsletterCampaign" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "preheader" TEXT,
    "content" TEXT NOT NULL,
    "featured" JSONB NOT NULL DEFAULT '[]',
    "isAdvertising" BOOLEAN NOT NULL DEFAULT true,
    "status" "NewsletterCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "unsubscribeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsletterDelivery" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "subscriberId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "NewsletterDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "claimedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "unsubscribeTokenHash" TEXT,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsletterDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterCampaign_status_scheduledAt_idx" ON "NewsletterCampaign"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "NewsletterCampaign_status_createdAt_idx" ON "NewsletterCampaign"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterDelivery_unsubscribeTokenHash_key" ON "NewsletterDelivery"("unsubscribeTokenHash");

-- CreateIndex
CREATE INDEX "NewsletterDelivery_campaignId_status_idx" ON "NewsletterDelivery"("campaignId", "status");

-- CreateIndex
CREATE INDEX "NewsletterDelivery_status_sentAt_idx" ON "NewsletterDelivery"("status", "sentAt");

-- CreateIndex
CREATE INDEX "NewsletterDelivery_subscriberId_idx" ON "NewsletterDelivery"("subscriberId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterDelivery_campaignId_subscriberId_key" ON "NewsletterDelivery"("campaignId", "subscriberId");

-- AddForeignKey
ALTER TABLE "NewsletterDelivery" ADD CONSTRAINT "NewsletterDelivery_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NewsletterCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewsletterDelivery" ADD CONSTRAINT "NewsletterDelivery_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "NewsletterSubscriber"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Counters can never go below zero (a bug that decrements twice fails loudly instead).
ALTER TABLE "NewsletterCampaign" ADD CONSTRAINT "NewsletterCampaign_counts_check"
  CHECK ("recipientCount" >= 0 AND "sentCount" >= 0 AND "failedCount" >= 0 AND "unsubscribeCount" >= 0);
ALTER TABLE "NewsletterDelivery" ADD CONSTRAINT "NewsletterDelivery_attempts_check" CHECK ("attempts" >= 0);
