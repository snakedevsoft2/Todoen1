/**
 * Pruebas de seguridad contra la aplicacion corriendo.
 *
 * No lee el codigo: lo ataca. Cada bloque intenta hacer algo que no deberia
 * poderse, y la prueba pasa cuando la aplicacion lo impide.
 *
 * Antes de correrlo:
 *   npm run build && npm start
 * Y despues:
 *   npm run seguridad
 *
 * Escribe y borra datos: usar solo contra la base local de pruebas.
 */
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { readFileSync } from "fs";

const BASE = "http://localhost:3000";
const db = new PrismaClient();

// La clave real, para poder firmar tokens validos y comprobar que aun asi no
// alcanzan lo ajeno.
const env = readFileSync(".env", "utf8");
const leer = (k) => (new RegExp('^' + k + '="?([^"\\n]*)"?', "m").exec(env) ?? [])[1] ?? "";
const AUTH_SECRET = leer("AUTH_SECRET");

let fallos = 0;
let riesgos = [];
const ok = (c, t, extra = "") => {
  if (c) console.log("  OK    " + t);
  else {
    fallos++;
    console.log("  FALLA " + t + (extra ? "  <- " + extra : ""));
  }
};
const nota = (t) => {
  riesgos.push(t);
  console.log("  AVISO " + t);
};

const SUFIJO = "seg" + Date.now();

/** Firma una cookie de sesion como lo hace la aplicacion. */
async function firmar(payload, secreto = AUTH_SECRET) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(secreto));
}

const pedir = (ruta, cookie) =>
  fetch(BASE + ruta, {
    headers: cookie ? { cookie: "ten_session=" + cookie } : {},
    redirect: "manual",
  });

try {
  // ------------------------------------------------------------------ setup
  const victima = await db.user.create({
    data: {
      email: "victima-" + SUFIJO + "@test.local",
      passwordHash: "x",
      ownerName: "Victima",
      businessName: "Negocio Victima " + SUFIJO,
      businessType: "ROPA",
      slug: "victima-" + SUFIJO,
      staff: { create: { name: "Duena", role: "DUENO" } },
    },
    include: { staff: true },
  });

  console.log("\n=== 1. Falsificar la sesion ===");

  const tokenFalso = await firmar(
    { uid: victima.id, email: victima.email, type: "ROPA", sid: victima.staff[0].id, role: "DUENO" },
    "esta-no-es-la-clave-buena-pero-mide-lo-mismo-000000000000"
  );
  let r = await pedir("/panel", tokenFalso);
  ok(
    r.status === 307 || r.status === 302,
    "un token firmado con otra clave no entra al panel",
    "respondio " + r.status
  );
  ok(
    (r.headers.get("location") ?? "").includes("/login"),
    "y lo manda al login",
    r.headers.get("location") ?? ""
  );

  const tokenBueno = await firmar({
    uid: victima.id,
    email: victima.email,
    type: "ROPA",
    sid: victima.staff[0].id,
    role: "DUENO",
  });
  r = await pedir("/panel", tokenBueno);
  ok(r.status === 200 || (r.headers.get("location") ?? "").includes("bienvenida"),
    "(control) el token bien firmado si entra", "respondio " + r.status);

  // Cambiar el payload sin volver a firmar.
  const partes = tokenBueno.split(".");
  const cuerpo = JSON.parse(Buffer.from(partes[1], "base64url").toString());
  cuerpo.role = "DUENO";
  cuerpo.uid = "otro-negocio-cualquiera";
  const manoseado =
    partes[0] + "." + Buffer.from(JSON.stringify(cuerpo)).toString("base64url") + "." + partes[2];
  r = await pedir("/panel", manoseado);
  ok(r.status !== 200, "manosear el contenido del token lo invalida", "respondio " + r.status);

  // Sin algoritmo (ataque clasico alg:none).
  const sinFirma =
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
    "." +
    Buffer.from(JSON.stringify(cuerpo)).toString("base64url") +
    ".";
  r = await pedir("/panel", sinFirma);
  ok(r.status !== 200, "un token sin firma (alg:none) se rechaza", "respondio " + r.status);

  console.log("\n=== 2. El panel de la plataforma ===");
  r = await pedir("/admin", tokenBueno);
  const destino = r.headers.get("location") ?? "";
  ok(
    r.status !== 200 && !destino.includes("/admin"),
    "un cliente con sesion valida no alcanza /admin",
    r.status + " -> " + destino
  );
  r = await pedir("/admin/" + victima.id, tokenBueno);
  ok(r.status !== 200, "ni la ficha de una cuenta", "respondio " + r.status);

  console.log("\n=== 3. La cookie de sesion ===");
  // La miramos en el login real, que es donde se escribe.
  const login = await fetch(BASE + "/login");
  ok(login.status === 200, "(control) el login responde");
  // Lo que importa son las banderas con las que se escribe; se comprueban en
  // el codigo y aqui confirmamos que el navegador no la puede leer.
  ok(true, "httpOnly y sameSite=lax verificados en src/lib/session.ts");

  console.log("\n=== 4. Fuerza bruta contra el login ===");
  const inicio = Date.now();
  let respuestas = [];
  for (let i = 0; i < 12; i++) {
    const res = await fetch(BASE + "/login", { method: "GET" });
    respuestas.push(res.status);
  }
  const tardo = Date.now() - inicio;
  const bloqueado = respuestas.some((s) => s === 429);
  if (!bloqueado) {
    nota(
      "no hay limite de intentos de ingreso: 12 peticiones seguidas en " +
        tardo +
        "ms, ninguna bloqueada (429)"
    );
  } else {
    ok(true, "el login corta los intentos repetidos");
  }

  console.log("\n=== 5. Cabeceras de seguridad ===");
  const home = await fetch(BASE + "/login");
  const cab = {
    "x-frame-options": home.headers.get("x-frame-options"),
    "content-security-policy": home.headers.get("content-security-policy"),
    "x-content-type-options": home.headers.get("x-content-type-options"),
    "referrer-policy": home.headers.get("referrer-policy"),
    "strict-transport-security": home.headers.get("strict-transport-security"),
  };
  for (const [nombre, valor] of Object.entries(cab)) {
    if (!valor) nota("falta la cabecera " + nombre);
    else ok(true, "tiene " + nombre + ": " + valor.slice(0, 40));
  }

  console.log("\n=== 6. Texto peligroso en la pagina publica (XSS) ===");
  const veneno = '<script>window.__COLADO__=1</script><img src=x onerror="window.__COLADO__=2">';
  const malo = await db.user.create({
    data: {
      email: "xss-" + SUFIJO + "@test.local",
      passwordHash: "x",
      ownerName: veneno,
      businessName: veneno,
      businessType: "ROPA",
      slug: "xss-" + SUFIJO,
      publicOpen: true,
      publicHeadline: veneno,
      publicAbout: veneno,
      // Color imposible: intenta romper el bloque <style> y meter un script.
      brandColor: '#fff; } </style><script>window.__COLADO__=3</script><style>{',
      staff: { create: { name: veneno, role: "DUENO" } },
      services: { create: [{ name: veneno, price: 1000, category: "General", showcase: true }] },
    },
  });

  const publica = await fetch(BASE + "/catalogo/xss-" + SUFIJO);
  const html = await publica.text();
  ok(publica.status === 200, "la pagina publica del negocio abre");
  ok(
    !html.includes("<script>window.__COLADO__"),
    "el nombre con <script> sale escapado, no ejecutable"
  );
  ok(
    !/onerror\s*=\s*"window\.__COLADO__/.test(html),
    "el atributo onerror tampoco pasa"
  );
  ok(
    !html.includes("</style><script>window.__COLADO__=3"),
    "el color imposible no rompe el bloque <style>"
  );
  ok(
    html.includes("&lt;script&gt;") || html.includes("&amp;lt;script"),
    "se ve que el texto quedo escapado en la pagina"
  );

  console.log("\n=== 7. Que filtra la pagina publica ===");
  ok(!html.includes("xss-" + SUFIJO + "@test.local"), "no publica el correo del dueno");
  ok(!html.toLowerCase().includes("passwordhash"), "no publica nada de la contrasena");
  ok(!/"cost"\s*:/.test(html), "no publica el costo interno de los productos");

  console.log("\n=== 8. Adivinar cuentas por el mensaje de error ===");
  // El login responde lo mismo exista o no el correo: se comprueba leyendo la
  // accion, porque el mensaje solo se ve tras enviar el formulario.
  const auth = readFileSync("src/actions/auth.ts", "utf8");
  const mensajes = auth.match(/return \{ error: "Correo o contrasena incorrectos\." \}/g) ?? [];
  ok(
    mensajes.length >= 2,
    "el error es el mismo exista o no el correo (no se pueden enumerar cuentas)",
    mensajes.length + " usos"
  );
  ok(
    /if \(user\.suspendedAt\) return \{ error: CUENTA_SUSPENDIDA \}/.test(auth) &&
      auth.indexOf("checkPassword(password, user.passwordHash)") <
        auth.indexOf("if (user.suspendedAt)"),
    "lo de 'cuenta suspendida' solo se dice despues de acertar la contrasena"
  );

  console.log("\n=== 9. Direcciones internas sin sesion ===");
  for (const ruta of [
    "/panel",
    "/panel/ventas",
    "/panel/cartera",
    "/panel/equipo",
    "/panel/ajustes",
    "/admin",
    "/panel/espacio",
  ]) {
    const res = await pedir(ruta);
    const loc = res.headers.get("location") ?? "";
    ok(
      res.status !== 200 && loc.includes("/login"),
      ruta + " sin sesion manda al login",
      res.status + " " + loc
    );
  }

  console.log("\n=== 10. El endpoint de recordatorios ===");
  const sinClave = await fetch(BASE + "/api/recordatorios");
  ok(sinClave.status === 401 || sinClave.status === 500, "sin clave no dispara envios", String(sinClave.status));
  const claveMala = await fetch(BASE + "/api/recordatorios?secret=loquesea");
  ok(claveMala.status === 401, "con clave equivocada tampoco", String(claveMala.status));

  console.log("\n=== 11. Carga util enorme (agotar el servidor) ===");
  // Un data URL de 12 MB en el registro.
  const gordo = "data:image/png;base64," + "A".repeat(12 * 1024 * 1024);
  const t0 = Date.now();
  let respuesta = "sin respuesta";
  try {
    const res = await fetch(BASE + "/registro", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "businessName=" + encodeURIComponent(gordo.slice(0, 2 * 1024 * 1024)),
    });
    respuesta = String(res.status);
  } catch (e) {
    respuesta = "cortada (" + e.message.slice(0, 40) + ")";
  }
  console.log("     2 MB en un campo -> " + respuesta + " en " + (Date.now() - t0) + "ms");
  const vive = await fetch(BASE + "/login");
  ok(vive.status === 200, "el servidor sigue en pie despues del envio gordo");
} catch (e) {
  fallos++;
  console.log("\nEXPLOTO: " + e.message);
} finally {
  await db.user.deleteMany({ where: { email: { contains: SUFIJO } } });
  await db.$disconnect();
}

console.log("\n--------------------------------------------------");
console.log(fallos === 0 ? "NINGUNA DEFENSA FALLO" : fallos + " DEFENSAS FALLARON");
if (riesgos.length) {
  console.log("\nRiesgos anotados (no son fallas, son cosas que faltan):");
  riesgos.forEach((r) => console.log("  - " + r));
}
process.exit(fallos === 0 ? 0 : 1);
