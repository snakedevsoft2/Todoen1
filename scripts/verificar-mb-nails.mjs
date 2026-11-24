/**
 * Comprueba en un navegador lo de MB NAILS SPA (ver lib/mb-nails.ts y
 * lib/mb-nails-plan.ts), empezando como esta su cuenta de verdad: "Otro
 * negocio", con sus productos en General y uno en "UÑAS".
 *   1. la dueña ve el aviso y Organizar: activa la agenda, crea las 5
 *      manicuristas, pasa cada producto a su categoria y agrega lo que falta;
 *   2. su inicio tiene Agendar cita y Vender; en la Agenda edita una cita
 *      (dia, hora y quien la atiende) y llega al horario;
 *   3. la manicurista entra solo con su usuario a Citas: agenda, cierra con
 *      adicionales, reprograma; vende sin cita por categoria; ve las clientas
 *      y la lista de precios sin poder cambiarla;
 *   4. otra barberia sigue igual.
 *
 * Antes: docker start ten-pg, y la app en localhost:3000 (npm run dev).
 * Despues: node scripts/verificar-mb-nails.mjs   (SHOT=carpeta para capturas)
 *
 * Crea dos cuentas desechables y las borra al final. Solo contra la base local.
 */
import "dotenv/config";
import { chromium } from "./navegador.mjs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE ?? "http://localhost:3000";
const DIR = process.env.SHOT;
const db = new PrismaClient();
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};

const S = String(Date.now()).slice(-7);
const CLAVE = "demo1234";
const ZONA = "America/Bogota";
const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(new Date());
const masDias = (d, n) => new Date(Date.parse(d + "T12:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// Los usuarios de las manicuristas son unicos en toda la base: que no los
// tenga una corrida anterior que se quedo a medias.
await db.staff.updateMany({ where: { username: { endsWith: ".mbnails" }, user: { email: { endsWith: "@test.local" } } }, data: { username: null } });

async function cuenta(businessName, businessType, empleados = []) {
  return db.user.create({
    data: {
      email: "mb-" + S + "-" + businessName.length + "@test.local",
      passwordHash: bcrypt.hashSync(CLAVE, 10),
      ownerName: "Marcela",
      businessName,
      businessType,
      slug: "mb-" + S + "-" + businessName.length,
      currency: "COP",
      timezone: ZONA,
      workDays: "1,2,3,4,5,6,7",
      staff: {
        create: [
          { name: "Marcela", role: "DUENO", onboardingDoneAt: new Date(), tourDoneAt: new Date() },
          ...empleados.map(([name, username]) => ({ name, username, role: "BARBERO", tourDoneAt: new Date() })),
        ],
      },
    },
    include: { staff: true },
  });
}

// Como esta en produccion: tipo Otro, lo suyo en General y una categoria UÑAS.
const mb = await cuenta("MB NAILS SPA", "OTRO");
await db.productCategory.create({ data: { userId: mb.id, name: "UÑAS", position: 0 } });
for (const [name, price, category] of [
  ["ESMALTADO SEMIPERMANENTE MANOS", 45000, "UÑAS"],
  ["COCA COLA 400ML", 3000, "General"],
  ["CEJAS", 15000, "General"],
  ["PAPAS RIZADAS", 2600, "General"],
  ["Tarjeta de regalo", 50000, "General"],
]) {
  await db.service.create({ data: { userId: mb.id, name, price, category } });
}
const otra = await cuenta("Barberia " + S, "BARBERIA", [["Andres", "andres." + S]]);

const browser = await chromium.launch({ channel: "msedge" });
const errores = [];
async function pagina() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(e.message));
  page.on("response", (r) => r.status() >= 500 && errores.push(r.status() + " " + r.url()));
  await page.addInitScript(() => localStorage.setItem("todoen1_onboarding_seen", "true"));
  await page.goto(BASE + "/login", { waitUntil: "networkidle" });
  return page;
}
const esperar = async (fn, ms = 15000) => {
  const fin = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > fin) return v;
    await new Promise((r) => setTimeout(r, 400));
  }
};
const sinDesborde = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

try {
  console.log("\n1. La dueña organiza MB Nails");
  const d = await pagina();
  await d.fill('input[name="email"]', mb.email);
  await d.fill('input[name="password"]', CLAVE);
  await d.click('button[type="submit"]');
  await d.waitForURL(/\/panel/, { timeout: 60000 });
  await d.goto(BASE + "/panel/ventas", { waitUntil: "networkidle" });
  ok((await d.locator("[data-aviso-organizar]").count()) === 1, "ve el aviso de Organizar");
  await d.locator("[data-aviso-organizar]").click();
  await d.waitForURL(/organizar-mb/, { timeout: 30000 });
  const plan = await d.locator("body").innerText();
  ok(/Se activa la agenda/.test(plan) && /jessica\.mbnails/.test(plan), "el plan dice que activa la agenda y crea a las manicuristas");
  ok(/COCA COLA 400ML[\s\S]*Bebidas/.test(await d.locator("[data-plan-mover]").innerText()), "COCA COLA pasa a Bebidas");
  const semi = d.locator("[data-plan-faltan] label").filter({ hasText: "Semi (manos o pies)" });
  ok(!(await semi.locator("input").isChecked()) && /ESMALTADO/.test(await semi.innerText()), "Semi sale desmarcado: ya tiene ESMALTADO SEMIPERMANENTE MANOS");
  ok(await d.locator("[data-plan-faltan] label").filter({ hasText: "Chokis" }).locator("input").isChecked(), "Chokis sale marcado para agregar");
  ok(await sinDesborde(d), "Organizar no se sale de la pantalla");
  if (DIR) await d.screenshot({ path: DIR + "/mb-organizar.png", fullPage: true });
  await d.getByRole("button", { name: /^Aplicar$/ }).click();
  await d.waitForSelector("text=Listo:", { timeout: 30000 }).catch(() => null);
  const u = await db.user.findUnique({ where: { id: mb.id } });
  ok(u.businessType === "BARBERIA", "la cuenta quedó con agenda (barbería)", u.businessType);
  const equipo = await db.staff.findMany({ where: { userId: mb.id, role: "BARBERO" }, orderBy: { name: "asc" } });
  ok(equipo.length === 5 && equipo.every((s) => s.username?.endsWith(".mbnails")), "las 5 manicuristas, cada una con su usuario", equipo.map((s) => s.username).join(","));
  const productos = await db.service.findMany({ where: { userId: mb.id } });
  const de = (n) => productos.find((p) => p.name === n);
  ok(de("COCA COLA 400ML")?.category === "Bebidas" && de("COCA COLA 400ML")?.price === 3500, "COCA COLA en Bebidas y a 3.500");
  ok(de("CEJAS")?.category === "Depilación con cera" && de("Tarjeta de regalo")?.category === "General", "CEJAS en Depilación; lo que no se reconoce se queda en General");
  ok(!de("Semi (manos o pies)") && de("Chokis")?.category === "Mecato" && de("Chokis")?.bookable === false, "no duplicó Semi; agregó Chokis en Mecato, sin reserva");
  ok(de("Montaje Polygel")?.category === "UÑAS", "lo de uñas entra en su categoría UÑAS, sin crear otra");
  // De las 50 de la lista ya tenia 3 con el mismo nombre (Coca, Cejas, Papas) y Semi queda sin marcar.
  ok(productos.length === 5 + 46, "5 suyos + 46 de la lista", String(productos.length));
  ok(!de("COCA COLA 400ML")?.bookable && !de("PAPAS RIZADAS")?.bookable && de("CEJAS")?.bookable, "lo suyo de Bebidas y Mecato deja de salir en la reserva; los servicios siguen");
  ok((await db.staff.findFirst({ where: { userId: mb.id, role: "DUENO" } })).onboardingDoneAt !== null, "la dueña no vuelve a la bienvenida");
  await d.goto(BASE + "/panel/organizar-mb", { waitUntil: "networkidle" });
  const otraVez = await d.locator("body").innerText();
  ok(/La agenda ya está activa/.test(otraVez) && /No hay nada en General por acomodar/.test(otraVez) && (await d.locator("[data-plan-faltan] li").count()) === 1, "al volver, solo queda Semi por si lo quiere agregar");

  console.log("\n2. Inicio y Agenda de la dueña");
  await d.goto(BASE + "/panel", { waitUntil: "networkidle" });
  ok((await d.locator("[data-inicio-agendar]").count()) === 1 && (await d.locator("[data-inicio-vender]").count()) === 1, "su inicio tiene Agendar cita y Vender");
  ok((await d.locator("[data-aviso-organizar]").count()) === 0, "ya no sale el aviso");
  const [jessica, paola] = [equipo.find((s) => s.name === "Jessica Gaitan"), equipo.find((s) => s.name === "Paola Meléndez")];
  const semiSuyo = de("ESMALTADO SEMIPERMANENTE MANOS");
  const cita = (staff, clientName, day, startTime) =>
    db.appointment.create({
      data: {
        userId: mb.id,
        serviceId: semiSuyo.id,
        serviceName: semiSuyo.name,
        price: semiSuyo.price,
        staffId: staff.id,
        staffName: staff.name,
        clientName,
        clientPhone: "3001234567",
        day,
        startTime,
        endTime: startTime.replace(/^(\d\d):00$/, (_, h) => h + ":30"),
      },
    });
  const ana = await cita(jessica, "Ana Cliente", hoy, "10:00");
  const beatriz = await cita(jessica, "Beatriz Cliente", masDias(hoy, 1), "15:00");
  const carla = await cita(paola, "Carla Ajena", hoy, "10:00");
  await db.customer.create({ data: { userId: mb.id, name: "Fernanda Clienta", phone: "3201112233" } });
  await d.goto(BASE + "/panel/turnos", { waitUntil: "networkidle" });
  const agenda = await d.locator("body").innerText();
  ok(/manicurista/i.test(agenda) && !/barbero|barber[ií]a/i.test(agenda), "la agenda habla de manicuristas", (agenda.match(/.{0,40}barber.{0,40}/i) ?? [""])[0]);
  ok((await d.locator("#agendar").count()) === 1 && (await d.locator("[data-cambiar-horario]").count()) === 1, "tiene Agendar cita y Horario");
  ok(await sinDesborde(d), "la agenda no se sale de la pantalla");
  // Editar: la cita de Carla pasa a mañana a las 9 con Natalia.
  const natalia = equipo.find((s) => s.name === "Natalia Rincon");
  const tCarla = d.locator("li").filter({ hasText: "Carla Ajena" }).filter({ has: d.locator("[data-editar-cita]") }).first();
  await tCarla.locator("[data-editar-cita] summary").click();
  await tCarla.locator('[data-editar-cita] input[name="day"]').fill(masDias(hoy, 1));
  await tCarla.locator('[data-editar-cita] select[name="startTime"]').selectOption("09:00");
  await tCarla.locator('[data-editar-cita] select[name="staffId"]').selectOption(natalia.id);
  await tCarla.locator("[data-editar-cita]").getByRole("button", { name: /Guardar cambios/ }).click();
  const movida = await esperar(async () => {
    const a = await db.appointment.findUnique({ where: { id: carla.id } });
    return a.staffId === natalia.id ? a : null;
  });
  ok(movida?.day === masDias(hoy, 1) && movida?.startTime === "09:00" && movida?.staffName === "Natalia Rincon", "la dueña cambió día, hora y manicurista de una cita");
  if (DIR) await d.screenshot({ path: DIR + "/mb-agenda-duena.png", fullPage: true });

  console.log("\n3. La manicurista entra solo con su usuario");
  const p = await pagina();
  await p.fill('input[name="email"]', jessica.username);
  ok((await p.locator('input[name="password"], #pin').count()) === 0, "no le pide contraseña ni PIN");
  await p.click('button[type="submit"]');
  await p.waitForURL(/\/panel\/mis-citas/, { timeout: 60000 }).catch(() => null);
  ok(p.url().endsWith("/panel/mis-citas"), "llega directo a sus citas", p.url());
  const texto = await p.locator("body").innerText();
  ok(texto.includes("Ana Cliente") && texto.includes("Beatriz Cliente") && !texto.includes("Carla Ajena"), "ve solo sus citas");
  ok((await p.locator("[data-boton-agendar]").count()) === 1 && (await p.locator("[data-boton-vender]").count()) === 1, "arriba tiene Agendar cita y Vender");
  const menu = (await p.locator("nav a").allInnerTexts()).join(" | ");
  ok(/Citas/.test(menu) && /Vender/.test(menu) && /Clientas/.test(menu) && /Precios/.test(menu) && !/Ventas|Caja|Gastos|Reportes/.test(menu), "su menú: Citas, Vender, Clientas, Precios y Perfil", menu);
  await p.goto(BASE + "/panel/catalogo", { waitUntil: "networkidle" });
  ok(p.url().endsWith("/panel/mis-citas"), "no entra al catálogo donde se cambian precios", p.url());
  if (DIR) await p.screenshot({ path: DIR + "/mb-mis-citas.png", fullPage: true });

  console.log("\n4. Cerrada, con adicionales");
  const coca = de("COCA COLA 400ML");
  const tAna = p.locator('[data-cita="Ana Cliente"]');
  await tAna.locator("[data-boton-cerrada]").click();
  await tAna.locator("[data-elegir-adicional]").selectOption(coca.id);
  await tAna.locator("[data-agregar-de-lista]").click();
  await tAna.locator("[data-otro-nombre]").fill("Decorado");
  await tAna.locator("[data-otro-valor]").fill("10");
  await tAna.locator("[data-agregar-otro]").click();
  ok(/58\.500/.test(await tAna.locator("[data-total-cita]").innerText()), "el total es 45.000 + 3.500 + 10.000");
  p.once("dialog", (dlg) => dlg.accept());
  await tAna.getByRole("button", { name: /Guardar como cerrada/ }).click();
  const venta = await esperar(() => db.sale.findFirst({ where: { appointmentId: ana.id }, include: { items: true } }));
  ok(venta?.total === 58500 && venta?.staffId === jessica.id && venta?.items.length === 3, "venta por 58.500 a su nombre, con 3 renglones");
  await p.waitForSelector('[data-cerrada="Ana Cliente"]', { timeout: 20000 }).catch(() => null);
  ok((await p.locator('[data-cerrada="Ana Cliente"]').count()) === 1, "sale en Cerradas hoy (sin pantalla en blanco)");

  console.log("\n5. Reprogramada");
  const pasado = masDias(hoy, 2);
  const tBea = p.locator('[data-cita="Beatriz Cliente"]');
  await tBea.locator("[data-boton-reprogramada]").click();
  await tBea.locator('input[name="day"]').fill(pasado);
  await tBea.locator('select[name="startTime"]').selectOption("11:00");
  await tBea.getByRole("button", { name: /Guardar nueva fecha/ }).click();
  const bea = await esperar(async () => {
    const a = await db.appointment.findUnique({ where: { id: beatriz.id } });
    return a.day === pasado ? a : null;
  });
  ok(bea?.startTime === "11:00" && /Reprogramada/.test(bea?.notes ?? ""), "quedó para pasado mañana a las 11:00, con la nota");

  console.log("\n6. Clientas: ve la lista y agenda desde ahí");
  await p.goto(BASE + "/panel/clientas", { waitUntil: "networkidle" });
  ok((await p.locator('[data-clienta="Fernanda Clienta"]').count()) === 1, "ve a las clientas del negocio");
  await p.fill('input[name="q"]', "fern");
  await p.getByRole("button", { name: /Buscar/ }).click();
  await p.waitForURL(/q=fern/, { timeout: 20000 });
  ok((await p.locator("[data-clienta]").count()) === 1, "busca por nombre");
  await p.locator('[data-clienta="Fernanda Clienta"] [data-agendar-clienta]').click();
  await p.waitForURL(/mis-citas\?agendar=1/, { timeout: 20000 });
  const fAg = p.locator("[data-agendar-cita]");
  ok((await fAg.locator('input[name="clientName"]').inputValue()) === "Fernanda Clienta", "Agendar abre con la clienta ya escrita");
  await fAg.locator('select[name="serviceId"]').selectOption(de("CEJAS").id);
  ok((await fAg.locator('select[name="serviceId"] option').allInnerTexts()).every((t) => !/Chokis|Coca/i.test(t)), "para agendar no sale el mecato");
  await fAg.locator('input[name="day"]').fill(pasado);
  const horas = await fAg.locator('select[name="startTime"] option').evaluateAll((os) => os.map((o) => o.value));
  ok(!horas.includes("11:00") && horas.includes("16:00"), "la hora que ya tiene ocupada sale bloqueada");
  await fAg.locator('select[name="startTime"]').selectOption("16:00");
  await fAg.getByRole("button", { name: /Guardar cita/ }).click();
  const nueva = await esperar(() => db.appointment.findFirst({ where: { userId: mb.id, clientName: "Fernanda Clienta" } }));
  ok(nueva?.staffId === jessica.id && nueva?.day === pasado && nueva?.startTime === "16:00" && nueva?.serviceName === "CEJAS", "quedó agendada a su nombre");

  console.log("\n7. Vender sin cita, por categoría");
  await p.goto(BASE + "/panel/mecato", { waitUntil: "networkidle" });
  const cats = (await p.locator("[data-categoria]").allInnerTexts()).map((c) => c.trim());
  ok(cats.slice(0, 2).join(",") === "Bebidas,Mecato" && cats.includes("UÑAS") && cats.includes("Depilación con cera"), "cada categoría por separado: primero Bebidas y Mecato", cats.join(" | "));
  await p.locator('[data-categoria="Bebidas"]').click();
  await p.locator('[data-producto="COCA COLA 400ML"] [data-sumar]').click();
  await p.locator('[data-producto="COCA COLA 400ML"] [data-sumar]').click();
  await p.locator('[data-categoria="Mecato"]').click();
  await p.locator('[data-producto="Chokis"] [data-sumar]').click();
  ok(/9\.000/.test(await p.locator("[data-total-mecato]").innerText()), "total 2 × 3.500 + 2.000");
  await p.locator('[data-cobrar-mecato] input[name="clientName"]').fill("Elena");
  p.once("dialog", (dlg) => dlg.accept());
  await p.getByRole("button", { name: /Guardar venta/ }).click();
  const vendida = await esperar(() => db.sale.findFirst({ where: { userId: mb.id, clientName: "Elena" }, include: { items: true } }));
  ok(vendida?.total === 9000 && vendida?.staffId === jessica.id && vendida?.appointmentId === null, "la venta quedó a su nombre, sin cita");
  await p.waitForSelector("[data-vendido]", { timeout: 20000 }).catch(() => null);
  ok((await p.locator("[data-vendido]").count()) === 1, "sale en Vendido hoy sin cita");
  ok(await sinDesborde(p), "Vender no se sale de la pantalla");
  if (DIR) await p.screenshot({ path: DIR + "/mb-vender.png", fullPage: true });

  console.log("\n8. Precios: se ven, no se cambian");
  await p.goto(BASE + "/panel/precios", { waitUntil: "networkidle" });
  const precios = (await p.locator("[data-lista-precios]").allInnerTexts()).join(" ");
  ok(precios.includes("Chokis") && precios.includes("3.500"), "ve la lista con sus precios");
  ok((await p.locator("[data-lista-precios] input, [data-lista-precios] button, main form").count()) === 0, "no hay dónde cambiar un precio");

  console.log("\n9. Otra barbería sigue igual");
  const o = await pagina();
  await o.fill('input[name="email"]', otra.staff.find((s) => s.name === "Andres").username);
  await o.click('button[type="submit"]');
  await o.waitForURL(/\/panel/, { timeout: 60000 }).catch(() => null);
  ok(/\/panel(\?|$|\/(?!mis-citas))/.test(o.url()), "su empleado entra a su panel de siempre", o.url());

  ok(errores.length === 0, "sin errores en la página", errores.join(" | "));
} finally {
  await browser.close();
  for (const u of [mb, otra]) await db.user.delete({ where: { id: u.id } }).catch((e) => console.log("No se borro " + u.email + ": " + e.message));
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
