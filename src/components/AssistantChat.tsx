"use client";

import { useActionState, useEffect, useRef } from "react";
import { askAssistantAction, type AssistantState } from "@/actions/assistant";
import { Alert } from "./ui";
import { Icon } from "./Icon";

/**
 * Chat con el asistente.
 *
 * La conversacion vive aqui, en el navegador, y viaja completa en cada
 * pregunta. No se guarda: al recargar se empieza de cero, que para pedir
 * consejos esta bien y evita guardar algo que despues habria que cuidar.
 */
export function AssistantChat({
  sugerencias,
  listo,
}: {
  sugerencias: string[];
  /** false si falta la clave en el servidor. */
  listo: boolean;
}) {
  // El tercer valor de useActionState nos dice si esta pensando, sin tener que
  // meter useFormStatus dentro del formulario.
  const [state, formAction, pensando] = useActionState<AssistantState, FormData>(
    askAssistantAction,
    undefined
  );

  const finRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const turns = state?.turns ?? [];

  // Al llegar una respuesta bajamos al final y dejamos el campo vacio.
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    if (inputRef.current) inputRef.current.value = "";
  }, [turns.length, pensando]);

  /** Las sugerencias mandan el formulario de una: es un toque, no dos. */
  function preguntar(texto: string) {
    if (!inputRef.current || !formRef.current) return;
    inputRef.current.value = texto;
    formRef.current.requestSubmit();
  }

  return (
    <div className="flex h-[calc(100dvh-14rem)] min-h-[440px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border-2 border-edge bg-surface p-4">
        {turns.length === 0 && !pensando && (
          <div className="py-6 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border-2 border-edge bg-brand-600 text-on-brand shadow-block">
              <Icon name="chart" className="h-6 w-6" />
            </span>
            <p className="mt-3 font-display text-lg text-strong">Preguntame por tu negocio</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Veo tus cifras de hoy, las del mes y tu inventario. Preguntame como vas, que reponer
              o como se hace algo en la aplicacion.
            </p>
          </div>
        )}

        {turns.map((turn, i) => (
          <div
            key={i}
            className={"flex " + (turn.role === "user" ? "justify-end" : "justify-start")}
          >
            <div
              className={
                "max-w-[85%] whitespace-pre-wrap rounded-2xl border-2 border-edge px-4 py-2.5 text-sm leading-relaxed sm:max-w-[75%] " +
                (turn.role === "user"
                  ? "rounded-br-md bg-brand-600 text-on-brand"
                  : "rounded-bl-md bg-panel text-body")
              }
            >
              {turn.text}
            </div>
          </div>
        ))}

        {pensando && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border-2 border-edge bg-panel px-4 py-3">
              <span className="flex gap-1" aria-label="Pensando">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
                    style={{ animationDelay: i * 0.15 + "s" }}
                  />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={finRef} />
      </div>

      {state?.error && (
        <div className="mt-3">
          <Alert kind="error">{state.error}</Alert>
        </div>
      )}

      {turns.length === 0 && !pensando && sugerencias.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {sugerencias.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => preguntar(s)}
              disabled={!listo}
              className="btn-ghost btn-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <form ref={formRef} action={formAction} className="mt-3 flex gap-2">
        {/* La conversacion viaja completa: el servidor no guarda nada. */}
        <input type="hidden" name="history" value={JSON.stringify(turns)} />
        <input
          ref={inputRef}
          className="input"
          name="question"
          maxLength={1000}
          required
          disabled={!listo || pensando}
          placeholder={listo ? "Escribe tu pregunta..." : "El asistente no esta configurado"}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn-primary shrink-0 px-3.5"
          disabled={!listo || pensando}
          aria-label="Enviar pregunta"
        >
          {pensando ? (
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-on-brand/30 border-t-on-brand"
              aria-hidden="true"
            />
          ) : (
            <Icon name="arrowIn" className="h-4 w-4 rotate-180" />
          )}
        </button>
      </form>

      <p className="mt-2 text-[11px] text-subtle">
        Para responder, tu pregunta y un resumen de tus cifras se envian a Google. No se manda
        informacion de tus clientes, y la conversacion no se guarda.
      </p>
    </div>
  );
}
