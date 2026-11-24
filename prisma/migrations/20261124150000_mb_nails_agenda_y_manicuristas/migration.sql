-- MB NAILS SPA: pasa a barberia (la agenda por persona, con reserva en linea)
-- y se le crean sus 5 manicuristas. Lo pidio el usuario el 23 nov 2026; lo que
-- ven ellas y la dueña esta en lib/mb-nails.ts.
--
-- Igual que las listas de precios: solo la cuenta cuyo negocio se llama
-- "MB NAILS SPA", y solo si es una sola; si no, no se toca nada.
--
-- El cambio de tipo hace lo mismo que cambiarTipoNegocio (lib/tipo-negocio.ts):
-- menu de fabrica, empleados con el rol del oficio y el asistente de
-- bienvenida otra vez para la dueña. Solo si de verdad cambia.
--
-- Las manicuristas se crean con usuario pero SIN PIN: no pueden entrar hasta
-- que la dueña les ponga el suyo en Manicuristas > Cambiar acceso. Asi en el
-- repositorio (que es publico) no queda ninguna clave. No se repite una que
-- ya exista con el mismo nombre, y si el usuario ya lo tiene otra persona de
-- otro negocio, queda sin usuario (la dueña le pone otro).
DO $$
DECLARE
  cuenta TEXT;
  cuantas INT;
  tipo TEXT;
  r RECORD;
BEGIN
  SELECT count(*), min(id) INTO cuantas, cuenta
  FROM "User"
  WHERE regexp_replace(lower("businessName"), '[^a-z0-9]', '', 'g') = 'mbnailsspa'
    AND "email" NOT LIKE '%@test.local';

  IF cuantas <> 1 THEN
    RAISE NOTICE 'MB NAILS SPA: % cuentas con ese nombre, no se cambio nada', cuantas;
    RETURN;
  END IF;

  SELECT "businessType"::text INTO tipo FROM "User" WHERE id = cuenta;
  IF tipo <> 'BARBERIA' THEN
    UPDATE "User" SET "businessType" = 'BARBERIA', "updatedAt" = CURRENT_TIMESTAMP WHERE id = cuenta;
    DELETE FROM "WorkspaceConfig" WHERE "userId" = cuenta;
    UPDATE "Staff" SET "navHidden" = NULL, "navOrder" = NULL WHERE "userId" = cuenta;
    UPDATE "Staff" SET role = 'BARBERO' WHERE "userId" = cuenta AND role <> 'DUENO';
    UPDATE "Staff"
    SET "onboardingDoneAt" = NULL, "onboardingStep" = 0, "tourDoneAt" = NULL
    WHERE "userId" = cuenta AND role = 'DUENO';
  END IF;

  FOR r IN
    SELECT *
    FROM (
      VALUES
        (1, 'Jessica Gaitan', 'jessica.mbnails', '#e11d48'),
        (2, 'Paola Meléndez', 'paola.mbnails', '#a855f7'),
        (3, 'Natalia Rincon', 'natalia.mbnails', '#0ea5e9'),
        (4, 'Génesis Carpio', 'genesis.mbnails', '#f97316'),
        (5, 'Karen Botero', 'karen.mbnails', '#16a34a')
    ) AS lista(pos, name, username, color)
    ORDER BY pos
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM "Staff"
      WHERE "userId" = cuenta
        AND "deletedAt" IS NULL
        AND regexp_replace(translate(lower(name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'), '[^a-z0-9]', '', 'g')
          = regexp_replace(translate(lower(r.name), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun'), '[^a-z0-9]', '', 'g')
    ) THEN
      INSERT INTO "Staff" (id, "userId", name, username, role, color, "commissionPct", bookable, active, "updatedAt")
      VALUES (
        gen_random_uuid()::text,
        cuenta,
        r.name,
        CASE WHEN EXISTS (SELECT 1 FROM "Staff" WHERE username = r.username) THEN NULL ELSE r.username END,
        'BARBERO',
        r.color,
        0,
        true,
        true,
        CURRENT_TIMESTAMP
      );
    END IF;
  END LOOP;
END $$;
