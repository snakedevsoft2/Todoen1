-- CreateTable
CREATE TABLE "OfflineAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PROCESANDO',
    "mensaje" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfflineAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfflineAction_clientKey_key" ON "OfflineAction"("clientKey");

-- CreateIndex
CREATE INDEX "OfflineAction_userId_createdAt_idx" ON "OfflineAction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "OfflineAction" ADD CONSTRAINT "OfflineAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

