"use client";

import { useEffect, useState } from "react";
import {
  OTRO_PAIS,
  PAISES,
  nombreMoneda,
  nombreZona,
  paisDeZona,
  paisPorCodigo,
  todasLasMonedas,
  todasLasZonas,
  zonaParaPais,
} from "@/lib/paises";
import { Field } from "./ui";

/**
 * Pais, moneda y zona horaria del negocio.
 *
 * Al elegir el pais se ponen solas su moneda y su zona; se pueden cambiar (en
 * Venezuela muchos venden en dolares, y Mexico tiene varias zonas). "Otro pais"
 * deja elegir cualquier moneda y cualquier zona del mundo.
 *
 * En el registro el pais se adivina por la zona horaria del celular y la
 * moneda y la zona van plegadas, para no llenar el formulario.
 */
export function PaisMonedaZona({
  pais: paisInicial = "CO",
  moneda: monedaInicial = "COP",
  zona: zonaInicial = "America/Bogota",
  registro = false,
}: {
  pais?: string;
  moneda?: string;
  zona?: string;
  registro?: boolean;
}) {
  const [pais, setPais] = useState(paisInicial);
  const [moneda, setMoneda] = useState(monedaInicial);
  const [zona, setZona] = useState(zonaInicial);
  const [monedas, setMonedas] = useState<string[]>([]);
  const [zonas, setZonas] = useState<string[]>([]);

  useEffect(() => {
    setMonedas(todasLasMonedas());
    setZonas(todasLasZonas());
    if (!registro) return;
    const aqui = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const p = paisDeZona(aqui);
    if (p) {
      setPais(p.code);
      setMoneda(p.moneda);
      setZona(aqui);
    }
  }, [registro]);

  const actual = paisPorCodigo(pais);

  function cambiarPais(code: string) {
    setPais(code);
    const p = paisPorCodigo(code);
    if (p) {
      setMoneda(p.moneda);
      setZona(zonaParaPais(p.code, zona));
    }
  }

  const principales = [...new Set([actual?.moneda, "USD", "EUR"].filter((m): m is string => Boolean(m)))];
  const otras = monedas.filter((m) => !principales.includes(m));
  const opcionesZona = actual ? actual.zonas : zonas.length > 0 ? zonas : [zona];
  const listaZonas = opcionesZona.includes(zona) ? opcionesZona : [zona, ...opcionesZona];

  const selectPais = (
    <Field label="País">
      <select className="input" name="country" value={pais} onChange={(e) => cambiarPais(e.target.value)} data-pais>
        {PAISES.map((p) => (
          <option key={p.code} value={p.code}>
            {p.nombre}
          </option>
        ))}
        <option value={OTRO_PAIS}>Otro país</option>
      </select>
    </Field>
  );

  const campos = (
    <>
      <Field label="Moneda">
        <select className="input" name="currency" value={moneda} onChange={(e) => setMoneda(e.target.value)} data-moneda>
          <optgroup label="Las más usadas">
            {principales.map((m) => (
              <option key={m} value={m}>
                {nombreMoneda(m)}
              </option>
            ))}
          </optgroup>
          {otras.length > 0 && (
            <optgroup label="Todas">
              {otras.map((m) => (
                <option key={m} value={m}>
                  {nombreMoneda(m)}
                </option>
              ))}
            </optgroup>
          )}
          {!principales.includes(moneda) && !otras.includes(moneda) && <option value={moneda}>{moneda}</option>}
        </select>
      </Field>
      <Field label="Zona horaria" hint="Define a qué hora cambia el día en tus reportes.">
        <select className="input" name="timezone" value={zona} onChange={(e) => setZona(e.target.value)} data-zona>
          {listaZonas.map((z) => (
            <option key={z} value={z}>
              {nombreZona(z)}
            </option>
          ))}
        </select>
      </Field>
    </>
  );

  if (!registro) {
    return (
      <>
        {selectPais}
        {campos}
      </>
    );
  }

  return (
    <div className="space-y-2">
      {selectPais}
      <details className="text-[13px]">
        <summary className="cursor-pointer text-muted">
          Moneda {moneda} · {nombreZona(zona)} <span className="link">Cambiar</span>
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">{campos}</div>
      </details>
    </div>
  );
}
