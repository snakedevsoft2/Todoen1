-- Cada linea de venta y de cuenta pasa a llevar su propio dueno.
--
-- Antes el aislamiento dependia de que la consulta pasara por el padre. Con la
-- columna, el aislamiento vive en la fila. Se rellena desde el padre en la
-- misma migracion para no perder nada de lo que ya existe.

-- 1. La columna entra permitiendo vacios, para poder rellenarla.
ALTER TABLE "OrderItem" ADD COLUMN "userId" TEXT;
ALTER TABLE "SaleItem"  ADD COLUMN "userId" TEXT;

-- 2. Se copia el dueno del padre.
UPDATE "OrderItem" AS oi
   SET "userId" = o."userId"
  FROM "Order" AS o
 WHERE oi."orderId" = o."id";

UPDATE "SaleItem" AS si
   SET "userId" = s."userId"
  FROM "Sale" AS s
 WHERE si."saleId" = s."id";

-- 3. Ya con todo relleno, se vuelve obligatoria.
ALTER TABLE "OrderItem" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "SaleItem"  ALTER COLUMN "userId" SET NOT NULL;

-- 4. Indices y llaves foraneas.
CREATE INDEX "OrderItem_userId_idx" ON "OrderItem"("userId");
CREATE INDEX "SaleItem_userId_idx"  ON "SaleItem"("userId");

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
