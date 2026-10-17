-- Eliminar a alguien del equipo: la persona desaparece, sus registros no.
-- La fila se queda (las ventas, los lavados y los marcajes la siguen
-- nombrando), pero sin sus datos y con el nombre "Ex colaborador".
ALTER TABLE "Staff" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Los que se eliminaron antes de esto quedaban desactivados, sin correo, sin
-- usuario y sin clave, y con la sesion cerrada (sessionVersion > 0): seguian
-- saliendo en Equipo con su nombre. Ahora quedan como los que se eliminen
-- desde aqui.
UPDATE "Staff"
SET "deletedAt" = "updatedAt",
    "name" = 'Ex colaborador',
    "color" = '#94a3b8',
    "phone" = NULL,
    "photo" = NULL,
    "securityQuestion" = NULL,
    "securityAnswerHash" = NULL,
    "bookable" = false
WHERE "active" = false
  AND "role" <> 'DUENO'
  AND "email" IS NULL
  AND "username" IS NULL
  AND "passwordHash" IS NULL
  AND "sessionVersion" > 0;
