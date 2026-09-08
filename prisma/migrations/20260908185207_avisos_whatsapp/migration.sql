-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('ENVIADO', 'FALLIDO', 'SIN_CONFIGURAR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "notifyOnBooking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "whatsappApiKey" TEXT,
ADD COLUMN     "whatsappNumber" TEXT,
ADD COLUMN     "whatsappPhoneId" TEXT,
ADD COLUMN     "whatsappProvider" TEXT NOT NULL DEFAULT 'enlace';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "provider" TEXT NOT NULL DEFAULT 'enlace',
    "toNumber" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "detail" TEXT,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
