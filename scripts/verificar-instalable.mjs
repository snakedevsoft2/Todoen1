/**
 * Comprueba que el navegador ofrezca instalar la app en el celular.
 *
 * Pregunta a Chromium si le falta algo para instalarla (manifiesto, iconos,
 * trabajador de fondo) y revisa que los iconos existan con su tamaño.
 *
 * Antes:   npm run build && npm start
 * Después: node scripts/verificar-instalable.mjs
 */
import "dotenv/config";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = "http://localhost:3000";
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};

const S = "inst-" + Date.now();
const cuenta = await db.user.create({
  data: {
    email: S + "@test.local",
    passwordHash: bcrypt.hashSync("demo1234", 10),
    ownerName: "Dueña",
    businessName: "Negocio " + S,
    businessType: "OTRO",
    slug: "negocio-" + S,
    staff: { create: { name: "Dueña", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() } },
  },
});

// Perfil normal y no de incógnito: en incógnito el navegador nunca ofrece instalar.
const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "instalable-"));
const ctx = await chromium.launchPersistentContext(perfil, { channel: "msedge", viewport: { width: 390, height: 844 } });
try {
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  console.log("\n1. Manifiesto e iconos");
  const res = await page.request.get(BASE + "/manifest.webmanifest");
  ok(res.ok(), "el manifiesto responde");
  const man = await res.json();
  ok(man.display === "standalone" && man.start_url === "/panel", "abre como app, en el panel");
  const tamanos = new Set();
  for (const ic of man.icons) {
    const r = await page.request.get(BASE + ic.src);
    const b = await r.body();
    const lado = r.ok() && b.readUInt32BE(16) + "x" + b.readUInt32BE(20);
    ok(lado === ic.sizes, ic.src + " existe y mide " + ic.sizes, String(lado));
    tamanos.add(ic.sizes);
  }
  ok(tamanos.has("192x192") && tamanos.has("512x512"), "tiene los iconos de 192 y 512 que pide Android");

  console.log("\n2. Chromium la deja instalar");
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  await page.waitForLoadState("load");
  const sw = await page.evaluate(async () => {
    const fin = Date.now() + 20000;
    while (Date.now() < fin) {
      const r = await navigator.serviceWorker.getRegistration();
      if (r?.active) return r.scope;
      await new Promise((x) => setTimeout(x, 500));
    }
    return null;
  });
  ok(Boolean(sw), "el trabajador de fondo quedó activo", String(sw));
  ok((await page.locator('link[rel="manifest"]').count()) > 0, "la página enlaza el manifiesto");
  const cdp = await ctx.newCDPSession(page);
  const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
  ok(installabilityErrors.length === 0, "sin nada que impida instalarla", JSON.stringify(installabilityErrors));
} finally {
  await ctx.close();
  fs.rmSync(perfil, { recursive: true, force: true });
  await db.user.delete({ where: { id: cuenta.id } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
