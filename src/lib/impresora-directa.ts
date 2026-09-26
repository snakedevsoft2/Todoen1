/**
 * Mandarle el recibo directo a una termica, sin driver ni programa instalado.
 *
 * Muchas termicas de mostrador y casi todas las de bolsillo no traen driver
 * para Windows ni para el celular, asi que no aparecen en el dialogo de
 * impresion. Chrome y Edge si dejan hablarles directo:
 *
 * - Bluetooth (Web Bluetooth): las de bolsillo, desde el celular Android o el
 *   computador. Solo las que usan Bluetooth de bajo consumo (BLE); las que solo
 *   tienen Bluetooth clasico se emparejan en Windows y salen como puerto COM.
 * - Cable USB (WebUSB): la termica conectada por cable que no tiene driver,
 *   sobre todo en Android con cable OTG. En Windows, si la impresora ya tiene
 *   driver, Windows no la suelta: esa se imprime por el dialogo del sistema.
 * - Puerto COM (Web Serial): la emparejada por Bluetooth en Windows y la de
 *   cable serie o USB-serie.
 *
 * Safari (iPhone) y Firefox no tienen ninguna de las tres: ahi se imprime por
 * el dialogo del sistema, que en el iPhone es AirPrint.
 *
 * Nada de esto usa internet: la conexion es entre el equipo y la impresora.
 */

export type Conexion = "sistema" | "bluetooth" | "usb" | "serial";

export const CONEXIONES: { value: Conexion; label: string; hint: string }[] = [
  {
    value: "sistema",
    label: "Diálogo de impresión",
    hint: "Cualquier impresora instalada: la de oficina, la térmica con su driver, Wi-Fi o AirPrint.",
  },
  { value: "bluetooth", label: "Térmica por Bluetooth", hint: "Directo, sin instalar nada. En Chrome o Edge." },
  { value: "usb", label: "Térmica por cable USB", hint: "Directo, para la que no tiene driver. En Chrome o Edge." },
  { value: "serial", label: "Térmica por puerto COM", hint: "La emparejada por Bluetooth en Windows o la de cable serie." },
];

export function esConexion(v: unknown): v is Conexion {
  return v === "sistema" || v === "bluetooth" || v === "usb" || v === "serial";
}

/* Tipos minimos de las tres puertas: TypeScript no los trae. */

type Caracteristica = {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(d: Uint8Array): Promise<void>;
  writeValueWithoutResponse?(d: Uint8Array): Promise<void>;
};
type ServidorGatt = { getPrimaryServices(): Promise<{ getCharacteristics(): Promise<Caracteristica[]> }[]> };
type DispositivoBt = { gatt?: { connected: boolean; connect(): Promise<ServidorGatt> } };
type ApiBluetooth = {
  requestDevice(o: { acceptAllDevices: boolean; optionalServices: string[] }): Promise<DispositivoBt>;
};

type EndpointUsb = { direction: "in" | "out"; type: string; endpointNumber: number };
type DispositivoUsb = {
  opened: boolean;
  configuration: {
    interfaces: { interfaceNumber: number; alternate: { interfaceClass: number; endpoints: EndpointUsb[] } }[];
  } | null;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  releaseInterface(n: number): Promise<void>;
  transferOut(endpoint: number, d: Uint8Array): Promise<unknown>;
};
type ApiUsb = {
  getDevices(): Promise<DispositivoUsb[]>;
  requestDevice(o: { filters: object[] }): Promise<DispositivoUsb>;
};

type Puerto = {
  writable: WritableStream<Uint8Array> | null;
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
};
type ApiSerial = { getPorts(): Promise<Puerto[]>; requestPort(): Promise<Puerto> };

function apis() {
  return navigator as Navigator & { bluetooth?: ApiBluetooth; usb?: ApiUsb; serial?: ApiSerial };
}

/** Las formas de imprimir que este navegador sabe usar. El dialogo del sistema, siempre. */
export function conexionesDisponibles(): Conexion[] {
  const lista: Conexion[] = ["sistema"];
  if (typeof window === "undefined" || !window.isSecureContext) return lista;
  const n = apis();
  if (typeof n.bluetooth?.requestDevice === "function") lista.push("bluetooth");
  if (typeof n.usb?.requestDevice === "function") lista.push("usb");
  if (typeof n.serial?.requestPort === "function") lista.push("serial");
  return lista;
}

/** Un aviso para la persona: el mensaje en ingles del navegador no le sirve. */
class AvisoImpresora extends Error {}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- Bluetooth ---------- */

/**
 * Los servicios por los que reciben datos las termicas Bluetooth mas comunes.
 * El navegador solo deja usar los que se nombran aqui.
 */
const SERVICIOS_BT = [
  "000018f0-0000-1000-8000-00805f9b34fb", // La mayoria de las de bolsillo (MTP, Goojprt, PT-210...).
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000ae00-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Xprinter y parecidas.
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // Modulos Microchip.
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Modulos Nordic.
];

/** La impresora Bluetooth de esta visita, para no preguntar cada vez. */
let bt: { dispositivo: DispositivoBt; caracteristica: Caracteristica } | null = null;

async function caracteristicaDe(dispositivo: DispositivoBt): Promise<Caracteristica> {
  if (!dispositivo.gatt) throw new AvisoImpresora("Esa impresora no se deja conectar por Bluetooth.");
  const servidor = await dispositivo.gatt.connect();
  let servicios: Awaited<ReturnType<ServidorGatt["getPrimaryServices"]>> = [];
  try {
    servicios = await servidor.getPrimaryServices();
  } catch {
    // Sin servicios conocidos: cae al aviso de abajo.
  }
  for (const s of servicios) {
    for (const c of await s.getCharacteristics().catch(() => [])) {
      if (c.properties.writeWithoutResponse || c.properties.write) return c;
    }
  }
  throw new AvisoImpresora(
    "Esa impresora no recibe datos por Bluetooth desde el navegador. Imprime con el diálogo de impresión o por puerto COM."
  );
}

async function enviarBluetooth(datos: Uint8Array, elegirOtra: boolean): Promise<void> {
  const api = apis().bluetooth;
  if (!api) throw new AvisoImpresora("Este navegador no tiene Bluetooth. Usa Chrome o Edge.");

  if (bt && !elegirOtra && !bt.dispositivo.gatt?.connected) {
    try {
      bt.caracteristica = await caracteristicaDe(bt.dispositivo);
    } catch {
      bt = null;
    }
  }
  if (!bt || elegirOtra) {
    bt = null;
    const dispositivo = await api.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS_BT });
    bt = { dispositivo, caracteristica: await caracteristicaDe(dispositivo) };
  }

  const c = bt.caracteristica;
  const sinRespuesta = c.properties.writeWithoutResponse && typeof c.writeValueWithoutResponse === "function";
  const escribir = (parte: Uint8Array) =>
    sinRespuesta ? c.writeValueWithoutResponse!(parte) : c.writeValue(parte);

  /**
   * Se manda en pedazos: por Bluetooth cabe poco en cada envio.
   *
   * Sin confirmacion se mandan de a 20 bytes, que es lo que cabe siempre en
   * un paquete BLE. Antes se empezaba con 100 y, si fallaba, se reintentaba el
   * MISMO pedazo mas chico. El problema es que un envio "sin confirmacion"
   * puede fallar despues de que los bytes ya salieron: ahi el reintento los
   * mandaba dos veces, y lo que el papel muestra repetido no hay forma de
   * quitarlo. Con el tamano seguro desde el principio no hace falta reintentar,
   * y por lo tanto no hay forma de duplicar nada.
   *
   * Con confirmacion (writeValue) si se puede ir de a 100: ahi el navegador
   * espera el visto bueno de la impresora, asi que un error significa que no
   * llego, y no queda la duda.
   */
  const trozo = sinRespuesta ? 20 : 100;
  for (let i = 0; i < datos.length; i += trozo) {
    try {
      await escribir(datos.slice(i, i + trozo));
    } catch (error) {
      bt = null;
      throw error;
    }
    // Sin confirmacion, la impresora necesita un respiro para no perder datos.
    if (sinRespuesta) await pausa(12);
  }
}

/* ---------- Cable USB ---------- */

async function enviarUsb(datos: Uint8Array, elegirOtra: boolean): Promise<void> {
  const api = apis().usb;
  if (!api) throw new AvisoImpresora("Este navegador no deja usar el cable USB. Usa Chrome o Edge.");

  const conocidas = elegirOtra ? [] : await api.getDevices();
  const d = conocidas[0] ?? (await api.requestDevice({ filters: [] }));

  if (!d.opened) await d.open();
  if (!d.configuration) await d.selectConfiguration(1);

  // La interfaz de impresora (clase 7) si la hay; si no, cualquiera que reciba datos.
  const interfaces = d.configuration?.interfaces ?? [];
  const salida = (i: (typeof interfaces)[number]) =>
    i.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
  const elegida = interfaces.find((i) => i.alternate.interfaceClass === 7 && salida(i)) ?? interfaces.find((i) => salida(i));
  if (!elegida) throw new AvisoImpresora("Ese aparato USB no es una impresora que reciba datos.");

  try {
    await d.claimInterface(elegida.interfaceNumber);
  } catch {
    await d.close().catch(() => {});
    throw new AvisoImpresora(
      "El equipo ya tiene esa impresora tomada con su driver. Imprime con el diálogo de impresión."
    );
  }
  try {
    const ep = salida(elegida)!.endpointNumber;
    for (let i = 0; i < datos.length; i += 4096) await d.transferOut(ep, datos.slice(i, i + 4096));
  } finally {
    await d.releaseInterface(elegida.interfaceNumber).catch(() => {});
    await d.close().catch(() => {});
  }
}

/* ---------- Puerto COM ---------- */

async function enviarSerial(datos: Uint8Array, elegirOtra: boolean): Promise<void> {
  const api = apis().serial;
  if (!api) throw new AvisoImpresora("Este navegador no deja usar puertos COM. Usa Chrome o Edge en el computador.");

  const conocidos = elegirOtra ? [] : await api.getPorts();
  const puerto = conocidos[0] ?? (await api.requestPort());

  // 9600 es la velocidad de fabrica de las termicas de cable serie; a las
  // emparejadas por Bluetooth la velocidad no les importa.
  if (!puerto.writable) {
    try {
      await puerto.open({ baudRate: 9600 });
    } catch {
      throw new AvisoImpresora("No se pudo abrir ese puerto. Revisa que la impresora esté prendida y que otro programa no la esté usando.");
    }
  }
  const escritor = puerto.writable!.getWriter();
  try {
    await escritor.write(datos);
    await escritor.close();
  } finally {
    escritor.releaseLock();
    await puerto.close().catch(() => {});
  }
}

/**
 * Manda el recibo ya armado en ESC/POS.
 *
 * Con `elegirOtra` pregunta cual impresora usar aunque ya haya una conocida.
 * Tiene que llamarse justo al tocar el boton: el navegador solo deja buscar
 * impresoras durante unos segundos despues de un toque.
 *
 * Devuelve "cancelado" si la persona cerro la lista de impresoras sin elegir.
 */
export async function imprimirDirecto(
  conexion: Exclude<Conexion, "sistema">,
  datos: Uint8Array,
  elegirOtra: boolean
): Promise<"impreso" | "cancelado"> {
  try {
    if (conexion === "bluetooth") await enviarBluetooth(datos, elegirOtra);
    else if (conexion === "usb") await enviarUsb(datos, elegirOtra);
    else await enviarSerial(datos, elegirOtra);
    return "impreso";
  } catch (error) {
    if (error instanceof AvisoImpresora) throw error;
    const nombre = error instanceof DOMException ? error.name : "";
    // Cerrar la lista de impresoras sin elegir.
    if (nombre === "NotFoundError" || nombre === "AbortError") return "cancelado";
    if (nombre === "SecurityError") throw new Error("Toca imprimir otra vez para buscar la impresora.");
    if (nombre === "NotAllowedError") throw new Error("El navegador no dio permiso para usar la impresora.");
    throw new Error("No se pudo imprimir: revisa que la impresora esté prendida, con papel y cerca.");
  }
}
