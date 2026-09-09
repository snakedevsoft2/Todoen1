"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkPassword, hashPassword, requireOwner, requireSession } from "@/lib/auth";
import { parseIntSafe, str } from "@/lib/format";
import { normalizeHex } from "@/lib/theme";
import { STAFF_COLORS, teamNoun } from "@/lib/staff";

export type StaffState = { error?: string; ok?: string } | undefined;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** El correo no se puede repetir ni entre duenos ni entre barberos. */
async function emailTaken(email: string, ignoreStaffId?: string) {
  const owner = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (owner) return true;
  const staff = await db.staff.findUnique({ where: { email }, select: { id: true } });
  return Boolean(staff && staff.id !== ignoreStaffId);
}

function readCommission(value: FormDataEntryValue | null, fallback = 0) {
  return Math.min(100, Math.max(0, parseIntSafe(value, fallback)));
}

export async function createStaffAction(
  _prev: StaffState,
  formData: FormData
): Promise<StaffState> {
  const { user } = await requireOwner();

  const name = str(formData.get("name"));
  const email = str(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const phone = str(formData.get("phone"));
  const noun = teamNoun(user.businessType);

  if (!name) return { error: "Escribe el nombre del " + noun.singular + "." };

  const count = await db.staff.count({ where: { userId: user.id } });
  if (count >= 20) return { error: "Por ahora puedes tener hasta 20 personas en el equipo." };

  // El correo y la contrasena son opcionales: puedes tener a alguien que solo
  // aparece en los reportes, sin usuario para entrar.
  if (email || password) {
    if (!EMAIL_RE.test(email)) return { error: "Escribe un correo valido para que pueda entrar." };
    if (password.length < 6) return { error: "La contrasena debe tener al menos 6 caracteres." };
    if (await emailTaken(email)) return { error: "Ya existe una cuenta con ese correo." };
  }

  await db.staff.create({
    data: {
      userId: user.id,
      name,
      email: email || null,
      passwordHash: password ? hashPassword(password) : null,
      phone: phone || null,
      // El rol depende del negocio: barbero en la barberia, vendedor en la ropa.
      role: noun.role === "VENDEDOR" ? "VENDEDOR" : "BARBERO",
      color: normalizeHex(str(formData.get("color"), STAFF_COLORS[count % STAFF_COLORS.length])),
      commissionPct: readCommission(formData.get("commissionPct")),
      bookable: formData.get("bookable") !== null,
    },
  });

  revalidatePath("/panel/equipo");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/ventas");
  const nombre = noun.singular.charAt(0).toUpperCase() + noun.singular.slice(1);
  return {
    ok: email ? nombre + " agregado. Ya puede entrar con su correo." : nombre + " agregado.",
  };
}

export async function updateStaffAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const staff = await db.staff.findFirst({ where: { id, userId: user.id } });
  if (!staff) return;

  await db.staff.update({
    where: { id: staff.id },
    data: {
      name: str(formData.get("name"), staff.name),
      phone: str(formData.get("phone")) || null,
      color: normalizeHex(str(formData.get("color"), staff.color)),
      commissionPct: readCommission(formData.get("commissionPct"), staff.commissionPct),
      bookable: formData.get("bookable") !== null,
    },
  });

  revalidatePath("/panel/equipo");
  revalidatePath("/panel/turnos");
  revalidatePath("/panel/reportes");
}

/** Crea o cambia el usuario con el que entra el barbero. */
export async function setStaffAccessAction(
  _prev: StaffState,
  formData: FormData
): Promise<StaffState> {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const staff = await db.staff.findFirst({ where: { id, userId: user.id } });
  if (!staff) return { error: "No encontramos a esa persona." };
  if (staff.role === "DUENO") {
    return { error: "El correo del dueno se cambia en Ajustes." };
  }

  const email = str(formData.get("email")).toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_RE.test(email)) return { error: "Escribe un correo valido." };
  if (await emailTaken(email, staff.id)) return { error: "Ya existe una cuenta con ese correo." };
  // Si ya tenia contrasena, dejarla en blanco significa "no la cambies".
  if (!staff.passwordHash && password.length < 6) {
    return { error: "La contrasena debe tener al menos 6 caracteres." };
  }
  if (password && password.length < 6) {
    return { error: "La contrasena debe tener al menos 6 caracteres." };
  }

  await db.staff.update({
    where: { id: staff.id },
    data: {
      email,
      passwordHash: password ? hashPassword(password) : staff.passwordHash,
    },
  });

  revalidatePath("/panel/equipo");
  return { ok: "Listo. " + staff.name + " ya puede entrar con " + email + "." };
}

/** Le quita el acceso a la aplicacion, pero lo deja en la agenda. */
export async function removeStaffAccessAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const staff = await db.staff.findFirst({ where: { id, userId: user.id } });
  if (!staff || staff.role === "DUENO") return;

  await db.staff.update({
    where: { id: staff.id },
    data: { email: null, passwordHash: null },
  });
  revalidatePath("/panel/equipo");
}

export async function toggleStaffActiveAction(formData: FormData) {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const staff = await db.staff.findFirst({ where: { id, userId: user.id } });
  if (!staff || staff.role === "DUENO") return;

  await db.staff.update({ where: { id: staff.id }, data: { active: !staff.active } });
  revalidatePath("/panel/equipo");
  revalidatePath("/panel/turnos");
}

/**
 * Solo se puede borrar a quien no tiene historial. Si ya atendio turnos o hizo
 * ventas, se desactiva: asi los reportes de meses pasados no se dañan.
 */
export async function deleteStaffAction(formData: FormData): Promise<void> {
  const { user } = await requireOwner();
  const id = str(formData.get("id"));
  const staff = await db.staff.findFirst({ where: { id, userId: user.id } });
  if (!staff || staff.role === "DUENO") return;

  const [turnos, ventas] = await Promise.all([
    db.appointment.count({ where: { staffId: staff.id } }),
    db.sale.count({ where: { staffId: staff.id } }),
  ]);

  if (turnos > 0 || ventas > 0) {
    await db.staff.update({
      where: { id: staff.id },
      data: { active: false, email: null, passwordHash: null },
    });
  } else {
    await db.staff.delete({ where: { id: staff.id } });
  }

  revalidatePath("/panel/equipo");
  revalidatePath("/panel/turnos");
}

/** Cada barbero puede cambiar su propia contrasena desde Ajustes. */
export async function changeStaffPasswordAction(
  _prev: StaffState,
  formData: FormData
): Promise<StaffState> {
  const { staff } = await requireSession();
  if (staff.role === "DUENO") return { error: "Cambia tu contrasena en la seccion de arriba." };
  if (!staff.passwordHash) return { error: "Tu usuario todavia no tiene contrasena." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 6) return { error: "La nueva contrasena debe tener al menos 6 caracteres." };

  if (!checkPassword(current, staff.passwordHash)) {
    return { error: "La contrasena actual no coincide." };
  }

  await db.staff.update({ where: { id: staff.id }, data: { passwordHash: hashPassword(next) } });
  return { ok: "Contrasena actualizada." };
}
