/**
 * Reemplazo de "server-only" para las pruebas.
 *
 * El paquete "server-only" no hace nada en tiempo de ejecucion: es un seguro
 * del empaquetador, que revienta a proposito si un archivo del servidor
 * termina dentro del paquete del navegador. Next lo sigue revisando igual al
 * compilar, que es donde importa.
 *
 * En las pruebas todo corre en Node, asi que ahi ese seguro solo estorbaba:
 * cualquier prueba que tocara (aunque fuera de refilon) un archivo marcado asi
 * fallaba con "This module cannot be imported from a Client Component". Ver
 * el alias en vitest.config.ts.
 */
export {};
