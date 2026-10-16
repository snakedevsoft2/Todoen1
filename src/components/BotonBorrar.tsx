"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal, useFormStatus } from "react-dom";
import { Icon } from "./Icon";
import type { AvisoBorrado } from "@/lib/impacto-borrado";

/**
 * El boton de borrar del dueño, con el aviso antes de borrar.
 *
 * En vez del "¿Seguro?" del navegador, abre un cuadro que dice que se va a
 * borrar (la venta, el vehiculo, el gasto, con sus datos) y que cambia en los
 * numeros si se borra (la caja de ese dia, la comision del lavador, la tarjeta
 * de fidelizacion...). Solo con "Sí, borrar" se envia el formulario en el que
 * esta el boton, asi que sirve igual con FormSinSenal y con <form action>.
 *
 * El texto lo arma el servidor con lib/impacto-borrado.ts: ahi estan los
 * datos de verdad de lo que se va a borrar.
 */
export function BotonBorrar({
  aviso,
  children,
  className = "btn-ghost btn-sm px-2 text-bad",
  ariaLabel,
}: {
  aviso: AvisoBorrado;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;
    cancelar.current?.focus();
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alTeclado);
    // La pagina de atras no se mueve mientras el cuadro esta abierto.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = antes;
    };
  }, [abierto]);

  function borrar() {
    setAbierto(false);
    boton.current?.form?.requestSubmit();
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        disabled={pending}
        className={className}
        aria-label={ariaLabel}
        title={ariaLabel}
        aria-haspopup="dialog"
        onClick={() => setAbierto(true)}
      >
        {pending ? "..." : children}
      </button>
      {abierto &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-4 sm:items-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) setAbierto(false);
            }}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="borrado-titulo"
              data-confirmar-borrado
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-surface p-5 text-left shadow-xl"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bad-soft text-bad">
                  <Icon name="trash" className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="borrado-titulo" className="font-display text-lg leading-tight text-strong">
                    {aviso.titulo}
                  </h2>
                  <p className="mt-1 text-xs font-semibold text-bad">No se puede deshacer.</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-line bg-panel p-3">
                <p className="eyebrow">Lo que se borra</p>
                <ul className="mt-1.5 space-y-1 text-sm text-strong" data-borrado-que>
                  {aviso.que.map((linea) => (
                    <li key={linea}>{linea}</li>
                  ))}
                </ul>
              </div>

              {aviso.efectos.length > 0 && (
                <div className="mt-3 rounded-xl border border-warn-line bg-warn-soft p-3">
                  <p className="eyebrow text-warn">Qué cambia si lo borras</p>
                  <ul className="mt-1.5 space-y-1.5 text-[13px] text-body" data-borrado-efectos>
                    {aviso.efectos.map((linea) => (
                      <li key={linea} className="flex gap-2">
                        <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                        <span>{linea}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-3 text-xs text-muted">Queda anotado en Empleados &gt; Auditoría con tu nombre.</p>

              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button ref={cancelar} type="button" className="btn-ghost w-full sm:w-auto" onClick={() => setAbierto(false)}>
                  Cancelar
                </button>
                <button type="button" className="btn-danger w-full sm:w-auto" onClick={borrar}>
                  <Icon name="trash" className="h-4 w-4" />
                  {aviso.boton ?? "Sí, borrar"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
