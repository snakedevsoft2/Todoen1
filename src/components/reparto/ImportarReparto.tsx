"use client";

import { useState, useTransition } from "react";
import { importarExcelAction } from "@/actions/reparto";
import type { ReporteImportacion } from "@/lib/reparto-importar";
import { money } from "@/lib/format";
import { Alert } from "../ui";
import { Icon } from "../Icon";

/**
 * Importar el Excel de reparto: primero un ensayo que no guarda nada y dice si
 * todo cuadra, y despues, con los vendedores confirmados, la importacion de
 * verdad. Se puede repetir: lo que ya estaba se salta.
 */
export function ImportarReparto({ equipo, currency }: { equipo: { id: string; name: string }[]; currency: string }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [claves, setClaves] = useState<string[]>([]);
  const [vendedores, setVendedores] = useState<Record<string, string>>({});
  const [reporte, setReporte] = useState<ReporteImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, startTransition] = useTransition();

  function correr(aplicar: boolean) {
    if (!archivo) return;
    setError(null);
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("vendedores", JSON.stringify(vendedores));
    if (aplicar) fd.set("aplicar", "1");
    startTransition(async () => {
      try {
        const r = await importarExcelAction(fd);
        if (r.error) {
          setError(r.error);
          return;
        }
        setClaves(r.claves ?? []);
        // El servidor dice con quien emparejo cada hoja (lo escogido, o el nombre de pila).
        setVendedores(r.vendedores ?? {});
        setReporte(r.reporte ?? null);
      } catch {
        setError("No se pudo leer el archivo. Revisa la conexión e inténtalo otra vez.");
      }
    });
  }

  const listo = reporte && !reporte.aplicado && claves.every((k) => vendedores[k]) && reporte.errores.length === 0;
  const $ = (c: number) => money(c, currency);

  return (
    <div className="space-y-4" data-importar-reparto>
      {error && <Alert kind="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".xlsx,.xlsm,.xls"
          className="input max-w-full py-1.5 text-sm"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            setReporte(null);
          }}
          aria-label="Archivo de Excel"
        />
        <button type="button" className="btn-primary btn-sm" disabled={!archivo || trabajando} onClick={() => correr(false)} data-revisar>
          <Icon name="search" className="h-4 w-4" />
          {trabajando ? "Leyendo..." : "Revisar (no guarda nada)"}
        </button>
      </div>

      {claves.length > 0 && (
        <div className="rounded-xl border border-line p-3" data-vendedores>
          <p className="mb-2 text-sm font-semibold text-strong">¿Quién es cada hoja del Excel?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {claves.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 font-semibold">{k}</span>
                <select
                  className="input py-1.5 text-sm"
                  value={vendedores[k] ?? ""}
                  onChange={(e) => {
                    setVendedores({ ...vendedores, [k]: e.target.value });
                    setReporte(null);
                  }}
                  aria-label={"Vendedor de " + k}
                >
                  <option value="">Escoge</option>
                  {equipo.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {!reporte && (
            <button type="button" className="btn-primary btn-sm mt-2" disabled={trabajando} onClick={() => correr(false)}>
              Revisar con estos vendedores
            </button>
          )}
        </div>
      )}

      {reporte && (
        <div className="space-y-3" data-reporte={reporte.aplicado ? "aplicado" : "ensayo"}>
          <Alert kind={reporte.aplicado ? "ok" : reporte.errores.length ? "error" : "info"}>
            {reporte.aplicado
              ? "Importado: " + reporte.planillas.filter((p) => p.accion === "crear").length + " planillas nuevas."
              : reporte.errores.length
                ? "Hay que corregir algo antes de importar."
                : "Ensayo: todo cuadra con el Excel. Nada se guardó todavía."}
          </Alert>
          {reporte.errores.map((e) => (
            <p key={e} className="text-sm text-bad">{e}</p>
          ))}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                  <th className="py-1">Hoja</th>
                  <th className="text-right">Días</th>
                  <th className="text-right">Ventas</th>
                  <th className="text-right">Crédito</th>
                  <th className="text-right">Contado</th>
                  <th className="text-right">Cartera</th>
                  <th className="text-right">Pagos</th>
                  <th className="text-right">Entregado</th>
                  <th className="text-right">Sobr./Falt.</th>
                </tr>
              </thead>
              <tbody>
                {reporte.totales.map((t) => (
                  <tr key={t.hoja} className="border-t border-line">
                    <td className="py-1 font-semibold">{t.hoja}</td>
                    <td className="text-right">{t.dias}</td>
                    {[t.ventas, t.credito, t.contado, t.cartera, t.pagos, t.entregado, t.neto].map((v, i) => (
                      <td key={i} className="text-right">{$(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-1 text-[13px] text-body">
            <li>
              Planillas: {reporte.planillas.length} — nuevas {reporte.planillas.filter((p) => p.accion === "crear").length}, ya importadas{" "}
              {reporte.planillas.filter((p) => p.accion === "ya-estaba").length}, que cuadran con el Excel {reporte.planillas.filter((p) => p.cuadra).length}.
            </li>
            <li>Productos nuevos: {reporte.productosNuevos.length}. Clientes nuevos: {reporte.clientesNuevos.length}. Saldos iniciales de cartera: {reporte.saldosIniciales}.</li>
            <li>Cobros sin documento al que aplicarse (quedan por revisar): {reporte.cobrosSinDocumento}.</li>
          </ul>

          {reporte.posiblesDuplicados.length > 0 && (
            <details className="rounded-xl border border-line p-2.5 text-[13px]">
              <summary className="cursor-pointer font-semibold text-strong">Clientes que parecen el mismo ({reporte.posiblesDuplicados.length}) — no se juntan solos</summary>
              <ul className="mt-1 space-y-0.5 text-body">
                {reporte.posiblesDuplicados.map(([a, b]) => (
                  <li key={a + b}>{a} ~ {b}</li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-subtle">Después de importar se juntan en Reparto → Clientes.</p>
            </details>
          )}
          {reporte.carteraDistinta.length > 0 && (
            <details className="rounded-xl border border-line p-2.5 text-[13px]">
              <summary className="cursor-pointer font-semibold text-strong">
                Cartera distinta a la última lista del Excel ({reporte.carteraDistinta.length} clientes)
              </summary>
              <p className="mt-1 text-[11px] text-subtle">La lista del Excel se copiaba a mano de un día a otro; aquí se calcula de los créditos y cobros.</p>
              <ul className="mt-1 space-y-0.5 text-body">
                {reporte.carteraDistinta.slice(0, 30).map((c) => (
                  <li key={c.cliente}>{c.cliente}: calculado {$(c.calculado)}, Excel {$(c.excel)}</li>
                ))}
              </ul>
            </details>
          )}
          {reporte.avisos.length > 0 && (
            <details className="rounded-xl border border-line p-2.5 text-[12px] text-muted">
              <summary className="cursor-pointer">Avisos ({reporte.avisos.length})</summary>
              {reporte.avisos.map((a) => (
                <p key={a}>{a}</p>
              ))}
            </details>
          )}

          {listo && (
            <button type="button" className="btn-success" disabled={trabajando} onClick={() => correr(true)} data-importar>
              <Icon name="check" className="h-4 w-4" />
              {trabajando ? "Importando..." : "Importar " + reporte.planillas.filter((p) => p.accion === "crear").length + " planillas"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
