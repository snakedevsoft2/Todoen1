-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "clientAddress" TEXT,
ADD COLUMN     "lastLat" DOUBLE PRECISION,
ADD COLUMN     "lastLng" DOUBLE PRECISION,
ADD COLUMN     "lastLocationAt" TIMESTAMP(3),
ADD COLUMN     "locationConsentAt" TIMESTAMP(3),
ADD COLUMN     "reference1Name" TEXT,
ADD COLUMN     "reference1Phone" TEXT,
ADD COLUMN     "reference2Name" TEXT,
ADD COLUMN     "reference2Phone" TEXT;
