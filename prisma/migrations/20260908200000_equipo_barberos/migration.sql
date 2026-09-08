-- Equipo de barberos: cada negocio puede tener varias personas que atienden,
-- cada una con su propio usuario, y los turnos y las ventas quedan a su nombre.

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('DUENO', 'BARBERO');

-- CreateTable
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "phone" TEXT,
    "role" "StaffRole" NOT NULL DEFAULT 'BARBERO',
    "color" TEXT NOT NULL DEFAULT '#0ea5e9',
    "commissionPct" INTEGER NOT NULL DEFAULT 0,
    "bookable" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Staff_email_key" ON "Staff"("email");

-- CreateIndex
CREATE INDEX "Staff_userId_active_idx" ON "Staff"("userId", "active");

-- AddForeignKey
ALTER TABLE "Staff" ADD CONSTRAINT "Staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- El dueno de cada negocio queda como la primera persona que atiende, para que
-- lo que ya estaba registrado siga teniendo un responsable.
INSERT INTO "Staff" ("id", "userId", "name", "role", "color", "bookable", "active", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "ownerName", 'DUENO', "brandColor", true, true, NOW(), NOW()
FROM "User";

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "staffId" TEXT,
ADD COLUMN     "staffName" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "staffId" TEXT;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Los turnos y las ventas que ya existian quedan a nombre del dueno.
UPDATE "Appointment" a
SET "staffId" = s."id", "staffName" = s."name"
FROM "Staff" s
WHERE s."userId" = a."userId" AND s."role" = 'DUENO' AND a."staffId" IS NULL;

UPDATE "Sale" v
SET "staffId" = s."id"
FROM "Staff" s
WHERE s."userId" = v."userId" AND s."role" = 'DUENO' AND v."staffId" IS NULL;

-- DropIndex
-- Antes solo podia haber un turno por hora en todo el negocio. Ahora puede
-- haber uno por barbero, asi los dos atienden a la misma hora.
DROP INDEX "Appointment_userId_day_startTime_key";

-- CreateIndex
CREATE INDEX "Appointment_userId_staffId_day_idx" ON "Appointment"("userId", "staffId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_userId_staffId_day_startTime_key" ON "Appointment"("userId", "staffId", "day", "startTime");

-- CreateIndex
CREATE INDEX "Sale_userId_staffId_day_idx" ON "Sale"("userId", "staffId", "day");
