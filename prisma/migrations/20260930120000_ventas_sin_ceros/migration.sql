-- Corrige las ventas que se cobraron sin los ceros: un lavado de moto de $30
-- que era de $30.000 (Superior, 29 de septiembre de 2026), y cualquier otra
-- igual. Es la misma regla que ahora aplica la app al cobrar (completarCeros y
-- cerosPara en src/lib/format.ts): en un lavadero o una barberia, en pesos,
-- nada vale menos de $1.000, asi que un valor de 1 a 999 son miles.
--
-- Va como migracion para que se aplique sola en produccion al publicar
-- (el build corre `prisma migrate deploy`). Corre una sola vez.
--
-- No toca una venta con factura electronica autorizada o en camino: ante la
-- DIAN esa ya existe con su valor y se corrige con una nota credito.

CREATE TEMP TABLE "_VentaSinCeros" AS
SELECT s."id", s."washJobId"
FROM "Sale" s
JOIN "User" u ON u."id" = s."userId"
WHERE u."businessType" IN ('LAVADERO', 'BARBERIA')
  AND u."currency" = 'COP'
  AND s."total" > 0
  AND s."total" < 1000
  AND NOT EXISTS (
    SELECT 1 FROM "ElectronicInvoice" e
    WHERE e."saleId" = s."id" AND e."status" IN ('AUTORIZADA', 'ENVIANDO')
  );

UPDATE "SaleItem" si
SET "unitPrice" = si."unitPrice" * 1000
FROM "_VentaSinCeros" v
WHERE si."saleId" = v."id" AND si."unitPrice" > 0 AND si."unitPrice" < 1000;

UPDATE "Sale" s
SET "total" = s."total" * 1000
FROM "_VentaSinCeros" v
WHERE s."id" = v."id";

UPDATE "WashJob" w
SET "price" = w."price" * 1000
FROM "_VentaSinCeros" v
WHERE w."id" = v."washJobId" AND w."price" > 0 AND w."price" < 1000;

DROP TABLE "_VentaSinCeros";
