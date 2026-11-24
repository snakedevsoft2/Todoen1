-- MB NAILS SPA (Jamundi): su "Listado de precios 2026" en el catalogo. Lo
-- pidio el usuario el 23 nov 2026 con la foto de la lista; no hay acceso a la
-- base de produccion desde el equipo, asi que se carga al desplegar.
--
-- Solo la cuenta cuyo negocio se llama "MB NAILS SPA" (sin mirar mayusculas,
-- espacios ni puntos), y solo si es una sola: si no aparece o hay mas de una,
-- no se toca nada. Se la reconoce por el nombre del negocio y no por el
-- correo porque el repositorio es publico.
--
-- Las categorias se crean si faltan (o se usa la que ya tenga con ese nombre).
-- Un servicio que ya exista con el mismo nombre no se repite: solo queda con
-- el precio de la lista. Precios en pesos enteros, como Service.price.
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
    RAISE NOTICE 'MB NAILS SPA: % cuentas con ese nombre, no se cargo la lista', cuantas;
    RETURN;
  END IF;

  FOR r IN
    SELECT *
    FROM (
      VALUES
        (1, 'Tradicional (manos o pies)', 'Uñas', 25000, 'u'),
        (2, 'Limpieza (manos o pies)', 'Uñas', 15000, 'u'),
        (3, 'Semi (manos o pies)', 'Uñas', 45000, 'u'),
        (4, 'Base Rubber', 'Uñas', 60000, 'u'),
        (5, 'Dipping', 'Uñas', 75000, 'u'),
        (6, 'Press On', 'Uñas', 85000, 'u'),
        (7, 'Builder Gel', 'Uñas', 80000, 'u'),
        (8, 'Montaje Polygel', 'Uñas', 90000, 'u'),
        (9, 'Retoque Polygel', 'Uñas', 80000, 'u'),
        (10, 'Montaje Acrílico', 'Uñas', 90000, 'u'),
        (11, 'Retoque Acrílico', 'Uñas', 80000, 'u'),
        (12, 'Cejas con henna', 'Depilación con cera', 30000, NULL),
        (13, 'Cejas', 'Depilación con cera', 15000, NULL),
        (14, 'Cejas con cuchilla', 'Depilación con cera', 5000, NULL),
        (15, 'Bozo', 'Depilación con cera', 10000, NULL),
        (16, 'Mentón', 'Depilación con cera', 8000, NULL),
        (17, 'Axilas', 'Depilación con cera', 20000, NULL),
        (18, 'Brazos', 'Depilación con cera', 35000, NULL),
        (19, 'Media pierna', 'Depilación con cera', 40000, NULL),
        (20, 'Pierna completa', 'Depilación con cera', 55000, NULL),
        (21, 'Pestañas', 'Pestañas', 30000, 'p'),
        (22, 'Hidratación', 'Capilares', 60000, 'c'),
        (23, 'Nutrición', 'Capilares', 60000, 'c'),
        (24, 'Reconstrucción', 'Capilares', 80000, 'c'),
        (25, 'Terapia capilar', 'Capilares', 70000, 'c')
    ) AS lista(pos, name, category, price, nota)
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
      INSERT INTO "Service" (id, "userId", name, description, price, category, "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        cuenta,
        r.name,
        CASE r.nota
          WHEN 'u' THEN 'Desde este valor: depende del largo y el decorado. Para el precio exacto, envía foto del decorado.'
          WHEN 'c' THEN 'Desde este valor: depende del largo y lo abundante del cabello. Para el precio exacto, envía foto del cabello.'
          WHEN 'p' THEN 'Entre $30.000 y $35.000.'
        END,
        r.price,
        cat,
        CURRENT_TIMESTAMP
      );
    END IF;
  END LOOP;
END $$;
