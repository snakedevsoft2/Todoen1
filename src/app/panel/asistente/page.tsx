import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { SUGERENCIAS_IA } from "@/lib/sugerencias-ia";
import { Card, PageHeader } from "@/components/ui";
import { AssistantChat } from "@/components/AssistantChat";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function AsistentePage() {
  const user = await requireUser();
  const listo = aiEnabled();

  return (
    <>
      <PageHeader
        title="IA Snake"
        subtitle="Tu asistente: pregúntale por tu negocio o por cómo se hace algo aquí"
      />

      {!listo && (
        <div className="mb-4">
          <Card>
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-warn-soft text-warn">
                <Icon name="alert" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] text-strong">La IA Snake todavía no está encendida</p>
                <p className="mt-1 text-sm text-body">
                  Falta poner la clave <strong>GEMINI_API_KEY</strong> en el servidor. Se saca gratis en Google AI
                  Studio y no cuesta nada para el uso de un negocio.
                </p>
                <p className="mt-1 text-xs text-subtle">Mientras tanto, el resto de la aplicación funciona igual.</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <AssistantChat sugerencias={SUGERENCIAS_IA[user.businessType]} listo={listo} />
    </>
  );
}
