-- AlterTable
ALTER TABLE "User" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'CO';


-- Los negocios que ya existian: el pais sale de su zona horaria.
UPDATE "User" SET "country" = CASE "timezone"
  WHEN 'America/Guayaquil' THEN 'EC'
  WHEN 'America/Mexico_City' THEN 'MX'
  WHEN 'America/Lima' THEN 'PE'
  WHEN 'America/Santiago' THEN 'CL'
  WHEN 'America/Argentina/Buenos_Aires' THEN 'AR'
  WHEN 'America/Caracas' THEN 'VE'
  WHEN 'America/Panama' THEN 'PA'
  WHEN 'America/Santo_Domingo' THEN 'DO'
  WHEN 'Europe/Madrid' THEN 'ES'
  ELSE 'CO'
END;
