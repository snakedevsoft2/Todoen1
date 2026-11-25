/**
 * Comprueba en un navegador lo de MB NAILS SPA (ver lib/mb-nails.ts y
 * lib/mb-nails-plan.ts), empezando como esta su cuenta de verdad: "Otro
 * negocio", con sus productos en General y uno en "UÑAS".
 *   1. la dueña ve el aviso y Organizar: activa la agenda, crea las 5
 *      manicuristas, pasa cada producto a su categoria y agrega lo que falta;
 *   2. su inicio tiene Agendar cita y Vender; en la Agenda edita una cita
 *      (dia, hora y quien la atiende) y llega al horario;
 *   3. la manicurista entra solo con su usuario a Citas: ve solo sus citas
 *      (nombre, hora y servicio; ni plata, ni telefonos, ni las de las demas)
 *      y marca Llegó, No llegó y Cambiar hora; nada mas en su menu;
 *   4. la dueña ve lo que marco cada una en la Agenda y en el inicio, con
 *      cuantas no llegaron y cuantas se reprogramaron;
 *   5. otra barberia sigue igual.
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
  const diana = await cita(jessica, "Diana Cliente", masDias(hoy, -1), "16:00");
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
  const texto = await p.locator("main").innerText();
  ok(texto.includes("Ana Cliente") && texto.includes("Beatriz Cliente") && texto.includes("Diana Cliente") && !texto.includes("Carla Ajena"), "ve solo sus citas");
  ok(texto.includes("ESMALTADO SEMIPERMANENTE MANOS") && /10:00 am/.test(texto), "ve el servicio y la hora");
  ok(!/\$|45\.000|3001234567/.test(texto), "no ve plata, precios ni teléfonos", (texto.match(/.{0,30}(\$|45\.000|3001234567).{0,30}/) ?? [""])[0]);
  ok((await p.locator("[data-boton-agendar], [data-boton-vender], [data-boton-cerrada]").count()) === 0, "no agenda, no vende, no cobra");
  const menu = (await p.locator("nav a").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  ok(menu.every((t) => /^(Citas|Perfil)$/i.test(t)) && menu.includes("Citas"), "su menú: solo Citas y Perfil", menu.join(" | "));
  for (const ruta of ["/panel/catalogo", "/panel/turnos", "/panel/ventas", "/panel/clientes", "/panel/caja"]) {
    await p.goto(BASE + ruta, { waitUntil: "networkidle" });
    ok(p.url().endsWith("/panel/mis-citas"), "no entra a " + ruta, p.url());
  }
  // Lo que tenian antes (Vender, Precios, Clientas) ya no existe.
  for (const ruta of ["/panel/mecato", "/panel/precios", "/panel/clientas"]) {
    const r = await p.goto(BASE + ruta, { waitUntil: "networkidle" });
    ok(r?.status() === 404 || p.url().endsWith("/panel/mis-citas"), ruta + " ya no existe", String(r?.status()));
  }
  await p.goto(BASE + "/panel/mis-citas", { waitUntil: "networkidle" });
  const tBea = p.locator('[data-cita="Beatriz Cliente"]');
  ok((await tBea.locator("[data-llego], [data-no-llego]").count()) === 0 && (await tBea.locator("[data-boton-cambiar-hora]").count()) === 1, "la de mañana solo se cambia de hora");
  ok(await sinDesborde(p), "sus citas no se salen de la pantalla");
  if (DIR) await p.screenshot({ path: DIR + "/mb-mis-citas.png", fullPage: true });

  console.log("\n4. Llegó");
  await p.locator('[data-cita="Ana Cliente"] [data-llego] button').click();
  const llego = await esperar(async () => {
    const a = await db.appointment.findUnique({ where: { id: ana.id } });
    return a.status === "ATENDIDO" ? a : null;
  });
  ok(Boolean(llego), "Ana quedó como que llegó");
  const nLlego = await db.appointmentEvent.findFirst({ where: { appointmentId: ana.id, kind: "LLEGO" } });
  ok(nLlego?.staffName === "Jessica Gaitan" && nLlego?.byOwner === false, "quedó la novedad a nombre de Jessica");
  ok((await db.sale.count({ where: { appointmentId: ana.id } })) === 0, "no se cobró nada: eso lo hace la dueña");
  await p.waitForSelector('[data-llego-hoy="Ana Cliente"]', { timeout: 20000 }).catch(() => null);
  ok((await p.locator('[data-llego-hoy="Ana Cliente"]').count()) === 1, "sale en Llegaron hoy (sin pantalla en blanco)");

  console.log("\n5. No llegó (la de ayer, sin marcar)");
  ok(/Sin marcar/i.test(await p.locator("main").innerText()), "la de ayer sale como Sin marcar");
  p.once("dialog", (dlg) => dlg.accept());
  await p.locator('[data-cita="Diana Cliente"] [data-no-llego] button').click();
  const noVino = await esperar(async () => {
    const a = await db.appointment.findUnique({ where: { id: diana.id } });
    return a.status === "NO_ASISTIO" ? a : null;
  });
  ok(Boolean(noVino) && (await db.appointmentEvent.count({ where: { appointmentId: diana.id, kind: "NO_LLEGO" } })) === 1, "Diana quedó como que no llegó, con su novedad");
  const siLlego = p.locator('[data-cita="Diana Cliente"] [data-llego] button', { hasText: "Sí llegó" });
  await siLlego.waitFor({ timeout: 20000 }).catch(() => null);
  ok((await siLlego.count()) === 1, "puede corregirlo con Sí llegó");

  console.log("\n6. Cambiar hora");
  const pasado = masDias(hoy, 2);
  await tBea.locator("[data-boton-cambiar-hora]").click();
  await tBea.locator('[data-cambiar-hora] input[name="day"]').fill(pasado);
  await tBea.locator('[data-cambiar-hora] select[name="startTime"]').selectOption("11:00");
  await tBea.getByRole("button", { name: /Guardar nueva hora/ }).click();
  const bea = await esperar(async () => {
    const a = await db.appointment.findUnique({ where: { id: beatriz.id } });
    return a.day === pasado ? a : null;
  });
  ok(bea?.startTime === "11:00", "quedó para pasado mañana a las 11:00");
  const nMovida = await db.appointmentEvent.findFirst({ where: { appointmentId: beatriz.id, kind: "REPROGRAMADA" } });
  ok(
    nMovida?.fromDay === masDias(hoy, 1) && nMovida?.fromTime === "15:00" && nMovida?.toDay === pasado && nMovida?.toTime === "11:00",
    "la novedad guarda la hora de antes y la nueva"
  );

  console.log("\n7. La dueña lo ve todo");
  await d.goto(BASE + "/panel/turnos", { waitUntil: "networkidle" });
  const novedades = await d.locator("[data-novedades]").innerText();
  ok(/Jessica Gaitan marcó que llegó Ana Cliente/.test(novedades), "ve que llegó Ana", novedades);
  ok(/Diana Cliente no llegó/.test(novedades) && /cambió la cita de Beatriz Cliente/.test(novedades), "ve que Diana no llegó y que movieron la de Beatriz");
  ok(!/Carla/.test(novedades), "lo que movió ella misma no le sale como novedad");
  const resumen = (await d.locator("[data-resumen-citas]").innerText()).replace(/\s+/g, " ");
  ok(/Reprogramadas 1/i.test(resumen) && /Llegaron sin cobrar 1/i.test(resumen), "hoy: 1 reprogramada (la de Carla) y 1 sin cobrar", resumen);
  const tAnaD = d.locator("li").filter({ hasText: "Ana Cliente" }).filter({ has: d.locator("[data-novedades-cita]") }).first();
  const anaD = await tAnaD.innerText();
  ok(/Llegó · marcó Jessica Gaitan/.test(anaD) && /Falta cobrar/i.test(anaD), "en la cita de Ana: quién marcó que llegó y que falta cobrar", anaD);
  ok(/3001234567/.test(anaD) && /45\.000/.test(anaD), "la dueña sí ve el teléfono y el precio");
  ok(await sinDesborde(d), "la agenda sigue sin salirse de la pantalla");
  if (DIR) await d.screenshot({ path: DIR + "/mb-agenda-novedades.png", fullPage: true });
  await d.goto(BASE + "/panel/turnos?d=" + masDias(hoy, -1), { waitUntil: "networkidle" });
  ok(/No llegaron\s*1/i.test(await d.locator("[data-resumen-citas]").innerText()), "ayer: 1 no llegó");
  await d.goto(BASE + "/panel", { waitUntil: "networkidle" });
  const inicio = await d.locator("[data-novedades]").innerText().catch(() => "");
  ok(/Ana Cliente/.test(inicio) && /Diana Cliente/.test(inicio) && /Beatriz Cliente/.test(inicio), "en su inicio están las novedades");
  if (DIR) await d.screenshot({ path: DIR + "/mb-inicio-duena.png", fullPage: true });

  console.log("\n8. Otra barbería sigue igual");
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
