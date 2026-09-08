import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1120",
        panel: "#111a2e",
        line: "#1f2b45",
        brand: {
          50: "#eef6ff",
          100: "#d9ecff",
          200: "#b6d9ff",
          300: "#84beff",
          400: "#4a9bff",
          500: "#1f7aff",
          600: "#0a5ce0",
          700: "#0a49b4",
          800: "#0e3e91",
          900: "#123776",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
