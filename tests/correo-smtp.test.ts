import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import { canalDeCorreo, mailEnabled, sendMail } from "../src/lib/mail";

/**
 * El correo por Gmail (SMTP).
 *
 * Contra un servidor de correo de mentira que corre aqui mismo: no sale ningun
 * correo de verdad. Lo que se fija: que con SMTP_USER y SMTP_PASS el correo
 * sale por ahi (y le gana a Resend), que la contrasena de aplicacion sirve con
 * los espacios con que la muestra Google, y que una clave mala devuelve false
 * sin tumbar la pantalla.
 */
const CLAVE = "abcdefghijklmnop";
const VARIABLES = ["SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "MAIL_FROM", "RESEND_API_KEY", "RESEND_BASE_URL"];
const antes = Object.fromEntries(VARIABLES.map((k) => [k, process.env[k]]));

const recibidos: string[] = [];
let puerto = 0;

const servidor = net.createServer((s) => {
  s.write("220 prueba ESMTP\r\n");
  let buffer = "";
  let enDatos = false;
  let cuerpo = "";
  s.on("data", (trozo) => {
    buffer += trozo.toString("utf8");
    let fin: number;
    while ((fin = buffer.indexOf("\r\n")) >= 0) {
      const linea = buffer.slice(0, fin);
      buffer = buffer.slice(fin + 2);
      if (enDatos) {
        if (linea === ".") {
          enDatos = false;
          recibidos.push(cuerpo);
          cuerpo = "";
          s.write("250 recibido\r\n");
        } else cuerpo += linea + "\n";
        continue;
      }
      const orden = linea.toUpperCase();
      if (orden.startsWith("EHLO") || orden.startsWith("HELO")) s.write("250-prueba\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (orden.startsWith("AUTH PLAIN ")) {
        const [, usuario, clave] = Buffer.from(linea.slice(11), "base64").toString("utf8").split("\0");
        s.write(usuario === "snakedev-prueba@gmail.com" && clave === CLAVE ? "235 adentro\r\n" : "535 clave mala\r\n");
      } else if (orden === "DATA") {
        enDatos = true;
        s.write("354 escribe\r\n");
      } else if (orden === "QUIT") {
        s.write("221 chao\r\n");
        s.end();
      } else s.write("250 ok\r\n");
    }
  });
});

beforeAll(async () => {
  await new Promise<void>((listo) => servidor.listen(0, "127.0.0.1", () => listo()));
  puerto = (servidor.address() as net.AddressInfo).port;
});

afterEach(() => {
  for (const k of VARIABLES) {
    if (antes[k] === undefined) delete process.env[k];
    else process.env[k] = antes[k];
  }
});

afterAll(async () => {
  await new Promise<void>((listo) => servidor.close(() => listo()));
});

function conGmailDePrueba(clave = "abcd efgh ijkl mnop") {
  for (const k of VARIABLES) delete process.env[k];
  process.env.SMTP_USER = "snakedev-prueba@gmail.com";
  process.env.SMTP_PASS = clave;
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(puerto);
  process.env.SMTP_SECURE = "false";
}

const correo = { to: "cliente@test.local", subject: "Recupera tu contraseña", html: "<p>Hola</p>", text: "Hola" };

describe("correo por Gmail (SMTP)", () => {
  it("sin nada configurado no hay correo", () => {
    for (const k of VARIABLES) delete process.env[k];
    expect(mailEnabled()).toBe(false);
    expect(canalDeCorreo()).toBeNull();
  });

  it("con SMTP_USER y SMTP_PASS sale desde ese correo, aunque la clave venga con espacios", async () => {
    conGmailDePrueba();
    expect(mailEnabled()).toBe(true);
    expect(canalDeCorreo()).toBe("smtp");

    const antesDeMandar = recibidos.length;
    expect(await sendMail(correo)).toBe(true);
    expect(recibidos.length).toBe(antesDeMandar + 1);
    const recibido = recibidos.at(-1)!;
    expect(recibido).toMatch(/^From: .*<snakedev-prueba@gmail\.com>/m);
    expect(recibido).toMatch(/^To: cliente@test\.local/m);
  });

  it("le gana a Resend si están los dos", async () => {
    conGmailDePrueba();
    process.env.RESEND_API_KEY = "re_prueba";
    process.env.RESEND_BASE_URL = "http://127.0.0.1:9/nunca";
    expect(canalDeCorreo()).toBe("smtp");
    expect(await sendMail(correo)).toBe(true);
  });

  it("con la clave mala devuelve false y no lanza", async () => {
    conGmailDePrueba("clave-equivocada");
    expect(await sendMail(correo)).toBe(false);
  });
});
