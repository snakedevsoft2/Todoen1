-- El PIN de 4 numeros con que entran las manicuristas de MB Nails Spa con su
-- usuario (ver lib/mb-nails.ts). Se guarda con bcrypt, como la contraseña.
ALTER TABLE "Staff" ADD COLUMN "pinHash" TEXT;
