import type { Config } from "tailwindcss";

/** Todos los colores salen de variables CSS, asi el negocio puede cambiarlos. */
const withAlpha = (variable: string) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: withAlpha("--ink"),
        panel: withAlpha("--panel"),
        surface: withAlpha("--surface-2"),
        "surface-3": withAlpha("--surface-3"),
        line: withAlpha("--line"),
        "line-strong": withAlpha("--line-strong"),
        /** Borde algo mas marcado, para separar sin gritar. */
        edge: withAlpha("--edge"),
        strong: withAlpha("--text-strong"),
        body: withAlpha("--text-body"),
        muted: withAlpha("--text-muted"),
        subtle: withAlpha("--text-subtle"),
        good: withAlpha("--good"),
        "good-soft": withAlpha("--good-soft"),
        "good-line": withAlpha("--good-line"),
        "good-solid": withAlpha("--good-solid"),
        "on-good": withAlpha("--on-good"),
        bad: withAlpha("--bad"),
        "bad-soft": withAlpha("--bad-soft"),
        "bad-line": withAlpha("--bad-line"),
        warn: withAlpha("--warn"),
        "warn-soft": withAlpha("--warn-soft"),
        "warn-line": withAlpha("--warn-line"),
        "on-brand": withAlpha("--on-brand"),
        brand: {
          50: withAlpha("--brand-50"),
          100: withAlpha("--brand-100"),
          200: withAlpha("--brand-200"),
          300: withAlpha("--brand-300"),
          400: withAlpha("--brand-400"),
          500: withAlpha("--brand-500"),
          600: withAlpha("--brand-600"),
          700: withAlpha("--brand-700"),
          800: withAlpha("--brand-800"),
          900: withAlpha("--brand-900"),
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Arial",
          "sans-serif",
        ],
        /** Titulos y plata: la version negra de la misma familia. */
        display: ["var(--font-display)", "var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        /*
          Sombras de apoyo, no de decoracion.

          La jerarquia la lleva el borde y el espacio; la sombra solo despega
          del fondo lo que de verdad flota. Salen de --shadow (un fragmento
          HSL que cambia con el tema) para que en oscuro no se vean sucias.
        */
        soft: "0 1px 2px 0 hsl(var(--shadow) / 0.06)",
        "soft-md":
          "0 1px 3px 0 hsl(var(--shadow) / 0.08), 0 1px 2px -1px hsl(var(--shadow) / 0.05)",
        "soft-lg":
          "0 10px 26px -8px hsl(var(--shadow) / 0.14), 0 2px 6px -2px hsl(var(--shadow) / 0.06)",
        /** Halo del campo enfocado, como el de la pantalla de ingreso. */
        "focus-brand": "0 0 0 3px rgb(var(--brand-500) / 0.14)",
      },
      borderRadius: {
        lg: "0.5rem",
        xl: "0.625rem",
        "2xl": "0.875rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
