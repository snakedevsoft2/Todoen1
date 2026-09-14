-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ENVIANDO', 'AUTORIZADA', 'RECHAZADA', 'ERROR');

-- CreateTable
CREATE TABLE "BillingConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT NOT NULL DEFAULT 'CO',
    "environment" TEXT NOT NULL DEFAULT 'pruebas',
    "credentials" TEXT,
    "defaultDocument" TEXT NOT NULL DEFAULT 'normal',
    "taxCode" TEXT NOT NULL DEFAULT '01',
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 19,
    "numberingRangeId" TEXT,
    "taxId" TEXT,
    "legalName" TEXT,
    "tradeName" TEXT,
    "fiscalAddress" TEXT,
    "establishment" TEXT NOT NULL DEFAULT '001',
    "emissionPoint" TEXT NOT NULL DEFAULT '001',
    "nextSequential" INTEGER NOT NULL DEFAULT 1,
    "keepsAccounting" BOOLEAN NOT NULL DEFAULT false,
    "specialTaxpayer" TEXT,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "lastCheckMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElectronicInvoice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ENVIANDO',
    "number" TEXT,
    "authCode" TEXT,
    "qrUrl" TEXT,
    "publicUrl" TEXT,
    "providerId" TEXT,
    "sequential" INTEGER,
    "customer" JSONB NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "tax" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "message" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "authorizedAt" TIMESTAMP(3),
    "createdByStaffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ElectronicInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingConfig_userId_key" ON "BillingConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ElectronicInvoice_saleId_key" ON "ElectronicInvoice"("saleId");

-- CreateIndex
CREATE INDEX "ElectronicInvoice_userId_createdAt_idx" ON "ElectronicInvoice"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ElectronicInvoice_status_updatedAt_idx" ON "ElectronicInvoice"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "BillingConfig" ADD CONSTRAINT "BillingConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectronicInvoice" ADD CONSTRAINT "ElectronicInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElectronicInvoice" ADD CONSTRAINT "ElectronicInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

