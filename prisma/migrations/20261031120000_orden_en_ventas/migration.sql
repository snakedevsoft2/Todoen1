-- El orden de los productos en Ventas, guardado en el servidor para que se vea
-- igual en todos los telefonos del negocio. Nulo: el orden de siempre.
ALTER TABLE "Service" ADD COLUMN "ventaPos" INTEGER;
