-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "locationConsentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "liveTracking" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LocationPing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracyM" INTEGER,
    "clientKey" TEXT NOT NULL,

    CONSTRAINT "LocationPing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteVisit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "siteId" TEXT,
    "place" TEXT,
    "note" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracyM" INTEGER,
    "distanceM" INTEGER,
    "clientKey" TEXT NOT NULL,

    CONSTRAINT "SiteVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocationPing_clientKey_key" ON "LocationPing"("clientKey");

-- CreateIndex
CREATE INDEX "LocationPing_userId_at_idx" ON "LocationPing"("userId", "at");

-- CreateIndex
CREATE INDEX "LocationPing_staffId_at_idx" ON "LocationPing"("staffId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "SiteVisit_clientKey_key" ON "SiteVisit"("clientKey");

-- CreateIndex
CREATE INDEX "SiteVisit_userId_arrivedAt_idx" ON "SiteVisit"("userId", "arrivedAt");

-- CreateIndex
CREATE INDEX "SiteVisit_staffId_arrivedAt_idx" ON "SiteVisit"("staffId", "arrivedAt");

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationPing" ADD CONSTRAINT "LocationPing_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteVisit" ADD CONSTRAINT "SiteVisit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "WorkSite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

