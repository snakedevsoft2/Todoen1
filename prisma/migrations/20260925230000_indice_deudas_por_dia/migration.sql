-- La pantalla de Ventas lista las ventas del dia junto con los fiados del dia,
-- asi que consulta Debt por (userId, day) en cada visita. Sin este indice esa
-- consulta recorria la tabla de deudas completa.
CREATE INDEX "Debt_userId_day_idx" ON "Debt"("userId", "day");
