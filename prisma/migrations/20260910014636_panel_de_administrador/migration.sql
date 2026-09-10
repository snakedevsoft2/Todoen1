-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "AccountModule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountModule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountModule_userId_idx" ON "AccountModule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountModule_userId_moduleKey_key" ON "AccountModule"("userId", "moduleKey");

-- AddForeignKey
ALTER TABLE "AccountModule" ADD CONSTRAINT "AccountModule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountModule" ADD CONSTRAINT "AccountModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "Module"("key") ON DELETE CASCADE ON UPDATE CASCADE;
