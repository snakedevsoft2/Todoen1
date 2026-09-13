"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { marcarEnviadoAManoAction, programarMensajeAction } from "@/actions/mensajes";
import { CANALES_MENSAJE, PLANTILLAS_RAPIDAS, aplicarPlantilla, type CanalMensaje } from "@/lib/crm";
import { SubmitButton } from "./SubmitButton";
import { Alert } from "./ui";
import { Icon } from "./Icon";

export type Canales = { whatsapp: boolean; plantilla: boolean; correo: boolean };

const CUANDO = [
  { key: "ahora", label: "Ahora" },
  { key: "manana", label: "Mañana 9 a. m." },
  { key: "semana", label: "En una semana" },
  { key: "fecha", label: "Otra fecha" },
];

/** Que va a pasar con el mensaje, dicho antes de programarlo. */
function comoSale(canal: CanalMensaje, canales: Canales, tieneTelefono: boolean, tieneCorreo: boolean): string {
  const wa = canal !== "correo" && tieneTelefono && canales.whatsapp;
  const correo = canal !== "whatsapp" && tieneCorreo && canales.correo;
  if (wa && canales.plantilla) return "Sale solo por WhatsApp.";
  if (wa) return "Sale solo por WhatsApp si el cliente te escribió en las últimas 24 horas; si no, falta la plantilla de Meta.";
  if (correo) return "Sale solo por correo.";
  if (tieneTelefono) return "No hay envío automático conectado: quedará listo para mandarlo con un toque en Mensajes.";
  return "Este cliente no tiene teléfono ni correo: agrégalos para poder escribirle.";
}

/**
 * Programar un mensaje o un recordatorio para un cliente.
 *
 * Las plantillas rapidas llenan el texto con {nombre} y {negocio}, que se
 * cambian al enviar. Debajo se dice por donde va a salir, para que nadie
 * programe un mensaje que no tiene por donde llegar.
 */
export function ProgramarMensaje({
  customerId,
  nombre,
  negocio,
  tieneTelefono,
  tieneCorreo,
  canales,
}: {
  customerId: string;
  nombre: string;
  negocio: string;
  tieneTelefono: boolean;
  tieneCorreo: boolean;
  canales: Canales;
}) {
  const [state, formAction] = useActionState(programarMensajeAction, undefined);
  const [texto, setTexto] = useState("");
  const [cuando, setCuando] = useState("ahora");
  const [canal, setCanal] = useState<CanalMensaje>("auto");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) setTexto("");
  }, [state]);

  return (
    <form ref={form} action={formAction} className="space-y-3" data-programar-mensaje>
      <input type="hidden" name="customerId" value={customerId} />
      <input type="hidden" name="cuando" value={cuando} />
      <input type="hidden" name="channel" value={canal} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="flex flex-wrap gap-1.5">
        {PLANTILLAS_RAPIDAS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setTexto(p.texto)}
            className="rounded-full border border-line-strong bg-panel px-2.5 py-1 text-[12px] font-semibold text-body transition-all duration-150 hover:border-brand-400 active:scale-95"
          >
            {p.label}
          </button>
        ))}
      </div>

      <textarea
        className="input min-h-24"
        name="text"
        required
        maxLength={1000}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Hola {nombre}, ..."
        aria-label="Mensaje"
      />
      {texto && (
        <p className="rounded-xl rounded-bl-sm bg-good-soft px-3 py-2 text-[13px] text-strong [overflow-wrap:anywhere]">
          {aplicarPlantilla(texto, { nombre, negocio })}
        </p>
      )}

      <div>
        <span className="label">Cuándo</span>
        <div className="flex flex-wrap gap-1.5">
          {CUANDO.map((c) => (
            <button
              key={c.key}
              type="button"
              aria-pressed={cuando === c.key}
              onClick={() => setCuando(c.key)}
              className={
                "rounded-full border px-3 py-1 text-[13px] font-semibold transition-all duration-150 active:scale-95 " +
                (cuando === c.key ? "border-brand-600 bg-brand-600 text-white" : "border-line-strong bg-panel text-body")
              }
            >
              {c.label}
            </button>
          ))}
        </div>
        {cuando === "fecha" && <input className="input mt-2" type="datetime-local" name="fecha" required aria-label="Fecha y hora" />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input h-9 w-auto py-1 text-sm" value={canal} onChange={(e) => setCanal(e.target.value as CanalMensaje)} aria-label="Por dónde">
          {CANALES_MENSAJE.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
        <SubmitButton className="btn-primary btn-sm" pendingText="...">
          <Icon name="whatsapp" className="h-4 w-4" />
          {cuando === "ahora" ? "Enviar ahora" : "Programar"}
        </SubmitButton>
      </div>
      <p className="text-[12px] text-muted">{comoSale(canal, canales, tieneTelefono, tieneCorreo)}</p>
    </form>
  );
}

/** El boton de WhatsApp de un mensaje que no salio solo: lo manda y lo marca. */
export function EnviarAMano({ id, href }: { id: string; href: string }) {
  const router = useRouter();
  const [listo, setListo] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        setListo(true);
        marcarEnviadoAManoAction(id)
          .then(() => router.refresh())
          .catch(() => setListo(false));
      }}
      className={listo ? "btn-ghost btn-sm text-good" : "btn-success btn-sm"}
    >
      <Icon name={listo ? "check" : "whatsapp"} className="h-4 w-4" />
      {listo ? "Enviado" : "Enviar"}
    </a>
  );
}
