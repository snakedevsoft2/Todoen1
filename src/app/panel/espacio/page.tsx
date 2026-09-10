import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  GRUPO_LABEL,
  PRESETS,
  apartadosSinUso,
  keysDeFabrica,
  modulosDe,
  presetKeys,
  type Grupo,
} from "@/lib/modules";
import { applyPresetAction, resetWorkspaceAction } from "@/actions/workspace";
import { Card, PageHeader, Stat } from "@/components/ui";
import { WorkspaceForm, type WorkspaceItem } from "@/components/WorkspaceForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function EspacioPage() {
  const sesion = await requireSession();
  const { user, staff } = sesion;

  // Se muestran en el orden que la persona ya eligio, para que editar sea
  // seguir moviendo lo mismo que ve en el menu.
  const modulos = await modulosDe(sesion);
  const fabrica = await keysDeFabrica(user.businessType, staff.role === "DUENO");

  const config = await db.workspaceConfig.findFirst({
    where: { staffId: staff.id, userId: user.id },
    select: { id: true, createdAt: true },
  });

  // Lo que tiene prendido pero no abre. Solo tiene sentido preguntarlo cuando
  // ya lleva un tiempo usando la aplicacion: al segundo dia todo esta sin
  // abrir y la sugerencia seria una tonteria.
  const rodado = config && Date.now() - config.createdAt.getTime() > 14 * 24 * 60 * 60 * 1000;
  const sinUso = rodado ? await apartadosSinUso(user.id, staff.id, modulos) : [];

  const items: WorkspaceItem[] = modulos.map((m) => ({
    key: m.key,
    label: m.label,
    icon: m.icon,
    short: m.short,
    example: m.example,
    fixed: m.fixed,
    visible: m.visible,
  }));

  const enElMenu = modulos.filter((m) => m.visible && m.inSidebar).length;
  const delMenu = modulos.filter((m) => m.inSidebar).length;
  const sinTocar = !config;

  // Cuantos apartados deja cada arreglo listo, para poder decirlo en el boton.
  const cuenta = (key: (typeof PRESETS)[number]["key"]) =>
    presetKeys(key, modulos, fabrica).filter((k) =>
      modulos.some((m) => m.key === k && m.inSidebar)
    ).length;

  // Para el resumen de por que este negocio ve estos apartados y no otros.
  const porGrupo = new Map<Grupo, number>();
  for (const m of modulos) porGrupo.set(m.group, (porGrupo.get(m.group) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Mi espacio"
        subtitle="Deja en el menú solo lo que uses, y en el orden que quieras"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="En tu menú"
          value={String(enElMenu)}
          hint={"de " + delMenu + " apartados"}
          tone="brand"
        />
        <Stat
          label="Apagados"
          value={String(delMenu - enElMenu)}
          hint="Siguen funcionando"
        />
        <Stat
          label="Tu espacio"
          value={sinTocar ? "De fábrica" : "A tu medida"}
          hint={sinTocar ? "Todavía no lo has tocado" : "Configurado por ti"}
          tone={sinTocar ? "default" : "good"}
        />
        <Stat
          label="Es tuyo"
          value={staff.name.split(" ")[0]}
          hint="Cada persona arma el suyo"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Tus apartados" subtitle="Prende, apaga y arrastra para ordenar">
          <WorkspaceForm items={items} />
        </Card>

        <div className="space-y-4">
          <Card title="Arreglos listos" subtitle="Para no ir apagando uno por uno">
            <div className="space-y-2">
              {PRESETS.map((preset) => (
                <form key={preset.key} action={applyPresetAction}>
                  <input type="hidden" name="preset" value={preset.key} />
                  <SubmitButton className="btn-ghost w-full justify-between" pendingText="...">
                    <span className="text-left">
                      <span className="block">{preset.label}</span>
                      <span className="block text-[11px] font-normal text-subtle">
                        {preset.hint}
                      </span>
                    </span>
                    <span className="text-xs text-muted">{cuenta(preset.key)}</span>
                  </SubmitButton>
                </form>
              ))}
            </div>

            <div className="mt-4 border-t border-line pt-4">
              <form action={resetWorkspaceAction}>
                <SubmitButton
                  className="btn-ghost btn-sm w-full"
                  pendingText="..."
                  confirm="Volver al menú de fábrica y perder tu orden."
                >
                  Volver al menú de fábrica
                </SubmitButton>
              </form>
            </div>
          </Card>

          {sinUso.length > 0 && (
            <Card title="Te sobran botones" subtitle="Los tienes prendidos y no los abres">
              <p className="text-sm text-body">
                Llevas <strong className="text-strong">dos meses</strong> sin entrar a{" "}
                {sinUso.map((m) => m.label).join(", ")}. Si no los usas, apágalos arriba y tu menú
                queda más corto. No se borra nada.
              </p>
            </Card>
          )}

          <Card title="Cómo funciona">
            <ul className="space-y-2.5 text-sm text-body">
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Apagar un apartado <strong>no borra nada</strong>. Tus datos siguen ahí y el
                apartado sigue funcionando si entras por su dirección.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Puedes ordenar de tres maneras: arrastrando la agarradera, con las flechas, o con
                el teclado si prefieres no arrastrar.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Resumen, Ajustes y Soporte no se pueden apagar: son por donde vuelves si te
                pierdes.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Esto es <strong>tuyo, no del negocio</strong>. Cada empleado arma el suyo sin
                cambiarle el menú a los demás.
              </li>
              <li className="flex gap-2">
                <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-good" />
                Si más adelante aparece un apartado nuevo, se te muestra solo al final.
              </li>
            </ul>
          </Card>

          <Card title="Lo que tienes" subtitle="Según tu tipo de negocio">
            <ul className="space-y-1.5 text-sm text-body">
              {[...porGrupo.entries()].map(([grupo, n]) => (
                <li key={grupo} className="flex items-center justify-between gap-2">
                  <span>{GRUPO_LABEL[grupo]}</span>
                  <span className="text-xs text-muted">{n}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-subtle">
              Los apartados que no aparecen en esta lista no existen para tu tipo de negocio. No
              están apagados: simplemente no aplican.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
