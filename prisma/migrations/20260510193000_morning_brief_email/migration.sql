ALTER TABLE "UserCalendarPreferences"
ADD COLUMN IF NOT EXISTS "morningBriefEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "morningBriefEmailRecipient" TEXT;

CREATE TABLE IF NOT EXISTS "MorningBriefEmailDeliveryLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "localBriefDay" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "provider" TEXT,
  "providerMessageId" TEXT,
  "error" TEXT,
  "generatedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MorningBriefEmailDeliveryLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MorningBriefEmailDeliveryLog_userId_localBriefDay_key"
ON "MorningBriefEmailDeliveryLog"("userId", "localBriefDay");

CREATE INDEX IF NOT EXISTS "MorningBriefEmailDeliveryLog_userId_createdAt_idx"
ON "MorningBriefEmailDeliveryLog"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "MorningBriefEmailDeliveryLog_status_idx"
ON "MorningBriefEmailDeliveryLog"("status");

DO $$
BEGIN
  ALTER TABLE "MorningBriefEmailDeliveryLog"
  ADD CONSTRAINT "MorningBriefEmailDeliveryLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
