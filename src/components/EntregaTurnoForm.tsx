"use client";

import { useActionState } from "react";
import Link from "next/link";
import { entregarTurnoAction } from "@/actions/lavadero";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * El formulario con el que el jefe de patio cierra su turno. No usa la cola
 * sin senal a proposito: la entrega es una foto de lo que hay en el servidor
 * en ese momento, y guardada en el telefono para despues ya no lo seria.
 */
export function EntregaTurnoForm({
  siguientes,
  efectivoEsperado,
  marcarSalida,
}: {
  siguientes: { id: string; name: string }[];
  /** Solo de referencia, para el placeholder del efectivo. */
  efectivoEsperado: string;
  /** Si quien entrega marca asistencia: al terminar se le ofrece marcar su salida. */
  marcarSalida: boolean;
}) {
  const [state, formAction] = useActionState(entregarTurnoAction, undefined);

  if (state?.ok) {
    return (
      <div className="space-y-3">
        <Alert kind="ok">{state.ok}</Alert>
        {marcarSalida && (
          <Link href="/panel/marcar" className="btn-primary w-full sm:w-auto">
            <Icon name="arrowOut" className="h-4 w-4" />
            Marcar mi salida
          </Link>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Se lo entregas a">
          <select className="input" name="toStaffId" defaultValue="">
            <option value="">Al que llegue (cualquiera del patio)</option>
            {siguientes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Efectivo que dejas en caja" hint={"Según el sistema deberían ser " + efectivoEsperado + "."}>
          <input className="input" name="cashDelivered" inputMode="decimal" placeholder="0" />
        </Field>
      </div>

      <Field label="Notas para el que llega (opcional)">
        <textarea
          className="input min-h-[80px]"
          name="notes"
          maxLength={1000}
          placeholder="La camioneta gris la recogen a las 7. Se acabó el shampoo."
        />
      </Field>

      <SubmitButton
        className="btn-primary w-full sm:w-auto"
        pendingText="Entregando..."
        confirm="Entregar el turno del patio"
      >
        <Icon name="check" className="h-4 w-4" />
        Entregar turno
      </SubmitButton>
    </form>
  );
}
