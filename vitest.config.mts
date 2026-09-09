import { defineConfig } from "vitest/config";

/**
 * Las pruebas hablan con la base de datos de verdad, asi que corren en serie
 * y sin limite de tiempo corto: una consulta real tarda mas que una simulada.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
