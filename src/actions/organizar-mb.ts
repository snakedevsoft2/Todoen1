"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOwner } from "@/lib/auth";
import { esMbNails } from "@/lib/mb-nails";
import { CATEGORIAS_MB, MANICURISTAS_MB, planDeOrganizar } from "@/lib/mb-nails-plan";
import { normalizar } from "@/lib/orden-productos";
import { asegurarCategorias } from "@/lib/categorias-negocio";
import { cambiarTipoDeNegocio } from "@/lib/tipo-negocio";
import { anotarActividad } from "@/lib/actividad";

export type OrganizarState = { error?: string; ok?: string } | undefined;

/**
 * Aplica en la cuenta de la dueña de MB Nails el plan que ella vio en
 * Organizar (ver lib/mb-nails-plan.ts). Todo sobre SU cuenta: el id sale de la
 * sesion, nunca del formulario. Se puede volver a correr: lo que ya esta no se
 * repite.
 */
export async function organizarMbNailsAction(_prev: OrganizarState, formData: FormData): Promise<OrganizarState> {
  const { user, staff } = await requireOwner();
  if (!esMbNails(user.businessName)) return { error: "Esto es solo para MB Nails Spa." };

  const existentes = await db.service.findMany({
    where: { userId: user.id },
    select: { id: true, name: true, price: true, category: true },
  });
  const plan = planDeOrganizar(existentes);
  const hechos: string[] = [];

  // 1. La agenda: pasa a barberia (citas por persona y reserva en linea).
  if (user.businessType !== "BARBERIA") {
    const r = await cambiarTipoDeNegocio(user.id, "BARBERIA");
    if (!r.ok) return { error: r.error };
    // Sin volver a la bienvenida: el menu de fabrica de la agenda ya sirve.
    await db.staff.updateMany({ where: { userId: user.id, role: "DUENO" }, data: { onboardingDoneAt: new Date() } });
    hechos.push("agenda activada");
  }

  // 2. Las categorias, en su orden (reusa la que ya tenga, como "UÑAS").
  const nombres = await asegurarCategorias(user.id, CATEGORIAS_MB);
  const categoria = (c: string) => nombres.get(c) ?? c;

  if (formData.get("mover") === "on" && plan.mover.length > 0) {
    for (const m of plan.mover) {
      await db.service.updateMany({ where: { id: m.id, userId: user.id }, data: { category: categoria(m.a) } });
    }
    hechos.push(plan.mover.length + " acomodados en su categoría");
  }

  if (formData.get("precios") === "on" && plan.precios.length > 0) {
    for (const p of plan.precios) {
      await db.service.updateMany({ where: { id: p.id, userId: user.id }, data: { price: p.a } });
    }
    hechos.push(plan.precios.length + " con el precio de la lista");
  }

  // Bebidas y mecato son productos, no citas: no salen en la reserva en linea
  // ni al agendar (los que ella cargo como servicio quedaban reservables).
  const deProductos = [categoria("Bebidas"), categoria("Mecato")];
  await db.service.updateMany({ where: { userId: user.id, category: { in: deProductos }, bookable: true }, data: { bookable: false } });

  const pedidos = new Set(formData.getAll("agregar").map(String));
  const nuevos = plan.faltan.filter((f) => pedidos.has(normalizar(f.item.name)));
  if (nuevos.length > 0) {
    await db.service.createMany({
      data: nuevos.map(({ item }) => ({
        userId: user.id,
        name: item.name,
        price: item.price,
        category: categoria(item.category),
        description: item.description,
        bookable: item.bookable,
      })),
    });
    hechos.push(nuevos.length + " agregados de la lista");
  }

  // 3. Las manicuristas: las que no esten, con su usuario si nadie lo tiene.
  const equipo = await db.staff.findMany({ where: { userId: user.id, deletedAt: null }, select: { name: true } });
  const yaEstan = new Set(equipo.map((s) => normalizar(s.name)));
  let creadas = 0;
  for (const m of MANICURISTAS_MB) {
    if (yaEstan.has(normalizar(m.name))) continue;
    if (equipo.length + creadas >= 20) break;
    const tomado = await db.staff.findUnique({ where: { username: m.username }, select: { id: true } });
    await db.staff.create({
      data: { userId: user.id, name: m.name, username: tomado ? null : m.username, role: "BARBERO", color: m.color, bookable: true },
    });
    creadas += 1;
  }
  if (creadas > 0) hechos.push(creadas + " manicuristas creadas");

  if (hechos.length === 0) return { ok: "Ya estaba todo organizado." };
  await anotarActividad({ user, staff }, { tipo: "cambio", detalle: "Organizó MB Nails: " + hechos.join(", ") });
  revalidatePath("/panel", "layout");
  return { ok: "Listo: " + hechos.join(", ") + "." };
}
