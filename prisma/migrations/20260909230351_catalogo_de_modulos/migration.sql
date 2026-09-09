-- CreateEnum
CREATE TYPE "ModuleGroup" AS ENUM ('FIJO', 'NUCLEO', 'DINERO', 'CRECIMIENTO', 'CONFIGURACION');

-- CreateTable
CREATE TABLE "Module" (
    "key" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "group" "ModuleGroup" NOT NULL,
    "shortDescription" TEXT NOT NULL,
    "longDescription" TEXT NOT NULL,
    "fixed" BOOLEAN NOT NULL DEFAULT false,
    "ownerOnly" BOOLEAN NOT NULL DEFAULT false,
    "requiresEnv" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Module_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "BusinessTypeModule" (
    "id" TEXT NOT NULL,
    "businessType" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabledByDefault" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "labelOverride" TEXT,
    "example" TEXT,

    CONSTRAINT "BusinessTypeModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "hiddenKeys" TEXT NOT NULL DEFAULT '',
    "orderKeys" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT,
    "moduleKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Module_href_key" ON "Module"("href");

-- CreateIndex
CREATE INDEX "BusinessTypeModule_businessType_idx" ON "BusinessTypeModule"("businessType");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessTypeModule_businessType_moduleKey_key" ON "BusinessTypeModule"("businessType", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceConfig_staffId_key" ON "WorkspaceConfig"("staffId");

-- CreateIndex
CREATE INDEX "WorkspaceConfig_userId_idx" ON "WorkspaceConfig"("userId");

-- CreateIndex
CREATE INDEX "ModuleEvent_userId_moduleKey_idx" ON "ModuleEvent"("userId", "moduleKey");

-- CreateIndex
CREATE INDEX "ModuleEvent_userId_createdAt_idx" ON "ModuleEvent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessTypeModule" ADD CONSTRAINT "BusinessTypeModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "Module"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceConfig" ADD CONSTRAINT "WorkspaceConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceConfig" ADD CONSTRAINT "WorkspaceConfig_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModuleEvent" ADD CONSTRAINT "ModuleEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
