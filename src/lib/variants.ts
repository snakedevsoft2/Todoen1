/**
 * Ayudas de tallas y colores.
 *
 * Vive aparte de `inventory.ts` porque tambien lo usan los componentes del
 * navegador, y ese archivo toca la base de datos: si lo importaran, Prisma
 * terminaria dentro del paquete que descarga el celular del cliente.
 */

/** Como se lee una talla en pantalla: "M / Negro", "M", "Negro" o "Unica". */
export function variantLabel(v: { size: string; color: string }): string {
  const size = v.size?.trim();
  const color = v.color?.trim();
  const generic = (value: string | undefined) =>
    !value || value.toLowerCase() === "unica" || value.toLowerCase() === "unico";

  if (generic(size) && generic(color)) return "Unica";
  if (generic(color)) return size!;
  if (generic(size)) return color!;
  return size + " / " + color;
}

/** El precio de la talla, o el del producto si la talla no tiene uno propio. */
export function variantPrice(
  variant: { price: number | null },
  service: { price: number }
): number {
  return variant.price ?? service.price;
}

/** Tallas y colores mas comunes, para llenar el formulario en un toque. */
export const SIZE_PRESETS = ["XS", "S", "M", "L", "XL", "XXL", "Unica"];
export const NUMERIC_SIZES = ["28", "30", "32", "34", "36", "38", "40", "42"];
export const COLOR_PRESETS = [
  "Negro",
  "Blanco",
  "Gris",
  "Azul",
  "Beige",
  "Verde",
  "Rojo",
  "Rosado",
  "Unico",
];
