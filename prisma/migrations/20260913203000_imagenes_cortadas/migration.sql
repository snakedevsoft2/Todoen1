-- Borra las imagenes que quedaron guardadas cortadas.
--
-- Desde el 12 de septiembre la portada, el logo y la foto de cada producto se
-- leian del formulario con el mismo tope de doscientos caracteres que los
-- nombres. Una imagen cortada sigue pareciendo base64, asi que pasaba la
-- validacion y quedaba guardada rota: en la pagina publica no aparecia la
-- portada, y el logo y las fotos salian como imagen rota.
--
-- Una imagen de verdad nunca mide exactamente doscientos caracteres, asi que
-- con eso se reconocen las danadas sin tocar las buenas. Dejarlas en NULL no
-- pierde nada que se estuviera viendo: la aplicacion pinta las iniciales
-- cuando no hay logo y omite la portada cuando no hay. Hay que volver a
-- subirlas.
UPDATE "User" SET "publicCover" = NULL
  WHERE length("publicCover") = 200 AND "publicCover" LIKE 'data:image/%';

UPDATE "User" SET "logo" = NULL
  WHERE length("logo") = 200 AND "logo" LIKE 'data:image/%';

UPDATE "Service" SET "image" = NULL
  WHERE length("image") = 200 AND "image" LIKE 'data:image/%';
