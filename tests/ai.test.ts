import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askAi, probarIa } from "../src/lib/ai";

/**
 * La conexion con Gemini.
 *
 * Nacio de un fallo real: en produccion el agente contestaba siempre "no
 * puedo responder" y el motivo se perdia. Lo que se fija: que el motivo de
 * Google llegue hasta la pantalla y que un modelo que Google no reconoce se
 * reintente con el de respaldo.
 */
const respuesta = (status: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status });
const texto = (t: string) => ({ candidates: [{ content: { parts: [{ text: t }] } }] });

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
  it("si Google no reconoce el modelo, reintenta con el de respaldo", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        return urls.length === 1
          ? respuesta(404, { error: { message: "models/gemini-2.5-flash is not found" } })
          : respuesta(200, texto("listo"));
      })
    );
    expect(await askAi("s", [{ role: "user", text: "hola" }])).toEqual({ ok: true, text: "listo" });
    expect(urls[0]).toContain("gemini-2.5-flash:generateContent");
    expect(urls[1]).toContain("gemini-flash-latest:generateContent");
  });

  it("dice el motivo real cuando Google rechaza la clave", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(403, { error: { message: "API key not valid. Please pass a valid API key." } })));
    const r = await askAi("s", [{ role: "user", text: "hola" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/rechazó la clave/);
      expect(r.error).toMatch(/API key not valid/);
      expect(r.error).not.toContain("clave-de-prueba");
    }
  });

  it("distingue la cuota agotada", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(429, { error: { message: "Quota exceeded" } })));
    const r = await askAi("s", [{ role: "user", text: "hola" }]);
    expect(!r.ok && r.error).toMatch(/consultas gratuitas/);
  });

  it("si los dos intentos fallan con 400, muestra lo que dijo Google", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respuesta(400, { error: { message: "Invalid JSON payload received." } })));
    const r = await askAi("s", [{ role: "user", text: "hola" }]);
    expect(!r.ok && r.error).toMatch(/Gemini respondió 400.*Invalid JSON payload/);
  });

  it("el diagnostico prueba la respuesta simple y la de funciones", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init?: RequestInit) =>
        String(init?.body).includes("function_declarations")
          ? respuesta(400, { error: { message: "tools no soportado" } })
          : respuesta(200, texto("listo"))
      )
    );
    const r = await probarIa();
    expect(r.clave).toBe(true);
    expect(r.simple.ok).toBe(true);
    expect(r.herramientas.ok).toBe(false);
    expect(r.herramientas.detalle).toMatch(/tools no soportado/);
  });

  it("sin clave lo dice sin llamar a nadie", async () => {
    delete process.env.GEMINI_API_KEY;
    const fn = vi.fn();
    vi.stubGlobal("fetch", fn);
    expect((await probarIa()).clave).toBe(false);
    expect(fn).not.toHaveBeenCalled();
  });
});
