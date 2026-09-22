/**
 * Plantillas de diseño del catálogo público.
 *
 * Igual que FONDOS en fondos.ts: colores fijos, no un selector libre, para que
 * la combinación siempre se vea cuidada. Cada plantilla trae su propio color
 * de acento y modo claro/oscuro, que se lo pasamos tal cual a themeCss()
 * (lib/theme.ts) apuntado al contenedor del catalogo en vez de a :root — asi
 * no tocamos el color de marca que el dueño ya eligio para el resto de la
 * aplicacion. "Clasica" es la unica que no trae acento propio: sigue usando
 * el color de marca del negocio, como el catalogo de siempre.
 *
 * Archivo puro: lo usan igual el servidor (pagina publica) y el navegador
 * (selector del panel).
 */

export type PlantillaKey =
  | "clasica"
  | "polaroid"
  | "editorial"
  | "industrial"
  | "nocturna"
  | "botanica"
  | "promo";

export type Plantilla = {
  key: PlantillaKey;
  label: string;
  hint: string;
  /** null en "clasica": usa el color de marca del propio negocio. */
  accent: string | null;
  scheme: "claro" | "oscuro";
  /** 2-3 colores para la muestra del selector. */
  swatch: string[];
};

export const PLANTILLAS: Plantilla[] = [
  {
    key: "clasica",
    label: "Clásica",
    hint: "Cálida y actual, con tu propio color de marca.",
    accent: null,
    scheme: "claro",
    swatch: ["#5856d6", "#ffffff", "#f2f2f7"],
  },
  {
    key: "polaroid",
    label: "Polaroid beige",
    hint: "Fotos con marco blanco y leve giro, para ropa y accesorios.",
    accent: "#8a6a4d",
    scheme: "claro",
    swatch: ["#8a6a4d", "#f4ede3", "#ffffff"],
  },
  {
    key: "editorial",
    label: "Editorial serif",
    hint: "Fino y minimalista, para joyería o boutique.",
    accent: "#4b4238",
    scheme: "claro",
    swatch: ["#4b4238", "#faf6f1", "#ffffff"],
  },
  {
    key: "industrial",
    label: "Industrial oscura",
    hint: "Fondo oscuro con specs, para mueblería o técnico.",
    accent: "#b08c4f",
    scheme: "oscuro",
    swatch: ["#b08c4f", "#1c1b1a", "#2a2826"],
  },
  {
    key: "nocturna",
    label: "Nocturna editorial",
    hint: "Alto contraste y elegante, para moda y fitness.",
    accent: "#c9a86a",
    scheme: "oscuro",
    swatch: ["#c9a86a", "#0b0b0d", "#1a1a1d"],
  },
  {
    key: "botanica",
    label: "Botánica fresca",
    hint: "Verde natural, para skincare, mercado o comida saludable.",
    accent: "#3f7d4a",
    scheme: "claro",
    swatch: ["#3f7d4a", "#f2f7ee", "#ffffff"],
  },
  {
    key: "promo",
    label: "Promo llamativa",
    hint: "Colores vivos y precio en sticker, para snacks y bebidas.",
    accent: "#d4232c",
    scheme: "claro",
    swatch: ["#d4232c", "#ffd23f", "#ffffff"],
  },
];

export function plantillaValida(v: unknown): v is PlantillaKey {
  return PLANTILLAS.some((p) => p.key === v);
}

/** La plantilla a usar. "clasica" si el valor guardado no es ninguna de la lista. */
export function plantillaDe(v: string | null | undefined): Plantilla {
  return PLANTILLAS.find((p) => p.key === v) ?? PLANTILLAS[0];
}
