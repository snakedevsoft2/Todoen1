-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "wantsReminder" BOOLEAN NOT NULL DEFAULT true;
