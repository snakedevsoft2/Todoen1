-- AlterTable
ALTER TABLE "User" ADD COLUMN     "brandColor" TEXT NOT NULL DEFAULT '#2563eb',
ADD COLUMN     "logo" TEXT,
ADD COLUMN     "tagline" TEXT,
ADD COLUMN     "theme" TEXT NOT NULL DEFAULT 'claro';
