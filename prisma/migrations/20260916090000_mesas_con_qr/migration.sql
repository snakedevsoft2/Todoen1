-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "hasNewFromCustomer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tableId" TEXT;

-- CreateTable
CREATE TABLE "Table" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "qrToken" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Table_qrToken_key" ON "Table"("qrToken");

-- CreateIndex
CREATE INDEX "Table_userId_active_idx" ON "Table"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Table_userId_number_key" ON "Table"("userId", "number");

-- CreateIndex
CREATE INDEX "Order_tableId_idx" ON "Order"("tableId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

