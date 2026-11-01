-- AlterTable
ALTER TABLE "BillingConfig" ADD COLUMN     "branchAddress" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "taxRegime" TEXT NOT NULL DEFAULT 'GENERAL',
ADD COLUMN     "withholdingAgent" TEXT;

-- AlterTable
ALTER TABLE "ElectronicInvoice" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "xml" TEXT;
