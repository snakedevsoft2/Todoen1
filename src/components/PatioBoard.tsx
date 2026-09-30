"use client";

import { useActionState, useState } from "react";
import {
  asignarLavadorAction,
  cambiarPrecioLavadoAction,
  cerrarLavadoAction,
  deleteWashJobAction,
  marcarListoAction,
  recibirVehiculoAction,
} from "@/actions/lavadero";
import { FormSinSenal, useAccionSinSenal } from "@/components/SinSenal";
import { SubmitButton } from "./SubmitButton";
import { Alert, Card, Field } from "./ui";
import { Icon } from "./Icon";
import { aCampo, cerosPara, money, parseMoney, shortDay } from "@/lib/format";
import { precioRaro } from "@/lib/precio-raro";

export type ServiceOption = { id: string; name: string; price: number };
export type StaffOption = { id: string; name: string; color: string };

export type WashJobRow = {
  id: string;
  /** El dia en que llego: si no es hoy, es un pendiente que quedo de antes. */
  day: string;
  clientName: string;
  clientPhone: string;
  vehiclePlate: string | null;
  vehicleType: string | null;
  vehicleColor: string | null;
  serviceName: string;
  price: number;
  status: "EN_COLA" | "LAVANDO" | "LISTO" | "POR_COBRAR";
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  assignedStaffColor: string | null;
};

const COLUMNAS: { status: WashJobRow["status"]; title: string }[] = [
  { status: "EN_COLA", title: "En cola" },
  { status: "LAVANDO", title: "Lavando" },
  { status: "LISTO", title: "Listo" },
  { status: "POR_COBRAR", title: "Pendientes" },
];

export function PatioBoard({
  jobs,
  lavadores,
  services,
  currency,
  today,
}: {
  jobs: WashJobRow[];
  lavadores: StaffOption[];
  services: ServiceOption[];
  currency: string;
  today: string;
}) {
  return (
    <div className="space-y-5">
      <RecibirVehiculoForm services={services} currency={currency} />

      <div className="grid gap-4 lg:grid-cols-4">
        {COLUMNAS.map((col) => {
          const enEstaColumna = jobs.filter((j) => j.status === col.status);
          return (
            <div key={col.status}>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">
                {col.title} · {enEstaColumna.length}
              </h3>
              <div className="space-y-2">
                {enEstaColumna.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line p-3 text-center text-xs text-subtle">
                    Nada aquí
                  </p>
                ) : (
                  enEstaColumna.map((job) => (
                    <JobCard key={job.id} job={job} lavadores={lavadores} currency={currency} today={today} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecibirVehiculoForm({ services, currency }: { services: ServiceOption[]; currency: string }) {
  const [state, formAction] = useActionState(
    useAccionSinSenal("recibirVehiculoAction", recibirVehiculoAction),
    undefined
  );
  // Al elegir el servicio se llena con su precio de catálogo, pero se puede
  // cambiar a mano: hay clientes de siempre o carros más sucios que se cobran
  // distinto.
  const [precio, setPrecio] = useState<number | "">("");

  return (
    <Card title="Recibir vehículo" subtitle="Anota los datos del cliente y asígnalo después">
      <form action={formAction} className="space-y-3">
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}
        {state?.aviso && <Alert kind="info">{state.aviso}</Alert>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <input className="input" name="clientName" required placeholder="Nombre completo" />
          </Field>
          <Field label="Celular">
            <input className="input" name="clientPhone" required inputMode="tel" placeholder="300 000 0000" />
          </Field>
          <Field label="Placa (opcional)">
            <input className="input" name="vehiclePlate" placeholder="ABC-123" />
          </Field>
          <Field label="Tipo de vehículo">
            <select className="input" name="vehicleType" defaultValue="carro">
              <option value="carro">Carro</option>
              <option value="camioneta">Camioneta</option>
              <option value="moto">Moto</option>
            </select>
          </Field>
          <Field label="Color (opcional)">
            <input className="input" name="vehicleColor" placeholder="Rojo" />
          </Field>
          <Field label="Servicio">
            <select
              className="input"
              name="serviceId"
              defaultValue=""
              onChange={(e) => {
                const elegido = services.find((s) => s.id === e.target.value);
                setPrecio(elegido ? elegido.price : "");
              }}
            >
              <option value="">Sin definir</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {money(s.price, currency)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Precio" hint="Se llena solo con el del servicio, pero lo puedes cambiar.">
            <input
              className="input"
              type="number"
              name="price"
              min={0}
              step={1}
              value={precio}
              onChange={(e) => setPrecio(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="0"
            />
          </Field>
        </div>

        <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Recibiendo...">
          <Icon name="plus" className="h-4 w-4" />
          Recibir vehículo
        </SubmitButton>
      </form>
    </Card>
  );
}

function JobCard({
  job,
  lavadores,
  currency,
  today,
}: {
  job: WashJobRow;
  lavadores: StaffOption[];
  currency: string;
  today: string;
}) {
  const deAntes = job.day < today;
  return (
    <div className={"rounded-xl border bg-surface p-3 " + (deAntes ? "border-warn-line" : "border-line")}>
      {deAntes && (
        <p className="mb-1.5 inline-block rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
          Pendiente desde el {shortDay(job.day)}
        </p>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-strong">{job.clientName}</p>
          <p className="text-xs text-muted">
            {[job.vehiclePlate, job.vehicleType, job.vehicleColor].filter(Boolean).join(" · ") ||
              "Sin datos del vehículo"}
          </p>
          <p className="mt-0.5 text-xs text-subtle">
            {job.serviceName} · {money(job.price, currency)}
          </p>
          {/* Dueño y jefe de patio corrigen el precio; al resto no se le muestra (FormSinSenal). */}
          <FormSinSenal accion="cambiarPrecioLavadoAction" servidor={cambiarPrecioLavadoAction} className="mt-1.5 flex items-center gap-1.5">
            <input type="hidden" name="washJobId" value={job.id} />
            <input
              name="price"
              type="text"
              inputMode="numeric"
              defaultValue={aCampo(job.price, currency)}
              aria-label="Precio del lavado"
              className="input w-24 px-2 py-1 text-xs"
              required
            />
            <SubmitButton className="btn-ghost btn-sm px-2 text-xs" pendingText="...">
              Cambiar precio
            </SubmitButton>
          </FormSinSenal>
        </div>
        <FormSinSenal accion="deleteWashJobAction" servidor={deleteWashJobAction}>
          <input type="hidden" name="id" value={job.id} />
          <SubmitButton
            className="btn-ghost btn-sm px-2 text-bad"
            pendingText="..."
            ariaLabel="Borrar"
            confirm={"Borrar el vehículo de " + job.clientName + " del patio"}
          >
            <Icon name="trash" className="h-4 w-4" />
          </SubmitButton>
        </FormSinSenal>
      </div>

      {job.assignedStaffName && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: job.assignedStaffColor ?? "#999" }} />
          Lo lava {job.assignedStaffName}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {(job.status === "EN_COLA" || job.status === "LAVANDO") && (
          <FormSinSenal
            accion="asignarLavadorAction"
            servidor={asignarLavadorAction}
            className="flex items-center gap-1.5"
          >
            <input type="hidden" name="washJobId" value={job.id} />
            <select name="staffId" defaultValue={job.assignedStaffId ?? ""} className="input w-36 py-1.5 text-xs">
              <option value="" disabled>
                Elegir lavador
              </option>
              {lavadores.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <SubmitButton className="btn-ghost btn-sm px-2" pendingText="...">
              {job.assignedStaffId ? "Cambiar" : "Asignar"}
            </SubmitButton>
          </FormSinSenal>
        )}

        {job.status === "LAVANDO" && (
          <FormSinSenal accion="marcarListoAction" servidor={marcarListoAction}>
            <input type="hidden" name="washJobId" value={job.id} />
            <SubmitButton className="btn-ghost btn-sm" pendingText="...">
              Ya está listo
            </SubmitButton>
          </FormSinSenal>
        )}

        {(job.status === "LISTO" || job.status === "POR_COBRAR") && <CerrarLavadoForm job={job} currency={currency} />}
      </div>
    </div>
  );
}

function CerrarLavadoForm({ job, currency }: { job: WashJobRow; currency: string }) {
  const [state, formAction] = useActionState(
    useAccionSinSenal("cerrarLavadoAction", cerrarLavadoAction),
    undefined
  );
  const [abierto, setAbierto] = useState(false);
  const [metodo, setMetodo] = useState("EFECTIVO");
  const [monto, setMonto] = useState(String(job.price));
  // Lo que de verdad se va a guardar ("30" es 30.000), comparado con el precio
  // del lavado: si se sale mucho, se avisa y se pide confirmar (ver precio-raro.ts).
  const cobrado = parseMoney(monto, currency, cerosPara("LAVADERO"));
  const raro = precioRaro(cobrado, job.price);
  // El que ya quedo pendiente de pago no puede volver a quedar pendiente.
  const yaDebe = job.status === "POR_COBRAR";

  if (state?.ok) return <Alert kind="ok">{state.ok}</Alert>;

  if (!abierto) {
    return (
      <button type="button" className="btn-primary btn-sm" onClick={() => setAbierto(true)}>
        {yaDebe ? "Ya pagó" : "Cobrar"}
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-1 w-full space-y-2 rounded-lg border border-line bg-panel p-2">
      <input type="hidden" name="washJobId" value={job.id} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.aviso && <Alert kind="info">{state.aviso}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input w-28 py-1.5 text-xs"
          type="text"
          inputMode="numeric"
          name="amount"
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          aria-label="Valor a cobrar"
        />
        <select
          name="paymentMethod"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value)}
          className="input w-40 py-1.5 text-xs"
        >
          <option value="EFECTIVO">Efectivo</option>
          <option value="TARJETA">Tarjeta</option>
          <option value="TRANSFERENCIA">Transferencia</option>
          <option value="OTRO">Otro</option>
          {!yaDebe && <option value="PENDIENTE">Pendientes</option>}
        </select>
        <SubmitButton
          className="btn-primary btn-sm"
          pendingText="Guardando..."
          confirm={
            raro
              ? "¿Seguro? Vas a cobrar " + money(cobrado, currency) + ". El precio normal es " + money(job.price, currency) + "."
              : undefined
          }
        >
          {metodo === "PENDIENTE" ? "Dejar en pendientes" : "Confirmar cobro " + money(cobrado, currency)}
        </SubmitButton>
      </div>
      {raro && (
        <p className="text-xs font-semibold text-bad" data-precio-raro>
          Revisa el valor: vas a cobrar {money(cobrado, currency)} y el precio normal es {money(job.price, currency)}.
        </p>
      )}
    </form>
  );
}
