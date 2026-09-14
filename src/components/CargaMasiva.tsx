"use client";

import { useMemo, useState } from "react";
import { cargarClientesAction, cargarProductosAction } from "@/actions/carga-masiva";
import type { ResultadoCarga } from "@/lib/carga-masiva";
import { LIMITE_FILAS, PLANTILLA, TITULO_CAMPO, filasDeClientes, filasDeProductos } from "@/lib/importar";
import { Alert } from "./ui";
import { Icon } from "./Icon";

/**
 * Subir de una vez la lista de clientes o de productos que ya estaba en Excel.
 *
 * Dos caminos, porque no todos saben guardar un CSV: copiar las celdas en
 * Excel o Google Sheets y pegarlas aqui, o subir el archivo CSV. Antes de
 * cargar se ve como quedo leida la tabla, para no llenar la cuenta de basura.
 */
export function CargaMasiva({ tipo }: { tipo: "clientes" | "productos" }) {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null);
  const [cargando, setCargando] = useState(false);

  const leido = useMemo(() => {
    if (!texto.trim()) return null;
    return tipo === "clientes" ? filasDeClientes(texto) : filasDeProductos(texto);
  }, [texto, tipo]);

  const nombre = tipo === "clientes" ? "clientes" : "productos";

  async function leerArchivo(archivo: File | undefined) {
    if (!archivo) return;
    setResultado(null);
    if (/\.xlsx?$/i.test(archivo.name)) {
      setAviso({
        kind: "error",
        text: "Ese archivo es de Excel. En Excel ve a Archivo > Guardar como > CSV, o copia las celdas y pégalas en el cuadro.",
      });
      return;
    }
    if (archivo.size > 3 * 1024 * 1024) {
      setAviso({ kind: "error", text: "El archivo pesa más de 3 MB. Divídelo en partes." });
      return;
    }
    const bytes = await archivo.arrayBuffer();
    let contenido: string;
    try {
      contenido = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // Excel en Windows guarda el CSV con otra tabla de letras: sin esto las
      // tildes y la ñ salen como simbolos raros.
      contenido = new TextDecoder("windows-1252").decode(bytes);
    }
    setTexto(contenido);
    setAviso(null);
  }

  function plantilla() {
    const archivo = new Blob(["﻿" + PLANTILLA[tipo]], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(archivo);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-" + nombre + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function cargar() {
    if (!leido || leido.filas.length === 0) return;
    setCargando(true);
    setAviso(null);
    try {
      const r = tipo === "clientes" ? await cargarClientesAction(leido.filas) : await cargarProductosAction(leido.filas);
      if (!r.ok) {
        setAviso({ kind: "error", text: r.error });
        return;
      }
      setResultado(r.resultado);
      setTexto("");
      setAviso({
        kind: "ok",
        text:
          "Listo: " +
          r.resultado.creados +
          " nuevos, " +
          r.resultado.actualizados +
          " actualizados" +
          (r.resultado.omitidos ? ", " + r.resultado.omitidos + " sin cargar" : "") +
          ".",
      });
    } catch {
      setAviso({ kind: "error", text: "No se pudo cargar. Revisa la conexión y vuelve a intentarlo." });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="space-y-3" data-carga-masiva={tipo}>
      <p className="text-[13px] text-body">
        {tipo === "clientes"
          ? "Copia las celdas de tu Excel (nombre, teléfono, correo…) y pégalas aquí, o sube el archivo CSV. Los que ya estén no se duplican: solo se les completan los datos que les falten."
          : "Copia las celdas de tu Excel (nombre, precio, costo, categoría, cantidad) y pégalas aquí, o sube el archivo CSV. Si el producto ya existe, se actualiza su precio y su cantidad."}
      </p>

      <div className="flex flex-wrap gap-2">
        <label className="btn-ghost btn-sm cursor-pointer">
          <Icon name="download" className="h-4 w-4 rotate-180" />
          Subir archivo CSV
          <input
            type="file"
            name={"carga-" + tipo}
            accept=".csv,.txt,.tsv,text/csv,text/plain"
            className="sr-only"
            onChange={(e) => {
              void leerArchivo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="btn-ghost btn-sm" onClick={plantilla}>
          <Icon name="download" className="h-4 w-4" />
          Descargar plantilla
        </button>
      </div>

      <textarea
        className="input min-h-28 font-mono text-[12px]"
        aria-label={"Pega aquí tus " + nombre}
        placeholder={tipo === "clientes" ? "Nombre\tTeléfono\tCorreo\nAna Pérez\t3001234567\tana@correo.com" : "Nombre\tPrecio\tCategoría\nCamiseta básica\t35000\tCamisetas"}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setResultado(null);
        }}
      />

      {aviso && <Alert kind={aviso.kind}>{aviso.text}</Alert>}

      {leido && (
        <div className="space-y-2" data-vista-previa>
          {leido.filas.length === 0 ? (
            <p className="text-[13px] text-bad">No encontramos filas con nombre. Revisa que la primera columna sea el nombre.</p>
          ) : (
            <>
              <p className="text-[12px] text-muted">
                Leímos <strong className="text-strong">{leido.filas.length}</strong> {nombre}
                {leido.sinNombre ? " (" + leido.sinNombre + " filas sin nombre se saltan)" : ""}. Columnas:{" "}
                {leido.columnas.map((c) => TITULO_CAMPO[c]).join(", ")}.
                {leido.filas.length >= LIMITE_FILAS ? " Solo se cargan las primeras " + LIMITE_FILAS + "." : ""}
              </p>
              <div className="table-wrap max-h-56 overflow-auto rounded-xl border border-line">
                <table className="tbl text-[12px]">
                  <thead>
                    <tr>
                      {leido.columnas.map((c) => (
                        <th key={c}>{TITULO_CAMPO[c]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leido.filas.slice(0, 6).map((f, i) => (
                      <tr key={i}>
                        {leido.columnas.map((c) => (
                          <td key={c} className="max-w-[160px] truncate">
                            {(f as Record<string, string>)[c]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn-primary w-full sm:w-auto" onClick={cargar} disabled={cargando}>
                {cargando ? "Cargando…" : "Cargar " + leido.filas.length + " " + nombre}
              </button>
            </>
          )}
        </div>
      )}

      {resultado && resultado.detalle.length > 0 && (
        <ul className="space-y-0.5 text-[12px] text-muted" data-detalle-carga>
          {resultado.detalle.map((d, i) => (
            <li key={i}>• {d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
