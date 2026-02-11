-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "runId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "protectedFromAutoArchive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RejectedSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectedSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RejectedSuggestion_userId_idx" ON "RejectedSuggestion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RejectedSuggestion_userId_type_value_key" ON "RejectedSuggestion"("userId", "type", "value");

-- CreateIndex
CREATE INDEX "AuditLog_runId_idx" ON "AuditLog"("runId");

-- AddForeignKey
ALTER TABLE "RejectedSuggestion" ADD CONSTRAINT "RejectedSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
