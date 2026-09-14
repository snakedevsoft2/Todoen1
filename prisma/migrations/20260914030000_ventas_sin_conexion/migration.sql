-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "clientKey" TEXT;

-- AlterTable
ALTER TABLE "ScanDocument" ADD COLUMN     "clientKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Sale_clientKey_key" ON "Sale"("clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "ScanDocument_clientKey_key" ON "ScanDocument"("clientKey");

