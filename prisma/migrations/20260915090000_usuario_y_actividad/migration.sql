-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "StaffActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "detalle" TEXT NOT NULL,
    "monto" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffActivity_userId_staffId_createdAt_idx" ON "StaffActivity"("userId", "staffId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffActivity_userId_createdAt_idx" ON "StaffActivity"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_username_key" ON "Staff"("username");

-- AddForeignKey
ALTER TABLE "StaffActivity" ADD CONSTRAINT "StaffActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffActivity" ADD CONSTRAINT "StaffActivity_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

