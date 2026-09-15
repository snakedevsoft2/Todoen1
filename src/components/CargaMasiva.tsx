"use client";

import { useMemo, useRef, useState } from "react";
import {
  analizarClientesAction,
  analizarProductosAction,
  cargarClientesAction,
  cargarProductosAction,
  type RespuestaAnalisis,
} from "@/actions/carga-masiva";
import type { Analisis, ModoCarga, ResultadoCarga } from "@/lib/carga-masiva";
import {
  LIMITE_FILAS,
  ORDEN_CLIENTES,
  ORDEN_PRODUCTOS,
  PLANTILLA,
  TITULO_CAMPO,
  filasDeTexto,
  leerClientes,
  leerProductos,
  type CampoCliente,
  type CampoProducto,
} from "@/lib/importar";
import { EXTENSIONES_ARCHIVO, leerArchivo } from "@/lib/leer-archivo";
import { Alert } from "./ui";
import { Icon } from "./Icon";

type Campo = CampoCliente | CampoProducto;
type Aviso = { kind: "ok" | "error" | "info"; text: string } | null;
type Archivo = { nombre: string; formato: string; hoja?: string; filas: string[][] };

const SIN_CONEXION = "No se pudo conectar. Revisa la conexión y vuelve a intentarlo.";

/**
 * Subir de una vez la lista de clientes o de productos que ya estaba en otro
 * lado.
 *
 * Se sube el archivo (Excel, CSV, LibreOffice o los contactos del celular) o se
 * pegan las celdas. La tabla se lee en el telefono y se muestra como quedo, con
 * la opcion de corregir cualquier columna. Antes de guardar se revisa contra lo
 * que ya hay: si algo ya estaba, se pregunta si sobrescribirlo con lo del
 * archivo o solo completar.
 */
export function CargaMasiva({ tipo }: { tipo: "clientes" | "productos" }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<Archivo | null>(null);
  const [asignacion, setAsignacion] = useState<Partial<Record<Campo, number>>>({});
  const [aviso, setAviso] = useState<Aviso>(null);
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [resultado, setResultado] = useState<ResultadoCarga | null>(null);
  const [ocupado, setOcupado] = useState<"" | "leyendo" | "revisando" | "cargando">("");
  const entrada = useRef<HTMLInputElement>(null);

  const clientes = tipo === "clientes";
  const nombre = clientes ? "clientes" : "productos";
  const orden: Campo[] = clientes ? ORDEN_CLIENTES : ORDEN_PRODUCTOS;

  const leido = useMemo(() => {
    const filas = archivo ? archivo.filas : texto.trim() ? filasDeTexto(texto) : null;
    if (!filas) return null;
    return clientes
      ? leerClientes(filas, asignacion as Partial<Record<CampoCliente, number>>)
      : leerProductos(filas, asignacion as Partial<Record<CampoProducto, number>>);
  }, [archivo, texto, asignacion, clientes]);

  function empezarDeNuevo() {
    setTexto("");
    setArchivo(null);
    setAsignacion({});
    setAnalisis(null);
    setResultado(null);
    setAviso(null);
  }

  async function elegirArchivo(elegido: File | undefined) {
    if (!elegido) return;
    empezarDeNuevo();
    setOcupado("leyendo");
    try {
      const r = await leerArchivo(elegido);
      if (!r.ok) {
        setAviso({ kind: "error", text: r.error });
        return;
      }
      if (r.filas.length === 0) {
        setAviso({ kind: "error", text: "El archivo está vacío o no trae una tabla." });
        return;
      }
      setArchivo({ nombre: elegido.name, formato: r.formato, hoja: r.hoja, filas: r.filas });
    } finally {
      setOcupado("");
    }
  }

  function plantilla() {
    const archivoPlantilla = new Blob(["﻿" + PLANTILLA[tipo]], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(archivoPlantilla);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-" + nombre + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  async function cargar(modo: ModoCarga) {
    if (!leido || leido.filas.length === 0) return;
    setOcupado("cargando");
    setAviso(null);
    try {
      const r = clientes ? await cargarClientesAction(leido.filas, modo) : await cargarProductosAction(leido.filas, modo);
      if (!r.ok) {
        setAviso({ kind: "error", text: r.error });
        return;
      }
      const { creados, actualizados, omitidos } = r.resultado;
      setAnalisis(null);
      setTexto("");
      setArchivo(null);
      setAsignacion({});
      setResultado(r.resultado);
      setAviso({
        kind: "ok",
        text: "Listo: " + creados + " nuevos, " + actualizados + " actualizados" + (omitidos ? ", " + omitidos + " sin cargar" : "") + ".",
      });
    } catch {
      setAviso({ kind: "error", text: SIN_CONEXION });
    } finally {
      setOcupado("");
    }
  }

  async function revisar() {
    if (!leido || leido.filas.length === 0) return;
    setOcupado("revisando");
    setAviso(null);
    setResultado(null);
    setAnalisis(null);
    let r: RespuestaAnalisis;
    try {
      r = clientes ? await analizarClientesAction(leido.filas) : await analizarProductosAction(leido.filas);
    } catch {
      setOcupado("");
      setAviso({ kind: "error", text: SIN_CONEXION });
      return;
    }
    setOcupado("");
    if (!r.ok) {
      setAviso({ kind: "error", text: r.error });
      return;
    }
    // Si nada de la lista estaba guardado, no hay nada que preguntar.
    if (r.analisis.repetidos === 0) {
      await cargar("completar");
      return;
    }
    setAnalisis(r.analisis);
  }

  const ejemplo = clientes
    ? "Nombre\tTeléfono\tCorreo\nAna Pérez\t3001234567\tana@correo.com"
    : "Nombre\tPrecio\tCategoría\nCamiseta básica\t35000\tCamisetas";
  const reconocidos = leido ? leido.porContenido.map((c) => TITULO_CAMPO[c]) : [];

  return (
    <div className="space-y-3" data-carga-masiva={tipo}>
      <p className="text-[13px] text-body">
        {clientes
          ? "Sube tu archivo de Excel, CSV o los contactos del celular, o pega las celdas aquí. Reconocemos el nombre, el teléfono y el correo aunque las columnas tengan otro nombre u otro orden."
          : "Sube tu archivo de Excel o CSV, o pega las celdas aquí (nombre, precio, costo, categoría, cantidad). Reconocemos las columnas aunque tengan otro nombre u otro orden."}
      </p>

      <div className="flex flex-wrap gap-2">
        <label className="btn-ghost btn-sm cursor-pointer">
          <Icon name="upload" className="h-4 w-4" />
          {ocupado === "leyendo" ? "Leyendo…" : "Subir archivo"}
          <input
            ref={entrada}
            type="file"
            name={"carga-" + tipo}
            accept={EXTENSIONES_ARCHIVO}
            className="sr-only"
            onChange={(e) => {
              void elegirArchivo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <button type="button" className="btn-ghost btn-sm" onClick={plantilla}>
          <Icon name="download" className="h-4 w-4" />
          Descargar plantilla
        </button>
      </div>
      <p className="text-[11px] text-subtle">
        Excel (.xlsx, .xls), LibreOffice (.ods), CSV{clientes ? " o contactos del celular (.vcf)" : ""}. Hasta {LIMITE_FILAS} filas.
      </p>

      {archivo ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-[13px]" data-archivo-cargado>
          <Icon name="file" className="h-4 w-4 text-muted" />
          <span className="min-w-0 flex-1 truncate">
            <strong className="text-strong">{archivo.nombre}</strong>
            {" · " + archivo.formato + (archivo.hoja ? " · hoja " + archivo.hoja : "")}
          </span>
          <button type="button" className="btn-ghost btn-sm" onClick={empezarDeNuevo}>
            Quitar
          </button>
        </div>
      ) : (
        <textarea
          className="input min-h-28 font-mono text-[12px]"
          aria-label={"Pega aquí tus " + nombre}
          placeholder={ejemplo}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setResultado(null);
            setAnalisis(null);
            setAsignacion({});
          }}
        />
      )}

      {aviso && <Alert kind={aviso.kind}>{aviso.text}</Alert>}

      {leido && !resultado && (
        <div className="space-y-2" data-vista-previa>
          {leido.filas.length === 0 ? (
            <p className="text-[13px] text-bad">No encontramos filas con nombre. Abajo puedes elegir cuál columna es el nombre.</p>
          ) : (
            <p className="text-[12px] text-muted">
              Leímos <strong className="text-strong">{leido.filas.length}</strong> {nombre}
              {leido.sinNombre ? " (" + leido.sinNombre + " filas sin nombre se saltan)" : ""}. Columnas:{" "}
              {leido.columnas.map((c) => TITULO_CAMPO[c]).join(", ")}.
              {"nombreUnido" in leido && leido.nombreUnido ? " Unimos el nombre y el apellido." : ""}
              {reconocidos.length > 0 ? " " + reconocidos.join(" y ") + (reconocidos.length === 1 ? " lo" : " los") + " reconocimos por los datos." : ""}
              {leido.filas.length >= LIMITE_FILAS ? " Solo se cargan las primeras " + LIMITE_FILAS + "." : ""}
            </p>
          )}

          {leido.filas.length > 0 && (
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
                        <td key={c} className="max-w-[180px] truncate">
                          {(f as Record<string, string>)[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {leido.encabezados.length > 0 && (
            <details className="rounded-xl border border-line px-3 py-2 text-[12px]" data-corregir-columnas>
              <summary className="cursor-pointer font-semibold text-body">¿Una columna quedó mal? Corrígela</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {orden.map((campo) => (
                  <label key={campo} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-muted">{TITULO_CAMPO[campo]}</span>
                    <select
                      className="input py-1 text-[12px]"
                      aria-label={"Columna de " + TITULO_CAMPO[campo]}
                      value={(leido.indice as Record<string, number>)[campo] ?? -1}
                      onChange={(e) => {
                        setAsignacion((a) => ({ ...a, [campo]: Number(e.target.value) }));
                        setAnalisis(null);
                      }}
                    >
                      <option value={-1}>— No está —</option>
                      {leido.encabezados.map((h, i) => (
                        <option key={i} value={i}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          )}

          {leido.filas.length > 0 && !analisis && (
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={revisar} disabled={ocupado !== ""}>
              {ocupado === "revisando"
                ? "Revisando…"
                : ocupado === "cargando"
                  ? "Cargando…"
                  : "Revisar y cargar " + leido.filas.length + " " + nombre}
            </button>
          )}
        </div>
      )}

      {analisis && leido && (
        <div className="space-y-2 rounded-xl border border-warn-line bg-warn-soft p-3 text-[13px]" data-decision-carga>
          <p className="font-semibold text-strong">
            {analisis.nuevos} {analisis.nuevos === 1 ? "nuevo" : "nuevos"} y {analisis.repetidos} que ya tenías
            {analisis.conCambios > 0 ? " (" + analisis.conCambios + " con datos distintos)" : ", con los mismos datos"}.
            {analisis.omitidos > 0 ? " " + analisis.omitidos + (analisis.omitidos === 1 ? " fila no se va" : " filas no se van") + " a cargar." : ""}
          </p>
          {analisis.ejemplos.length > 0 && (
            <ul className="space-y-1 text-[12px] text-body">
              {analisis.ejemplos.map((e, i) => (
                <li key={i}>
                  <strong className="text-strong">{e.nombre}:</strong>{" "}
                  {e.cambios.map((c) => c.campo + " " + (c.antes || "vacío") + " → " + c.despues).join("; ")}
                </li>
              ))}
              {analisis.conCambios > analisis.ejemplos.length && <li>y {analisis.conCambios - analisis.ejemplos.length} más…</li>}
            </ul>
          )}

          {analisis.conCambios > 0 ? (
            <>
              <p className="text-[12px] text-muted">¿Qué hacemos con los que ya tenías? Las celdas vacías del archivo no borran nada.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary btn-sm" disabled={ocupado !== ""} onClick={() => void cargar("sobrescribir")}>
                  Sobrescribir con los datos del archivo
                </button>
                <button type="button" className="btn-ghost btn-sm" disabled={ocupado !== ""} onClick={() => void cargar("completar")}>
                  {clientes ? "Solo completar lo que falta" : "Solo agregar los nuevos"}
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setAnalisis(null)}>
                  Cancelar
                </button>
              </div>
            </>
          ) : analisis.nuevos > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={ocupado !== ""} onClick={() => void cargar("completar")}>
                {analisis.nuevos === 1 ? "Cargar el nuevo" : "Cargar los " + analisis.nuevos + " nuevos"}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setAnalisis(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted">No hay nada nuevo que cargar.</span>
              <button type="button" className="btn-ghost btn-sm" onClick={empezarDeNuevo}>
                Listo
              </button>
            </div>
          )}
          {ocupado === "cargando" && <p className="text-[12px] text-muted">Cargando…</p>}
        </div>
      )}

      {resultado && (
        <div className="space-y-2">
          {resultado.detalle.length > 0 && (
            <ul className="space-y-0.5 text-[12px] text-muted" data-detalle-carga>
              {resultado.detalle.map((d, i) => (
                <li key={i}>• {d}</li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => {
              empezarDeNuevo();
              entrada.current?.click();
            }}
          >
            <Icon name="upload" className="h-4 w-4" />
            Subir otro archivo
          </button>
        </div>
      )}
    </div>
  );
}
