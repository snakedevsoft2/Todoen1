"use client";

import { useActionState } from "react";
import { updatePortfolioAction } from "@/actions/portfolio";
import { SubmitButton } from "./SubmitButton";
import { PhotoField } from "./PhotoField";
import { Alert, Field } from "./ui";

export function PortfolioForm({
  initial,
  businessName,
  itemPlural,
}: {
  initial: {
    publicOpen: boolean;
    publicShowPrices: boolean;
    publicHeadline: string | null;
    publicAbout: string | null;
    publicOrderNote: string | null;
    publicCover: string | null;
  };
  businessName: string;
  itemPlural: string;
}) {
  const [state, formAction] = useActionState(updatePortfolioAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

      <PhotoField
        name="publicCover"
        currentUrl={initial.publicCover}
        label="Foto de portada"
        hint="La franja de arriba de tu portafolio. Se ve mejor una foto ancha del local."
      />

      <Field label="Titular" hint={"Si lo dejas vacio usamos " + businessName + "."}>
        <input
          className="input"
          name="publicHeadline"
          maxLength={80}
          defaultValue={initial.publicHeadline ?? ""}
          placeholder={businessName}
        />
      </Field>

      <Field
        label="Presentacion"
        hint="Dos o tres lineas contando quien eres y que haces. Es lo primero que lee el cliente."
      >
        <textarea
          className="input min-h-[92px] resize-y"
          name="publicAbout"
          maxLength={400}
          defaultValue={initial.publicAbout ?? ""}
          placeholder={"Ej: Llevamos 8 anos vendiendo " + itemPlural + " en el centro. Domicilios a toda la ciudad."}
        />
      </Field>

      <Field
        label="Nota del pedido"
        hint="Sale junto al boton de pedir: horarios, domicilios, formas de pago."
      >
        <input
          className="input"
          name="publicOrderNote"
          maxLength={200}
          defaultValue={initial.publicOrderNote ?? ""}
          placeholder="Ej: pedidos hasta las 8 pm. Domicilio $5.000."
        />
      </Field>

      <div className="space-y-2.5 rounded-xl border-2 border-edge bg-surface p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-strong">
          <input
            type="checkbox"
            name="publicOpen"
            defaultChecked={initial.publicOpen}
            className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
          />
          Mi portafolio esta publicado
        </label>
        <label className="flex items-center gap-2 text-sm text-body">
          <input
            type="checkbox"
            name="publicShowPrices"
            defaultChecked={initial.publicShowPrices}
            className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
          />
          Mostrar los precios
        </label>
        <p className="text-xs text-subtle">
          Si lo apagas, el enlace sigue funcionando pero solo muestra tus datos de contacto.
        </p>
      </div>

      <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
        Guardar portafolio
      </SubmitButton>
    </form>
  );
}
