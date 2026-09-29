/**
 * Notificaciones push en un navegador de verdad: el dueño toca "Activar", el
 * celular queda guardado a su nombre, y el servicio de push del navegador
 * acepta un aviso firmado con nuestras llaves.
 *
 * Necesita el servidor corriendo (BASE, por defecto http://localhost:3000) y
 * las llaves VAPID en .env.
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import webpush from "web-push";

const BASE = process.env.BASE ?? "http://localhost:3000";
const db = new PrismaClient();
const fallas = [];
const ok = (c, t) => {
  console.log((c ? "  OK   " : "  !!   ") + t);
  if (!c) fallas.push(t);
};

const S = "push-" + Date.now();
const listo = new Date();
const user = await db.user.create({
  data: {
    email: "dueno-" + S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueño",
    businessName: "Lavadero " + S,
    businessType: "LAVADERO",
    slug: "lav-" + S,
    staff: { create: [{ name: "Dueño", role: "DUENO", onboardingDoneAt: listo, tourDoneAt: listo }] },
  },
  include: { staff: true },
});

const browser = await chromium.launch({ channel: "msedge" });
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.grantPermissions(["notifications"], { origin: BASE });
  await ctx.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  const page = await ctx.newPage();
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', user.email);
  await page.fill('input[name="password"]', "demo1234");
  await Promise.all([page.waitForURL(/\/panel/, { timeout: 60000 }), page.click('button[type="submit"]')]);
  await page.goto(BASE + "/panel", { waitUntil: "networkidle" });

  const aviso = page.locator("[data-activar-notificaciones]");
  await aviso.waitFor({ timeout: 15000 }).catch(() => {});
  ok((await aviso.count()) > 0, "panel: aparece 'Activa las notificaciones'");
  if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS + "/push-aviso.png" });

  await aviso.locator("button", { hasText: "Activar" }).click();
  await aviso.waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
  const sub = await db.pushSubscription.findFirst({ where: { userId: user.id } });
  ok(Boolean(sub), "activar: el celular quedó guardado a nombre del dueño");

  if (sub) {
    webpush.setVapidDetails("mailto:soporte@todoen1.app", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    try {
      const r = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: "Venta nueva · $20.000", body: "1x Lavado", url: "/panel/ventas" })
      );
      ok(r.statusCode >= 200 && r.statusCode < 300, "push: el servicio del navegador aceptó el aviso (" + r.statusCode + ")");
    } catch (e) {
      ok(false, "push: el servicio rechazó el aviso (" + (e.statusCode ?? e.message) + ")");
    }
  }

  await page.goto(BASE + "/panel/perfil", { waitUntil: "networkidle" });
  ok((await page.locator("[data-notificaciones-perfil]").innerText()).includes("Activas en este celular"), "perfil: dice que están activas");
  await ctx.close();
} finally {
  await browser.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } });
  await db.$disconnect();
}

console.log(fallas.length ? "\n" + fallas.length + " fallas" : "\nTodo bien");
process.exit(fallas.length ? 1 : 0);
