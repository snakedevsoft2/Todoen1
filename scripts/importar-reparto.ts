/**
 * Importa a Reparto el Excel de ventas por reparto (o su copia en JSON).
 *
 *   npx tsx scripts/importar-reparto.ts --cuenta choposnacks@gmail.com
 *       Ensayo: no escribe nada, dice lo que haria y si todo cuadra.
 *   npx tsx scripts/importar-reparto.ts --cuenta choposnacks@gmail.com --aplicar
 *       Importa. Se puede correr dos veces: lo ya importado se salta.
 *
 * Opciones:
 *   --archivo <ruta>       .xlsx con el formato del Excel, o .json (por defecto
 *                          prisma/datos/reparto-octubre-2026.json)
 *   --vendedor HOJA=Nombre quien del Equipo es cada hoja, si no se adivina
 *                          (ej: --vendedor "LUIS=Luis Andrimba"). Se repite.
 *   --exportar-json <ruta> guarda lo leido del Excel como JSON y termina.
 *
 * Usa la base del .env. Ver REPARTO.md.
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { FECHAS_CORREGIDAS, leerExcelReparto, type LibroReparto } from "../src/lib/reparto-excel";
import { claveVendedor, importarReparto, sugerirVendedor, type ProductoCatalogo } from "../src/lib/reparto-importar";

const args = process.argv.slice(2);
const valor = (nombre: string) => {
  const i = args.indexOf(nombre);
  return i >= 0 ? args[i + 1] : undefined;
};
const todos = (nombre: string) => args.flatMap((a, i) => (a === nombre && args[i + 1] ? [args[i + 1]] : []));

const archivo = valor("--archivo") ?? "prisma/datos/reparto-octubre-2026.json";
const libro: LibroReparto = archivo.toLowerCase().endsWith(".json")
  ? JSON.parse(readFileSync(archivo, "utf8"))
  : leerExcelReparto(readFileSync(archivo), { fechas: FECHAS_CORREGIDAS });

const exportar = valor("--exportar-json");
if (exportar) {
  writeFileSync(exportar, JSON.stringify(libro, null, 1) + "\n");
  console.log("Guardado " + exportar + ": " + libro.planillas.length + " planillas, " + libro.atrasadas.length + " cuentas atrasadas.");
  process.exit(0);
}

const correo = valor("--cuenta");
if (!correo) {
  console.error("Falta --cuenta <correo de la cuenta de Chopo Snacks>.");
  process.exit(1);
}

const db = new PrismaClient();
const plata = (c: number) => (c / 100).toFixed(2);

async function main() {
try {
  const cuenta = await db.user.findUnique({ where: { email: correo }, select: { id: true, businessName: true } });
  if (!cuenta) throw new Error("No hay ninguna cuenta con el correo " + correo + ".");
  const equipo = await db.staff.findMany({ where: { userId: cuenta.id, deletedAt: null }, select: { id: true, name: true } });

  // Quien es cada hoja: lo que se diga con --vendedor, y si no, el nombre de pila.
  const vendedores: Record<string, string> = {};
  for (const clave of new Set(libro.planillas.map(claveVendedor))) {
    const sugerido = sugerirVendedor(clave, equipo);
    if (sugerido) vendedores[clave] = sugerido;
  }
  for (const v of todos("--vendedor")) {
    const [clave, nombre] = v.split("=");
    const persona = equipo.find((s) => s.name.trim().toLowerCase() === nombre?.trim().toLowerCase());
    if (!persona) throw new Error("No hay nadie llamado \"" + nombre + "\" en el equipo de " + cuenta.businessName + ".");
    vendedores[clave.trim().toUpperCase()] = persona.id;
  }

  const catalogo: ProductoCatalogo[] = JSON.parse(readFileSync("prisma/datos/reparto-catalogo.json", "utf8"));
  const aplicar = args.includes("--aplicar");
  const r = await importarReparto(db, { userId: cuenta.id, libro, catalogo, vendedores, aplicar });

  console.log("\n" + (aplicar ? "IMPORTACIÓN" : "ENSAYO (no se escribió nada)") + " en " + cuenta.businessName);
  console.log("\nVendedores:");
  for (const [clave, id] of Object.entries(vendedores)) console.log("  " + clave + " -> " + equipo.find((s) => s.id === id)?.name);
  const porAccion = r.planillas.reduce<Record<string, number>>((s, p) => ((s[p.accion] = (s[p.accion] ?? 0) + 1), s), {});
  console.log("\nPlanillas: " + r.planillas.length + " " + JSON.stringify(porAccion) + ", que cuadran con el Excel: " + r.planillas.filter((p) => p.cuadra).length);
  console.log("\nTotales por hoja (ventas / crédito / contado / cartera / pagos / entregado / sobrante-faltante):");
  for (const t of r.totales) {
    console.log("  " + t.hoja.padEnd(8) + " " + t.dias + " días  " + [t.ventas, t.credito, t.contado, t.cartera, t.pagos, t.entregado, t.neto].map(plata).join(" / "));
  }
  console.log("\nProductos nuevos: " + r.productosNuevos.length + ". Clientes nuevos: " + r.clientesNuevos.length + ". Saldos iniciales: " + r.saldosIniciales + ". Cobros sin documento (a revisar): " + r.cobrosSinDocumento + ".");
  if (r.posiblesDuplicados.length) {
    console.log("\nClientes que parecen el mismo (NO se juntaron, revisar a mano):");
    for (const [a, b] of r.posiblesDuplicados) console.log("  " + a + "  ~  " + b);
  }
  if (r.carteraDistinta.length) {
    console.log("\nCartera calculada distinta a la última lista del Excel (" + r.carteraDistinta.length + " clientes):");
    for (const c of r.carteraDistinta.slice(0, 15)) console.log("  " + c.cliente + ": calculado " + plata(c.calculado) + ", Excel " + plata(c.excel));
  }
  for (const a of r.avisos) console.log("aviso: " + a);
  for (const e of r.errores) console.log("ERROR: " + e);
  if (r.errores.length) process.exitCode = 1;
  else console.log(aplicar ? "\nListo." : "\nTodo cuadra. Para importar de verdad, agrega --aplicar.");
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
}

void main();
