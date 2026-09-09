-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "onboardingDoneAt" TIMESTAMP(3),
ADD COLUMN     "onboardingStep" INTEGER NOT NULL DEFAULT 0;
