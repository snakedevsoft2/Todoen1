-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Debt_clientKey_key" ON "Debt"("clientKey");

