import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { BUSINESS_LABEL } from "@/lib/nav";
import { GRUPO_LABEL, PRESETS, keysDeFabrica, modulosDe, presetKeys } from "@/lib/modules";
import { PASOS } from "@/lib/onboarding";
import {
  chooseWorkspaceAction,
  finishOnboardingAction,
  goToStepAction,
} from "@/actions/onboarding";
import { WorkspaceForm, type WorkspaceItem } from "@/components/WorkspaceForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Card } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

const TITULOS = [
  "Bienvenido",
  "¿Qué necesitas ver?",
  "Ajusta tu menú",
  "Tu primer paso",
];

/** Lo primero que vale la pena hacer, segun el oficio. */
const PRIMER_PASO: Record<string, { texto: string; href: string; boton: string }> = {
  CARTERA: {
    texto:
      "Anota tu primer prestamo: cuanto entregaste, el interes y en cuantas cuotas. La aplicacion arma el plan y te avisa a quien cobrarle cada dia.",
    href: "/panel/cartera",
    boton: "Anotar un prestamo",
  },
  BARBERIA: {
    texto:
      "Sube tus cortes con su precio. Es lo que ve el cliente cuando separa turno, así que es lo que más rinde el primer día.",
    href: "/panel/catalogo",
    boton: "Cargar mis cortes",
  },
  RESTAURANTE: {
    texto:
      "Sube tu carta con los precios. Con eso ya puedes abrir cuentas por mesa sin escribir el precio a mano cada vez.",
    href: "/panel/catalogo",
    boton: "Cargar mi carta",
  },
  COMIDAS_RAPIDAS: {
    texto:
      "Sube tus productos con su precio. Con eso ya puedes cobrar en el mostrador en dos toques.",
    href: "/panel/catalogo",
    boton: "Cargar mis productos",
  },
  ROPA: {
    texto:
      "Sube tus prendas con su foto, su precio y sus tallas. La foto es la que te sirve después para el catálogo que mandas por WhatsApp.",
    href: "/panel/catalogo",
    boton: "Cargar mis prendas",
  },
  OTRO: {
    texto:
      "Sube lo que vendes con su precio, sea producto o servicio. Te dejamos dos de ejemplo para que veas cómo es: cámbialos por los tuyos. Si manejas existencias, márcale la casilla de inventario.",
    href: "/panel/catalogo",
    boton: "Cargar lo que vendo",
  },
};

export default async function BienvenidaPage() {
  const sesion = await requireSession();
  const { user, staff } = sesion;

  // Si ya lo termino o lo salto, no se lo volvemos a poner encima.
  if (staff.onboardingDoneAt) redirect("/panel");

  const paso = Math.max(0, Math.min(PASOS - 1, staff.onboardingStep));
  const modulos = await modulosDe(sesion);
  const fabrica = await keysDeFabrica(user.businessType, staff.role === "DUENO");

  const config = await db.workspaceConfig.findFirst({
    where: { staffId: staff.id, userId: user.id },
    select: { id: true },
  });

  const items: WorkspaceItem[] = modulos.map((m) => ({
    key: m.key,
    label: m.label,
    icon: m.icon,
    short: m.short,
    example: m.example,
    fixed: m.fixed,
    visible: m.visible,
  }));

  const enElMenu = modulos.filter((m) => m.visible && m.inSidebar);
  const nucleo = modulos.filter((m) => m.group === "NUCLEO");
  const primero = PRIMER_PASO[user.businessType] ?? PRIMER_PASO.ROPA;

  const saltar = (
    <form action={finishOnboardingAction}>
      <SubmitButton className="btn-ghost btn-sm" pendingText="...">
        Saltar por ahora
      </SubmitButton>
    </form>
  );

  const atras = (destino: number) => (
    <form action={goToStepAction}>
      <input type="hidden" name="paso" value={destino} />
      <SubmitButton className="btn-ghost btn-sm" pendingText="...">
        Atrás
      </SubmitButton>
    </form>
  );

  const siguiente = (destino: number, texto: string) => (
    <form action={goToStepAction}>
      <input type="hidden" name="paso" value={destino} />
      <SubmitButton className="btn-primary" pendingText="...">
        {texto}
        <Icon name="arrowOut" className="h-4 w-4 rotate-90" />
      </SubmitButton>
    </form>
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Donde va y cuanto falta. Un asistente sin esto se siente eterno. */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-bold uppercase tracking-wide text-subtle">
            Paso {paso + 1} de {PASOS}
          </span>
          {saltar}
        </div>
        <div className="flex gap-1.5" role="presentation">
          {Array.from({ length: PASOS }).map((_, i) => (
            <span
              key={i}
              className={
                "h-1.5 flex-1 rounded-full border border-line " +
                (i <= paso ? "bg-brand-600" : "bg-surface")
              }
            />
          ))}
        </div>
      </div>

      <h1 className="font-display text-2xl text-strong">{TITULOS[paso]}</h1>

      {/* ------------------------------------------------------ Paso 1 */}
      {paso === 0 && (
        <div className="mt-4 space-y-4">
          <Card>
            <p className="text-base leading-relaxed text-body">
              Hola <strong className="text-strong">{staff.name.split(" ")[0]}</strong>. Vamos a
              dejar <strong className="text-strong">{user.businessName}</strong> listo en cuatro
              pasos cortos.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-body">
              La aplicación tiene muchos apartados porque sirve para negocios muy distintos. Casi
              ninguno los necesita todos. En el siguiente paso escoges los que sí, y el resto
              queda apagado para que no te estorbe.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-body">
              Nada de esto es definitivo: puedes cambiarlo cuando quieras desde{" "}
              <strong className="text-strong">Armar mi menú</strong>, y lo que apagues no se
              borra.
            </p>
          </Card>

          <Card title={"Tu negocio es " + BUSINESS_LABEL[user.businessType].toLowerCase()}>
            <p className="text-sm text-body">
              Por eso te preparamos{" "}
              {nucleo.length > 0 ? (
                <>
                  <strong className="text-strong">
                    {nucleo.map((m) => m.label).join(" y ")}
                  </strong>
                  , que es lo propio de tu oficio, más
                </>
              ) : (
                <>lo propio de tu oficio, más</>
              )}{" "}
              lo de la plata del día. Los apartados que no aplican a tu negocio ni siquiera
              aparecen en tu lista.
            </p>
          </Card>

          <div className="flex justify-end">{siguiente(1, "Empecemos")}</div>
        </div>
      )}

      {/* ------------------------------------------------------ Paso 2 */}
      {paso === 1 && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-body">
            Escoge por dónde empezar. Puedes cambiarlo en el siguiente paso, uno por uno.
          </p>

          <div className="space-y-3">
            {PRESETS.map((preset) => {
              const llaves = presetKeys(preset.key, modulos, fabrica);
              const visibles = modulos.filter(
                (m) => m.inSidebar && (m.fixed || llaves.includes(m.key))
              );

              return (
                <form key={preset.key} action={chooseWorkspaceAction}>
                  <input type="hidden" name="preset" value={preset.key} />
                  <SubmitButton
                    className="block w-full rounded-xl border border-line bg-panel px-4 py-3 text-left transition hover:border-brand-600 hover:shadow-[4px_4px_0_0_var(--edge)]"
                    pendingText="Guardando..."
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="font-display text-base text-strong">{preset.label}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {visibles.length} apartados
                      </span>
                    </span>
                    <span className="mt-0.5 block text-sm font-normal text-subtle">
                      {preset.hint}
                    </span>
                    <span className="mt-2 block text-[11px] font-normal leading-snug text-muted">
                      {visibles.map((m) => m.label).join(" · ")}
                    </span>
                  </SubmitButton>
                </form>
              );
            })}
          </div>

          <div className="flex justify-between">{atras(0)}</div>
        </div>
      )}

      {/* ------------------------------------------------------ Paso 3 */}
      {paso === 2 && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-body">
            {config
              ? "Ya quedó un punto de partida. Prende o apaga lo que quieras y arrastra para poner primero lo que más uses."
              : "Prende lo que uses y arrastra para poner primero lo que más necesites."}{" "}
            Recuerda: apagar no borra nada.
          </p>

          <Card title="Tus apartados">
            <WorkspaceForm items={items} />
          </Card>

          <div className="flex items-center justify-between gap-3">
            {atras(1)}
            {siguiente(3, "Ya quedó")}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ Paso 4 */}
      {paso === 3 && (
        <div className="mt-4 space-y-4">
          <Card title="Tu menú quedó así">
            <ul className="flex flex-wrap gap-2">
              {enElMenu.map((m) => (
                <li
                  key={m.key}
                  className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-bold text-strong"
                >
                  <Icon name={m.icon} className="h-3.5 w-3.5" />
                  {m.label}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Lo que más rinde ahora">
            <p className="text-sm leading-relaxed text-body">{primero.texto}</p>
            <Link href={primero.href} className="btn-primary btn-sm mt-3">
              {primero.boton}
            </Link>
          </Card>

          <Card title="Si algo no se entiende">
            <p className="text-sm text-body">
              En <strong className="text-strong">Guía</strong> buscas lo que quieres hacer y te
              decimos dónde y cómo. Y si no está ahí, escríbenos por Soporte.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href="/panel/guia" className="btn-ghost btn-sm">
                <Icon name="book" className="h-4 w-4" />
                Ver la guía
              </Link>
              <Link href="/panel/soporte" className="btn-ghost btn-sm">
                <Icon name="whatsapp" className="h-4 w-4" />
                Soporte
              </Link>
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3">
            {atras(2)}
            <form action={finishOnboardingAction}>
              <SubmitButton className="btn-primary" pendingText="...">
                <Icon name="check" className="h-4 w-4" />
                Entrar a mi negocio
              </SubmitButton>
            </form>
          </div>
        </div>
      )}

      <p className="mt-6 text-center text-xs text-subtle">
        {GRUPO_LABEL.CONFIGURACION}: puedes volver a ver esto desde Ajustes cuando quieras.
      </p>
    </div>
  );
}
