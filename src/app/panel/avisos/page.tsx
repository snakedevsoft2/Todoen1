import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { clearNotificationsAction } from "@/actions/branding";
import { prettyPhone, waLink } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const ESTADO: Record<string, { label: string; tone: "green" | "red" | "amber" }> = {
  ENVIADO: { label: "Enviado", tone: "green" },
  FALLIDO: { label: "Fallo", tone: "red" },
  SIN_CONFIGURAR: { label: "Por enviar a mano", tone: "amber" },
};

export default async function AvisosPage() {
  const { user } = await requireOwner();

  const avisos = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const enviados = avisos.filter((a) => a.status === "ENVIADO").length;
  const fallidos = avisos.filter((a) => a.status === "FALLIDO").length;
  const pendientes = avisos.filter((a) => a.status === "SIN_CONFIGURAR").length;

  return (
    <>
      <PageHeader title="Avisos de WhatsApp" subtitle="Todo lo que la aplicacion intento enviarte">
        <Link href="/panel/personalizar" className="btn-ghost btn-sm">
          <Icon name="cog" className="h-4 w-4" />
          Configurar
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Numero configurado"
          value={user.whatsappNumber ? prettyPhone(user.whatsappNumber) : "Sin numero"}
          tone={user.whatsappNumber ? "brand" : "amber"}
        />
        <Stat label="Enviados" value={String(enviados)} tone="good" />
        <Stat label="Por enviar a mano" value={String(pendientes)} tone="amber" />
        <Stat label="Con error" value={String(fallidos)} tone={fallidos ? "bad" : "default"} />
      </div>

      <div className="mt-5">
        <Card
          title="Historial"
          subtitle={avisos.length + " avisos"}
          action={
            avisos.length > 0 ? (
              <form action={clearNotificationsAction}>
                <SubmitButton
                  className="btn-ghost btn-sm"
                  pendingText="Borrando..."
                  confirm="Borrar todo el historial de avisos"
                >
                  <Icon name="trash" className="h-4 w-4" />
                  Vaciar
                </SubmitButton>
              </form>
            ) : undefined
          }
        >
          {avisos.length === 0 ? (
            <Empty
              title="Todavia no hay avisos"
              hint="Cuando un cliente separe un turno, el aviso aparece aqui."
            />
          ) : (
            <ul className="space-y-3">
              {avisos.map((a) => {
                const estado = ESTADO[a.status] ?? ESTADO.SIN_CONFIGURAR;
                const link = waLink(a.toNumber, a.message);
                return (
                  <li key={a.id} className="surface-box p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-strong">
                          {prettyPhone(a.toNumber)}
                        </p>
                        <p className="text-xs text-subtle">
                          {a.createdAt.toLocaleString("es-CO", { timeZone: user.timezone })}
                          {" - "}
                          {a.provider}
                        </p>
                      </div>
                      <Badge tone={estado.tone}>{estado.label}</Badge>
                    </div>

                    <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-body">
                      {a.message}
                    </pre>

                    {a.detail && <p className="mt-2 text-[11px] text-subtle">{a.detail}</p>}

                    {link && a.status !== "ENVIADO" && (
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-success btn-sm mt-3"
                      >
                        <Icon name="whatsapp" className="h-4 w-4" />
                        Abrir en WhatsApp
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
