-- CreateEnum
CREATE TYPE "SignStatus" AS ENUM ('PENDIENTE', 'FIRMADO', 'ANULADO');

-- CreateTable
CREATE TABLE "SignRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdByStaffId" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "signerName" TEXT NOT NULL,
    "signerPhone" TEXT,
    "signerEmail" TEXT,
    "token" TEXT NOT NULL,
    "status" "SignStatus" NOT NULL DEFAULT 'PENDIENTE',
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedName" TEXT,
    "signedDocNumber" TEXT,
    "signerIp" TEXT,
    "signerAgent" TEXT,
    "signature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pdf" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "pages" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "spots" TEXT,
    "signedPdf" TEXT,
    "signedSha256" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SignRequest_token_key" ON "SignRequest"("token");

-- CreateIndex
CREATE INDEX "SignRequest_userId_createdAt_idx" ON "SignRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SignDocument_requestId_idx" ON "SignDocument"("requestId");

-- AddForeignKey
ALTER TABLE "SignRequest" ADD CONSTRAINT "SignRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignDocument" ADD CONSTRAINT "SignDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignDocument" ADD CONSTRAINT "SignDocument_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SignRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
