import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Las pruebas hablan con la base de datos de verdad, asi que corren en serie
 * y sin limite de tiempo corto: una consulta real tarda mas que una simulada.
 */
export default defineConfig({
  resolve: {
    alias: {
      // El @ del proyecto, para que una prueba pueda importar igual que el codigo.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Ver tests/stub-server-only.ts.
      "server-only": fileURLToPath(new URL("./tests/stub-server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
