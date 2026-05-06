-- Add Brief feedback columns to suppress resurfacing priorities
ALTER TABLE "EmailEvent"
ADD COLUMN     "briefDismissedAt" TIMESTAMP(3),
ADD COLUMN     "briefNotImportantAt" TIMESTAMP(3);

