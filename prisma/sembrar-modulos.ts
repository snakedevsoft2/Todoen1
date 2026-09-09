/**
 * Deja el catalogo de apartados en la base tal como esta escrito en modulos.ts.
 *
 * Se puede correr las veces que sea: actualiza lo que cambio, crea lo nuevo y
 * borra las combinaciones que ya no estan. Corre en cada despliegue para que
 * un texto corregido llegue sin tener que tocar la base a mano.
 */
import { PrismaClient } from "@prisma/client";
import { MODULOS, PRESETS, TIPOS, type Tipo } from "./modulos";

const db = new PrismaClient();

/** Traduce las direcciones viejas a llaves de modulo. */
function llavePorHref(href: string): string | null {
  const m = MODULOS.find((x) => x.href === href);
  return m ? m.key : null;
}

/**
 * Pasa la configuracion vieja de Staff a su propia tabla.
 *
 * Antes se guardaban direcciones sueltas en dos columnas de Staff. Ahora se
 * guardan llaves de modulo en WorkspaceConfig. Esto lo hace una sola vez: si
 * la persona ya tiene su fila, no se toca, para no pisar lo que ya configuro.
 */
async function mudarConfiguracionVieja() {
  const conConfig = await db.staff.findMany({
    where: {
      OR: [{ navHidden: { not: null } }, { navOrder: { not: null } }],
      workspace: null,
    },
    select: { id: true, userId: true, navHidden: true, navOrder: true },
  });

  if (conConfig.length === 0) return 0;

  const aLlaves = (raw: string | null) =>
    (raw ?? "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean)
      .map(llavePorHref)
      .filter((k): k is string => Boolean(k))
      .join(",");

  for (const s of conConfig) {
    await db.workspaceConfig.create({
      data: {
        userId: s.userId,
        staffId: s.id,
        hiddenKeys: aLlaves(s.navHidden),
        orderKeys: aLlaves(s.navOrder),
      },
    });
  }

  return conConfig.length;
}

async function main() {
  // 1. El catalogo maestro.
  for (const m of MODULOS) {
    const datos = {
      href: m.href,
      label: m.label,
      icon: m.icon,
      group: m.group,
      shortDescription: m.shortDescription,
      longDescription: m.longDescription,
      fixed: m.fixed ?? false,
      ownerOnly: m.ownerOnly ?? false,
      inSidebar: m.inSidebar ?? true,
      requiresEnv: m.requiresEnv ?? null,
      sortOrder: m.sortOrder,
      active: true,
    };
    await db.module.upsert({
      where: { key: m.key },
      create: { key: m.key, ...datos },
      update: datos,
    });
  }

  // Un apartado que se saco del catalogo se apaga, no se borra: si alguien lo
  // tenia en su menu, borrarlo se llevaria su configuracion por delante.
  const llaves = MODULOS.map((m) => m.key);
  const apagados = await db.module.updateMany({
    where: { key: { notIn: llaves }, active: true },
    data: { active: false },
  });

  // 2. Que le toca a cada oficio.
  let filas = 0;
  for (const tipo of TIPOS) {
    const preset = PRESETS[tipo as Tipo];
    const deEsteTipo = Object.keys(preset);

    for (const key of deEsteTipo) {
      const modulo = MODULOS.find((m) => m.key === key);
      if (!modulo) throw new Error("El preset de " + tipo + " menciona un modulo que no existe: " + key);

      const p = preset[key];
      const datos = {
        enabledByDefault: p.on ?? true,
        sortOrder: p.orden ?? modulo.sortOrder,
        labelOverride: p.label ?? null,
        example: p.ejemplo ?? null,
      };
      await db.businessTypeModule.upsert({
        where: { businessType_moduleKey: { businessType: tipo, moduleKey: key } },
        create: { businessType: tipo, moduleKey: key, ...datos },
        update: datos,
      });
      filas++;
    }

    // Lo que ya no aparece en el preset se borra de verdad: es lo que hace que
    // la agenda por hora no exista para un restaurante, ni siquiera apagada.
    await db.businessTypeModule.deleteMany({
      where: { businessType: tipo, moduleKey: { notIn: deEsteTipo } },
    });
  }

  const mudados = await mudarConfiguracionVieja();

  console.log("Modulos en el catalogo:      " + MODULOS.length);
  console.log("Modulos apagados por viejos: " + apagados.count);
  console.log("Filas tipo-de-negocio:       " + filas);
  console.log("Configuraciones mudadas:     " + mudados);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
