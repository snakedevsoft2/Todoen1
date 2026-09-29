-- CreateTable
CREATE TABLE "PatioHandover" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "fromStaffId" TEXT,
    "toStaffId" TEXT,
    "since" TIMESTAMP(3) NOT NULL,
    "vehiclesDelivered" INTEGER NOT NULL,
    "totalSales" INTEGER NOT NULL,
    "totalCash" INTEGER NOT NULL,
    "totalCard" INTEGER NOT NULL,
    "totalTransfer" INTEGER NOT NULL,
    "totalOther" INTEGER NOT NULL DEFAULT 0,
    "totalExpenses" INTEGER NOT NULL DEFAULT 0,
    "totalCommissions" INTEGER NOT NULL DEFAULT 0,
    "pendingCount" INTEGER NOT NULL,
    "pendingValue" INTEGER NOT NULL,
    "pendingSnapshot" JSONB NOT NULL,
    "cashDelivered" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedAt" TIMESTAMP(3),
    "receivedById" TEXT,

    CONSTRAINT "PatioHandover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatioHandover_userId_createdAt_idx" ON "PatioHandover"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PatioHandover_userId_receivedAt_idx" ON "PatioHandover"("userId", "receivedAt");

-- AddForeignKey
ALTER TABLE "PatioHandover" ADD CONSTRAINT "PatioHandover_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatioHandover" ADD CONSTRAINT "PatioHandover_fromStaffId_fkey" FOREIGN KEY ("fromStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatioHandover" ADD CONSTRAINT "PatioHandover_toStaffId_fkey" FOREIGN KEY ("toStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatioHandover" ADD CONSTRAINT "PatioHandover_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
