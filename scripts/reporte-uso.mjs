/**
 * Reporte de uso de la plataforma: que cuentas usan mas la aplicacion y quien
 * adentro de ellas.
 *
 * SOLO LEE. No escribe, no borra y no cambia nada: todas las consultas son
 * conteos y listados. Se puede correr contra produccion sin miedo.
 *
 * De donde sale cada numero:
 *   - Eventos: cada vez que alguien abre un apartado (tabla ModuleEvent).
 *   - Dias activos: dias distintos con al menos un evento.
 *   - Ultimo acceso: la marca de actividad de cada persona (Staff.lastSeenAt),
 *     que se escribe cada cinco minutos mientras alguien usa la aplicacion.
 *   - Registros: lo que de verdad hicieron en el periodo (ventas, prestamos,
 *     marcajes, gastos). Abrir pantallas no es lo mismo que trabajar en ellas.
 *
 * Uso:
 *   1. Pega la cadena de Neon en .env.neon.local:
 *        NEON_DATABASE_URL="postgresql://..."
 *   2. npm run uso                  ultimos 30 dias, produccion
 *      npm run uso -- 7             ultimos 7 dias
 *      npm run uso -- 30 --local    contra la base local
 */
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const local = args.includes("--local");
const dias = Math.max(1, Math.min(365, Number(args.find((a) => /^\d+$/.test(a)) ?? 30)));

let url;
if (local) {
  config();
  url = process.env.DATABASE_URL;
} else {
  config({ path: ".env.neon.local" });
  url = process.env.NEON_DATABASE_URL;
}

if (!url || url.includes("PEGA_AQUI")) {
  console.error(
    "\nFalta la cadena de la base de produccion.\n\n" +
      "Abre .env.neon.local y reemplaza PEGA_AQUI_LA_CADENA_DE_NEON por la tuya.\n" +
      "En Neon: Connect -> Show password -> Copy snippet.\n\n" +
      "Para probar contra la base local:  npm run uso -- 30 --local\n"
  );
  process.exit(1);
}

const db = new PrismaClient({ datasourceUrl: url });
const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

const fecha = (d) => (d ? d.toISOString().slice(0, 10) : "nunca");
const col = (v, n) => String(v ?? "").slice(0, n).padEnd(n);
const num = (v, n) => String(v ?? 0).padStart(n);

/** Cuenta registros por cuenta. Si una tabla no existe o cambio, no tumba el reporte. */
async function contarPor(modelo, campoFecha = "createdAt") {
  try {
    const filas = await db[modelo].groupBy({
      by: ["userId"],
      where: { [campoFecha]: { gte: desde } },
      _count: { _all: true },
    });
    return new Map(filas.map((f) => [f.userId, f._count._all]));
  } catch (e) {
    console.warn("  (no se pudo contar " + modelo + ": " + String(e.message ?? e).slice(0, 80) + ")");
    return new Map();
  }
}

try {
  const [cuentas, eventos, diasActivos, porPersona, porModulo, ventas, deudas, marcajes, gastos] =
    await Promise.all([
      db.user.findMany({
        select: {
          id: true,
          businessName: true,
          businessType: true,
          createdAt: true,
          suspendedAt: true,
          staff: { select: { id: true, name: true, active: true, lastSeenAt: true, role: true } },
        },
      }),
      db.moduleEvent.groupBy({
        by: ["userId"],
        where: { createdAt: { gte: desde } },
        _count: { _all: true },
      }),
      db.$queryRaw`
        SELECT "userId", COUNT(DISTINCT DATE("createdAt"))::int AS dias
        FROM "ModuleEvent" WHERE "createdAt" >= ${desde} GROUP BY "userId"`,
      db.moduleEvent.groupBy({
        by: ["staffId"],
        where: { createdAt: { gte: desde }, staffId: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { staffId: "desc" } },
        take: 15,
      }),
      db.moduleEvent.groupBy({
        by: ["moduleKey"],
        where: { createdAt: { gte: desde } },
        _count: { _all: true },
        orderBy: { _count: { moduleKey: "desc" } },
        take: 12,
      }),
      contarPor("sale"),
      contarPor("debt"),
      contarPor("attendance"),
      contarPor("expense"),
    ]);

  const evPor = new Map(eventos.map((e) => [e.userId, e._count._all]));
  const diasPor = new Map(diasActivos.map((d) => [d.userId, Number(d.dias)]));

  const filas = cuentas.map((c) => {
    const vistos = c.staff.filter((s) => s.lastSeenAt && s.lastSeenAt >= desde);
    const ultimo = c.staff.reduce((m, s) => (s.lastSeenAt && (!m || s.lastSeenAt > m) ? s.lastSeenAt : m), null);
    return {
      c,
      eventos: evPor.get(c.id) ?? 0,
      dias: diasPor.get(c.id) ?? 0,
      activos: vistos.length,
      personas: c.staff.filter((s) => s.active).length,
      ultimo,
      ventas: ventas.get(c.id) ?? 0,
      deudas: deudas.get(c.id) ?? 0,
      marcajes: marcajes.get(c.id) ?? 0,
      gastos: gastos.get(c.id) ?? 0,
    };
  });

  filas.sort(
    (a, b) =>
      b.eventos - a.eventos ||
      b.dias - a.dias ||
      (b.ultimo?.getTime() ?? 0) - (a.ultimo?.getTime() ?? 0)
  );

  const conActividad = filas.filter((f) => f.eventos > 0 || (f.ultimo && f.ultimo >= desde));

  console.log("\nREPORTE DE USO · ultimos " + dias + " dias · desde " + fecha(desde));
  console.log(
    cuentas.length + " cuentas registradas · " +
      conActividad.length + " con actividad en el periodo · " +
      (cuentas.length - conActividad.length) + " sin actividad\n"
  );

  console.log("CUENTAS, DE MAS A MENOS USO");
  console.log(
    " # " + col("Negocio", 26) + col("Oficio", 16) + num("Eventos", 8) + num("Dias", 6) +
      num("Gente", 7) + "  " + col("Ultimo", 11) + num("Ventas", 7) + num("Prest", 6) +
      num("Marc", 6) + num("Gastos", 7)
  );
  filas.forEach((f, i) => {
    console.log(
      num(i + 1, 2) + " " + col(f.c.businessName + (f.c.suspendedAt ? " (susp)" : ""), 26) +
        col(f.c.businessType, 16) + num(f.eventos, 8) + num(f.dias, 6) +
        num(f.activos + "/" + f.personas, 7) + "  " + col(fecha(f.ultimo), 11) +
        num(f.ventas, 7) + num(f.deudas, 6) + num(f.marcajes, 6) + num(f.gastos, 7)
    );
  });
  console.log("  Gente = personas que entraron en el periodo / personas activas de la cuenta.");

  const nombres = new Map();
  for (const c of cuentas) for (const s of c.staff) nombres.set(s.id, { persona: s.name, negocio: c.businessName, ultimo: s.lastSeenAt });

  console.log("\nQUIEN LA USA MAS (PERSONAS)");
  porPersona.forEach((p, i) => {
    const n = nombres.get(p.staffId);
    if (!n) return;
    console.log(
      num(i + 1, 2) + " " + col(n.persona, 22) + col(n.negocio, 26) + num(p._count._all, 7) +
        " eventos   ultimo " + fecha(n.ultimo)
    );
  });
  if (porPersona.length === 0) console.log("  Nadie registro actividad en el periodo.");

  console.log("\nAPARTADOS MAS ABIERTOS");
  porModulo.forEach((m, i) => console.log(num(i + 1, 2) + " " + col(m.moduleKey, 20) + num(m._count._all, 8)));

  const dormidas = filas.filter((f) => f.c.createdAt < desde && f.eventos === 0 && !(f.ultimo && f.ultimo >= desde));
  console.log("\nCUENTAS QUE NO VOLVIERON (registradas antes del periodo, sin actividad en el)");
  dormidas.slice(0, 20).forEach((f) =>
    console.log("  " + col(f.c.businessName, 30) + col(f.c.businessType, 16) + "registro " + fecha(f.c.createdAt) + "  ultimo " + fecha(f.ultimo))
  );
  if (dormidas.length === 0) console.log("  Ninguna.");
  console.log("");
} finally {
  await db.$disconnect();
}
