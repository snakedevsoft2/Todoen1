-- AlterTable
ALTER TABLE "User" ADD COLUMN     "billingNote" TEXT,
ADD COLUMN     "paidUntil" TIMESTAMP(3),
ADD COLUMN     "suspendedForPayment" BOOLEAN NOT NULL DEFAULT false;

