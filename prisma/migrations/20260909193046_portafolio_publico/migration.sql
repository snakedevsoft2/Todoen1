-- AlterTable
ALTER TABLE "User" ADD COLUMN     "publicAbout" TEXT,
ADD COLUMN     "publicCover" TEXT,
ADD COLUMN     "publicHeadline" TEXT,
ADD COLUMN     "publicOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicOrderNote" TEXT,
ADD COLUMN     "publicShowPrices" BOOLEAN NOT NULL DEFAULT true;
