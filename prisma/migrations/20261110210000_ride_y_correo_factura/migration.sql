-- Chopo Snacks: el RIDE de la factura del SRI y el correo al comprador.
-- La calificacion artesanal sale en el RIDE; emailedTo/emailedAt dicen a quien
-- y cuando se le mando la factura (PDF + XML) por correo.
ALTER TABLE "BillingConfig" ADD COLUMN     "artisanNumber" TEXT;

ALTER TABLE "ElectronicInvoice" ADD COLUMN     "emailedAt" TIMESTAMP(3),
ADD COLUMN     "emailedTo" TEXT;
