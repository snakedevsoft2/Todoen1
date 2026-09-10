-- AlterTable
ALTER TABLE "User" ADD COLUMN     "wholesaleNote" TEXT,
ADD COLUMN     "wholesaleOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wholesaleTitle" TEXT;

-- CreateTable
CREATE TABLE "WholesaleTier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "percentOff" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WholesaleTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WholesaleTier_userId_idx" ON "WholesaleTier"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WholesaleTier_userId_minQty_key" ON "WholesaleTier"("userId", "minQty");

-- AddForeignKey
ALTER TABLE "WholesaleTier" ADD CONSTRAINT "WholesaleTier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
