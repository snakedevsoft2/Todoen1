"use client";

import { useActionState, useState } from "react";
import { testWhatsappAction, updateWhatsappAction } from "@/actions/branding";
import { SubmitButton } from "./SubmitButton";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";
import { prettyPhone, WHATSAPP_PROVIDERS, type WhatsappProvider } from "@/lib/whatsapp";

export function WhatsappForm({
  initial,
}: {
  initial: {
    whatsappNumber: string | null;
    whatsappProvider: string;
    whatsappApiKey: string | null;
    whatsappPhoneId: string | null;
    notifyOnBooking: boolean;
  };
}) {
  const [state, formAction] = useActionState(updateWhatsappAction, undefined);
  const [testState, testAction] = useActionState(testWhatsappAction, undefined);
  const [provider, setProvider] = useState<WhatsappProvider>(
    (initial.whatsappProvider as WhatsappProvider) ?? "enlace"
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

        <Field
          label="Numero que recibe los avisos"
          hint="Con indicativo del pais. Ejemplo: +57 317 448 5643"
        >
          <input
            className="input"
            name="whatsappNumber"
            inputMode="tel"
            defaultValue={prettyPhone(initial.whatsappNumber)}
            placeholder="+57 317 448 5643"
          />
        </Field>

        <label className="flex items-start gap-2.5 text-sm text-body">
          <input
            type="checkbox"
            name="notifyOnBooking"
            defaultChecked={initial.notifyOnBooking}
            className="mt-0.5 h-4 w-4 rounded border-line-strong bg-panel accent-brand-600"
          />
          <span>
            Avisarme cada vez que un cliente separe un turno
            <span className="mt-0.5 block text-xs text-muted">
              El aviso incluye la hora, el cliente, el telefono y el servicio.
            </span>
          </span>
        </label>

        <div>
          <span className="label">Como se envia</span>
          <div className="space-y-2">
            {WHATSAPP_PROVIDERS.map((option) => (
              <label
                key={option.value}
                className={
                  "flex cursor-pointer gap-3 rounded-xl border p-3 transition " +
                  (provider === option.value
                    ? "border-edge bg-brand-600 text-on-brand shadow-block"
                    : "border-line hover:border-line-strong")
                }
              >
                <input
                  type="radio"
                  name="whatsappProvider"
                  value={option.value}
                  checked={provider === option.value}
                  onChange={() => setProvider(option.value)}
                  className="mt-0.5 h-4 w-4 accent-brand-600"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{option.label}</span>
                  <span className="mt-0.5 block text-xs opacity-75">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {provider === "callmebot" && (
          <div className="surface-box space-y-3 p-3">
            <p className="text-xs leading-relaxed text-body">
              Para activarlo, desde el WhatsApp de ese mismo numero escribe{" "}
              <span className="font-semibold text-strong">
                &quot;I allow callmebot to send me messages&quot;
              </span>{" "}
              al numero{" "}
              <a
                className="link"
                href="https://wa.me/34644519523?text=I%20allow%20callmebot%20to%20send%20me%20messages"
                target="_blank"
                rel="noopener noreferrer"
              >
                +34 644 51 95 23
              </a>
              . Te responde con una clave. Pegala aqui abajo.
            </p>
            <Field label="Clave de CallMeBot">
              <input
                className="input font-mono text-sm"
                name="whatsappApiKey"
                defaultValue={initial.whatsappApiKey ?? ""}
                placeholder="123456"
              />
            </Field>
          </div>
        )}

        {provider === "meta" && (
          <div className="surface-box space-y-3 p-3">
            <p className="text-xs leading-relaxed text-body">
              Datos de tu cuenta de WhatsApp Business API. Los encuentras en el panel de
              desarrolladores de Meta.
            </p>
            <Field label="Token de acceso">
              <input
                className="input font-mono text-sm"
                name="whatsappApiKey"
                type="password"
                defaultValue={initial.whatsappApiKey ?? ""}
                placeholder="EAAG..."
              />
            </Field>
            <Field label="Identificador del numero">
              <input
                className="input font-mono text-sm"
                name="whatsappPhoneId"
                defaultValue={initial.whatsappPhoneId ?? ""}
                placeholder="1234567890"
              />
            </Field>
          </div>
        )}

        <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
          Guardar avisos
        </SubmitButton>
      </form>

      <form action={testAction} className="divider space-y-3 pt-4">
        {testState?.error && <Alert kind="error">{testState.error}</Alert>}
        {testState?.ok && <Alert kind="ok">{testState.ok}</Alert>}
        <SubmitButton className="btn-ghost btn-sm" pendingText="Enviando prueba...">
          <Icon name="whatsapp" className="h-4 w-4" />
          Enviar mensaje de prueba
        </SubmitButton>
      </form>
    </div>
  );
}
