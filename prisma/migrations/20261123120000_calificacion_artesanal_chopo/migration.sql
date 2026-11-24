-- Chopo Snacks: la calificacion artesanal (JNDA) en la factura del SRI.
-- El campo existe desde 20261110210000_ride_y_correo_factura, pero en
-- produccion quedo vacio y el RIDE salia sin el numero. Se llena una sola vez
-- con el de su factura anterior (Wanqara), solo para su RUC y solo si esta
-- vacio: si la duena ya escribio otro en Ajustes, no se toca.
UPDATE "BillingConfig"
SET "artisanNumber" = '247166',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE regexp_replace(COALESCE("taxId", ''), '[^0-9]', '', 'g') = '0850554668001'
  AND COALESCE(TRIM("artisanNumber"), '') = '';
