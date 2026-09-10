"use client";

import { useActionState, useState } from "react";
import { updatePortfolioAction } from "@/actions/portfolio";
import { SubmitButton } from "./SubmitButton";
import { PhotoField } from "./PhotoField";
import { PortfolioPreview, type PreviewItem } from "./PortfolioPreview";
import { Alert, Field } from "./ui";
import { Icon } from "./Icon";

/**
 * Editor del portafolio, con la vista previa al lado.
 *
 * Todo lo que se escribe se ve al instante en el celular de la derecha, sin
 * guardar ni recargar. Por eso el estado vive aqui arriba y no dentro de cada
 * campo: la vista previa necesita leerlo mientras la persona escribe.
 */
export function PortfolioForm({
  initial,
  businessName,
  itemPlural,
  preview,
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
  /** Lo que no se edita aqui pero si se ve en la pagina. */
  preview: {
    tagline: string | null;
    logo: string | null;
    brandColor: string;
    phone: string | null;
    address: string | null;
    items: PreviewItem[];
    showBooking: boolean;
    currency: string;
  };
}) {
  const [state, formAction] = useActionState(updatePortfolioAction, undefined);

  const [cover, setCover] = useState(initial.publicCover);
  const [headline, setHeadline] = useState(initial.publicHeadline ?? "");
  const [about, setAbout] = useState(initial.publicAbout ?? "");
  const [orderNote, setOrderNote] = useState(initial.publicOrderNote ?? "");
  const [open, setOpen] = useState(initial.publicOpen);
  const [showPrices, setShowPrices] = useState(initial.publicShowPrices);
  // En celular no caben las dos cosas al tiempo, asi que se alterna.
  const [verPreview, setVerPreview] = useState(false);

  const vista = (
    <PortfolioPreview
      cover={cover}
      headline={headline}
      about={about}
      orderNote={orderNote}
      showPrices={showPrices}
      open={open}
      businessName={businessName}
      {...preview}
    />
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <form action={formAction} className="space-y-4">
        {state?.error && <Alert kind="error">{state.error}</Alert>}
        {state?.ok && <Alert kind="ok">{state.ok}</Alert>}

        <button
          type="button"
          onClick={() => setVerPreview(!verPreview)}
          className="btn-ghost btn-sm w-full lg:hidden"
        >
          <Icon name="image" className="h-4 w-4" />
          {verPreview ? "Volver a editar" : "Ver como queda"}
        </button>

        {verPreview && <div className="lg:hidden">{vista}</div>}

        <div className={verPreview ? "hidden lg:block lg:space-y-4" : "space-y-4"}>
          <PhotoField
            name="publicCover"
            currentUrl={initial.publicCover}
            onChange={setCover}
            label="Foto de portada"
            hint="La franja de arriba de tu pagina. Se ve mejor una foto ancha del local."
          />

          <Field label="Titular" hint={"Si lo dejas vacio usamos " + businessName + "."}>
            <input
              className="input"
              name="publicHeadline"
              maxLength={80}
              value={headline}
              onChange={(e) => setHeadline(e.target.value)}
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
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              placeholder={
                "Ej: Llevamos 8 anos vendiendo " + itemPlural + " en el centro. Domicilios a toda la ciudad."
              }
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
              value={orderNote}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Ej: pedidos hasta las 8 pm. Domicilio $5.000."
            />
          </Field>

          <div className="space-y-2.5 rounded-xl border border-line bg-surface p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-strong">
              <input
                type="checkbox"
                name="publicOpen"
                checked={open}
                onChange={(e) => setOpen(e.target.checked)}
                className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
              />
              Mi pagina esta publicada
            </label>
            <label className="flex items-center gap-2 text-sm text-body">
              <input
                type="checkbox"
                name="publicShowPrices"
                checked={showPrices}
                onChange={(e) => setShowPrices(e.target.checked)}
                className="h-4 w-4 rounded border-line bg-panel accent-brand-600"
              />
              Mostrar los precios
            </label>
            <p className="text-xs text-subtle">
              Si la apagas, el enlace sigue funcionando pero solo muestra tus datos de contacto.
            </p>
          </div>
        </div>

        <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Guardando...">
          <Icon name="check" className="h-4 w-4" />
          Guardar mi pagina
        </SubmitButton>
      </form>

      {/* En pantalla grande la vista previa se queda pegada mientras edita. */}
      <div className="hidden lg:block">
        <div className="sticky top-6">{vista}</div>
      </div>
    </div>
  );
}
