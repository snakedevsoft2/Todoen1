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
        soft: "0 1px 2px 0 hsl(var(--shadow) / 0.05)",
        "soft-md":
          "0 1px 3px 0 hsl(var(--shadow) / 0.07), 0 1px 2px -1px hsl(var(--shadow) / 0.04)",
        "soft-lg":
          "0 12px 32px -10px hsl(var(--shadow) / 0.16), 0 2px 8px -3px hsl(var(--shadow) / 0.07)",
        /*
          La sombra de una tarjeta va en dos capas muy bajas: una pegada, que
          dibuja el canto, y otra abierta, que la despega del fondo. Una sola
          sombra fuerte se ve barata; dos suaves se ven caras.
        */
        card:
          "0 1px 1px 0 hsl(var(--shadow) / 0.04), 0 4px 16px -6px hsl(var(--shadow) / 0.08)",
        "card-hover":
          "0 1px 1px 0 hsl(var(--shadow) / 0.05), 0 10px 28px -8px hsl(var(--shadow) / 0.13)",
        /** Halo del campo enfocado, como el de la pantalla de ingreso. */
        "focus-brand": "0 0 0 4px rgb(var(--brand-500) / 0.12)",
      },
      /*
        Radios mas generosos. Un borde de 8px se lee como formulario; uno de 16
        se lee como aplicacion. Los controles van mas cerrados que las cajas,
        que es la proporcion que usa el telefono.
      */
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1.25rem",
        "3xl": "1.75rem",
      },
      transitionTimingFunction: {
        suave: "var(--ease-suave)",
        resorte: "var(--ease-resorte)",
      },
    },
  },
  plugins: [],
} satisfies Config;
