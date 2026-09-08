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
      },
      boxShadow: {
        soft: "0 1px 2px hsl(var(--shadow) / 0.06), 0 8px 24px -12px hsl(var(--shadow) / 0.18)",
        lift: "0 2px 4px hsl(var(--shadow) / 0.07), 0 16px 36px -18px hsl(var(--shadow) / 0.28)",
      },
      borderRadius: {
        xl: "0.75rem",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
