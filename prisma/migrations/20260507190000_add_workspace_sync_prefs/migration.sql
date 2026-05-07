-- Add workspace/sync preference fields (additive, nullable)
ALTER TABLE "UserCalendarPreferences"
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "morningPrepLocalTime" TEXT,
  ADD COLUMN "refreshMode" TEXT,
  ADD COLUMN "periodicRefreshHours" INTEGER;

