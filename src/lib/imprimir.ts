import { esFormato, type Formato } from "./tirilla";

/**
 * Mandar un PDF a la impresora de verdad.
 *
 * Desde el navegador no se puede hablar directo con una impresora, ni por USB
 * ni por Bluetooth: no existe esa puerta, y menos en el celular. Lo que si se
 * puede es abrirle el dialogo de impresion del sistema con el documento ya
 * cargado, y ahi el sistema usa el driver que tenga instalado. Eso funciona
 * igual con la termica del mostrador y con la de oficina.
 *
 * Se hace con un marco escondido: se le carga el PDF y se le pide imprimir.
 * En el computador eso abre el dialogo sin sacar a la persona de la pantalla
 * donde estaba.
 */

const CLAVE = "ten_formato_impresion";

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

/** Como termino el intento de imprimir, para poder decirselo a la persona. */
export type ResultadoImpresion = "dialogo" | "pestana";

/**
 * Abre el dialogo de impresion con este PDF.
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
