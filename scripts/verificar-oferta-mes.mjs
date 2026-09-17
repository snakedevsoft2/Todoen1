/**
 * Comprueba el pop-up de la oferta del mes en la pagina publica: sale al
 * entrar, se puede cerrar, y una vez cerrado no vuelve a salir en el mismo
 * mes (ni recargando ni en una pestaña nueva del mismo navegador).
 *
 * Antes:   npm run build && npm start
 * Después: node scripts/verificar-oferta-mes.mjs
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
let fallos = 0;
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK   " + t);
  else {
    fallos++;
    console.log("  MAL  " + t + (extra ? "  <- " + extra : ""));
  }
};

const browser = await chromium.launch({ channel: "msedge" });
try {
  console.log("\n1. Sale al entrar por primera vez");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  ok((await page.locator("[data-oferta-mes]").count()) === 1, "aparece el pop-up");
  ok((await page.getByText(/este mes/).count()) > 0, "menciona la oferta de este mes");
  ok((await page.getByRole("link", { name: /Quiero mi kit/ }).count()) === 1, "trae un enlace para crear cuenta");

  console.log("\n2. Se cierra y no vuelve a salir en el mismo mes");
  await page.getByRole("button", { name: "Ahora no" }).click();
  ok((await page.locator("[data-oferta-mes]").count()) === 0, "se cierra al tocar «Ahora no»");
  await page.reload({ waitUntil: "load" });
  ok((await page.locator("[data-oferta-mes]").count()) === 0, "no vuelve a salir al recargar");

  console.log("\n3. En otra pestaña del mismo navegador tampoco (mismo localStorage)");
  const page2 = await ctx.newPage();
  await page2.goto(BASE + "/", { waitUntil: "load" });
  ok((await page2.locator("[data-oferta-mes]").count()) === 0, "no vuelve a salir en otra pestaña");

  console.log("\n4. Un navegador nuevo (sin ese localStorage) sí lo ve");
  const ctxNuevo = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page3 = await ctxNuevo.newPage();
  await page3.goto(BASE + "/", { waitUntil: "load" });
  ok((await page3.locator("[data-oferta-mes]").count()) === 1, "aparece para un visitante nuevo");
  ok((await page3.locator("[data-oferta-mes] svg").count()) >= 1, "y cabe en la pantalla del celular");
} finally {
  await browser.close();
}

console.log(fallos === 0 ? "\nTodo bien.\n" : "\n" + fallos + " fallo(s).\n");
process.exit(fallos === 0 ? 0 : 1);
