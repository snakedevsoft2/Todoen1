-- CreateEnum
CREATE TYPE "NoveltyKind" AS ENUM ('PERMISO', 'INCAPACIDAD', 'CALAMIDAD', 'LLEGADA_TARDE', 'SALIDA_TEMPRANO', 'VACACIONES', 'OTRO');

-- CreateEnum
CREATE TYPE "NoveltyStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "photo" TEXT;

-- AlterTable
ALTER TABLE "VisitPhoto" ADD COLUMN     "clientKey" TEXT;

-- AlterTable
ALTER TABLE "VisitReport" ADD COLUMN     "clientKey" TEXT,
ADD COLUMN     "seenAt" TIMESTAMP(3),
ADD COLUMN     "sentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Novelty" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "kind" "NoveltyKind" NOT NULL,
    "fromDay" TEXT NOT NULL,
    "toDay" TEXT NOT NULL,
    "fromTime" TEXT,
    "toTime" TEXT,
    "reason" TEXT NOT NULL,
    "photo" TEXT,
    "status" "NoveltyStatus" NOT NULL DEFAULT 'PENDIENTE',
    "clientKey" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByStaffId" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Novelty_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Novelty_clientKey_key" ON "Novelty"("clientKey");

-- CreateIndex
CREATE INDEX "Novelty_userId_status_idx" ON "Novelty"("userId", "status");

-- CreateIndex
CREATE INDEX "Novelty_staffId_fromDay_idx" ON "Novelty"("staffId", "fromDay");

-- CreateIndex
CREATE UNIQUE INDEX "VisitPhoto_clientKey_key" ON "VisitPhoto"("clientKey");

-- CreateIndex
CREATE UNIQUE INDEX "VisitReport_clientKey_key" ON "VisitReport"("clientKey");

-- AddForeignKey
ALTER TABLE "Novelty" ADD CONSTRAINT "Novelty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Novelty" ADD CONSTRAINT "Novelty_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Los reportes que ya existian se hicieron con la pantalla de antes, donde no
-- habia "enviar": se dan por enviados y vistos para que no le aparezcan de
-- golpe al administrador como nuevos.
UPDATE "VisitReport" SET "sentAt" = "createdAt", "seenAt" = "createdAt" WHERE "sentAt" IS NULL;
