-- DropForeignKey
ALTER TABLE "ElectronicInvoice" DROP CONSTRAINT "ElectronicInvoice_saleId_fkey";

-- AddForeignKey
ALTER TABLE "ElectronicInvoice" ADD CONSTRAINT "ElectronicInvoice_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

