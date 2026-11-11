"use client";

import {
  planillaHoja,
  planillaTexto,
  planillaTirilla,
  recibosDeCobro,
  recibosDeCobroHoja,
  type FilaCobro,
  type NegocioCobro,
} from "@/lib/cobro-dia";
import { BotonImprimir } from "./BotonImprimir";
import { Icon } from "./Icon";

/**
 * Los botones del cobro del dia (EM Inversiones): todos los recibos de una,
 * la planilla para el cobrador y la misma planilla por WhatsApp.
 *
 * Los recibos salen uno detras de otro en el rollo de la termica, o tres por
 * fila en hoja normal para recortarlos. Igual que cualquier otro recibo, el
 * tamaño y la impresora se eligen una vez en este equipo y quedan guardados.
 */
export function ImprimirCobro({
  filas,
  negocio,
  dia,
  soloBluetooth,
}: {
  filas: FilaCobro[];
  negocio: NegocioCobro;
  dia: string;
  /** El empleado solo imprime por la termica, sin dialogo (ver BotonImprimir). */
  soloBluetooth: boolean;
}) {
  if (filas.length === 0) return null;

  const enlaceWhatsapp = "https://wa.me/?text=" + encodeURIComponent(planillaTexto(filas, negocio, dia));

  return (
    <div className="flex flex-wrap items-start gap-2" data-cobro-del-dia>
      <BotonImprimir
        label={"Imprimir los recibos (" + filas.length + ")"}
        className="btn-primary btn-sm"
        menu="izquierda"
        tirilla={() => recibosDeCobro(filas, negocio, dia)}
        hoja={() => recibosDeCobroHoja(filas, negocio, dia)}
        nombreArchivo={"recibos-cobro-" + dia}
        soloBluetooth={soloBluetooth}
      />
      <BotonImprimir
        label="Imprimir la planilla"
        menu="izquierda"
        tirilla={() => planillaTirilla(filas, negocio, dia)}
        hoja={() => planillaHoja(filas, negocio, dia)}
        nombreArchivo={"planilla-cobro-" + dia}
        soloBluetooth={soloBluetooth}
      />
      <a href={enlaceWhatsapp} target="_blank" rel="noopener noreferrer" className="btn-success btn-sm">
        <Icon name="whatsapp" className="h-4 w-4" />
        Planilla por WhatsApp
      </a>
    </div>
  );
}
