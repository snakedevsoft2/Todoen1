/**
 * El navegador de las verificaciones, sin la presentacion del primer ingreso.
 *
 * Desde el 22 sep 2026, quien abre /login por primera vez en un navegador ve
 * antes una presentacion de tres pasos (ver OnboardingGate), y el formulario
 * aparece despues. Las verificaciones abren navegadores nuevos cada vez, asi
 * que se quedaban esperando un campo de correo que todavia no estaba.
 *
 * Se usa igual que el de playwright:
 *   import { chromium } from "./navegador.mjs";
 * y cada pagina o contexto que abra ya tiene la presentacion marcada como
 * vista. Una verificacion que quiera ver la presentacion importa playwright
 * directo.
 */
import { chromium as playwright } from "playwright";

function marcarVista() {
  try {
    localStorage.setItem("todoen1_onboarding_seen", "true");
  } catch {
    /* paginas sin almacenamiento (about:blank, archivos): no hay nada que marcar */
  }
}

export const chromium = {
  async launch(opciones) {
    const browser = await playwright.launch(opciones);
    const newContext = browser.newContext.bind(browser);
    const newPage = browser.newPage.bind(browser);
    browser.newContext = async (o) => {
      const ctx = await newContext(o);
      await ctx.addInitScript(marcarVista);
      return ctx;
    };
    // newPage de playwright crea su propio contexto y lo cierra con la pagina;
    // se respeta eso y solo se le agrega el aviso antes de la primera visita.
    browser.newPage = async (o) => {
      const page = await newPage(o);
      await page.addInitScript(marcarVista);
      return page;
    };
    return browser;
  },

  async launchPersistentContext(perfil, opciones) {
    const ctx = await playwright.launchPersistentContext(perfil, opciones);
    await ctx.addInitScript(marcarVista);
    return ctx;
  },
};
