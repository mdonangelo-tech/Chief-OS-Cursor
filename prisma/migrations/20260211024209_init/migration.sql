-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "GoogleAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "userDefinedLabel" TEXT,
    "syncStateJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDeclutterPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "autoArchiveEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserDeclutterPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "to" TEXT,
    "cc" TEXT,
    "subject" TEXT,
    "snippet" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "labels" TEXT[],
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "senderDomain" TEXT,
    "bodyFetched" BOOLEAN NOT NULL DEFAULT false,
    "bodyPlain" TEXT,
    "bodyHtml" TEXT,
    "syncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classificationCategoryId" TEXT,
    "importanceScore" DOUBLE PRECISION,
    "needsAction" BOOLEAN,
    "actionType" TEXT,
    "confidence" DOUBLE PRECISION,
    "explainJson" JSONB,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER,
    "attendees" TEXT[],
    "organizer" TEXT,
    "location" TEXT,
    "recurrence" TEXT,
    "syncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "classificationCategoryId" TEXT,
    "importanceScore" DOUBLE PRECISION,
    "needsAction" BOOLEAN,
    "confidence" DOUBLE PRECISION,
    "explainJson" JSONB,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleAccountId" TEXT NOT NULL,
    "messageId" TEXT,
    "threadId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionType" TEXT NOT NULL,
    "reason" TEXT,
    "confidence" DOUBLE PRECISION,
    "beforeLabelsJson" JSONB NOT NULL,
    "afterLabelsJson" JSONB NOT NULL,
    "rollbackStatus" TEXT NOT NULL DEFAULT 'applied',

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleAccount_userId_email_key" ON "GoogleAccount"("userId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "UserDeclutterPref_userId_key" ON "UserDeclutterPref"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgRule_userId_domain_key" ON "OrgRule"("userId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "PersonRule_userId_email_key" ON "PersonRule"("userId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "EmailEvent_messageId_key" ON "EmailEvent"("messageId");

-- CreateIndex
CREATE INDEX "EmailEvent_googleAccountId_date_idx" ON "EmailEvent"("googleAccountId", "date");

-- CreateIndex
CREATE INDEX "EmailEvent_threadId_idx" ON "EmailEvent"("threadId");

-- CreateIndex
CREATE INDEX "CalendarEvent_googleAccountId_startAt_idx" ON "CalendarEvent"("googleAccountId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_googleAccountId_eventId_key" ON "CalendarEvent"("googleAccountId", "eventId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_googleAccountId_idx" ON "AuditLog"("googleAccountId");

-- CreateIndex
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleAccount" ADD CONSTRAINT "GoogleAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDeclutterPref" ADD CONSTRAINT "UserDeclutterPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRule" ADD CONSTRAINT "OrgRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgRule" ADD CONSTRAINT "OrgRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRule" ADD CONSTRAINT "PersonRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRule" ADD CONSTRAINT "PersonRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailEvent" ADD CONSTRAINT "EmailEvent_classificationCategoryId_fkey" FOREIGN KEY ("classificationCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_classificationCategoryId_fkey" FOREIGN KEY ("classificationCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_googleAccountId_fkey" FOREIGN KEY ("googleAccountId") REFERENCES "GoogleAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
