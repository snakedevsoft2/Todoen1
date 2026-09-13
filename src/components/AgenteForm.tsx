"use client";

import { useActionState, useState } from "react";
import { guardarAgenteAction } from "@/actions/agente";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";

function Interruptor({
  name,
  label,
  hint,
  defaultChecked,
  disabled,
}: {
  name: string;
  label: string;
  hint: string;
  defaultChecked: boolean;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <label className={"flex items-start gap-3 " + (disabled ? "opacity-60" : "cursor-pointer")}>
      <input
        type="checkbox"
        name={name}
        checked={on}
        disabled={disabled}
        onChange={(e) => setOn(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={
          "relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 " +
          (on ? "bg-good" : "bg-line-strong")
        }
      >
        <span
          className={
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-resorte " +
            (on ? "translate-x-[22px]" : "translate-x-0.5")
          }
        />
      </span>
      <span>
        <span className="block text-sm font-semibold text-strong">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

export function AgenteForm({
  inicial,
  saludoPorDefecto,
  metaConectado,
  agenda,
}: {
  inicial: { webOn: boolean; whatsappOn: boolean; greeting: string | null; notes: string | null };
  saludoPorDefecto: string;
  metaConectado: boolean;
  agenda: boolean;
}) {
  const [state, formAction] = useActionState(guardarAgenteAction, undefined);

  return (
    <form action={formAction} className="space-y-5">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="space-y-4">
        <Interruptor
          name="webOn"
          label="Contestar en mi página"
          hint="Aparece una burbuja de chat en tu catálogo para que te pregunten y pidan a cualquier hora."
          defaultChecked={inicial.webOn}
        />
        <Interruptor
          name="whatsappOn"
          label="Contestar mi WhatsApp"
          hint={
            metaConectado
              ? "Responde solo los mensajes que llegan a tu número conectado con Meta."
              : "Primero conecta tu número con Meta (abajo te explicamos cómo)."
          }
          defaultChecked={inicial.whatsappOn}
          disabled={!metaConectado && !inicial.whatsappOn}
        />
      </div>

      <Field label="Saludo (opcional)" hint="Lo primero que ve el cliente al abrir el chat.">
        <input
          className="input"
          name="greeting"
          maxLength={200}
          defaultValue={inicial.greeting ?? ""}
          placeholder={saludoPorDefecto}
        />
      </Field>

      <Field
        label="Lo que el agente debe saber"
        hint="Lo que no está en la aplicación. Escríbelo como se lo explicarías a un empleado nuevo."
      >
        <textarea
          className="input min-h-[140px]"
          name="notes"
          maxLength={2000}
          defaultValue={inicial.notes ?? ""}
          placeholder={
            agenda
              ? "Ej: Recibimos Nequi y efectivo. Hay parqueadero. Si llegas 10 minutos tarde se corre el turno."
              : "Ej: Domicilios en el barrio por $3.000, gratis desde $50.000. Recibimos Nequi y efectivo. Cambios hasta 8 días con factura."
          }
        />
      </Field>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        Guardar agente
      </SubmitButton>
    </form>
  );
}
