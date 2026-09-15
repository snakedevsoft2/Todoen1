"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { coincideBusqueda } from "@/lib/categorias";
import { Field } from "./ui";
import { Icon } from "./Icon";

export type ClienteOpcion = { id: string; name: string; phone: string | null };

/** Cuantos se muestran a la vez: con miles de clientes no hay que pintarlos todos. */
const MAX_VISIBLES = 30;

/**
 * Escoger un cliente ya guardado, para no repetir el nombre y el telefono a
 * mano en cada venta.
 *
 * Al tocar el campo aparece la lista (los que hacen juego con lo escrito, o
 * los primeros si todavia no se ha escrito nada): en el celular el datalist
 * nativo es de fiar a medias (en iPhone ni aparece), asi que la lista es
 * nuestra, con botones que se pueden tocar.
 *
 * Tambien se puede escribir un nombre que no este en la lista: es un cliente
 * nuevo, y queda guardado solo al terminar la venta (como ya funcionaba).
 */
export function ClienteSelector({
  clientes,
  nameLabel,
  phoneLabel = "Teléfono del cliente (opcional)",
  phoneHint,
  nameFieldName = "clientName",
  phoneFieldName = "clientPhone",
  required = false,
}: {
  clientes: ClienteOpcion[];
  nameLabel: string;
  phoneLabel?: string;
  phoneHint?: string;
  nameFieldName?: string;
  phoneFieldName?: string;
  required?: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [resaltado, setResaltado] = useState(0);
  const cajaRef = useRef<HTMLDivElement>(null);

  const opciones = useMemo(() => {
    const lista = texto.trim() ? clientes.filter((c) => coincideBusqueda([c.name, c.phone], texto)) : clientes;
    return lista.slice(0, MAX_VISIBLES);
  }, [clientes, texto]);

  useEffect(() => {
    function fuera(e: MouseEvent) {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  function elegir(c: ClienteOpcion) {
    setTexto(c.name);
    // Si ya habia un telefono escrito a mano, se respeta.
    setTelefono((antes) => antes || c.phone || "");
    setAbierto(false);
  }

  return (
    <>
      <Field label={nameLabel}>
        <div ref={cajaRef} className="relative">
          <input
            className="input"
            name={nameFieldName}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAbierto(true);
              setResaltado(0);
            }}
            onFocus={() => setAbierto(true)}
            onKeyDown={(e) => {
              if (!abierto || opciones.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setResaltado((i) => Math.min(i + 1, opciones.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setResaltado((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && opciones[resaltado]) {
                e.preventDefault();
                elegir(opciones[resaltado]);
              } else if (e.key === "Escape") {
                setAbierto(false);
              }
            }}
            placeholder="Mostrador"
            autoComplete="off"
            required={required}
            role="combobox"
            aria-expanded={abierto}
            aria-autocomplete="list"
            data-selector-cliente
          />
          {clientes.length > 0 && (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setAbierto((a) => !a)}
              aria-label="Ver clientes guardados"
              className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-subtle"
            >
              <Icon name="chevronDown" className={"h-4 w-4 transition " + (abierto ? "rotate-180" : "")} />
            </button>
          )}
          {abierto && opciones.length > 0 && (
            <ul
              className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-soft-lg"
              role="listbox"
              data-lista-clientes
            >
              {opciones.map((c, i) => (
                <li key={c.id} role="option" aria-selected={i === resaltado}>
                  <button
                    type="button"
                    className={
                      "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] " +
                      (i === resaltado ? "bg-brand-50 text-brand-700" : "text-strong hover:bg-surface")
                    }
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => elegir(c)}
                  >
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {c.phone && <span className="shrink-0 text-[11px] text-subtle">{c.phone}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {abierto && texto.trim() && opciones.length === 0 && (
            <div className="absolute z-30 mt-1 w-full rounded-xl border border-line bg-panel p-2.5 text-[12px] text-subtle shadow-soft-lg">
              Ningún cliente guardado con ese nombre: se agrega como nuevo.
            </div>
          )}
        </div>
      </Field>
      <Field label={phoneLabel} hint={phoneHint}>
        <input
          className="input"
          name={phoneFieldName}
          inputMode="tel"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="300 000 0000"
        />
      </Field>
    </>
  );
}
