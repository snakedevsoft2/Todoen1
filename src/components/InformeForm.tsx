"use client";

import { useActionState } from "react";
import { crearInformeAction } from "@/actions/informes";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * Empezar un reporte de visita.
 *
 * Las fotos no van aqui sino en el paso siguiente, ya con el reporte creado:
 * se suben una por una, y la que sube queda subida aunque la senal se corte a
 * mitad.
 */
export function InformeForm({
  today,
  sitios,
}: {
  today: string;
  sitios: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(crearInformeAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}

      <Field label="Titulo">
        <input className="input" name="title" required placeholder="Ej: Limpieza de fachada" />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fecha">
          <input className="input" type="date" name="day" defaultValue={today} />
        </Field>
        <Field label="Sitio">
          <select className="input" name="siteId" defaultValue={sitios[0]?.id ?? ""}>
            <option value="">Sin sitio</option>
            {sitios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente (opcional)">
          <input className="input" name="clientName" placeholder="Ej: Edificio Los Cedros" />
        </Field>
        <Field label="WhatsApp del cliente (opcional)" hint="Para mandarle el PDF.">
          <input className="input" name="clientPhone" inputMode="tel" placeholder="300 000 0000" />
        </Field>
      </div>

      <Field label="Que se hizo">
        <textarea
          className="input min-h-28"
          name="body"
          placeholder="Ej: Se limpio la fachada norte y se cambiaron dos luminarias del parqueadero."
        />
      </Field>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Creando...">
        <Icon name="plus" className="h-4 w-4" />
        Crear reporte y agregar fotos
      </SubmitButton>
    </form>
  );
}
