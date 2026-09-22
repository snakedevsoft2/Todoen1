-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deliveryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryFee" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codPayment" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onlinePayment" BOOLEAN NOT NULL DEFAULT false;
