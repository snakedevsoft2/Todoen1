import { esConexion, type Conexion } from "./impresora-directa";
import { esFormato, TIRILLA_CSS, type Formato } from "./tirilla";

/**
 * Mandar un documento a la impresora por el dialogo de impresion del sistema.
 *
 * El sistema usa el driver que tenga instalado, asi que sirve con cualquier
 * impresora: la termica del mostrador, la de oficina, la de Wi-Fi o AirPrint.
 * Para las termicas sin driver esta impresora-directa.ts.
 */

const CLAVE = "ten_formato_impresion";
const CLAVE_CONEXION = "ten_conexion_impresion";

/** El tamano que eligio la ultima vez en ESTE equipo. */
export function formatoGuardado(): Formato | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return esFormato(v) ? v : null;
  } catch {
    // Navegador en privado o con el almacenamiento bloqueado: se pregunta otra vez.
    return null;
  }
}

export function guardarFormato(f: Formato): void {
  try {
    localStorage.setItem(CLAVE, f);
  } catch {
    // Que no se pueda recordar no impide imprimir.
  }
}

/** Como imprimio la ultima vez en ESTE equipo. */
export function conexionGuardada(): Conexion | null {
  try {
    const v = localStorage.getItem(CLAVE_CONEXION);
    return esConexion(v) ? v : null;
  } catch {
    return null;
  }
}

export function guardarConexion(c: Conexion): void {
  try {
    localStorage.setItem(CLAVE_CONEXION, c);
  } catch {
    // Igual que el tamano.
  }
}

const CLAVE_LETRA = "ten_letra_chica_impresion";

/**
 * Si en ESTE equipo se pidio la letra chica de la termica.
 *
 * Se guarda por equipo, como el tamano y la conexion, porque depende de la
 * impresora que tenga cada uno: hay termicas que no entienden el comando y
 * sueltan el papel en blanco. Por eso arranca apagado y lo prende la persona
 * despues de hacer una prueba. Ver LETRA_CHICA en lib/escpos.ts.
 */
export function letraChicaGuardada(): boolean {
  try {
    return localStorage.getItem(CLAVE_LETRA) === "1";
  } catch {
    return false;
  }
}

export function guardarLetraChica(si: boolean): void {
  try {
    localStorage.setItem(CLAVE_LETRA, si ? "1" : "0");
  } catch {
    // Que no se pueda recordar no impide imprimir.
  }
}

const ID = "ten-impresion";
let limpiarAnterior: (() => void) | null = null;

/**
 * Imprime un recibo armado con tirillaHtml.
 *
 * No usa internet ni carga nada: el recibo se pinta en la misma pagina, se
 * mide cuanto papel ocupa y se abre el dialogo. Por eso funciona sin senal.
 */
export async function imprimirHtml(html: string, formato: Formato, titulo?: string): Promise<void> {
  limpiarAnterior?.();

  const estilo = document.createElement("style");
  estilo.id = ID + "-estilo";
  estilo.textContent = TIRILLA_CSS;
  document.head.appendChild(estilo);

  const caja = document.createElement("div");
  caja.id = ID;
  caja.setAttribute("aria-hidden", "true");
  caja.innerHTML = html;
  document.body.appendChild(caja);

  const tituloAntes = document.title;
  let hecho = false;
  const limpiar = () => {
    if (hecho) return;
    hecho = true;
    caja.remove();
    estilo.remove();
    document.title = tituloAntes;
    if (limpiarAnterior === limpiar) limpiarAnterior = null;
  };
  limpiarAnterior = limpiar;

  // El logo: se espera un momento a que cargue, y si no carga se quita para
  // que no salga el cuadro de imagen rota.
  const imagenes = Array.from(caja.querySelectorAll("img"));
  await Promise.all(
    imagenes.map((img) =>
      img.complete
        ? null
        : new Promise((listo) => {
            img.onload = img.onerror = listo;
            setTimeout(listo, 2500);
          })
    )
  );
  for (const img of imagenes) if (!img.naturalWidth) img.remove();

  if (formato === "a4") {
    // Hoja: se deja el tamano de papel que tenga la impresora (carta o A4).
    estilo.textContent += "@page{margin:12mm}";
  } else {
    // Tirilla: una sola pagina del ancho del rollo y del alto del recibo.
    const px = (caja.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height ?? 0;
    const alto = Math.max(40, Math.ceil((px * 25.4) / 96) + 2);
    estilo.textContent += "@page{size:" + formato + "mm " + alto + "mm;margin:0}";
  }

  // El nombre que propone "Guardar como PDF".
  if (titulo) document.title = titulo;

  // En el computador print() espera a que se cierre el dialogo; en el celular
  // vuelve de una. Se limpia un rato despues de imprimir, y por si el aviso de
  // "ya imprimio" no llega, a los dos minutos.
  window.addEventListener("afterprint", () => setTimeout(limpiar, 1500), { once: true });
  setTimeout(limpiar, 120_000);
  await new Promise((r) => setTimeout(r, 30));
  window.print();
}

/** Como termino el intento de imprimir, para poder decirselo a la persona. */
export type ResultadoImpresion = "dialogo" | "pestana";

/**
 * Abre el dialogo de impresion con un PDF ya armado (reportes y planillas).
 *
 * Devuelve "dialogo" si se pudo desde la misma pantalla, o "pestana" si toco
 * abrirlo aparte. Lo segundo pasa sobre todo en el celular, donde el navegador
 * no deja imprimir un PDF metido en un marco: ahi se abre el visor del sistema
 * y desde ese visor se comparte o se imprime.
 */
export async function imprimirPdf(file: File): Promise<ResultadoImpresion> {
  const url = URL.createObjectURL(file);

  const limpiar = (marco?: HTMLIFrameElement) => {
    // Se espera antes de soltar el archivo: si se suelta de una, el dialogo de
    // impresion se queda sin el documento y sale una hoja en blanco.
    setTimeout(() => {
      marco?.remove();
      URL.revokeObjectURL(url);
    }, 60000);
  };

  const marco = document.createElement("iframe");
  marco.setAttribute("aria-hidden", "true");
  marco.style.position = "fixed";
  marco.style.right = "0";
  marco.style.bottom = "0";
  marco.style.width = "1px";
  marco.style.height = "1px";
  marco.style.opacity = "0";
  marco.style.border = "0";

  const cargado = new Promise<boolean>((resolve) => {
    marco.onload = () => resolve(true);
    marco.onerror = () => resolve(false);
    // Si el navegador no pinta el PDF, no se queda esperando para siempre.
    setTimeout(() => resolve(false), 4000);
  });

  marco.src = url;
  document.body.appendChild(marco);

  const ok = await cargado;
  if (ok) {
    try {
      marco.contentWindow?.focus();
      marco.contentWindow?.print();
      limpiar(marco);
      return "dialogo";
    } catch {
      // Cae a abrirlo aparte.
    }
  }

  marco.remove();
  window.open(url, "_blank", "noopener");
  limpiar();
  return "pestana";
}
