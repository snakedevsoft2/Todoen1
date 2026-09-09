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
        /** Borde marcado de los bloques y color de la sombra dura. */
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
        /** Sombra dura desplazada: es lo que da el aire de bloque. */
        block: "3px 3px 0 0 rgb(var(--edge))",
        "block-lg": "5px 5px 0 0 rgb(var(--edge))",
        "block-brand": "3px 3px 0 0 rgb(var(--brand-600))",
      },
      borderRadius: {
        // Radios mas cerrados que los de Tailwind: el bloque quiere esquina.
        lg: "0.4rem",
        xl: "0.55rem",
        "2xl": "0.75rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
