-- CreateEnum
CREATE TYPE "ScheduledStatus" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO', 'MANUAL', 'CANCELADO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "whatsappTemplate" TEXT,
ADD COLUMN     "whatsappTemplateLang" TEXT NOT NULL DEFAULT 'es';

-- CreateTable
CREATE TABLE "ScheduledMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'auto',
    "text" TEXT NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledStatus" NOT NULL DEFAULT 'PENDIENTE',
    "sentAt" TIMESTAMP(3),
    "via" TEXT,
    "detail" TEXT,
    "createdByStaffId" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledMessage_userId_status_sendAt_idx" ON "ScheduledMessage"("userId", "status", "sendAt");

-- CreateIndex
CREATE INDEX "ScheduledMessage_status_sendAt_idx" ON "ScheduledMessage"("status", "sendAt");

-- CreateIndex
CREATE INDEX "ScheduledMessage_customerId_idx" ON "ScheduledMessage"("customerId");

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledMessage" ADD CONSTRAINT "ScheduledMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

