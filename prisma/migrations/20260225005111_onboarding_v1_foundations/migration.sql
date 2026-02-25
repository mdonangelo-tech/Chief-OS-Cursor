-- CreateEnum
CREATE TYPE "OnboardingRunStatus" AS ENUM ('queued', 'running', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('work', 'personal', 'unknown');

-- CreateEnum
CREATE TYPE "SoloEventDefaultKind" AS ENUM ('TASK', 'FOCUS', 'MEETING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "HoldDefault" AS ENUM ('HARD_BUSY', 'SOFT_HOLD');

-- CreateEnum
CREATE TYPE "CalendarClassDefault" AS ENUM ('BLOCK', 'FYI');

-- CreateTable
CREATE TABLE "OnboardingRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OnboardingRunStatus" NOT NULL DEFAULT 'queued',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "accountIds" TEXT[],
    "inputsJson" JSONB,
    "resultsJson" JSONB,
    "questionsJson" JSONB,
    "undoSnapshotJson" JSONB,
    "error" TEXT,

    CONSTRAINT "OnboardingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAccountPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL DEFAULT 'unknown',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "includeInOnboarding" BOOLEAN NOT NULL DEFAULT true,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAccountPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCalendarPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "soloEventDefaultKind" "SoloEventDefaultKind" NOT NULL DEFAULT 'UNKNOWN',
    "holdDefault" "HoldDefault" NOT NULL DEFAULT 'SOFT_HOLD',
    "classDefault" "CalendarClassDefault" NOT NULL DEFAULT 'BLOCK',
    "delegateEmails" TEXT[],
    "familyKeywordRules" TEXT[],
    "workDomainAllowlist" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCalendarPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnboardingRun_userId_createdAt_idx" ON "OnboardingRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OnboardingRun_status_idx" ON "OnboardingRun"("status");

-- CreateIndex
CREATE INDEX "UserGoal_userId_idx" ON "UserGoal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGoal_userId_key_key" ON "UserGoal"("userId", "key");

-- CreateIndex
CREATE INDEX "UserAccountPreference_userId_idx" ON "UserAccountPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccountPreference_userId_googleAccountId_key" ON "UserAccountPreference"("userId", "googleAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCalendarPreferences_userId_key" ON "UserCalendarPreferences"("userId");

-- AddForeignKey
ALTER TABLE "OnboardingRun" ADD CONSTRAINT "OnboardingRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGoal" ADD CONSTRAINT "UserGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccountPreference" ADD CONSTRAINT "UserAccountPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccountPreference" ADD CONSTRAINT "UserAccountPreference_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCalendarPreferences" ADD CONSTRAINT "UserCalendarPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
