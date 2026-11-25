-- Novedades de cada cita: la clienta llego, no llego o le cambiaron el dia o la
-- hora. Las marca la manicurista de MB Nails y le llegan a la dueña (lo pidio
-- el usuario el 24 nov 2026). Ver lib/novedades-cita.ts.

-- CreateEnum
CREATE TYPE "AppointmentEventKind" AS ENUM ('LLEGO', 'NO_LLEGO', 'REPROGRAMADA');

-- CreateTable
CREATE TABLE "AppointmentEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "staffId" TEXT,
    "staffName" TEXT NOT NULL,
    "byOwner" BOOLEAN NOT NULL DEFAULT false,
    "kind" "AppointmentEventKind" NOT NULL,
    "clientName" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "fromDay" TEXT NOT NULL,
    "fromTime" TEXT NOT NULL,
    "toDay" TEXT,
    "toTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentEvent_userId_createdAt_idx" ON "AppointmentEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AppointmentEvent_userId_fromDay_idx" ON "AppointmentEvent"("userId", "fromDay");

-- CreateIndex
CREATE INDEX "AppointmentEvent_appointmentId_idx" ON "AppointmentEvent"("appointmentId");

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentEvent" ADD CONSTRAINT "AppointmentEvent_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

