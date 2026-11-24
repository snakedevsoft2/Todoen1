-- MB NAILS SPA (Jamundi): su lista de precios de mecato en el catalogo, junto
-- a los servicios (ver 20261124120000_servicios_mb_nails_spa). Lo pidio el
-- usuario el 23 nov 2026 con la foto de la lista: bebidas en "Bebidas" y los
-- paquetes en "Mecato".
--
-- Igual que la lista de servicios: solo la cuenta cuyo negocio se llama
-- "MB NAILS SPA" y solo si es una sola; las categorias se crean si faltan; lo
-- que ya exista con el mismo nombre no se repite, solo queda con el precio de
-- la lista. Son productos y no citas: no salen en la reserva en linea.
DO $$
DECLARE
  cuenta TEXT;
  cuantas INT;
  cat TEXT;
  r RECORD;
BEGIN
  SELECT count(*), min(id) INTO cuantas, cuenta
  FROM "User"
  WHERE regexp_replace(lower("businessName"), '[^a-z0-9]', '', 'g') = 'mbnailsspa'
    AND "email" NOT LIKE '%@test.local';

  IF cuantas <> 1 THEN
    RAISE NOTICE 'MB NAILS SPA: % cuentas con ese nombre, no se cargo el mecato', cuantas;
    RETURN;
  END IF;

  FOR r IN
    SELECT *
    FROM (
      VALUES
        (1, 'Coca Cola 400ml', 'Bebidas', 3500),
        (2, 'Soda Bretaña', 'Bebidas', 3000),
        (3, 'Vive 100', 'Bebidas', 4500),
        (4, 'Gatorade', 'Bebidas', 4500),
        (5, 'Jugo Hit 500ml', 'Bebidas', 3500),
        (6, 'Pepsi 400ml', 'Bebidas', 3500),
        (7, 'Manzana 400ml', 'Bebidas', 3500),
        (8, 'Uva 400ml', 'Bebidas', 3500),
        (9, 'Colombiana 400ml', 'Bebidas', 3500),
        (10, 'Seven Up 400ml', 'Bebidas', 3500),
        (11, 'Naranja 400ml', 'Bebidas', 3500),
        (12, 'Manzana 250ml', 'Bebidas', 2000),
        (13, 'Uva 250ml', 'Bebidas', 2000),
        (14, 'Colombiana 250ml', 'Bebidas', 2000),
        (15, 'Speed Max 250ml', 'Bebidas', 2500),
        (16, 'Agua con gas 250ml', 'Bebidas', 1000),
        (17, 'Chokis', 'Mecato', 2000),
        (18, 'Mas Picadota', 'Mecato', 1500),
        (19, 'Rosquillas', 'Mecato', 1500),
        (20, 'Papas rizadas', 'Mecato', 2600),
        (21, 'Palomitas', 'Mecato', 2500),
        (22, 'Tozineta', 'Mecato', 2500),
        (23, 'Yupi Gigante', 'Mecato', 2000),
        (24, 'Cheese Tris', 'Mecato', 2300),
        (25, 'Maní', 'Mecato', 1000)
    ) AS lista(pos, name, category, price)
    ORDER BY pos
  LOOP
    -- La categoria: la que ya tenga con ese nombre, o una nueva al final.
    SELECT name INTO cat
    FROM "ProductCategory"
    WHERE "userId" = cuenta
      AND regexp_replace(translate(lower(name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'), '[^a-z0-9]', '', 'g')
        = regexp_replace(translate(lower(r.category), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'), '[^a-z0-9]', '', 'g')
    LIMIT 1;
    IF cat IS NULL THEN
      INSERT INTO "ProductCategory" (id, "userId", name, position)
      SELECT gen_random_uuid()::text, cuenta, r.category, COALESCE(max(position), -1) + 1
      FROM "ProductCategory"
      WHERE "userId" = cuenta;
      cat := r.category;
    END IF;

    UPDATE "Service"
    SET price = r.price, "updatedAt" = CURRENT_TIMESTAMP
    WHERE "userId" = cuenta
      AND regexp_replace(translate(lower(name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'), '[^a-z0-9]', '', 'g')
        = regexp_replace(translate(lower(r.name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'), '[^a-z0-9]', '', 'g');

    IF NOT FOUND THEN
      INSERT INTO "Service" (id, "userId", name, price, category, bookable, "updatedAt")
      VALUES (gen_random_uuid()::text, cuenta, r.name, r.price, cat, false, CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END $$;
