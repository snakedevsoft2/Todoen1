-- Renovar un prestamo (lo pidio EM Inversiones): el prestamo nuevo apunta al
-- que renovo, y el abono que cierra el anterior queda marcado como renovacion
-- porque no es plata que entro, sino saldo que se paso al nuevo.
ALTER TABLE "Debt" ADD COLUMN     "renewedFromId" TEXT;

ALTER TABLE "DebtPayment" ADD COLUMN     "renewal" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Debt_renewedFromId_key" ON "Debt"("renewedFromId");

ALTER TABLE "Debt" ADD CONSTRAINT "Debt_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "Debt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
