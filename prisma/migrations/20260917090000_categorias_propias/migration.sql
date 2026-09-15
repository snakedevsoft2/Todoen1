-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductCategory_userId_position_idx" ON "ProductCategory"("userId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_userId_name_key" ON "ProductCategory"("userId", "name");

-- AddForeignKey
ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Categorias que ya se usaban: sin espacios de sobra, y las vacias a General.
UPDATE "Service" SET "category" = btrim(regexp_replace("category", '\s+', ' ', 'g'))
WHERE "category" <> btrim(regexp_replace("category", '\s+', ' ', 'g'));
UPDATE "Service" SET "category" = 'General' WHERE "category" = '' OR lower("category") = 'general';

-- Cada negocio arranca con las categorias que ya tenia, en orden alfabetico.
INSERT INTO "ProductCategory" ("id", "userId", "name", "position", "createdAt")
SELECT 'cat' || substr(md5(s."userId" || '/' || s."category"), 1, 22),
       s."userId",
       s."category",
       (ROW_NUMBER() OVER (PARTITION BY s."userId" ORDER BY lower(s."category"), s."category") - 1)::int,
       CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "userId", "category" FROM "Service" WHERE "category" <> 'General') s;
