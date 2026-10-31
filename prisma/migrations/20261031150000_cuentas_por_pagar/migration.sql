-- Cuentas por pagar a proveedores (Chopo Snacks): proveedores, compras con sus
-- renglones y los pagos de cada compra.
-- CreateTable
CREATE TABLE "PayableSupplier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayableSupplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayableBill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "document" TEXT,
    "notes" TEXT,
    "taxPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayableBill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayableItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(14,4) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "discount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(14,4),

    CONSTRAINT "PayableItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayablePayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "amount" DECIMAL(14,4) NOT NULL,
    "day" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayablePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PayableSupplier_userId_idx" ON "PayableSupplier"("userId");

-- CreateIndex
CREATE INDEX "PayableBill_userId_supplierId_idx" ON "PayableBill"("userId", "supplierId");

-- CreateIndex
CREATE INDEX "PayableItem_userId_idx" ON "PayableItem"("userId");

-- CreateIndex
CREATE INDEX "PayableItem_billId_idx" ON "PayableItem"("billId");

-- CreateIndex
CREATE INDEX "PayablePayment_userId_idx" ON "PayablePayment"("userId");

-- CreateIndex
CREATE INDEX "PayablePayment_billId_idx" ON "PayablePayment"("billId");

-- AddForeignKey
ALTER TABLE "PayableSupplier" ADD CONSTRAINT "PayableSupplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableBill" ADD CONSTRAINT "PayableBill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableBill" ADD CONSTRAINT "PayableBill_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "PayableSupplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableItem" ADD CONSTRAINT "PayableItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayableItem" ADD CONSTRAINT "PayableItem_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PayableBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "PayablePayment_billId_fkey" FOREIGN KEY ("billId") REFERENCES "PayableBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

