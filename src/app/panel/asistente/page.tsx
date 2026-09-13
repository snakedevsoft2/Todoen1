import type { BusinessType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { aiEnabled } from "@/lib/ai";
import { Card, PageHeader } from "@/components/ui";
import { AssistantChat } from "@/components/AssistantChat";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

/** Preguntas para arrancar, distintas segun lo que hace el negocio. */
const SUGERENCIAS: Record<BusinessType, string[]> = {
  BARBERIA: [
    "Como voy este mes?",
    "Que corte deberia promocionar?",
    "¿Cómo cierro la caja del día?",
    "Como le mando el recordatorio a un cliente?",
  ],
  ASISTENCIA: [
    "¿Quién no ha marcado entrada hoy?",
    "Cuantas horas trabajo el equipo esta semana?",
    "Como saco la planilla del mes?",
    "Como le mando el reporte al cliente?",
  ],
  CARTERA: [
    "¿A quién le tengo que cobrar hoy?",
    "¿Quién está atrasado y cuánto debe?",
    "Cuanta plata tengo prestada en la calle?",
    "Como registro un abono y le doy el recibo?",
  ],
  RESTAURANTE: [
    "Como voy este mes?",
    "¿Qué plato me está dejando más?",
    "Como cierro una cuenta de mesa?",
    "Como bajo mis gastos?",
  ],
  COMIDAS_RAPIDAS: [
    "Como voy este mes?",
    "¿Qué producto me deja más?",
    "Como registro una venta rapida?",
    "Como subo mi ticket promedio?",
  ],
  ROPA: [
    "Como voy este mes?",
    "Que tallas deberia reponer?",
    "¿Cómo uso el escáner de código de barras?",
    "Como cobro un fiado que se vencio?",
  ],
  OTRO: [
    "Como voy este mes?",
    "¿Qué me está dejando más plata?",
    "Que apartados me sirven para mi negocio?",
    "¿Cómo cierro la caja del día?",
  ],
};

export default async function AsistentePage() {
  const user = await requireUser();
  const listo = aiEnabled();

  return (
    <>
      <PageHeader
        title="Asistente"
        subtitle="Pregunta por tu negocio o por cómo se hace algo aquí"
      />

      {!listo && (
        <div className="mb-4">
          <Card>
            <div className="flex flex-wrap items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-warn-soft text-warn">
                <Icon name="alert" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] text-strong">
                  El asistente todavia no esta encendido
                </p>
                <p className="mt-1 text-sm text-body">
                  Falta poner la clave <strong>GEMINI_API_KEY</strong> en el servidor. Se saca
                  gratis en Google AI Studio y no cuesta nada para el uso de un negocio.
                </p>
                <p className="mt-1 text-xs text-subtle">
                  Mientras tanto, el resto de la aplicacion funciona igual.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      <AssistantChat sugerencias={SUGERENCIAS[user.businessType]} listo={listo} />
    </>
  );
}
