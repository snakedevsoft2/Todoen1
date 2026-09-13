-- AlterTable
ALTER TABLE "VisitReport" ADD COLUMN     "observations" TEXT;

-- CreateTable
CREATE TABLE "VisitAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "clientKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisitAttachment_clientKey_key" ON "VisitAttachment"("clientKey");

-- CreateIndex
CREATE INDEX "VisitAttachment_reportId_idx" ON "VisitAttachment"("reportId");

-- AddForeignKey
ALTER TABLE "VisitAttachment" ADD CONSTRAINT "VisitAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitAttachment" ADD CONSTRAINT "VisitAttachment_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "VisitReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

