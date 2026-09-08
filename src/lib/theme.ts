/**
 * Motor de temas.
 *
 * A partir de un solo color de marca y del tema elegido (claro u oscuro)
 * generamos toda la paleta como variables CSS. Tailwind lee esas variables,
 * asi que cambiar el color de la marca repinta la aplicacion entera.
 *
 * Este archivo no importa nada del servidor: se usa igual en el panel y en la
 * vista previa en vivo del apartado de personalizacion.
 */

export type ThemeName = "claro" | "oscuro";

export const DEFAULT_BRAND = "#2563eb";
export const DEFAULT_THEME: ThemeName = "claro";

export const BRAND_PRESETS: { name: string; color: string }[] = [
  { name: "Azul", color: "#2563eb" },
  { name: "Indigo", color: "#4f46e5" },
  { name: "Violeta", color: "#7c3aed" },
  { name: "Fucsia", color: "#c026d3" },
  { name: "Rojo", color: "#e11d48" },
  { name: "Naranja", color: "#ea580c" },
  { name: "Ambar", color: "#d97706" },
  { name: "Verde", color: "#16a34a" },
  { name: "Esmeralda", color: "#059669" },
  { name: "Turquesa", color: "#0891b2" },
  { name: "Grafito", color: "#475569" },
  { name: "Cafe", color: "#92400e" },
];

/** Deja el color en formato #rrggbb. Si no es valido devuelve el de por defecto. */
export function normalizeHex(input: string | null | undefined): string {
  const raw = String(input ?? "").trim();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(raw);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const full = /^#?([0-9a-f]{6})$/i.exec(raw);
  if (full) return `#${full[1]}`.toLowerCase();
  return DEFAULT_BRAND;
}

export function isTheme(value: string | null | undefined): value is ThemeName {
  return value === "claro" || value === "oscuro";
}

type Hsl = { h: number; s: number; l: number };

function hexToRgb(hex: string): [number, number, number] {
  const clean = normalizeHex(hex).slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function hexToHsl(hex: string): Hsl {
  const [r255, g255, b255] = hexToRgb(hex);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }

  return { h, s: s * 100, l: l * 100 };
}

/** Devuelve "R G B" para poder usarlo con la opacidad de Tailwind. */
export function hslTriplet(h: number, s: number, l: number): string {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const lig = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = lig - c / 2;
  return rgb.map((v) => Math.round((v + m) * 255)).join(" ");
}

/** Luminancia relativa, para decidir si el texto encima va blanco o negro. */
function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Color de texto legible sobre el color de marca. */
export function onBrand(hex: string): string {
  return luminance(hex) > 0.45 ? "17 24 39" : "255 255 255";
}

const SCALE: { stop: number; l: number; satFactor: number }[] = [
  { stop: 50, l: 97, satFactor: 0.55 },
  { stop: 100, l: 93, satFactor: 0.7 },
  { stop: 200, l: 86, satFactor: 0.8 },
  { stop: 300, l: 76, satFactor: 0.9 },
  { stop: 400, l: 64, satFactor: 1 },
  { stop: 500, l: 53, satFactor: 1 },
  { stop: 600, l: 45, satFactor: 1 },
  { stop: 700, l: 37, satFactor: 0.95 },
  { stop: 800, l: 30, satFactor: 0.9 },
  { stop: 900, l: 24, satFactor: 0.85 },
];

/** Escala completa de la marca, del 50 al 900, en tripletas "R G B". */
export function brandScale(hex: string): Record<number, string> {
  const { h, s } = hexToHsl(hex);
  const base = Math.max(30, Math.min(92, s));
  const out: Record<number, string> = {};
  for (const step of SCALE) {
    out[step.stop] = hslTriplet(h, base * step.satFactor, step.l);
  }
  return out;
}

/** Todas las variables CSS del tema. */
export function themeVars(brandHex: string, theme: ThemeName): Record<string, string> {
  const hex = normalizeHex(brandHex);
  const { h } = hexToHsl(hex);
  const scale = brandScale(hex);
  const dark = theme === "oscuro";

  const vars: Record<string, string> = {
    "--on-brand": onBrand(hex),
    "--brand-hex": hex,
  };
  for (const [stop, value] of Object.entries(scale)) vars[`--brand-${stop}`] = value;

  if (dark) {
    vars["--ink"] = hslTriplet(h, 20, 7);
    vars["--panel"] = hslTriplet(h, 17, 11);
    vars["--surface-2"] = hslTriplet(h, 15, 16);
    vars["--surface-3"] = hslTriplet(h, 14, 21);
    vars["--line"] = hslTriplet(h, 14, 20);
    vars["--line-strong"] = hslTriplet(h, 13, 28);
    vars["--text-strong"] = hslTriplet(h, 25, 97);
    vars["--text-body"] = hslTriplet(h, 12, 84);
    vars["--text-muted"] = hslTriplet(h, 9, 63);
    vars["--text-subtle"] = hslTriplet(h, 8, 48);
    vars["--good"] = "110 231 183";
    vars["--good-soft"] = hslTriplet(152, 45, 14);
    vars["--good-line"] = hslTriplet(152, 40, 26);
    vars["--bad"] = "253 164 175";
    vars["--bad-soft"] = hslTriplet(352, 50, 15);
    vars["--bad-line"] = hslTriplet(352, 45, 28);
    vars["--warn"] = "252 211 77";
    vars["--warn-soft"] = hslTriplet(40, 55, 14);
    vars["--warn-line"] = hslTriplet(40, 50, 27);
    vars["--good-solid"] = "16 185 129";
    vars["--on-good"] = "255 255 255";
    vars["--shadow"] = "0 0% 0%";
    vars["--scheme"] = "dark";
  } else {
    vars["--ink"] = hslTriplet(h, 30, 98);
    vars["--panel"] = "255 255 255";
    vars["--surface-2"] = hslTriplet(h, 30, 96);
    vars["--surface-3"] = hslTriplet(h, 26, 92);
    vars["--line"] = hslTriplet(h, 20, 89);
    vars["--line-strong"] = hslTriplet(h, 18, 80);
    vars["--text-strong"] = hslTriplet(h, 32, 13);
    vars["--text-body"] = hslTriplet(h, 20, 27);
    vars["--text-muted"] = hslTriplet(h, 14, 45);
    vars["--text-subtle"] = hslTriplet(h, 12, 57);
    vars["--good"] = hslTriplet(158, 74, 26);
    vars["--good-soft"] = hslTriplet(152, 62, 95);
    vars["--good-line"] = hslTriplet(152, 45, 82);
    vars["--bad"] = hslTriplet(350, 70, 42);
    vars["--bad-soft"] = hslTriplet(352, 80, 96);
    vars["--bad-line"] = hslTriplet(352, 60, 87);
    vars["--warn"] = hslTriplet(30, 85, 34);
    vars["--warn-soft"] = hslTriplet(42, 90, 94);
    vars["--warn-line"] = hslTriplet(40, 70, 82);
    vars["--good-solid"] = hslTriplet(158, 68, 34);
    vars["--on-good"] = "255 255 255";
    vars["--shadow"] = `${Math.round(h)} 25% 25%`;
    vars["--scheme"] = "light";
  }

  return vars;
}

/** Bloque CSS listo para inyectar en la pagina. */
export function themeCss(brandHex: string, theme: ThemeName, selector = ":root"): string {
  const vars = themeVars(brandHex, theme);
  const body = Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  const scheme = theme === "oscuro" ? "dark" : "light";
  return `${selector}{${body};color-scheme:${scheme}}`;
}
