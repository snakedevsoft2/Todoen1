-- CreateEnum
CREATE TYPE "WashJobStatus" AS ENUM ('EN_COLA', 'LAVANDO', 'LISTO', 'ENTREGADO', 'CANCELADO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "loyaltyGoal" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "loyaltyReward" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "washJobId" TEXT;

-- CreateTable
CREATE TABLE "WashJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT NOT NULL,
    "customerId" TEXT,
    "vehiclePlate" TEXT,
    "vehicleType" TEXT,
    "vehicleColor" TEXT,
    "serviceId" TEXT,
    "serviceName" TEXT NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "assignedStaffId" TEXT,
    "receivedById" TEXT,
    "appointmentId" TEXT,
    "status" "WashJobStatus" NOT NULL DEFAULT 'EN_COLA',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WashJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stamps" INTEGER NOT NULL DEFAULT 0,
    "rewardsEarned" INTEGER NOT NULL DEFAULT 0,
    "lastStampAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyStamp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "loyaltyCardId" TEXT NOT NULL,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyStamp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WashJob_appointmentId_key" ON "WashJob"("appointmentId");

-- CreateIndex
CREATE INDEX "WashJob_userId_day_idx" ON "WashJob"("userId", "day");

-- CreateIndex
CREATE INDEX "WashJob_userId_status_idx" ON "WashJob"("userId", "status");

-- CreateIndex
CREATE INDEX "WashJob_userId_assignedStaffId_idx" ON "WashJob"("userId", "assignedStaffId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyCard_customerId_key" ON "LoyaltyCard"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyCard_userId_idx" ON "LoyaltyCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyStamp_saleId_key" ON "LoyaltyStamp"("saleId");

-- CreateIndex
CREATE INDEX "LoyaltyStamp_userId_loyaltyCardId_idx" ON "LoyaltyStamp"("userId", "loyaltyCardId");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_washJobId_key" ON "Sale"("washJobId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_washJobId_fkey" FOREIGN KEY ("washJobId") REFERENCES "WashJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashJob" ADD CONSTRAINT "WashJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashJob" ADD CONSTRAINT "WashJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashJob" ADD CONSTRAINT "WashJob_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashJob" ADD CONSTRAINT "WashJob_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashJob" ADD CONSTRAINT "WashJob_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WashJob" ADD CONSTRAINT "WashJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyCard" ADD CONSTRAINT "LoyaltyCard_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyStamp" ADD CONSTRAINT "LoyaltyStamp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyStamp" ADD CONSTRAINT "LoyaltyStamp_loyaltyCardId_fkey" FOREIGN KEY ("loyaltyCardId") REFERENCES "LoyaltyCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
