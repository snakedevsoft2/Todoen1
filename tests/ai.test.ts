import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askAi, modeloRecomendado, probarIa } from "../src/lib/ai";

/**
 * La conexion con Gemini.
 *
 * Nacio de un fallo real: en produccion Google respondio "gemini-2.5-flash is
 * no longer available to new users" y el agente contestaba siempre "no puedo
 * responder". Lo que se fija: que el motivo de Google llegue a la pantalla, y
 * que un modelo retirado se reemplace solo por el que Google recomienda.
 */
const respuesta = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status });
const texto = (t: string) => ({ candidates: [{ content: { parts: [{ text: t }] } }] });
const RETIRADO =
  "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features and improvements.";

beforeEach(() => {
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_BASE_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("conexion con Gemini", () => {
  it("lee el modelo que Google recomienda en su error", () => {
    expect(modeloRecomendado(RETIRADO)).toBe("gemini-3.6-flash");
    expect(modeloRecomendado("use gemini-4-flash, please")).toBe("gemini-4-flash");
    expect(modeloRecomendado("API key not valid")).toBeNull();
  });

  it("usa gemini-3.6-flash por defecto", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (urls.push(String(url)), respuesta(200, texto("listo")))));
    await askAi("s", [{ role: "user", text: "hola" }]);
    expect(urls[0]).toContain("gemini-3.6-flash:generateContent");
  });

  it("si el modelo configurado esta retirado, usa el que Google recomienda", async () => {
    process.env.GEMINI_MODEL = "gemini-2.5-flash";
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return urls.length === 1 ? respuesta(404, { error: { message: RETIRADO } }) : respuesta(200, texto("listo"));
      })
    );
    expect(await askAi("s", [{ role: "user", text: "hola" }])).toEqual({ ok: true, text: "listo" });
    expect(urls[0]).toContain("gemini-2.5-flash:generateContent");
    expect(urls[1]).toContain("gemini-3.6-flash:generateContent");
  });

  it("sin recomendacion, recorre los modelos de respaldo", async () => {
    process.env.GEMINI_MODEL = "gemini-viejo";
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return String(url).includes("gemini-flash-latest")
          ? respuesta(200, texto("listo"))
          : respuesta(404, { error: { message: "model not found" } });
      })
    );
    expect(await askAi("s", [{ role: "user", text: "hola" }])).toEqual({ ok: true, text: "listo" });
    expect(urls.map((u) => u.split("/models/")[1]?.split(":")[0])).toEqual(["gemini-viejo", "gemini-3.6-flash", "gemini-flash-latest"]);
  });

  it("dice el motivo real cuando Google rechaza la clave, sin reintentar", async () => {
    const fn = vi.fn(async () => respuesta(403, { error: { message: "API key not valid. Please pass a valid API key." } }));
    vi.stubGlobal("fetch", fn);
    const r = await askAi("s", [{ role: "user", text: "hola" }]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/rechazó la clave/);
      expect(r.error).not.toContain("clave-de-prueba");
    }
  });

  it("distingue la cuota agotada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(429, { error: { message: "Quota exceeded" } })));
    const r = await askAi("s", [{ role: "user", text: "hola" }]);
    expect(!r.ok && r.error).toMatch(/consultas gratuitas/);
  });

  it("si todos los intentos fallan con 400, muestra lo que dijo Google", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(400, { error: { message: "Invalid JSON payload received." } })));
    const r = await askAi("s", [{ role: "user", text: "hola" }]);
    expect(!r.ok && r.error).toMatch(/Gemini respondió 400.*Invalid JSON payload/);
  });

  it("el diagnostico prueba la respuesta simple y la de funciones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) =>
        String(init?.body).includes("function_declarations")
          ? respuesta(403, { error: { message: "tools no permitido" } })
          : respuesta(200, texto("listo"))
      )
    );
    const r = await probarIa();
    expect(r.clave).toBe(true);
    expect(r.modelo).toBe("gemini-3.6-flash");
    expect(r.simple.ok).toBe(true);
    expect(r.herramientas.ok).toBe(false);
    expect(r.herramientas.detalle).toMatch(/tools no permitido/);
  });

  it("sin clave lo dice sin llamar a nadie", async () => {
    delete process.env.GEMINI_API_KEY;
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    expect((await probarIa()).clave).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("modelos fuera del plan de la clave", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "clave-de-prueba";
    delete process.env.GEMINI_MODEL;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("si el modelo no esta en el plan (403 o cuota cero), prueba el mas liviano", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (String(url).includes("gemini-flash-lite-latest")) return respuesta(200, texto("listo"));
        return String(url).includes("gemini-3.6-flash")
          ? respuesta(403, { error: { message: "Gemini 3 Flash is only available with billing enabled." } })
          : respuesta(429, { error: { message: "Quota exceeded for metric generate_content_free_tier_requests, limit: 0" } });
      })
    );
    expect(await askAi("s", [{ role: "user", text: "hola" }])).toEqual({ ok: true, text: "listo" });
    expect(urls.at(-1)).toContain("gemini-flash-lite-latest");
  });

  it("si nada sirve, dice que falta activar la facturacion", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(403, { error: { message: "Billing required." } })));
    const r = await askAi("s", [{ role: "user", text: "hola" }]);
    expect(!r.ok && r.error).toMatch(/activa la facturación/);
  });
});
