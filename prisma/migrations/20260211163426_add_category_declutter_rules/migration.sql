-- CreateTable
CREATE TABLE "CategoryDeclutterRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryDeclutterRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategoryDeclutterRule_userId_categoryId_key" ON "CategoryDeclutterRule"("userId", "categoryId");

-- AddForeignKey
ALTER TABLE "CategoryDeclutterRule" ADD CONSTRAINT "CategoryDeclutterRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryDeclutterRule" ADD CONSTRAINT "CategoryDeclutterRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
