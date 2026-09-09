# TODO EN UNO

Aplicación web para **barbería, restaurante, comidas rápidas y tienda de ropa**. Cada dueño tiene su propio
usuario y su propio espacio de trabajo: registra sus ventas del día, sus gastos, cierra su caja
y administra su propio catálogo de productos o servicios. **Los datos de un negocio nunca se
cruzan con los de otro.**

Hecha con Next.js 15 (App Router), Prisma y PostgreSQL. Lista para desplegar en Vercel y
totalmente responsive (celular, tablet y computador).

---

## Qué hace cada apartado

### Barbería

- Los clientes separan turno desde un enlace público propio: `/reservar/tu-negocio`.
- **Separar turno es solo de la barbería.** `/reservar/...` de otro tipo de negocio responde 404 (la
  tienda de ropa se va a su catálogo), y la acción pública de reserva rechaza cualquier intento que
  no venga de una barbería, aunque le cambien el negocio al formulario.
- Horario configurable, por defecto **lunes a sábado de 9:00 am a 8:00 pm** en bloques de 30 minutos.
- Una hora ocupada desaparece para los demás clientes, así no se cruzan dos turnos.
- El barbero ve la agenda del día con la hora, el nombre del cliente, el teléfono, el corte que
  pidió y la nota que dejó.
- Contadores del día: cupos separados, cuántos faltan por atender, cortes atendidos y plata cobrada.
- Botón **cerrar venta** en cada turno: marca el turno como atendido y registra la plata con su
  método de pago.
- También puede agregar turnos a mano para el cliente que llega sin reservar.

### Barbería con varios barberos

- El dueño agrega barberos desde **Barberos** y le da a cada uno su propio correo y contraseña.
  Entran por la misma pantalla de ingreso, al mismo negocio.
- Cada barbero tiene su color, su porcentaje de comisión y se puede activar o desactivar.
- La agenda del día se ve en columnas, una por barbero: dos pueden atender a la misma hora sin
  chocar, y se puede filtrar la agenda por barbero.
- En el enlace público el cliente elige **con quién** se quiere atender, o deja "el que esté
  libre" y la aplicación le asigna uno que tenga ese cupo libre.
- Cada turno y cada venta queda a nombre de quien atendió. Un turno se puede pasar a otro barbero
  y su venta se mueve con él.
- **Reportes** trae una tabla por barbero: turnos separados, atendidos, no asistió, ventas,
  vendido, ticket promedio y comisión.
- Qué ve el barbero: la agenda completa, las ventas, los gastos, la caja, el catálogo y los
  reportes de la barbería. Qué no ve: Personalizar, Avisos y la página de Barberos. En Ajustes
  solo cambia su propia contraseña.

### Restaurante y comidas rápidas

- Cuentas abiertas por mesa, domicilio o mostrador.
- Se le cargan productos del catálogo con un toque, se ajustan cantidades y se aplica descuento.
- **Cerrar cuenta** convierte la cuenta en venta del día con su método de pago.
- Venta directa sin abrir cuenta, para el mostrador rápido.

### Tienda de ropa

Pensado para el local que vende por talla y color y necesita saber qué le queda.

- **Inventario por talla y color.** Cada prenda tiene sus variantes (S / Negro, 32 / Azul, Única…)
  con su propio stock, su mínimo, su costo y, si hace falta, su propio precio. Se crean en lote:
  escribes `S, M, L, XL` y los colores, y quedan todas de una vez.
- **Movimientos con motivo.** Entrada cuando llega mercancía, salida cuando se daña o se regala, y
  conteo físico cuando cuentas y no cuadra (escribes cuántas contaste, no la diferencia). Todo queda
  en un historial que dice quién movió qué, cuándo y por qué. Los botones `+` y `−` mueven una unidad
  sin abrir formulario.
- **La venta descuenta el stock sola.** Al vender eliges la prenda y la talla; la venta y el descuento
  van en la misma transacción, así que o quedan los dos o ninguno. Si borras la venta, las prendas
  vuelven al inventario. No se puede vender más de lo que hay.
- **Código de barras.** Cada talla puede llevar el código de su etiqueta, y no se permite repetirlo
  dentro del negocio (si no, escanear no sabría cuál es cuál). Se escanea de dos formas:
  - **Con la cámara del celular**, desde el botón *Escanear*. Usa el lector nativo del navegador
    cuando existe (Android) y, cuando no (iPhone), carga la librería solo en ese momento.
  - **Con pistola lectora USB o Bluetooth**: se dispara sobre la página de inventario y busca sola,
    sin tocar nada. Esos lectores escriben como un teclado, y se reconocen por la velocidad.
  - Al escanear, el inventario deja esa talla filtrada **y ya elegida en *Mover stock***, así que
    cargar o descontar es un solo toque más. Si la etiqueta está rota, se escribe el código a mano.
- **Avisos de bajo stock** en el resumen del día y en el inventario, con filtros de *por acabarse* y
  *agotadas*.
- **Fotos de las prendas.** Se suben desde el celular con vista previa, se achican solas y se ven en
  el inventario, al vender y en el catálogo público.
- **Catálogo público** en `/catalogo/<tu-negocio>`: foto, precio, tallas disponibles y un botón que
  abre WhatsApp con el mensaje escrito. Solo salen las prendas que marques para el catálogo.
- **Empleados con su propio usuario.** Entran con su correo, venden, ven el inventario y los reportes,
  pero no tocan la configuración ni el equipo. Cada venta queda a nombre de quien la hizo, con su
  comisión.
- **Estadísticas de la tienda** en Reportes: facturado, costo de la mercancía vendida, utilidad bruta
  y margen, precio promedio por prenda, tallas que más salen, categorías que más facturan y la
  medición por empleado.

### Facturas en PDF

Desde **Ventas**, cada venta tiene un botón *Factura* que arma el PDF en el mismo navegador (no pasa
por el servidor ni queda guardado en ninguna parte):

- **Desde el celular** abre el menú de compartir con el PDF ya adjunto, que es como se manda por
  WhatsApp o por Gmail.
- **Desde el computador** descarga el PDF y abre el chat de WhatsApp o el correo de Gmail con el
  resumen ya escrito, para adjuntarlo.
- También se puede solo descargar.

La factura lleva el logo y los datos del negocio, el número, la fecha, el cliente, quién atendió, el
detalle con talla y cantidad, el total y la forma de pago.

### Los cuatro negocios comparten

- **Ventas del día** con carrito rápido, método de pago y detalle por producto.
- **Gastos del día** por categoría, con el reparto en porcentaje.
- **Cierre de caja**: base inicial, total por efectivo, tarjeta y transferencia, gastos, neto del
  día y la diferencia frente al efectivo contado a mano. Se puede reabrir si algo quedó mal.
- **Catálogo propio**: agregar, editar, activar, desactivar y borrar sus productos o servicios,
  con precio, costo, categoría y duración.
- **Reportes** por rango de fechas: día por día, ganancia, totales por método de pago y lo más vendido.
- **Ajustes**: nombre, teléfono, dirección, moneda, zona horaria, horario de atención, días que
  atiende y cambio de contraseña.

### Personalizar (apartado propio de cada negocio)

Cada dueño le pone la cara de su marca a **su** aplicación, sin tocar la de los demás:

- **Color de marca**: doce colores listos o el que quiera con el selector. Ese color repinta
  botones, enlaces, resaltados y gráficas de todo su panel y de su página pública.
- **Tema claro u oscuro**.
- **Logo propio**: sube PNG, JPG, WEBP o SVG. La imagen se achica sola en el navegador y se sirve
  como archivo cacheado, no incrustada en cada página. Si no sube ninguno se usan las iniciales.
- **Frase de la página pública**, debajo del nombre del negocio.
- **Vista previa en vivo** que usa exactamente los mismos colores que la aplicación real.

### Avisos por WhatsApp

Cuando un cliente separa un turno, al dueño le llega el aviso con la hora, el nombre, el teléfono,
el servicio y la nota. El número que recibe los mensajes se configura en Personalizar. Hay tres
formas de enviarlo:

| Modo | Qué necesita | Cómo funciona |
| --- | --- | --- |
| Solo enlace | Nada | Al terminar la reserva, el cliente ve un botón que abre WhatsApp con el mensaje ya escrito para el negocio. |
| Automático gratis | Una clave de CallMeBot, se pide una sola vez | La aplicación manda el aviso sola. |
| WhatsApp Business oficial | Token y número de Meta | Envío por la API oficial. |

Todo queda registrado en la sección **Avisos**, con el estado de cada mensaje y un botón para
reenviarlo a mano si algo falló. Desde la agenda también hay un botón para escribirle al cliente
por WhatsApp con la confirmación ya redactada.

---

## Cómo se garantiza que un usuario no vea ni edite lo de otro

1. La sesión va en una cookie `httpOnly` firmada con JWT (HS256). No se puede editar desde el navegador.
2. Un middleware bloquea todo `/panel/*` sin sesión válida.
3. **Toda** consulta y toda escritura filtra por el `userId` de la sesión. Por ejemplo, editar un
   producto usa `updateMany({ where: { id, userId } })`, así que un id ajeno simplemente no
   coincide y no se toca nada.
4. Las páginas de detalle usan `findFirst({ where: { id, userId } })` y devuelven 404 si el
   registro es de otro negocio.
5. Los barberos con usuario propio pertenecen a un solo negocio: su sesión guarda el negocio y la
   persona, y todas las consultas siguen filtrando por el `userId` del negocio. Si al barbero le
   quitan el acceso o lo desactivan, su sesión deja de valer en la siguiente petición.
6. Lo que es configuración (Ajustes del negocio, Personalizar, Avisos y Barberos) está protegido
   en la página **y** en la acción del servidor, así que no basta con adivinar la dirección.

---

## Instalación local

```bash
npm install
```

Copia `.env.example` a `.env`. Si tienes Docker, la base de datos de pruebas se levanta sola:

```bash
npm run db:up          # PostgreSQL en el puerto 55432
npx prisma migrate deploy
npm run seed           # datos de ejemplo (opcional)
npm run dev
```

Si prefieres una base en la nube, pon su cadena de conexión en `DATABASE_URL` y sáltate
`npm run db:up`.

Genera el secreto de sesión con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Abre http://localhost:3000 y crea tu cuenta en **Crear cuenta**.

### Cuentas de ejemplo

`npm run seed` crea tres cuentas, todas con la contraseña `demo1234`:

| Correo | Negocio |
| --- | --- |
| barberia@demo.com | Barbería El Estilo |
| restaurante@demo.com | Restaurante Doña Rosa |
| rapidas@demo.com | Comidas Rápidas El Punto |
| barbero@demo.com | Segundo barbero de Barbería El Estilo (Andrés López) |

La página pública de reservas de la barbería de ejemplo queda en
`/reservar/barberia-el-estilo`.

Para apagar la base de datos local: `npm run db:down`.

## Desplegar en Vercel

### 1. Crear la base de datos

Entra a [neon.com](https://neon.com), crea una cuenta gratis y un proyecto. Copia la cadena de
conexion.

> **Importante:** usa la cadena **directa**, la que **no** lleva `-pooler` en el servidor. Con la
> agrupada las migraciones pueden fallar durante el despliegue.

Se ve asi:

```
postgresql://usuario:clave@ep-algo-123456.us-east-2.aws.neon.tech/neondb?sslmode=require
```

### 2. Generar la clave de sesion

En tu computador:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Guarda esa cadena larga. Firma las sesiones, asi que no la compartas con nadie.

### 3. Importar el proyecto

1. Entra a [vercel.com](https://vercel.com) y crea la cuenta con tu GitHub.
2. Toca **Add New** y luego **Project**.
3. Elige el repositorio de esta aplicacion y toca **Import**.
4. Antes de desplegar, abre **Environment Variables** y agrega estas dos:

   | Nombre | Valor |
   | --- | --- |
   | `DATABASE_URL` | La cadena directa de Neon del paso 1 |
   | `AUTH_SECRET` | La cadena larga del paso 2 |

5. Toca **Deploy** y espera unos minutos.

No hay que tocar nada mas. El comando de compilacion ya crea las tablas solo:

```
prisma generate && prisma migrate deploy && next build
```

### 4. Crear las cuentas

Entra a tu dominio, por ejemplo `https://tu-proyecto.vercel.app`, y toca **Crear cuenta**. Crea
una cuenta por cada negocio con su propio correo. Cada uno entra solo a lo suyo.

Despues, en **Personalizar**, cada dueno pone su color, su logo y el numero de WhatsApp que
recibe los avisos.

> El enlace publico de reservas de la barberia queda en
> `https://tu-proyecto.vercel.app/reservar/tu-negocio`. Ese enlace se comparte por WhatsApp y el
> cliente no necesita crear cuenta.

### Actualizaciones

Cada vez que subas cambios a GitHub, Vercel despliega solo. Las migraciones nuevas de la base de
datos tambien se aplican solas.

---

## Estructura

```
prisma/
  schema.prisma        Modelo de datos
  migrations/          Migraciones de PostgreSQL
  seed.ts              Datos de ejemplo
src/
  actions/             Server Actions: auth, catálogo, turnos, cuentas, ventas, gastos, caja,
                       ajustes, marca y avisos
  app/
    page.tsx           Presentación
    login, registro    Acceso
    panel/             Panel privado de cada negocio (incluye personalizar y avisos)
    reservar/[slug]/   Página pública de reservas (solo barbería)
    catalogo/[slug]/   Catálogo público con fotos (solo tienda de ropa)
    logo/[slug]/       Sirve el logo del negocio como imagen cacheada
  components/          Interfaz reutilizable
  lib/                 Sesión, fechas, dinero, horarios, consultas, equipo, temas y WhatsApp
  middleware.ts        Protección de rutas
```

## Pruebas hechas

La aplicación se probó de punta a punta en un navegador real (Microsoft Edge, en vista de
escritorio y de celular) contra la compilación de producción y una base PostgreSQL real.
Las 71 comprobaciones pasan, más 8 de la subida de logo: ingreso y registro, reserva de turno por
el cliente, bloqueo de la hora ya tomada, rechazo de horas fuera del horario y del domingo,
cierre de venta del turno, venta directa, gastos, cierre de caja con su diferencia, cuenta por
mesa con descuento, edición del catálogo, reportes, aviso de WhatsApp al reservar, cambio de
color y tema, subida y borrado del logo, navegación en celular, cierre de sesión y, sobre todo,
que un negocio no alcance los datos ni la marca de otro.

El equipo de barberos se probó igual, en Edge contra la compilación de producción: alta de un
barbero con su usuario, ingreso del barbero, menú recortado y redirección al resumen cuando
intenta entrar a Barberos, Personalizar o Avisos, agenda en columnas con los dos barberos,
reserva del cliente eligiendo barbero, cierre de venta a nombre del barbero, paso de un turno a
otro barbero con su venta incluida, y la tabla de medición por barbero en Reportes.

### Instructivo y soporte

- **Instructivo de bienvenida.** La primera vez que entra cada persona (dueño o empleado) aparece
  una guía de seis pasos, distinta según el negocio. Se puede **omitir** en cualquier momento, y
  omitir cuenta igual que terminar: no se vuelve a poner encima. Desde **Soporte** se puede volver
  a abrir cuando se quiera. La marca va en `Staff.tourDoneAt`, por persona y no por negocio.
- **Soporte técnico** en `/panel/soporte`, con el WhatsApp directo. El mensaje sale ya escrito con
  el nombre del negocio y de quien escribe, y hay seis motivos frecuentes que lo redactan solos.
  El número vive en un único sitio: `src/lib/support.ts`.

### Para el dueño

- **Exportar a Excel** desde Reportes: ventas (una fila por línea de venta), gastos, inventario
  valorizado y movimientos de stock. Sale en CSV con `sep=;` y marca UTF-8, que es lo que hace que
  Excel en español lo abra en columnas y con las tildes bien.
- **Comparativas.** Cada rango se compara con el anterior del mismo largo y pegado a él: si miras
  los últimos 7 días, se compara con los 7 anteriores. Sube o baja en porcentaje, y en gastos subir
  se pinta en rojo, no en verde.
- **Proveedores** (tienda de ropa): a quién le compras cada prenda, cuánto llevas comprado, cuándo
  fue la última vez y a cómo te sale cada prenda. Se llena solo: cada prenda dice a quién se le
  compra, y cada **entrada** de inventario guarda el proveedor y el costo.

## El estilo

Cada negocio elige su propio color, así que la personalidad **no puede venir del color**: viene de
la tipografía, la forma y la estructura, que sí son iguales para todos.

- **Tipografía propia.** Archivo para el texto y Archivo Black para títulos y plata, servidas por
  `next/font` desde el mismo dominio (sin pedirle nada a Google en producción). Toda la plata va con
  números tabulares, así que las columnas de pesos alinean.
- **Bloques, no cajas flotando.** Borde de 2px (`border-edge`, un token que el motor de temas genera
  junto al resto de la paleta) y sombra dura desplazada. La sombra se reserva para lo que se toca o
  se mira primero — las cifras del día y los botones — porque si todo flotara no destacaría nada.
- **Los botones se hunden.** Al presionar se mueven hacia su sombra y la sombra desaparece.
- **La cifra manda.** Cada `Stat` va en la negra a 32px con una raya de color debajo, para leerla
  desde el otro lado del mostrador.

Casi todo esto vive en `globals.css` y `tailwind.config.ts`, así que las pantallas que no se tocaron
heredan el estilo solas.

## Notas técnicas

- El dinero se guarda en enteros (pesos, sin centavos) para evitar errores de redondeo. La moneda
  se elige en Ajustes.
- Las fechas del negocio se guardan como texto `YYYY-MM-DD` calculado en la zona horaria del
  negocio, así el corte del día nunca se corre por UTC.
- Los formularios también funcionan con JavaScript desactivado (mejora progresiva).
- El tema se genera a partir de un solo color: `src/lib/theme.ts` deriva toda la paleta y la
  escribe como variables CSS, así que cambiar el color de marca repinta la aplicación entera sin
  recompilar nada.
- El aviso de WhatsApp nunca puede tumbar una reserva: se envía con tiempo límite y, si falla,
  el turno queda guardado igual y el error se anota en el historial.
- Un turno tiene índice único por negocio, día y hora, de modo que dos clientes no pueden quedarse
  con el mismo cupo aunque envíen al mismo tiempo.
