-- CreateTable
CREATE TABLE "ThreadAttention" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "importance" TEXT NOT NULL DEFAULT 'neutral',
    "snoozeUntil" TIMESTAMP(3),
    "waitingOn" BOOLEAN NOT NULL DEFAULT false,
    "neverSimilar" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadAttention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRankingProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domainPenalties" JSONB NOT NULL DEFAULT '{}',
    "senderPenalties" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserRankingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThreadAttention_userId_googleAccountId_threadId_key" ON "ThreadAttention"("userId", "googleAccountId", "threadId");

-- CreateIndex
CREATE INDEX "ThreadAttention_userId_googleAccountId_idx" ON "ThreadAttention"("userId", "googleAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRankingProfile_userId_key" ON "UserRankingProfile"("userId");

-- AddForeignKey
ALTER TABLE "ThreadAttention" ADD CONSTRAINT "ThreadAttention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThreadAttention" ADD CONSTRAINT "ThreadAttention_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRankingProfile" ADD CONSTRAINT "UserRankingProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
