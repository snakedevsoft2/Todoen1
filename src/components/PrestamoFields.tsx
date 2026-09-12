"use client";

import { useState } from "react";
import { money, pasoMoneda } from "@/lib/format";
import {
  FRECUENCIAS,
  ganancia,
  planDeCuotas,
  totalConInteres,
  valorCuota,
  type Frecuencia,
} from "@/lib/prestamos";
import { Field } from "./ui";
import { Icon } from "./Icon";

function Resumen({ label, valor, fuerte }: { label: string; valor: string; fuerte?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-subtle">{label}</p>
      <p className={fuerte ? "text-lg font-bold text-brand-600" : "text-sm font-bold text-strong"}>
        {valor}
      </p>
    </div>
  );
}

/**
 * Capital, interes y cuotas de un prestamo.
 *
 * El total no se escribe: se calcula. Si se pudiera escribir a mano, un dia
 * quedaria un total que no cuadra con lo que se presto y nadie sabria cual de
 * los dos numeros es el bueno.
 *
 * Se muestra mientras la persona teclea porque lo que de verdad quiere saber
 * antes de prestar es de cuanto le queda la cuota y cuanto se gana, no la suma
 * total.
 */
export function CamposPrestamo({ today, currency }: { today: string; currency: string }) {
  const [capital, setCapital] = useState("");
  const [interes, setInteres] = useState("20");
  const [cuotas, setCuotas] = useState("20");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>("DIARIA");
  const [desde, setDesde] = useState(today);

  // Se lee igual que lo va a leer el servidor, o el numero que se ve en la
  // pantalla no seria el que queda guardado.
  const factor = pasoMoneda(currency) === "1" ? 1 : 100;
  const capitalNum = Math.round((Number(capital.replace(",", ".")) || 0) * factor);
  const interesNum = Math.max(0, Math.trunc(Number(interes) || 0));
  const cuotasNum = Math.max(0, Math.trunc(Number(cuotas) || 0));

  const total = totalConInteres(capitalNum, interesNum);
  const cuota = valorCuota(total, cuotasNum);
  const gano = ganancia(capitalNum, interesNum);
  const plan = planDeCuotas({ total, cuotas: cuotasNum, frecuencia, desde });
  const ultima = plan[plan.length - 1];

  const dia = (d: string) => d.slice(8) + "/" + d.slice(5, 7);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={"Cuanto le prestas (" + currency + ")"}>
          <input
            className="input"
            type="number"
            name="principal"
            min={0}
            step={pasoMoneda(currency)}
            required
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Interes (%)" hint="Sobre lo prestado. Ej: 20 es un 20%.">
          <input
            className="input"
            type="number"
            name="interestPct"
            min={0}
            max={500}
            step={1}
            required
            value={interes}
            onChange={(e) => setInteres(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="En cuantas cuotas">
          <input
            className="input"
            type="number"
            name="installments"
            min={1}
            max={500}
            step={1}
            required
            value={cuotas}
            onChange={(e) => setCuotas(e.target.value)}
          />
        </Field>
        <Field label="Cada cuanto paga">
          <select
            className="input"
            name="frequency"
            value={frecuencia}
            onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}
          >
            {FRECUENCIAS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Fecha del prestamo">
          <input
            className="input"
            type="date"
            name="day"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
        </Field>
      </div>

      {/* El resumen es lo que se mira antes de decir que si. */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Resumen label="Cuota" valor={money(cuota, currency)} fuerte />
          <Resumen label="Total a pagar" valor={money(total, currency)} />
          <Resumen label="Te ganas" valor={money(gano, currency)} />
          <Resumen label="Termina" valor={ultima ? dia(ultima.day) : "-"} />
        </div>
        {plan.length > 0 && (
          <p className="mt-2.5 text-xs text-muted">
            {plan.length} {plan.length === 1 ? "cuota" : "cuotas"} de {money(cuota, currency)}. La
            primera cae el {dia(plan[0].day)}: quien presta hoy no cobra hoy.
          </p>
        )}
      </div>
    </>
  );
}

/**
 * El fiador: quien responde si el deudor no paga.
 *
 * Va plegado porque no siempre hay, y desplegarlo de entrada haria el
 * formulario el doble de largo para quien presta con sola firma. Se pide
 * cedula y direccion porque sin eso no se le puede ubicar, que es justo para
 * lo que existe la figura.
 */
export function CamposFiador() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-bold text-strong"
      >
        <Icon name="users" className="h-4 w-4 text-muted" />
        Datos del fiador
        <span className="ml-auto text-xs font-normal text-muted">
          {abierto ? "Ocultar" : "Opcional"}
        </span>
      </button>

      {abierto && (
        <div className="space-y-3 border-t border-line p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre del fiador">
              <input className="input" name="guarantorName" placeholder="Ej: Rosa Medina" />
            </Field>
            <Field label="Cedula">
              <input className="input" name="guarantorId" placeholder="Ej: 43.123.456" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telefono">
              <input
                className="input"
                name="guarantorPhone"
                inputMode="tel"
                placeholder="300 000 0000"
              />
            </Field>
            <Field label="Direccion">
              <input className="input" name="guarantorAddress" placeholder="Ej: Carrera 8 #12-30" />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}
