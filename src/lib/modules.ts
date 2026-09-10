import "server-only";
import { db } from "@/lib/db";
import type { NavItem } from "@/lib/nav";

export type { NavItem };

/**
 * El menu, leido de la base de datos.
 *
 * Antes la lista de apartados vivia en un archivo de codigo. Ahora vive en las
 * tablas Module y BusinessTypeModule, y lo que cada persona escogio vive en
 * WorkspaceConfig. Este archivo es el unico que traduce todo eso a un menu.
 *
 * La regla que manda: si un tipo de negocio no tiene fila en
 * BusinessTypeModule para un apartado, ese negocio no lo tiene. Ni apagado.
 * Asi es como la agenda por hora es de barberia y no puede aparecerse en un
 * restaurante por un descuido de codigo.
 */

export type Grupo = "FIJO" | "NUCLEO" | "DINERO" | "CRECIMIENTO" | "CONFIGURACION";

export const GRUPO_LABEL: Record<Grupo, string> = {
  FIJO: "Siempre a la mano",
  NUCLEO: "Tu oficio",
  DINERO: "La plata",
  CRECIMIENTO: "Para crecer",
  CONFIGURACION: "Configuracion",
};

export type Modulo = {
  key: string;
  href: string;
  /// Ya resuelto al nombre del oficio: "Barberos" y no "Equipo".
  label: string;
  icon: string;
  group: Grupo;
  short: string;
  long: string;
  /// Ejemplo en las palabras del oficio. Vacio si no se escribio uno.
  example: string | null;
  fixed: boolean;
  inSidebar: boolean;
  /// Si esta persona lo tiene encendido ahora mismo.
  visible: boolean;
};

type Sesion = {
  user: { id: string; businessType: string };
  staff: { id: string; role: string };
};

/** Lee las llaves guardadas. No llevan comas nunca, asi que basta separar. */
export function parseKeys(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Todo el catalogo de este negocio para esta persona, ya ordenado.
 *
 * Devuelve tambien lo apagado, porque el configurador necesita mostrarlo para
 * poder encenderlo. Quien quiera solo el menu que use menuDe().
 */
export async function modulosDe({ user, staff }: Sesion): Promise<Modulo[]> {
  const esDueno = staff.role === "DUENO";

  const [filas, config, overrides] = await Promise.all([
    db.businessTypeModule.findMany({
      where: { businessType: user.businessType, module: { active: true } },
      include: { module: true },
      orderBy: { sortOrder: "asc" },
    }),
    // El aislamiento va en la consulta: la config se pide por persona Y por
    // negocio, aunque el id de la persona ya sea unico.
    db.workspaceConfig.findFirst({ where: { staffId: staff.id, userId: user.id } }),
    // Lo que el administrador de la plataforma le prendio o le apago a esta
    // cuenta en particular.
    db.accountModule.findMany({ where: { userId: user.id } }),
  ]);

  /**
   * El interruptor del administrador manda sobre todo lo demas.
   *
   * Si dice que no, el apartado se saca de la lista entero, como si el oficio
   * no lo tuviera: no queda apagado y visible en el configurador, porque
   * entonces la persona lo prenderia y se preguntaria por que no funciona.
   */
  const apagadosPorAdmin = new Set(
    overrides.filter((o) => !o.enabled).map((o) => o.moduleKey)
  );
  const prendidosPorAdmin = new Set(
    overrides.filter((o) => o.enabled).map((o) => o.moduleKey)
  );

  const escondidos = new Set(parseKeys(config?.hiddenKeys));
  const orden = parseKeys(config?.orderKeys);
  // Un apartado que la config no menciona es uno que se estreno despues de que
  // la persona armo su menu: para ese manda lo que trae de fabrica.
  const conocidos = new Set([...escondidos, ...orden]);

  const modulos: Modulo[] = filas
    .filter((f) => !apagadosPorAdmin.has(f.module.key))
    .filter((f) => esDueno || !f.module.ownerOnly)
    // Si le falta la credencial, el apartado no se ofrece: mejor que no
    // aparezca a que aparezca y lleve a una pantalla rota.
    .filter((f) => !f.module.requiresEnv || Boolean(process.env[f.module.requiresEnv]))
    .map((f) => {
      const key = f.module.key;
      // Si el administrador lo prendio a mano, entra encendido aunque de
      // fabrica viniera apagado. Es la forma de estrenarle algo a una cuenta.
      const apagado = prendidosPorAdmin.has(key)
        ? escondidos.has(key)
        : config
          ? escondidos.has(key) || (!conocidos.has(key) && !f.enabledByDefault)
          : !f.enabledByDefault;

      return {
        key,
        href: f.module.href,
        label: f.labelOverride ?? f.module.label,
        icon: f.module.icon,
        group: f.module.group as Grupo,
        short: f.module.shortDescription,
        long: f.module.longDescription,
        example: f.example,
        fixed: f.module.fixed,
        inSidebar: f.module.inSidebar,
        // Lo fijo no se puede apagar aunque la config diga otra cosa.
        visible: f.module.fixed ? true : !apagado,
      };
    });

  if (orden.length === 0) return modulos;

  const posicion = new Map(orden.map((key, i) => [key, i]));
  return [...modulos].sort((a, b) => {
    const pa = posicion.get(a.key) ?? Number.MAX_SAFE_INTEGER;
    const pb = posicion.get(b.key) ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    // Empate: los que se estrenaron despues conservan el orden de fabrica.
    return modulos.indexOf(a) - modulos.indexOf(b);
  });
}


/** Lo que se pinta en el menu lateral. */
export function menuDe(modulos: Modulo[]): NavItem[] {
  return modulos
    .filter((m) => m.visible && m.inSidebar)
    .map((m) => ({ href: m.href, label: m.label, icon: m.icon }));
}

/**
 * Arreglos listos, para no ir encendiendo uno por uno.
 *
 * Devuelven las llaves que quedan encendidas. Lo fijo no hace falta nombrarlo:
 * se enciende solo.
 */
export type PresetKey = "esencial" | "fabrica" | "todo";

export const PRESETS: { key: PresetKey; label: string; hint: string }[] = [
  { key: "esencial", label: "Lo esencial", hint: "Tu oficio y la plata del dia" },
  { key: "fabrica", label: "Recomendado", hint: "Lo que traia al empezar" },
  { key: "todo", label: "Todo", hint: "Todos los apartados que tienes" },
];

/** El grupo de la plata que casi nadie puede dejar de llevar. */
const ESENCIALES = new Set(["ventas", "gastos", "caja"]);

export function presetKeys(preset: PresetKey, modulos: Modulo[], deFabrica: Set<string>): string[] {
  if (preset === "todo") return modulos.map((m) => m.key);
  if (preset === "fabrica") return modulos.filter((m) => deFabrica.has(m.key)).map((m) => m.key);
  return modulos
    .filter((m) => m.fixed || m.group === "NUCLEO" || ESENCIALES.has(m.key))
    .map((m) => m.key);
}

/** Lo que trae de fabrica este tipo de negocio, para el boton "Recomendado". */
export async function keysDeFabrica(businessType: string, esDueno: boolean): Promise<Set<string>> {
  const filas = await db.businessTypeModule.findMany({
    where: {
      businessType,
      enabledByDefault: true,
      module: { active: true, ...(esDueno ? {} : { ownerOnly: false }) },
    },
    select: { moduleKey: true },
  });
  return new Set(filas.map((f) => f.moduleKey));
}

/**
 * Deja anotado que alguien abrio un apartado.
 *
 * Sirve para una sola cosa: poder sugerirle al cliente que apague lo que nunca
 * abre, en vez de adivinar. Como la pregunta es "abre esto alguna vez" y no
 * "cuantas veces", guardamos una sola fila por apartado y por dia: con eso
 * alcanza y la tabla no crece sin control.
 *
 * Si falla no importa. No vale la pena tumbar una pagina por no poder anotar
 * una visita.
 */
export async function anotarVisita(userId: string, staffId: string, moduleKey: string) {
  try {
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);

    const yaHoy = await db.moduleEvent.findFirst({
      where: { userId, staffId, moduleKey, createdAt: { gte: desde } },
      select: { id: true },
    });
    if (yaHoy) return;

    await db.moduleEvent.create({ data: { userId, staffId, moduleKey } });
  } catch {
    // a proposito en silencio
  }
}

/**
 * Los apartados encendidos que esta persona no abre.
 *
 * Es lo unico que consume la telemetria: poder decirle "llevas dos meses sin
 * abrir Proveedores, lo apago?" en vez de dejarle un boton muerto en el menu.
 */
export async function apartadosSinUso(
  userId: string,
  staffId: string,
  modulos: Modulo[],
  dias = 60
): Promise<Modulo[]> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

  const vistos = await db.moduleEvent.findMany({
    where: { userId, staffId, createdAt: { gte: desde } },
    select: { moduleKey: true },
    distinct: ["moduleKey"],
  });
  const abiertos = new Set(vistos.map((v) => v.moduleKey));

  return modulos.filter((m) => m.visible && m.inSidebar && !m.fixed && !abiertos.has(m.key));
}
