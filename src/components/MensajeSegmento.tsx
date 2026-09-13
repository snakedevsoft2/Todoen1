"use client";

import Link from "next/link";
import { useState } from "react";
import { registrarEnvioAction } from "@/actions/crm";
import { CANALES_MENSAJE, aplicarPlantilla, telefonoVisible } from "@/lib/crm";
import { programarSegmentoAction } from "@/actions/mensajes";
import { Icon } from "./Icon";

export type Destinatario = {
  id: string;
  name: string;
  /** Solo digitos, con indicativo. Null si no tiene telefono. */
  phone: string | null;
};

/**
 * Escribirle a un grupo de clientes por WhatsApp.
 *
 * Es un enlace por cliente y no un envio masivo a proposito: WhatsApp bloquea
 * los numeros que mandan el mismo mensaje a muchos de golpe, y el negocio
 * perderia su numero. Tocar uno por uno es mas lento pero no arriesga nada.
 * Cada mensaje que sale queda anotado en la ficha del cliente.
 */
export function MensajeSegmento({
  destinatarios,
  negocio,
}: {
  destinatarios: Destinatario[];
  negocio: string;
}) {
  const [plantilla, setPlantilla] = useState("Hola {nombre}, te escribimos de {negocio}. ");
  const [enviados, setEnviados] = useState<Set<string>>(new Set());
  const [copiado, setCopiado] = useState(false);
  const [cuando, setCuando] = useState("ahora");
  const [fecha, setFecha] = useState("");
  const [canal, setCanal] = useState("auto");
  const [programando, setProgramando] = useState(false);
  const [resultado, setResultado] = useState<{ ok?: string; error?: string } | null>(null);

  const conTelefono = destinatarios.filter((d) => d.phone);
  const ejemplo = destinatarios[0]
    ? aplicarPlantilla(plantilla, { nombre: destinatarios[0].name, negocio })
    : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(conTelefono.map((d) => telefonoVisible(d.phone!)).join("\n"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  function alEnviar(d: Destinatario, mensaje: string) {
    setEnviados((prev) => new Set(prev).add(d.id));
    registrarEnvioAction(d.id, mensaje).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label" htmlFor="plantilla">
          Mensaje
        </label>
        <textarea
          id="plantilla"
          className="input min-h-[96px]"
          maxLength={1000}
          value={plantilla}
          onChange={(e) => setPlantilla(e.target.value)}
        />
        <p className="mt-1 text-xs text-subtle">
          <code className="rounded bg-surface px-1">{"{nombre}"}</code> se cambia por el primer nombre de
          cada cliente y <code className="rounded bg-surface px-1">{"{negocio}"}</code> por el tuyo.
        </p>
        {ejemplo && (
          <p className="mt-2 rounded-xl rounded-bl-sm bg-good-soft px-3 py-2 text-sm text-strong [overflow-wrap:anywhere]">
            {ejemplo}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted">
          {enviados.size} de {conTelefono.length} enviados
        </p>
        <button
          type="button"
          onClick={copiar}
          disabled={conTelefono.length === 0}
          className="btn-ghost btn-sm ml-auto"
        >
          <Icon name={copiado ? "check" : "phone"} className="h-4 w-4" />
          {copiado ? "Copiados" : "Copiar teléfonos"}
        </button>
      </div>

      <details className="rounded-xl border border-line bg-surface px-3 py-2.5" data-programar-segmento>
        <summary className="cursor-pointer text-sm font-semibold text-strong">
          Programar para todos (sale solo)
        </summary>
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {[
              { key: "ahora", label: "Ahora" },
              { key: "manana", label: "Mañana 9 a. m." },
              { key: "semana", label: "En una semana" },
              { key: "fecha", label: "Otra fecha" },
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                aria-pressed={cuando === c.key}
                onClick={() => setCuando(c.key)}
                className={
                  "rounded-full border px-3 py-1 text-[13px] font-semibold " +
                  (cuando === c.key ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-panel text-body")
                }
              >
                {c.label}
              </button>
            ))}
          </div>
          {cuando === "fecha" && (
            <input className="input" type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Fecha y hora" />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <select className="input h-9 w-auto py-1 text-sm" value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Por dónde">
              {CANALES_MENSAJE.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={programando || destinatarios.length === 0}
              onClick={async () => {
                setProgramando(true);
                setResultado(null);
                try {
                  setResultado(await programarSegmentoAction(destinatarios.map((d) => d.id), plantilla, canal, cuando, fecha));
                } catch {
                  setResultado({ error: "No se pudo programar. Revisa tu conexión." });
                } finally {
                  setProgramando(false);
                }
              }}
            >
              {programando ? "Programando…" : "Programar para " + destinatarios.length}
            </button>
          </div>
          {resultado?.ok && <p className="text-[13px] font-semibold text-good">{resultado.ok}</p>}
          {resultado?.error && <p className="text-[13px] text-bad">{resultado.error}</p>}
          <p className="text-[11px] text-muted">
            Sale por WhatsApp o correo según lo que tengas conectado. Lo que no pueda salir solo queda en Clientes › Mensajes.
          </p>
        </div>
      </details>

      <ul className="animate-lista">
        {destinatarios.map((d) => {
          const mensaje = aplicarPlantilla(plantilla, { nombre: d.name, negocio });
          const listo = enviados.has(d.id);
          return (
            <li key={d.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              <Link href={"/panel/clientes/" + d.id} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-strong">{d.name}</span>
                <span className="block text-xs text-muted">{d.phone ? telefonoVisible(d.phone) : "Sin teléfono"}</span>
              </Link>
              {d.phone && (
                <a
                  href={"https://wa.me/" + d.phone + "?text=" + encodeURIComponent(mensaje)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => alEnviar(d, mensaje)}
                  className={listo ? "btn-ghost btn-sm text-good" : "btn-success btn-sm"}
                >
                  <Icon name={listo ? "check" : "whatsapp"} className="h-4 w-4" />
                  {listo ? "Enviado" : "Enviar"}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
