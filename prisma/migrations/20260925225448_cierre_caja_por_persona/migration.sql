-- DropIndex
DROP INDEX "CashClosure_userId_day_key";

-- AlterTable
ALTER TABLE "CashClosure" ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CashClosure_userId_staffId_day_key" ON "CashClosure"("userId", "staffId", "day");

-- AddForeignKey
ALTER TABLE "CashClosure" ADD CONSTRAINT "CashClosure_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
