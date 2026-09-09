import { requireSession } from "@/lib/auth";
import { GRUPO_LABEL, modulosDe, type Grupo } from "@/lib/modules";
import { PageHeader } from "@/components/ui";
import { GuiaBuscador, type GuiaTema } from "@/components/GuiaBuscador";

export const dynamic = "force-dynamic";

/**
 * La guia.
 *
 * Sale del mismo catalogo del que sale el menu, a proposito: asi no puede
 * quedar explicando un apartado que este negocio no tiene, ni faltarle uno
 * que si tiene. Un manual escrito aparte se desfasa el primer mes.
 */
export default async function GuiaPage() {
  const sesion = await requireSession();
  const modulos = await modulosDe(sesion);

  const temas: GuiaTema[] = modulos.map((m) => ({
    key: m.key,
    href: m.href,
    label: m.label,
    icon: m.icon,
    grupo: GRUPO_LABEL[m.group as Grupo],
    short: m.short,
    long: m.long,
    example: m.example,
    visible: m.visible,
  }));

  return (
    <>
      <PageHeader
        title="Guía"
        subtitle="Busca lo que quieres hacer y te decimos dónde y cómo"
      />
      <GuiaBuscador temas={temas} />
    </>
  );
}
