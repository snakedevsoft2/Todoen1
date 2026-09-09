"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkPassword, hashPassword, requireOwner, slugify } from "@/lib/auth";
import { parseIntSafe, str } from "@/lib/format";
import { TIMEZONES } from "@/lib/timezones";

export type SettingsState = { error?: string; ok?: string } | undefined;

export async function updateBusinessAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { user } = await requireOwner();

  const businessName = str(formData.get("businessName"), user.businessName);
  const ownerName = str(formData.get("ownerName"), user.ownerName);
  const openHour = Math.min(23, Math.max(0, parseIntSafe(formData.get("openHour"), user.openHour)));
  const closeHour = Math.min(24, Math.max(1, parseIntSafe(formData.get("closeHour"), user.closeHour)));
  const slotMinutes = Math.min(180, Math.max(5, parseIntSafe(formData.get("slotMinutes"), user.slotMinutes)));

  if (closeHour <= openHour) return { error: "La hora de cierre debe ser mayor a la de apertura." };

  const days = formData.getAll("workDays").map((d) => parseIntSafe(d, 0)).filter((d) => d >= 1 && d <= 7);
  const timezone = str(formData.get("timezone"), user.timezone);

  let slug = user.slug;
  const slugInput = slugify(str(formData.get("slug"), user.slug));
  if (slugInput && slugInput !== user.slug) {
    const exists = await db.user.findUnique({ where: { slug: slugInput }, select: { id: true } });
    if (exists) return { error: "Ese enlace ya esta en uso. Prueba otro." };
    slug = slugInput;
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      businessName,
      ownerName,
      phone: str(formData.get("phone")) || null,
      address: str(formData.get("address")) || null,
      currency: str(formData.get("currency"), user.currency).toUpperCase().slice(0, 3),
      timezone: TIMEZONES.includes(timezone) ? timezone : user.timezone,
      openHour,
      closeHour,
      slotMinutes,
      workDays: days.length ? days.sort().join(",") : user.workDays,
      // La tienda de ropa no recibe reservas: el campo no viaja en su formulario.
      bookingOpen:
        user.businessType === "BARBERIA" ? formData.get("bookingOpen") === "on" : user.bookingOpen,
      slug,
    },
  });

  revalidatePath("/panel/ajustes");
  revalidatePath("/panel");
  revalidatePath("/catalogo/" + slug);
  return { ok: "Ajustes guardados." };
}

export async function changePasswordAction(
  _prev: SettingsState,
  formData: FormData
): Promise<SettingsState> {
  const { user } = await requireOwner();
  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!checkPassword(current, user.passwordHash)) {
    return { error: "La contrasena actual no es correcta." };
  }
  if (next.length < 6) return { error: "La nueva contrasena debe tener al menos 6 caracteres." };
  if (next !== confirm) return { error: "Las contrasenas nuevas no coinciden." };

  await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(next) } });
  return { ok: "Contrasena actualizada." };
}
