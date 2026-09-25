-- AlterTable
ALTER TABLE "Debt" ADD COLUMN     "receiptSeq" INTEGER;

-- AlterTable
ALTER TABLE "DebtPayment" ADD COLUMN     "receiptSeq" INTEGER;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "receiptSeq" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nextReceiptSeq" INTEGER NOT NULL DEFAULT 1;
