# Todoen1 — prompt completo de la aplicación

Este documento describe la aplicación entera. Sirve para tres cosas:

1. Explicársela a alguien (un socio, un cliente, otro desarrollador).
2. Dárselo a una IA para que la reconstruya o la continúe sin perder el rumbo.
3. Que tú mismo no te desvíes cuando agregues cosas nuevas.

Está escrito en presente y describe lo que **ya existe**, no lo que se planea.

---

## 1. Qué es

**Todoen1** es una aplicación web para que dueños de negocios pequeños y medianos en Colombia
manejen su negocio completo desde el celular: ventas, inventario, clientes, cartera y caja.

Una sola aplicación desplegada sirve a **muchos negocios distintos**, cada uno con su cuenta y sus
datos completamente separados.

**Frase que la resume:** *Todo tu negocio. En un solo lugar.*

---

## 2. La regla que manda sobre todas

**Un negocio nunca puede ver ni tocar los datos de otro.**

No es un detalle técnico, es el requisito central. Toda consulta y toda escritura filtra por el
`userId` de la sesión, nunca solo por el id del registro. Cuando un modelo cuelga de otro
(por ejemplo una talla que cuelga de un producto), igual lleva su propio `userId` para poder filtrar
directo sin pasar por el padre.

En la práctica, cada `where` de Prisma lleva `userId: user.id`. Un `updateMany` con `userId` en el
`where` es preferible a un `update` por id, porque si el id no es de ese negocio no actualiza nada en
vez de actualizar lo ajeno.

---

## 3. Los cuatro tipos de negocio

La misma aplicación cambia de cara según qué vende el negocio. El tipo se elige al registrarse y
define el menú, el vocabulario y las pantallas disponibles.

| Tipo | Qué hace distinto |
|---|---|
| **Barbería** | Agenda por hora. El cliente separa su turno desde un enlace público. Barberos con su propio usuario y comisión. |
| **Restaurante** | Cuentas abiertas por mesa. Se cargan platos y se cierra la cuenta cuando pagan. |
| **Comidas rápidas** | Igual que restaurante, pero pensado para venta al mostrador. |
| **Tienda de ropa** | Inventario por talla y color, código de barras, proveedores, empleados con comisión. |

Los cuatro comparten: ventas, gastos, cartera, cierre de caja, catálogo, reportes, portafolio
público, asistente y soporte.

El vocabulario cambia solo: la barbería tiene *cortes y servicios*, el restaurante *platos y
productos*, la ropa *prendas*. Eso vive en `ITEM_NOUN` (`src/lib/nav.ts`).

---

## 4. Quién usa la aplicación

- **Dueño** — ve todo, configura todo.
- **Empleado** (barbero o vendedor, según el negocio) — entra con su propio correo y contraseña, ve
  el movimiento del negocio y vende, pero **no** puede entrar a Personalizar, Avisos, Empleados,
  Proveedores ni Mi portafolio.
- **Cliente final** — no tiene cuenta. Solo ve las páginas públicas: el portafolio y, si es barbería,
  la agenda de reservas.

El dueño también es una fila de `Staff`, para poder medirlo igual que a los demás.

---

## 5. Qué hace cada apartado

### Resumen del día
Ventas, gastos, lo que queda limpio, desglose por método de pago. Según el negocio: turnos de hoy,
cuentas abiertas o tallas por acabarse. Últimas ventas y gastos del día.

### Ventas
Carrito rápido: se toca lo que se vendió, se elige método de pago y listo. En ropa se elige la talla
y **se descuenta el stock en la misma transacción**. Cada venta puede generar una **factura en PDF**
que se manda por WhatsApp o correo.

### Gastos
Lo que sale de la caja, por categoría, con el reparto en porcentaje.

### Cartera
Lo que le deben al negocio: quién debe, cuánto, desde cuándo y próximo vencimiento. Cobro por
WhatsApp con el mensaje ya escrito, historial de abonos y **comprobante en PDF** de cada uno.

> **Regla contable:** al anotar la deuda se pregunta si esa venta ya se registró. Si **no** se
> registró, cada abono entra como venta del día en que se recibe. Si **sí** se registró, el abono
> solo baja el saldo. Nunca se cuenta la misma plata dos veces.

### Cierre de caja
Base inicial, total por método de pago, gastos, neto del día y la diferencia contra el efectivo
contado a mano.

### Productos y servicios
El catálogo del negocio: nombre, precio, costo, categoría, foto y si aparece en el portafolio. En
ropa además: marca, proveedor, y las tallas con su stock.

### Inventario (solo ropa)
Stock por talla y color. Entradas, salidas y conteo físico, cada uno con su motivo, en un historial
que nunca se edita. Alertas de bajo stock. **Escáner de código de barras** con la cámara o con
pistola lectora.

### Proveedores (solo ropa)
A quién se le compra cada prenda, cuánto se lleva comprado, cuándo fue la última vez y a cómo sale
cada prenda. Se llena solo con las entradas de inventario.

### Turnos (solo barbería)
Agenda por barbero. El cliente separa desde el enlace público. Recordatorios de los turnos de mañana
por WhatsApp, si el cliente los pidió al reservar.

### Cuentas abiertas (restaurante y comidas rápidas)
Una cuenta por mesa o domicilio. Se cargan productos y al cerrarla se vuelve venta del día.

### Empleados (barbería y ropa)
Personas con su propio usuario, color y comisión. Cada venta queda a nombre de quien la hizo.

### Reportes
Por rango de fechas: día por día, ganancia, totales por método de pago, lo más vendido, medición por
persona, **comparación con el periodo anterior** y **exportación a Excel** (CSV) de ventas, gastos,
inventario y movimientos.

### Mi portafolio
La página pública del negocio. Portada, titular, presentación, precios visibles o no, y un
interruptor para publicarla. Con **vista previa en vivo** dentro de un celular y **código QR** para
imprimir.

### Asistente
Chat con IA que ve las cifras reales del negocio y responde cómo va, qué reponer o cómo se hace algo
en la aplicación.

### Personalizar
Logo, color de marca (repinta toda la aplicación), tema claro u oscuro y frase corta.

### Avisos
Configuración de los avisos por WhatsApp cuando un cliente separa turno.

### Ajustes
Nombre, teléfono, dirección, moneda, zona horaria, horario, enlace público y contraseña.

### Soporte
WhatsApp directo con el mensaje ya escrito, motivos frecuentes y el instructivo de bienvenida.

---

## 6. Las páginas públicas

| Ruta | Qué es | Quién |
|---|---|---|
| `/catalogo/<slug>` | Portafolio: fotos, precios y **pedido por WhatsApp** | Los cuatro negocios |
| `/reservar/<slug>` | Agenda para separar turno | **Solo barbería** |
| `/qr/<slug>` | Código QR del portafolio, en SVG | Los cuatro |

Separar turno es **solo de la barbería**. La comprobación está en la página *y* en la acción del
servidor, porque el servicio es opcional y sin esa segunda barrera se podría crear un turno
"por definir" en un restaurante.

El dueño puede ver su portafolio completo **antes de lanzarlo**, con una franja que dice que solo él
lo ve.

---

## 7. Modelo de datos

```
User          El negocio. Un usuario = un negocio = un espacio aislado.
Staff         Quien atiende. El dueño también es un Staff.
Service       Lo que vende el negocio (corte, plato, prenda).
ProductVariant  Talla y color con su propio stock. Lleva userId propio.
StockMove     Cada movimiento de stock, con motivo. Nunca se edita.
Supplier      A quién se le compra.
Appointment   Turno reservado (barbería).
Order         Cuenta abierta (restaurante y comidas rápidas).
OrderItem     Línea de una cuenta.
Sale          Venta cerrada. Fuente de verdad del dinero del día.
SaleItem      Línea de una venta, con talla si aplica.
Expense       Gasto del día.
CashClosure   Cierre de caja del día.
Debt          Deuda de un cliente.
DebtPayment   Abono sobre una deuda.
Notification  Historial de avisos por WhatsApp.
```

Enums: `BusinessType`, `StaffRole`, `AppointmentStatus`, `OrderStatus`, `PaymentMethod`,
`SaleOrigin`, `DebtStatus`, `StockMoveType`, `NotificationStatus`.

---

## 8. Cómo se ve

Hay **dos lenguajes visuales** a propósito, y no es un descuido.

**El panel: bloque, con carácter fuerte.** Se usa a diario y se lee de lejos, desde el otro lado del
mostrador.

- Borde de 2px (`border-edge`) y sombra dura desplazada.
- La sombra se reserva para lo que se toca o se mira primero: las cifras del día y los botones. Si
  todo flotara, no destacaría nada.
- Al presionar, el botón se mueve hacia su sombra y la sombra desaparece.
- Tipografía **Archivo** para texto y **Archivo Black** para títulos y plata, servidas por
  `next/font` desde el mismo dominio.
- Toda la plata va con números tabulares, para que las columnas alineen.
- Cada `Stat` va en la negra a 32px con una raya de color debajo.

**La puerta de entrada: sobria y premium.** Tiene su propio juego de estilos (`.auth-*`), con bordes
de un píxel, sombras que casi no se ven y mucho aire.

**El color lo elige cada negocio.** Por eso la personalidad no puede venir del color: viene de la
tipografía, la forma y la estructura. Un solo color de marca genera toda la paleta (`src/lib/theme.ts`).

---

## 9. Cómo se escribe el código

- **Comentarios que explican el porqué, no el qué.** Si algo se hizo de una forma rara, el comentario
  dice por qué.
- **Nombres en español** en el dominio del negocio; en inglés lo que es del framework.
- **Server Actions** para todo lo que escribe. Cada una empieza con `requireUser()` o
  `requireSession()`.
- **Transacciones** cuando dos cosas tienen que pasar juntas o ninguna: la venta y el descuento de
  stock, el abono y la venta que genera.
- **Degradación limpia:** si falta una credencial (Google, IA, WhatsApp), esa parte no aparece y el
  resto sigue funcionando igual. Nunca una pantalla rota.
- **Nada de enlaces muertos.** Si algo no existe todavía (recuperar contraseña), se lleva a algo que
  sí funciona (soporte) y se dice la verdad.
- **Los mensajes de error hablan como una persona** y dicen qué hacer, no qué falló por dentro.

---

## 10. Lo técnico

- **Next.js 15** (App Router), **React 19**, **Prisma**, **PostgreSQL**, **Tailwind**.
- Sesión propia: JWT firmado con `jose` en una cookie `httpOnly`. Sin librería de autenticación.
- PDFs con `jspdf`, cargado en el momento, en el navegador.
- Códigos de barras y QR con `@zxing/browser` / `@zxing/library`.
- Desplegado en **Vercel**. El `build` corre `prisma migrate deploy`, así que las migraciones se
  aplican solas.

### Variables de entorno

| Variable | Obligatoria | Para qué |
|---|---|---|
| `DATABASE_URL` | Sí | PostgreSQL |
| `AUTH_SECRET` | Sí | Firmar la sesión (mínimo 16 caracteres) |
| `GEMINI_API_KEY` | No | Asistente con IA |
| `GEMINI_MODEL` | No | Cambiar el modelo (por defecto `gemini-2.0-flash`) |
| `GOOGLE_CLIENT_ID` | No | Entrar con Google |
| `GOOGLE_CLIENT_SECRET` | No | Entrar con Google |
| `CRON_SECRET` | No | Proteger los envíos automáticos |

---

## 11. El prompt del asistente

Este es el texto exacto que recibe el modelo, además del resumen de cifras. Vive en
`systemPrompt()` (`src/lib/ai-context.ts`):

```
Eres el asistente de Todoen1, una aplicacion para manejar negocios pequenos en Colombia.
Le hablas al dueno o al empleado de un negocio de tipo: <TIPO>.

COMO RESPONDER
- En espanol de Colombia, claro y directo. Tuteas.
- Corto: maximo 6 frases o una lista de 5 puntos. Nada de parrafos largos.
- Habla como le hablarias a alguien que maneja su negocio, no como un consultor.
- Nada de tecnicismos de contabilidad sin explicarlos.
- No uses tablas ni encabezados. Texto simple y listas con guiones.

DE QUE PUEDES HABLAR
- Como va el negocio, segun las cifras de abajo.
- Que hacer para vender mas, cobrar mejor o cuidar el inventario.
- Como se hace algo dentro de la aplicacion (registrar una venta, cerrar la caja,
  anotar un fiado, cargar inventario, mandar el portafolio, cobrar una deuda).

REGLAS QUE NO PUEDES ROMPER
- Usa SOLO los numeros del resumen. Si te preguntan algo que no esta ahi, dilo:
  "eso no lo tengo a la mano". NUNCA inventes cifras.
- No prometas resultados ni des consejo legal, tributario ni medico.
- Si la pregunta no tiene que ver con el negocio, redirige con amabilidad.

RESUMEN DEL NEGOCIO (datos reales de hoy)
<resumen con las cifras del negocio: ventas de hoy y del mes, comparación con los
30 días anteriores, lo más vendido, inventario, agenda y cartera>
```

Se envía con `temperature: 0.3` y máximo 800 tokens de respuesta.

---

## 12. Lo que todavía no existe

Para que nadie lo dé por hecho:

- Recuperar contraseña por correo (hoy va a soporte por WhatsApp).
- Recordatorios de cita fuera de la barbería.
- El portafolio es **configurable, no un constructor**: no se pueden agregar ni mover secciones.
- Cambios y devoluciones de mercancía.
- Apartados (separar una prenda con abono).
- Imprimir etiquetas con código de barras.
- Instalable como app (PWA) y funcionar sin internet.
