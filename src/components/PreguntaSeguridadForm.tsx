"use client";

import { useActionState, useState } from "react";
import { guardarPreguntaAction } from "@/actions/seguridad";
import { MIN_RESPUESTA, PREGUNTAS } from "@/lib/preguntas";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";

/**
 * Configurar la pregunta de seguridad en Ajustes.
 *
 * La respuesta nunca se vuelve a mostrar, ni siquiera a su dueno: se guarda
 * como la contrasena, sin forma de leerla. Por eso aqui solo se ve cual es la
 * pregunta actual, y para cambiarla hay que escribir la respuesta de nuevo.
 */
export function PreguntaSeguridadForm({ actual }: { actual: string | null }) {
  const [state, formAction] = useActionState(guardarPreguntaAction, undefined);
  const [elegida, setElegida] = useState(
    actual && !PREGUNTAS.includes(actual) ? "__otra__" : (actual ?? PREGUNTAS[0])
  );

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <p className="text-[13px] text-muted">
        {actual ? (
          <>
            Tu pregunta actual: <strong className="font-semibold text-strong">{actual}</strong>
          </>
        ) : (
          "Todavía no tienes pregunta. Sin ella, si olvidas la contraseña y el correo no te llega, no hay cómo recuperarla sola."
        )}
      </p>

      <Field label="Pregunta">
        <select className="input" name="pregunta" value={elegida} onChange={(e) => setElegida(e.target.value)}>
          {PREGUNTAS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="__otra__">Otra (la escribo yo)</option>
        </select>
      </Field>

      {elegida === "__otra__" && (
        <Field label="Tu pregunta">
          <input
            className="input"
            name="preguntaPropia"
            required
            maxLength={120}
            defaultValue={actual && !PREGUNTAS.includes(actual) ? actual : ""}
            placeholder="Ej: ¿Cómo se llamaba el primer negocio de la familia?"
          />
        </Field>
      )}

      <Field
        label="Respuesta"
        hint="No importan tildes ni mayúsculas. Que sea algo que no se adivine mirando tus redes."
      >
        <input className="input" name="respuesta" required minLength={MIN_RESPUESTA} autoComplete="off" />
      </Field>

      <Field label="Tu contraseña actual" hint="Para confirmar que eres tú.">
        <input className="input" type="password" name="claveActual" required autoComplete="current-password" />
      </Field>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        {actual ? "Cambiar pregunta" : "Guardar pregunta"}
      </SubmitButton>
    </form>
  );
}
