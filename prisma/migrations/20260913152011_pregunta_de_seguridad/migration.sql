-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "securityAnswerHash" TEXT,
ADD COLUMN     "securityQuestion" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "securityAnswerHash" TEXT,
ADD COLUMN     "securityQuestion" TEXT;

-- CreateTable
CREATE TABLE "SecurityAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityAttempt_email_createdAt_idx" ON "SecurityAttempt"("email", "createdAt");
