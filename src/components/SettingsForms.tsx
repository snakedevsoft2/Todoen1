"use client";

import { useActionState } from "react";
import { changePasswordAction, updateBusinessAction, updateLoyaltyAction } from "@/actions/settings";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { WEEKDAYS } from "@/lib/timezones";
import { PaisMonedaZona } from "./PaisMonedaZona";

export type BusinessSettings = {
  businessName: string;
  ownerName: string;
  phone: string | null;
  address: string | null;
  country: string;
  currency: string;
  timezone: string;
  openHour: number;
  closeHour: number;
  slotMinutes: number;
  workDays: string;
  bookingOpen: boolean;
  slug: string;
};

const HOURS = Array.from({ length: 25 }, (_, i) => i);

function hourLabel(h: number) {
  if (h === 0) return "12:00 am";
  if (h === 12) return "12:00 pm";
  if (h === 24) return "12:00 am (medianoche)";
  return (h % 12 === 0 ? 12 : h % 12) + ":00 " + (h < 12 ? "am" : "pm");
}

export function BusinessSettingsForm({
  settings,
  isBarber,
  isClothing = false,
  isLavadero = false,
}: {
  settings: BusinessSettings;
  isBarber: boolean;
  /** La tienda de ropa tambien tiene enlace publico, pero es su catalogo. */
  isClothing?: boolean;
  /** El lavadero tiene catalogo publico Y reservas, igual que la barberia. */
  isLavadero?: boolean;
}) {
  const [state, formAction] = useActionState(updateBusinessAction, undefined);
  const selectedDays = settings.workDays.split(",").map((d) => Number(d.trim()));

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre del negocio">
          <input className="input" name="businessName" defaultValue={settings.businessName} required />
        </Field>
        <Field label="Tu nombre">
          <input className="input" name="ownerName" defaultValue={settings.ownerName} required />
        </Field>
        <Field label="Teléfono">
          <input className="input" name="phone" defaultValue={settings.phone ?? ""} inputMode="tel" />
        </Field>
        <Field label="Dirección">
          <input className="input" name="address" defaultValue={settings.address ?? ""} />
        </Field>
        <PaisMonedaZona pais={settings.country} moneda={settings.currency} zona={settings.timezone} />
      </div>

      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="mb-3 text-sm font-semibold text-strong">Horario de atencion</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Abre a las">
            <select className="input" name="openHour" defaultValue={settings.openHour}>
              {HOURS.slice(0, 24).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cierra a las">
            <select className="input" name="closeHour" defaultValue={settings.closeHour}>
              {HOURS.slice(1).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cada cuanto un turno" hint="En minutos.">
            <input
              className="input"
              name="slotMinutes"
              type="number"
              min={5}
              max={180}
              step={5}
              defaultValue={settings.slotMinutes}
            />
          </Field>
        </div>

        <div className="mt-3">
          <span className="label">Dias que atiendes</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <label
                key={d.value}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-body hover:bg-surface"
              >
                <input
                  type="checkbox"
                  name="workDays"
                  value={d.value}
                  defaultChecked={selectedDays.includes(d.value)}
                  className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
                />
                {d.short}
              </label>
            ))}
          </div>
        </div>
      </div>

      {(isBarber || isClothing || isLavadero) && (
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="mb-3 text-sm font-semibold text-strong">
            {isClothing ? "Catálogo en línea" : isLavadero ? "Catálogo y reservas en línea" : "Reservas en línea"}
          </p>
          <Field
            label={isClothing || isLavadero ? "Enlace de tu catálogo" : "Enlace de tu página de reservas"}
            hint="Solo letras, numeros y guiones. Si lo cambias, el enlace anterior deja de servir."
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs text-subtle">
                {isClothing || isLavadero ? "/catalogo/" : "/reservar/"}
              </span>
              <input className="input" name="slug" defaultValue={settings.slug} />
            </div>
          </Field>
          {(isBarber || isLavadero) && (
            <label className="mt-3 flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                name="bookingOpen"
                defaultChecked={settings.bookingOpen}
                className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
              />
              Recibir reservas de clientes
            </label>
          )}
        </div>
      )}

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        Guardar ajustes
      </SubmitButton>
    </form>
  );
}

export function LoyaltySettingsForm({ goal, reward }: { goal: number; reward: string | null }) {
  const [state, formAction] = useActionState(updateLoyaltyAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lavadas para el premio" hint="Al completarla, el sello vuelve a cero.">
          <input className="input" type="number" name="loyaltyGoal" min={2} max={30} defaultValue={goal} />
        </Field>
        <Field label="En qué consiste el premio">
          <input
            className="input"
            name="loyaltyReward"
            defaultValue={reward ?? ""}
            placeholder="Ej: Lavado completo gratis"
          />
        </Field>
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        Guardar tarjeta
      </SubmitButton>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, undefined);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <Field label="Contraseña actual">
        <input className="input" type="password" name="currentPassword" required autoComplete="current-password" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nueva contraseña">
          <input
            className="input"
            type="password"
            name="newPassword"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Repite la nueva">
          <input
            className="input"
            type="password"
            name="confirmPassword"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </Field>
      </div>
      <SubmitButton className="btn-ghost w-full sm:w-auto" pendingText="Cambiando...">
        Cambiar contrasena
      </SubmitButton>
    </form>
  );
}
