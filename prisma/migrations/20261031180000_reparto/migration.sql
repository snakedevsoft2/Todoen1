-- Reparto (Chopo Snacks): planillas diarias de los vendedores de ruta, con sus
-- productos, creditos, cobros y pagos. Solo tablas nuevas: no toca ninguna existente.
-- Para deshacerlo ver REPARTO.md (Rollback).
-- CreateEnum
CREATE TYPE "RepartoEstado" AS ENUM ('BORRADOR', 'CERRADA', 'ANULADA');

-- CreateTable
CREATE TABLE "RepartoProducto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "serviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepartoProducto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepartoPrecio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "desde" TEXT NOT NULL,

    CONSTRAINT "RepartoPrecio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepartoCliente" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "staffId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepartoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepartoPlanilla" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "acompanante" TEXT,
    "otrosDescuentos" INTEGER NOT NULL DEFAULT 0,
    "entregado" INTEGER NOT NULL DEFAULT 0,
    "entregadoDetalle" TEXT,
    "estado" "RepartoEstado" NOT NULL DEFAULT 'BORRADOR',
    "notes" TEXT,
    "createdById" TEXT,
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "auditoria" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "origenRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepartoPlanilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepartoLinea" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "productoId" TEXT NOT NULL,
    "carga" INTEGER NOT NULL DEFAULT 0,
    "cargaDetalle" TEXT,
    "devolucion" INTEGER NOT NULL DEFAULT 0,
    "precio" INTEGER NOT NULL,
    "base12" INTEGER NOT NULL DEFAULT 0,
    "iva" INTEGER NOT NULL DEFAULT 0,
    "unidVendCant" INTEGER NOT NULL DEFAULT 0,
    "unidVendValor" INTEGER NOT NULL DEFAULT 0,
    "docDescuento" TEXT,
    "dctoPrecio" INTEGER NOT NULL DEFAULT 0,
    "dctoPromocion" INTEGER NOT NULL DEFAULT 0,
    "caducadoCant" INTEGER NOT NULL DEFAULT 0,
    "devolUnidadesValor" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RepartoLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepartoCredito" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planillaId" TEXT,
    "clienteId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "documento" TEXT,
    "factura" TEXT,
    "valor" INTEGER NOT NULL,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RepartoCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepartoCobro" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "clienteId" TEXT,
    "creditoId" TEXT,
    "fechaDocumento" TEXT,
    "documento" TEXT,
    "factura" TEXT,
    "valor" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'COBRO',
    "revisar" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RepartoCobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepartoPago" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planillaId" TEXT NOT NULL,
    "documento" TEXT,
    "concepto" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'otro',
    "valor" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RepartoPago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepartoProducto_userId_idx" ON "RepartoProducto"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepartoProducto_userId_nameKey_key" ON "RepartoProducto"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "RepartoPrecio_userId_idx" ON "RepartoPrecio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepartoPrecio_productoId_desde_key" ON "RepartoPrecio"("productoId", "desde");

-- CreateIndex
CREATE INDEX "RepartoCliente_userId_idx" ON "RepartoCliente"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepartoCliente_userId_nameKey_key" ON "RepartoCliente"("userId", "nameKey");

-- CreateIndex
CREATE INDEX "RepartoPlanilla_userId_day_idx" ON "RepartoPlanilla"("userId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "RepartoPlanilla_userId_staffId_day_key" ON "RepartoPlanilla"("userId", "staffId", "day");

-- CreateIndex
CREATE INDEX "RepartoLinea_userId_idx" ON "RepartoLinea"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RepartoLinea_planillaId_productoId_key" ON "RepartoLinea"("planillaId", "productoId");

-- CreateIndex
CREATE INDEX "RepartoCredito_userId_clienteId_idx" ON "RepartoCredito"("userId", "clienteId");

-- CreateIndex
CREATE INDEX "RepartoCredito_planillaId_idx" ON "RepartoCredito"("planillaId");

-- CreateIndex
CREATE INDEX "RepartoCobro_userId_clienteId_idx" ON "RepartoCobro"("userId", "clienteId");

-- CreateIndex
CREATE INDEX "RepartoCobro_planillaId_idx" ON "RepartoCobro"("planillaId");

-- CreateIndex
CREATE INDEX "RepartoCobro_creditoId_idx" ON "RepartoCobro"("creditoId");

-- CreateIndex
CREATE INDEX "RepartoPago_userId_idx" ON "RepartoPago"("userId");

-- CreateIndex
CREATE INDEX "RepartoPago_planillaId_idx" ON "RepartoPago"("planillaId");

-- AddForeignKey
ALTER TABLE "RepartoProducto" ADD CONSTRAINT "RepartoProducto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoProducto" ADD CONSTRAINT "RepartoProducto_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoPrecio" ADD CONSTRAINT "RepartoPrecio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoPrecio" ADD CONSTRAINT "RepartoPrecio_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "RepartoProducto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCliente" ADD CONSTRAINT "RepartoCliente_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCliente" ADD CONSTRAINT "RepartoCliente_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoPlanilla" ADD CONSTRAINT "RepartoPlanilla_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoPlanilla" ADD CONSTRAINT "RepartoPlanilla_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoLinea" ADD CONSTRAINT "RepartoLinea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoLinea" ADD CONSTRAINT "RepartoLinea_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "RepartoPlanilla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoLinea" ADD CONSTRAINT "RepartoLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "RepartoProducto"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCredito" ADD CONSTRAINT "RepartoCredito_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCredito" ADD CONSTRAINT "RepartoCredito_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "RepartoPlanilla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCredito" ADD CONSTRAINT "RepartoCredito_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "RepartoCliente"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCobro" ADD CONSTRAINT "RepartoCobro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCobro" ADD CONSTRAINT "RepartoCobro_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "RepartoPlanilla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCobro" ADD CONSTRAINT "RepartoCobro_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "RepartoCliente"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoCobro" ADD CONSTRAINT "RepartoCobro_creditoId_fkey" FOREIGN KEY ("creditoId") REFERENCES "RepartoCredito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoPago" ADD CONSTRAINT "RepartoPago_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepartoPago" ADD CONSTRAINT "RepartoPago_planillaId_fkey" FOREIGN KEY ("planillaId") REFERENCES "RepartoPlanilla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

