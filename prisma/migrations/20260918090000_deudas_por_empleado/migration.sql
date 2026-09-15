-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "staffId" TEXT;

-- AlterTable
ALTER TABLE "DebtPayment" ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE INDEX "Debt_userId_staffId_idx" ON "Debt"("userId", "staffId");

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtPayment" ADD CONSTRAINT "DebtPayment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
