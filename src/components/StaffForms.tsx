"use client";

import Link from "next/link";
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
import { ROLES_ELEGIBLES, STAFF_COLORS, etiquetaDeRol, initials, teamNoun } from "@/lib/staff";
import { SubmitButton } from "./SubmitButton";
import { Alert, Badge, Field } from "./ui";
import { Icon } from "./Icon";

export type StaffRow = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
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
              "h-7 w-7 rounded-full border transition " +
              (color === c ? "border-strong scale-110" : "border-transparent")
            }
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

export function NewStaffForm({ businessType = "BARBERIA" }: { businessType?: string }) {
  const [state, formAction] = useActionState(createStaffAction, undefined);
  const [withAccess, setWithAccess] = useState(true);
  const noun = teamNoun(businessType);
  // La barberia y el lavadero reparten agenda; en la tienda de ropa el color es para los reportes.
  const agenda = businessType === "BARBERIA" || businessType === "LAVADERO";
  // En el gestor de asistencia nadie vende: ni comision ni "puede vender".
  const asistencia = businessType === "ASISTENCIA";
  const roles = ROLES_ELEGIBLES[businessType];

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={"Nombre del " + noun.singular}>
          <input className="input" name="name" required placeholder="Ej: Andres Lopez" />
        </Field>
        <Field label="Teléfono (opcional)">
          <input className="input" name="phone" inputMode="tel" placeholder="300 000 0000" />
        </Field>
      </div>

      {roles && (
        <Field label="Rol">
          <select className="input" name="role" defaultValue={roles[0].value}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field
        label={agenda ? "Color en la agenda" : "Color en los reportes"}
        hint={
          agenda
            ? "Para reconocer sus turnos de un vistazo."
            : asistencia
              ? "Para reconocerlo en la planilla y los reportes."
              : "Para reconocer sus ventas de un vistazo."
        }
      >
        <ColorPicker name="color" defaultValue={STAFF_COLORS[1]} />
      </Field>

      {!asistencia && (
        <Field
          label="Comisión (%)"
          hint="Cuánto se lleva de lo que vende. Solo se usa para el reporte. Déjalo en 0 si no aplica."
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
      )}

      {agenda && (
        <label className="flex items-center gap-2 text-sm text-body">
          <input type="checkbox" name="bookable" defaultChecked className="h-4 w-4" />
          Los clientes pueden elegirlo en la pagina de reservas
        </label>
      )}

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
          {agenda
            ? "Con esto el barbero entra con su usuario, sin contraseña, y ve la agenda y las ventas del negocio."
            : asistencia
              ? "Con esto entra con su usuario, sin contraseña, marca su entrada y su salida desde el teléfono, avisa sus novedades y hace sus reportes con fotos."
              : "Con esto el empleado entra con su usuario, sin contraseña, y registra las ventas, los gastos y lo del día."}{" "}
          No puede borrar ni cambiar lo que ya está registrado, ni los ajustes ni el equipo, y todo lo que hace queda en su historial.
        </p>

        {withAccess && (
          <div className="mt-3">
            <Field label="Usuario para entrar" hint="Entra escribiendo solo este usuario, sin contraseña. Letras, números, punto o guion.">
              <input
                className="input"
                name="username"
                placeholder="Ej: juliana.tienda"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
          </div>
        )}
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Agregando...">
        <Icon name="plus" className="h-4 w-4" />
        Agregar {noun.singular}
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

      <Field label="Usuario para entrar" hint="Entra escribiendo solo este usuario, sin contraseña.">
        <input
          className="input"
          name="username"
          defaultValue={staff.username ?? ""}
          placeholder="Ej: juliana.tienda"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </Field>
      {staff.email && <p className="text-xs text-muted">También puede entrar con su correo {staff.email} y su contraseña.</p>}

      <div className="flex flex-wrap gap-2">
        <SubmitButton className="btn-primary btn-sm" pendingText="Guardando...">
          {staff.username || staff.email ? "Guardar acceso" : "Crear su usuario"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function StaffCard({
  staff,
  stats,
  currency,
  businessType = "BARBERIA",
}: {
  staff: StaffRow;
  stats?: {
    totalSales: string;
    attended: number;
    booked: number;
    salesCount: number;
    commission: string;
  };
  currency: string;
  businessType?: string;
}) {
  const [tab, setTab] = useState<"none" | "datos" | "acceso">("none");
  const isOwner = staff.role === "DUENO";
  const agenda = businessType === "BARBERIA" || businessType === "LAVADERO";
  const asistencia = businessType === "ASISTENCIA";
  const roles = ROLES_ELEGIBLES[businessType];

  return (
    <li className={"rounded-xl border p-3 " + (staff.active ? "border-line bg-surface" : "border-dashed border-line bg-panel opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StaffDot name={staff.name} color={staff.color} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-strong">
              {staff.name}
              {isOwner ? (
                <Badge tone="blue">{etiquetaDeRol("DUENO", businessType)}</Badge>
              ) : (
                <Badge>{etiquetaDeRol(staff.role, businessType)}</Badge>
              )}
              {!staff.active && <Badge tone="red">Inactivo</Badge>}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              {staff.username || staff.email ? (
                <>
                  <Icon name="user" className="mr-1 inline h-3 w-3" />
                  {staff.username ? "Usuario: " + staff.username : staff.email}
                </>
              ) : isOwner ? (
                "Entra con el correo del negocio"
              ) : (
                "Sin usuario para entrar"
              )}
            </p>
            <p className="mt-0.5 text-xs text-subtle">
              {agenda
                ? staff.bookable
                  ? "Los clientes lo pueden elegir"
                  : "No aparece en las reservas"
                : asistencia
                  ? staff.email || staff.username
                    ? "Marca desde su teléfono"
                    : "Dale un usuario para que pueda marcar"
                  : staff.active
                    ? "Puede vender en la tienda"
                    : "Sin acceso a la tienda"}
              {staff.commissionPct > 0 ? " - Comisión " + staff.commissionPct + "%" : ""}
            </p>
          </div>
        </div>

        {stats && (
          <div className="text-right">
            <p className="text-sm font-bold text-brand-600">{stats.totalSales}</p>
            <p className="text-[11px] text-subtle">
              {agenda
                ? stats.booked + " turnos este mes - " + stats.attended + " atendidos"
                : stats.salesCount + " ventas este mes"}
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

        <Link href={"/panel/equipo/" + staff.id} className="btn-ghost btn-sm">
          <Icon name="clock" className="h-4 w-4" />
          Ver lo que hizo
        </Link>

        {!isOwner && (
          <button
            type="button"
            onClick={() => setTab(tab === "acceso" ? "none" : "acceso")}
            className="btn-ghost btn-sm"
          >
            <Icon name="lock" className="h-4 w-4" />
            {staff.email || staff.username ? "Cambiar acceso" : "Darle usuario"}
          </button>
        )}

        {!isOwner && (staff.email || staff.username) && (
          <form action={removeStaffAccessAction}>
            <input type="hidden" name="id" value={staff.id} />
            <SubmitButton
              className="btn-ghost btn-sm"
              pendingText="..."
              confirm={
                "Quitarle el acceso a " +
                staff.name +
                (agenda
                  ? ". Seguira apareciendo en la agenda."
                  : ". Sus ventas anteriores no se pierden.")
              }
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
            <Field label="Teléfono">
              <input className="input" name="phone" defaultValue={staff.phone ?? ""} inputMode="tel" />
            </Field>
          </div>
          {roles && !isOwner && (
            <Field label="Rol">
              <select className="input" name="role" defaultValue={staff.role}>
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={agenda ? "Color en la agenda" : "Color en los reportes"}>
            <ColorPicker name="color" defaultValue={staff.color} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {asistencia ? (
              // Sin ventas no hay comision, pero se conserva lo que estaba guardado.
              <input type="hidden" name="commissionPct" value={staff.commissionPct} />
            ) : (
              <Field label={"Comisión (%) en " + currency}>
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
            )}
            {agenda ? (
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-body">
                <input
                  type="checkbox"
                  name="bookable"
                  defaultChecked={staff.bookable}
                  className="h-4 w-4"
                />
                Aparece en la pagina de reservas
              </label>
            ) : (
              // Sin agenda el campo no se muestra, pero se conserva como estaba.
              staff.bookable && <input type="hidden" name="bookable" value="on" />
            )}
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

      <Field label="Contraseña actual">
        <input
          className="input"
          type="password"
          name="current"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="Nueva contraseña" hint="Mínimo 6 caracteres.">
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
