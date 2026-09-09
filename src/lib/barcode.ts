/**
 * Lectura de codigos de barras en el navegador.
 *
 * Hay dos formas de escanear en un local, y la aplicacion soporta las dos:
 *
 * 1. La camara del celular. Aqui usamos el lector nativo del navegador cuando
 *    existe (Android) y, cuando no (iPhone), cargamos ZXing solo en ese momento
 *    para no engordar la aplicacion de quien nunca escanea.
 * 2. La pistola lectora USB o Bluetooth. Esa no necesita nada de esto: escribe
 *    el codigo como si fuera un teclado y manda Enter.
 */

// La normalizacion vive en variants.ts porque el servidor tambien la usa al
// guardar el codigo, y tiene que dejar exactamente el mismo texto.
import { normalizeCode } from "./variants";

export { normalizeCode };

/** Formatos tipicos de una etiqueta de ropa, mas QR por si acaso. */
const FORMATS = [
  "code_128",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_39",
  "itf",
  "codabar",
  "qr_code",
];

type NativeDetector = {
  detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
};

type NativeDetectorClass = {
  new (options?: { formats?: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

function nativeClass(): NativeDetectorClass | null {
  const w = window as unknown as { BarcodeDetector?: NativeDetectorClass };
  return typeof w.BarcodeDetector === "function" ? w.BarcodeDetector : null;
}

export type FrameDecoder = {
  /** Lee un fotograma ya dibujado. Devuelve el codigo o null si no vio ninguno. */
  read: (canvas: HTMLCanvasElement) => Promise<string | null>;
  /** true si lo hace el navegador; false si tocó cargar la libreria. */
  native: boolean;
};

export async function createDecoder(): Promise<FrameDecoder> {
  const Native = nativeClass();

  if (Native) {
    // Pedimos solo los formatos que el navegador dice soportar: pasarle uno
    // desconocido hace que falle la creacion entera del lector.
    let formats = FORMATS;
    try {
      const supported = await Native.getSupportedFormats?.();
      if (supported?.length) {
        const usable = FORMATS.filter((f) => supported.includes(f));
        if (usable.length) formats = usable;
      }
    } catch {
      // Si no sabe decir cuales soporta, probamos con la lista completa.
    }

    try {
      const detector = new Native({ formats });
      return {
        native: true,
        read: async (canvas) => {
          const found = await detector.detect(canvas);
          return found[0]?.rawValue ? normalizeCode(found[0].rawValue) : null;
        },
      };
    } catch {
      // Cae al lector de la libreria.
    }
  }

  // Carga diferida: ZXing pesa y solo hace falta cuando alguien escanea.
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const reader = new BrowserMultiFormatReader();

  return {
    native: false,
    read: async (canvas) => {
      try {
        const result = reader.decodeFromCanvas(canvas);
        const text = result?.getText?.();
        return text ? normalizeCode(text) : null;
      } catch {
        // ZXing lanza cuando no encuentra nada: es lo normal en cada fotograma.
        return null;
      }
    },
  };
}

/** Un pito corto y una vibracion, para saber que leyo sin mirar la pantalla. */
export function feedback() {
  try {
    navigator.vibrate?.(60);
  } catch {
    // En computador no hay vibracion y no pasa nada.
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    setTimeout(() => ctx.close(), 400);
  } catch {
    // Si el navegador no deja sonar, el aviso visual alcanza.
  }
}
