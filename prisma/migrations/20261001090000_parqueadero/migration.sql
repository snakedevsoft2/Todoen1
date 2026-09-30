-- AlterEnum
ALTER TYPE "BusinessType" ADD VALUE 'PARQUEADERO';

-- AlterEnum
ALTER TYPE "SaleOrigin" ADD VALUE 'PARQUEADERO';

-- CreateEnum
CREATE TYPE "ParkingStatus" AS ENUM ('DENTRO', 'PAGADO', 'POR_COBRAR', 'ANULADO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "nextTicketSeq" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN "parkingTicketId" TEXT;

-- CreateTable
CREATE TABLE "ParkingRate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pricePerHour" INTEGER NOT NULL DEFAULT 0,
    "fractionMinutes" INTEGER NOT NULL DEFAULT 60,
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "pricePerDay" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParkingTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "qrToken" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "spot" TEXT,
    "notes" TEXT,
    "rateId" TEXT,
    "vehicleType" TEXT NOT NULL,
    "pricePerHour" INTEGER NOT NULL,
    "fractionMinutes" INTEGER NOT NULL,
    "graceMinutes" INTEGER NOT NULL,
    "pricePerDay" INTEGER NOT NULL,
    "status" "ParkingStatus" NOT NULL DEFAULT 'DENTRO',
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "amount" INTEGER,
    "receivedById" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParkingTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParkingRate_userId_active_idx" ON "ParkingRate"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingTicket_qrToken_key" ON "ParkingTicket"("qrToken");

-- CreateIndex
CREATE INDEX "ParkingTicket_userId_status_idx" ON "ParkingTicket"("userId", "status");

-- CreateIndex
CREATE INDEX "ParkingTicket_userId_day_idx" ON "ParkingTicket"("userId", "day");

-- CreateIndex
CREATE INDEX "ParkingTicket_userId_plate_idx" ON "ParkingTicket"("userId", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "ParkingTicket_userId_seq_key" ON "ParkingTicket"("userId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_parkingTicketId_key" ON "Sale"("parkingTicketId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_parkingTicketId_fkey" FOREIGN KEY ("parkingTicketId") REFERENCES "ParkingTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingRate" ADD CONSTRAINT "ParkingRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingTicket" ADD CONSTRAINT "ParkingTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingTicket" ADD CONSTRAINT "ParkingTicket_rateId_fkey" FOREIGN KEY ("rateId") REFERENCES "ParkingRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingTicket" ADD CONSTRAINT "ParkingTicket_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParkingTicket" ADD CONSTRAINT "ParkingTicket_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
