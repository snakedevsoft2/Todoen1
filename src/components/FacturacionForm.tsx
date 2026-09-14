"use client";

import { startTransition, useActionState, useState } from "react";
import { guardarFacturacionAction, probarFacturacionAction } from "@/actions/facturacion";
import type { ConfigVista } from "@/lib/facturacion";
import { PAISES, TARIFAS, datosPais, type Pais } from "@/lib/facturacion/paises";
import { Alert, Field } from "./ui";

/**
 * Configurar la factura autorizada (DIAN o SRI) con la cuenta del negocio.
 *
 * Las credenciales nunca vuelven a la pantalla: si ya estan guardadas, el
 * campo dice "guardada" y dejarlo vacio no la cambia.
 */
export function FacturacionForm({ config, moneda }: { config: ConfigVista; moneda: string }) {
  const [state, guardar, guardando] = useActionState(guardarFacturacionAction, undefined);
  const [prueba, probar, probando] = useActionState(probarFacturacionAction, undefined);
  const actual = state?.config ?? config;
  const [pais, setPais] = useState<Pais>(config.country);
  const [rango, setRango] = useState(config.numberingRangeId);
  // Elegir un rango de la prueba solo llena el campo: hay que guardar.
  const [rangoSinGuardar, setRangoSinGuardar] = useState(false);
  // Cambia despues de guardar, para vaciar los campos de las claves.
  const [vuelta, setVuelta] = useState(0);
  const p = datosPais(pais);
  const guardadas = actual.credencialesGuardadas && actual.country === pais;
  const claveGuardada = guardadas ? "Guardada: escribe solo para cambiarla" : "";

  return (
    <div className="space-y-4" data-facturacion>
      <p className="text-[13px] leading-relaxed text-body">
        Con la factura autorizada, cada venta que lo necesite sale validada ante la {p.entidad}, con su número oficial y su{" "}
        {pais === "CO" ? "CUFE" : "clave de acceso"}. Usa tu propia cuenta de <strong>{p.proveedor}</strong>. La factura normal
        sigue saliendo igual para quien no la necesita.
      </p>

      <form
        // Se envia a mano: React vacia el formulario despues de la accion y
        // el pais volveria al de antes mientras la pantalla muestra el nuevo.
        onSubmit={(e) => {
          e.preventDefault();
          const datos = new FormData(e.currentTarget);
          startTransition(() => {
            guardar(datos);
            setVuelta((v) => v + 1);
          });
        }}
        className="space-y-4"
      >
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

        <label className="flex items-start gap-2 text-sm text-body">
          <input type="checkbox" name="enabled" defaultChecked={config.enabled} className="mt-0.5 h-4 w-4" />
          <span>
            <strong className="text-strong">Activar la factura autorizada</strong>
            <span className="block text-[12px] text-muted">Al vender aparece la opción de sacarla.</span>
          </span>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="País">
            <select className="input" name="country" value={pais} onChange={(e) => setPais(e.target.value as Pais)}>
              {PAISES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label} · {x.entidad} con {x.proveedor}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Ambiente" hint="Empieza en pruebas: esas facturas no tienen validez fiscal.">
            <select className="input" name="environment" defaultValue={config.environment}>
              <option value="pruebas">Pruebas</option>
              <option value="produccion">Producción (facturas reales)</option>
            </select>
          </Field>
          <Field label="Impuesto de tus ventas" hint="Tus precios ya lo traen incluido: se separa al facturar.">
            <select key={pais} className="input" name="taxKey" defaultValue={pais === config.country ? config.taxKey : TARIFAS[pais][0].value}>
              {TARIFAS[pais].map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Al vender, marcar de primero">
            <select className="input" name="defaultDocument" defaultValue={config.defaultDocument}>
              <option value="normal">Factura normal</option>
              <option value="autorizada">Factura autorizada</option>
            </select>
          </Field>
        </div>

        {moneda !== p.moneda && (
          <Alert kind="info">
            La factura de {p.label} va en {p.moneda} y tu negocio está en {moneda}. Cambia la moneda en Datos del negocio antes de
            activarla.
          </Alert>
        )}

        {pais === "CO" ? (
          <fieldset className="space-y-3 rounded-xl border border-line p-3" key={"co-" + vuelta}>
            <legend className="px-1 text-[12px] font-bold text-strong">Tu cuenta de Factus</legend>
            <p className="text-[12px] text-muted">
              En Factus: Configuración &gt; API. El NIT, la resolución y el logo de la factura se configuran allá.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client ID">
                <input className="input" name="clientId" autoComplete="off" placeholder={claveGuardada} />
              </Field>
              <Field label="Client secret">
                <input className="input" name="clientSecret" type="password" autoComplete="new-password" placeholder={claveGuardada} />
              </Field>
              <Field label="Usuario (correo)">
                <input className="input" name="username" autoComplete="off" placeholder={claveGuardada} />
              </Field>
              <Field label="Contraseña de Factus">
                <input className="input" name="password" type="password" autoComplete="new-password" placeholder={claveGuardada} />
              </Field>
            </div>
            <Field label="Rango de numeración" hint="Solo si tienes más de un rango activo. Prueba la conexión para verlos.">
              <input className="input" name="numberingRangeId" inputMode="numeric" value={rango} onChange={(e) => setRango(e.target.value)} placeholder="Automático" />
            </Field>
            {rangoSinGuardar && rango !== actual.numberingRangeId && (
              <p className="text-[12px] font-semibold text-warn">Rango {rango} elegido: toca Guardar para usarlo.</p>
            )}
          </fieldset>
        ) : (
          <fieldset className="space-y-3 rounded-xl border border-line p-3" key={"ec-" + vuelta}>
            <legend className="px-1 text-[12px] font-bold text-strong">Tu cuenta de Dátil y tus datos ante el SRI</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Clave del API de Dátil">
                <input className="input" name="apiKey" type="password" autoComplete="new-password" placeholder={claveGuardada} />
              </Field>
              <Field label="Clave de tu firma electrónica">
                <input className="input" name="certPassword" type="password" autoComplete="new-password" placeholder={claveGuardada} />
              </Field>
              <Field label="RUC">
                <input className="input" name="taxId" inputMode="numeric" maxLength={13} defaultValue={config.taxId} />
              </Field>
              <Field label="Razón social">
                <input className="input" name="legalName" defaultValue={config.legalName} />
              </Field>
              <Field label="Nombre comercial">
                <input className="input" name="tradeName" defaultValue={config.tradeName} />
              </Field>
              <Field label="Dirección de la matriz">
                <input className="input" name="fiscalAddress" defaultValue={config.fiscalAddress} />
              </Field>
              <Field label="Establecimiento">
                <input className="input" name="establishment" inputMode="numeric" maxLength={3} defaultValue={config.establishment} />
              </Field>
              <Field label="Punto de emisión">
                <input className="input" name="emissionPoint" inputMode="numeric" maxLength={3} defaultValue={config.emissionPoint} />
              </Field>
              <Field label="Siguiente número de factura" hint="El secuencial que sigue en tu punto de emisión.">
                <input className="input" name="nextSequential" type="number" min={1} defaultValue={actual.nextSequential} />
              </Field>
              <Field label="Contribuyente especial (resolución)">
                <input className="input" name="specialTaxpayer" defaultValue={config.specialTaxpayer} placeholder="Déjalo vacío si no eres" />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-body">
              <input type="checkbox" name="keepsAccounting" defaultChecked={config.keepsAccounting} className="h-4 w-4" />
              Obligado a llevar contabilidad
            </label>
          </fieldset>
        )}

        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </button>
      </form>

      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" disabled={probando || !guardadas} onClick={() => startTransition(() => probar())}>
            {probando ? "Probando…" : "Probar conexión con " + p.proveedor}
          </button>
          {!guardadas && <span className="text-[12px] text-muted">Guarda primero las credenciales.</span>}
          {!prueba && actual.lastCheckAt && (
            <span className={"text-[12px] " + (actual.lastCheckOk ? "text-good" : "text-bad")}>
              Última prueba: {actual.lastCheckMessage}
            </span>
          )}
        </div>
        {prueba && (
          <p className={"mt-2 text-[13px] " + (prueba.ok ? "text-good" : "text-bad")} data-prueba-facturacion>
            {prueba.mensaje}
          </p>
        )}
        {prueba?.rangos && prueba.rangos.length > 0 && (
          <ul className="mt-2 space-y-1">
            {prueba.rangos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 text-[12px] text-body">
                <span className="min-w-0 flex-1">
                  <strong>{r.prefijo || "Sin prefijo"}</strong> {r.desde}–{r.hasta} · va en {r.actual} · resolución {r.resolucion}
                  {r.documento ? " · " + r.documento : ""}
                </span>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setRango(r.id);
                    setRangoSinGuardar(true);
                  }}
                >
                  Usar este
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
