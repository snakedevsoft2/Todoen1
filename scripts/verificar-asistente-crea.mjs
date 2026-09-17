/**
 * Comprueba que el asistente del dueño pueda crear cosas en la aplicación
 * cuando se lo piden, y que a un empleado no le funcione lo mismo.
 *
 * El modelo se reemplaza por un servidor de mentira que levanta este script:
 * la primera vez responde pidiendo la función "crear_producto"; cuando le
 * llega el resultado de esa función, contesta en texto contándolo.
 *
 * Antes:
 *   npm run build
 *   GEMINI_API_KEY=prueba GEMINI_BASE_URL=http://localhost:3999/models/ npm start
 * Después: node scripts/verificar-asistente-crea.mjs
 */
import "dotenv/config";
import http from "node:http";
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
const esperarHasta = async (fn, ms = 15000) => {
  const fin = Date.now() + ms;
  let v = await fn();
  while (!v && Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 300));
    v = await fn();
  }
  return v;
};

// ------------------------------------------------ el servidor de mentira
const pedidosAlModelo = [];
const falso = http.createServer((req, res) => {
  let cuerpo = "";
  req.on("data", (c) => (cuerpo += c));
  req.on("end", () => {
    const pedido = JSON.parse(cuerpo || "{}");
    pedidosAlModelo.push(pedido);
    const json = (o) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o));
    };
    const texto = (t) => json({ candidates: [{ content: { parts: [{ text: t }] } }] });
    const ultimo = pedido.contents?.at(-1)?.parts ?? [];

    const resultado = ultimo.find((p) => p.functionResponse)?.functionResponse?.response;
    if (resultado) {
      return texto(
        resultado.ok
          ? "¡Listo! Creé el producto " + resultado.nombre + " en " + resultado.categoria + "."
          : "No pude: " + resultado.error
      );
    }

    const dijo = ultimo.map((p) => p.text ?? "").join(" ");
    if (/hamburguesa/i.test(dijo)) {
      return json({
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "crear_producto", args: { nombre: "Hamburguesa clásica", precio: 14000, categoria: "Comidas" } } }],
            },
          },
        ],
      });
    }
    return texto("Hola, ¿en qué te ayudo?");
  });
});
await new Promise((r) => falso.listen(3999, r));

// ------------------------------------------------------------- los datos
const S = "asistcrea-" + Date.now();
const clave = bcrypt.hashSync("demo1234", 10);
const listo = { onboardingDoneAt: new Date(), tourDoneAt: new Date() };
const cuenta = await db.user.create({
  data: {
    email: "duena-" + S + "@test.local",
    passwordHash: clave,
    ownerName: "Dueña",
    businessName: "Negocio " + S,
    businessType: "OTRO",
    slug: "negocio-" + S,
    staff: {
      create: [
        { name: "Dueña", role: "DUENO", ...listo },
        { name: "Ana", role: "VENDEDOR", username: "ana." + S.replace(/[^a-z0-9]/g, ""), ...listo },
      ],
    },
  },
  include: { staff: true },
});
const ana = cuenta.staff.find((s) => s.name === "Ana");

const errores = [];
const vigilar = (page) => page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && errores.push(r.status() + " " + r.url()));

const browser = await chromium.launch({ channel: "msedge" });
try {
  console.log("\n1. La dueña le pide al asistente que cree un producto");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  vigilar(page);
  await page.goto(BASE + "/login", { waitUntil: "load" });
  await page.fill('input[name="email"]', cuenta.email);
  await page.fill('input[name="password"]', "demo1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/panel/, { timeout: 25000 });
  await page.goto(BASE + "/panel/asistente", { waitUntil: "load" });
  ok((await page.getByText(/dile qué crear/).count()) === 1, "el subtítulo le dice a la dueña que puede pedirle que cree cosas");

  await page.fill('input[name="question"]', "Tengo hamburguesa clásica a 14000, categoría comidas. Créala.");
  await page.getByLabel("Enviar pregunta").click();
  ok(Boolean(await esperarHasta(() => page.getByText(/Creé el producto/).count())), "el asistente confirma que lo creó");

  const creado = await db.service.findFirst({ where: { userId: cuenta.id, name: "Hamburguesa clásica" } });
  ok(Boolean(creado), "el producto queda de verdad en el catálogo");
  ok(creado?.price === 14000 && creado?.category === "Comidas", "con el precio y la categoría correctos", JSON.stringify(creado));

  const conHerramientas = pedidosAlModelo.some((p) => Array.isArray(p.tools?.[0]?.function_declarations) && p.tools[0].function_declarations.some((f) => f.name === "crear_producto"));
  ok(conHerramientas, "al modelo se le ofreció la función crear_producto");

  console.log("\n2. A un empleado no se le ofrece esa capacidad");
  pedidosAlModelo.length = 0;
  const ctxAna = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pAna = await ctxAna.newPage();
  vigilar(pAna);
  await pAna.goto(BASE + "/login", { waitUntil: "load" });
  await pAna.fill('input[name="email"]', ana.username);
  await esperarHasta(() => pAna.locator("[data-ingreso-usuario]").count());
  await pAna.click('button[type="submit"]');
  await pAna.waitForURL(/\/panel/, { timeout: 25000 });
  await pAna.goto(BASE + "/panel/asistente", { waitUntil: "load" });
  ok((await pAna.getByText(/dile qué crear/).count()) === 0, "a Ana no le ofrece pedirle que cree cosas");

  await pAna.fill('input[name="question"]', "Tengo hamburguesa clásica a 14000. Créala.");
  await pAna.getByLabel("Enviar pregunta").click();
  await esperarHasta(() => pAna.locator(".rounded-bl-md").count() > 0);
  ok(
    pedidosAlModelo.every((p) => !p.tools),
    "y al modelo no se le ofrece ninguna función para ella"
  );
  ok(
    (await db.service.count({ where: { userId: cuenta.id, name: "Hamburguesa clásica" } })) === 1,
    "no se creó un segundo producto: Ana no puede crear nada por su cuenta"
  );

  console.log("\n3. Errores durante el recorrido");
  ok(errores.length === 0, "ningún error 500", errores.slice(0, 3).join(" | "));
} finally {
  await browser.close();
  falso.close();
  await db.user.deleteMany({ where: { slug: { contains: S } } }).catch(() => {});
  await db.$disconnect();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
