-- CreateTable
CREATE TABLE "ScanDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffId" TEXT,
    "title" TEXT NOT NULL,
    "pdf" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "pages" INTEGER NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScanDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScanDocument_userId_createdAt_idx" ON "ScanDocument"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "ScanDocument" ADD CONSTRAINT "ScanDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

