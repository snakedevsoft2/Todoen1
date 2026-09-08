"use client";

import { useActionState, useState } from "react";
import {
  changeStaffPasswordAction,
  createStaffAction,
  removeStaffAccessAction,
  setStaffAccessAction,
  toggleStaffActiveAction,
  updateStaffAction,
  deleteStaffAction,
} from "@/actions/staff";
import { STAFF_COLORS, initials } from "@/lib/staff";
import { SubmitButton } from "./SubmitButton";
import { Alert, Badge, Field } from "./ui";
import { Icon } from "./Icon";

export type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  color: string;
  commissionPct: number;
  bookable: boolean;
  active: boolean;
  hasPassword: boolean;
};

/** Circulito de color con las iniciales del barbero. */
export function StaffDot({
  name,
  color,
  size = "md",
}: {
  name: string;
  color: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-6 w-6 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white " + dim
      }
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

function ColorPicker({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [color, setColor] = useState(defaultValue);
  return (
    <div>
      <input type="hidden" name={name} value={color} />
      <div className="flex flex-wrap gap-1.5">
        {STAFF_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={"Color " + c}
            className={
              "h-7 w-7 rounded-full border-2 transition " +
              (color === c ? "border-strong scale-110" : "border-transparent")
            }
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

export function NewStaffForm() {
  const [state, formAction] = useActionState(createStaffAction, undefined);
  const [withAccess, setWithAccess] = useState(true);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del barbero">
          <input className="input" name="name" required placeholder="Ej: Andres Lopez" />
        </Field>
        <Field label="Telefono (opcional)">
          <input className="input" name="phone" inputMode="tel" placeholder="300 000 0000" />
        </Field>
      </div>

      <Field label="Color en la agenda" hint="Para reconocer sus turnos de un vistazo.">
        <ColorPicker name="color" defaultValue={STAFF_COLORS[1]} />
      </Field>

      <Field
        label="Comision (%)"
        hint="Cuanto se lleva de lo que cobra. Solo se usa para el reporte. Dejalo en 0 si no aplica."
      >
        <input
          className="input w-28"
          type="number"
          name="commissionPct"
          min={0}
          max={100}
          step={1}
          defaultValue={0}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-body">
        <input type="checkbox" name="bookable" defaultChecked className="h-4 w-4" />
        Los clientes pueden elegirlo en la pagina de reservas
      </label>

      <div className="rounded-xl border border-line bg-surface p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-strong">
          <input
            type="checkbox"
            checked={withAccess}
            onChange={(e) => setWithAccess(e.target.checked)}
            className="h-4 w-4"
          />
          Darle su propio usuario para entrar
        </label>
        <p className="mt-1 text-xs text-muted">
          Con esto el barbero entra con su correo y su contrasena, y ve la agenda y las ventas del
          negocio. No puede cambiar los ajustes ni el equipo.
        </p>

        {withAccess && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Correo">
              <input
                className="input"
                type="email"
                name="email"
                placeholder="barbero@correo.com"
                autoComplete="off"
              />
            </Field>
            <Field label="Contrasena" hint="Minimo 6 caracteres. Despues el la puede cambiar.">
              <input
                className="input"
                type="text"
                name="password"
                placeholder="Ej: barberia123"
                autoComplete="new-password"
              />
            </Field>
          </div>
        )}
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Agregando...">
        <Icon name="plus" className="h-4 w-4" />
        Agregar barbero
      </SubmitButton>
    </form>
  );
}

function AccessForm({ staff }: { staff: StaffRow }) {
  const [state, formAction] = useActionState(setStaffAccessAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={staff.id} />
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Correo para entrar">
          <input
            className="input"
            type="email"
            name="email"
            defaultValue={staff.email ?? ""}
            placeholder="barbero@correo.com"
            required
            autoComplete="off"
          />
        </Field>
        <Field
          label={staff.hasPassword ? "Nueva contrasena" : "Contrasena"}
          hint={staff.hasPassword ? "Dejala vacia si no la quieres cambiar." : "Minimo 6 caracteres."}
        >
          <input
            className="input"
            type="text"
            name="password"
            placeholder={staff.hasPassword ? "Sin cambios" : "Ej: barberia123"}
            autoComplete="new-password"
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
          {staff.hasPassword ? "Guardar acceso" : "Crear su usuario"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function StaffCard({
  staff,
  stats,
  currency,
}: {
  staff: StaffRow;
  stats?: { totalSales: string; attended: number; booked: number; commission: string };
  currency: string;
}) {
  const [tab, setTab] = useState<"none" | "datos" | "acceso">("none");
  const isOwner = staff.role === "DUENO";

  return (
    <li className={"rounded-xl border p-3 " + (staff.active ? "border-line bg-surface" : "border-dashed border-line bg-panel opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StaffDot name={staff.name} color={staff.color} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-strong">
              {staff.name}
              {isOwner ? <Badge tone="blue">Dueno</Badge> : <Badge>Barbero</Badge>}
              {!staff.active && <Badge tone="red">Inactivo</Badge>}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {staff.email ? (
                <>
                  <Icon name="user" className="mr-1 inline h-3 w-3" />
                  {staff.email}
                </>
              ) : isOwner ? (
                "Entra con el correo del negocio"
              ) : (
                "Sin usuario para entrar"
              )}
            </p>
            <p className="mt-0.5 text-xs text-subtle">
              {staff.bookable ? "Los clientes lo pueden elegir" : "No aparece en las reservas"}
              {staff.commissionPct > 0 ? " - Comision " + staff.commissionPct + "%" : ""}
            </p>
          </div>
        </div>

        {stats && (
          <div className="text-right">
            <p className="text-sm font-bold text-brand-600">{stats.totalSales}</p>
            <p className="text-[11px] text-subtle">
              {stats.booked} turnos este mes - {stats.attended} atendidos
            </p>
            {staff.commissionPct > 0 && (
              <p className="text-[11px] text-muted">Comision {stats.commission}</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setTab(tab === "datos" ? "none" : "datos")}
          className="btn-ghost btn-sm"
        >
          <Icon name="cog" className="h-4 w-4" />
          Editar
        </button>

        {!isOwner && (
          <button
            type="button"
            onClick={() => setTab(tab === "acceso" ? "none" : "acceso")}
            className="btn-ghost btn-sm"
          >
            <Icon name="lock" className="h-4 w-4" />
            {staff.email ? "Cambiar acceso" : "Darle usuario"}
          </button>
        )}

        {!isOwner && staff.email && (
          <form action={removeStaffAccessAction}>
            <input type="hidden" name="id" value={staff.id} />
            <SubmitButton
              className="btn-ghost btn-sm"
              pendingText="..."
              confirm={"Quitarle el acceso a " + staff.name + ". Seguira apareciendo en la agenda."}
            >
              Quitar acceso
            </SubmitButton>
          </form>
        )}

        {!isOwner && (
          <form action={toggleStaffActiveAction}>
            <input type="hidden" name="id" value={staff.id} />
            <SubmitButton className="btn-ghost btn-sm" pendingText="...">
              {staff.active ? "Desactivar" : "Activar"}
            </SubmitButton>
          </form>
        )}

        {!isOwner && (
          <form action={deleteStaffAction} className="ml-auto">
            <input type="hidden" name="id" value={staff.id} />
            <SubmitButton
              className="btn-ghost btn-sm text-bad"
              pendingText="..."
              confirm={
                "Quitar a " +
                staff.name +
                " del equipo. Si ya tiene turnos o ventas, se guarda el historial y solo queda inactivo."
              }
            >
              <Icon name="trash" className="h-4 w-4" />
            </SubmitButton>
          </form>
        )}
      </div>

      {tab === "datos" && (
        <form action={updateStaffAction} className="mt-3 space-y-3 rounded-xl border border-line bg-panel p-3">
          <input type="hidden" name="id" value={staff.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <input className="input" name="name" defaultValue={staff.name} required />
            </Field>
            <Field label="Telefono">
              <input className="input" name="phone" defaultValue={staff.phone ?? ""} inputMode="tel" />
            </Field>
          </div>
          <Field label="Color en la agenda">
            <ColorPicker name="color" defaultValue={staff.color} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={"Comision (%) en " + currency}>
              <input
                className="input w-28"
                type="number"
                name="commissionPct"
                min={0}
                max={100}
                step={1}
                defaultValue={staff.commissionPct}
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-body">
              <input
                type="checkbox"
                name="bookable"
                defaultChecked={staff.bookable}
                className="h-4 w-4"
              />
              Aparece en la pagina de reservas
            </label>
          </div>
          <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
            Guardar cambios
          </SubmitButton>
        </form>
      )}

      {tab === "acceso" && !isOwner && (
        <div className="mt-3 rounded-xl border border-line bg-panel p-3">
          <AccessForm staff={staff} />
        </div>
      )}
    </li>
  );
}

/** Cada barbero cambia su propia contrasena desde Ajustes. */
export function StaffPasswordForm() {
  const [state, formAction] = useActionState(changeStaffPasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <Field label="Contrasena actual">
        <input
          className="input"
          type="password"
          name="current"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="Nueva contrasena" hint="Minimo 6 caracteres.">
        <input
          className="input"
          type="password"
          name="next"
          required
          minLength={6}
          autoComplete="new-password"
        />
      </Field>
      <SubmitButton className="btn-ghost w-full sm:w-auto" pendingText="Cambiando...">
        Cambiar contrasena
      </SubmitButton>
    </form>
  );
}
