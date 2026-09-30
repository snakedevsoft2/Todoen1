/**
 * Cuando un precio cobrado se sale de lo normal.
 *
 * Existe por un lavado de moto que se cobro en $30 en vez de $30.000: nadie
 * lo noto hasta que el resumen del dia no cuadro. Con esto:
 *   - antes de guardar, la confirmacion de la venta avisa del precio raro
 *     (precioRaro), para corregirlo ahi mismo;
 *   - si igual se guarda muy por debajo, al dueño le llega una notificacion
 *     (precioMuyBajo, ver avisarVentaGuardada en push.ts).
 *
 * "Normal" es el precio del catalogo (o de la talla). Sin precio de catalogo
 * no hay con que comparar y nunca es raro.
 *
 * No usa la base de datos: la importa tambien el navegador.
 */

/** Por debajo de la mitad del precio normal: probablemente un error, o un descuento que el dueño debe saber. */
export function precioMuyBajo(cobrado: number, normal: number | null | undefined): boolean {
  return Boolean(normal && normal > 0 && cobrado < normal * 0.5);
}

/** Muy por debajo, o mas del triple: vale la pena preguntar antes de guardar. */
export function precioRaro(cobrado: number, normal: number | null | undefined): boolean {
  return Boolean(normal && normal > 0 && (cobrado < normal * 0.5 || cobrado > normal * 3));
}
