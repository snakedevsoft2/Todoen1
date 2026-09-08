# TODO EN UNO

Aplicación web para **barbería, restaurante y comidas rápidas**. Cada dueño tiene su propio
usuario y su propio espacio de trabajo: registra sus ventas del día, sus gastos, cierra su caja
y administra su propio catálogo de productos o servicios. **Los datos de un negocio nunca se
cruzan con los de otro.**

Hecha con Next.js 15 (App Router), Prisma y PostgreSQL. Lista para desplegar en Vercel y
totalmente responsive (celular, tablet y computador).

---

## Qué hace cada apartado

### Barbería

- Los clientes separan turno desde un enlace público propio: `/reservar/tu-negocio`.
- Horario configurable, por defecto **lunes a sábado de 9:00 am a 8:00 pm** en bloques de 30 minutos.
- Una hora ocupada desaparece para los demás clientes, así no se cruzan dos turnos.
- El barbero ve la agenda del día con la hora, el nombre del cliente, el teléfono, el corte que
  pidió y la nota que dejó.
- Contadores del día: cupos separados, cuántos faltan por atender, cortes atendidos y plata cobrada.
- Botón **cerrar venta** en cada turno: marca el turno como atendido y registra la plata con su
  método de pago.
- También puede agregar turnos a mano para el cliente que llega sin reservar.

### Restaurante y comidas rápidas

- Cuentas abiertas por mesa, domicilio o mostrador.
- Se le cargan productos del catálogo con un toque, se ajustan cantidades y se aplica descuento.
- **Cerrar cuenta** convierte la cuenta en venta del día con su método de pago.
- Venta directa sin abrir cuenta, para el mostrador rápido.

### Los tres negocios comparten

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
  migrations/          Migración inicial de PostgreSQL
  seed.ts              Datos de ejemplo
src/
  actions/             Server Actions: auth, catálogo, turnos, cuentas, ventas, gastos, caja,
                       ajustes, marca y avisos
  app/
    page.tsx           Presentación
    login, registro    Acceso
    panel/             Panel privado de cada negocio (incluye personalizar y avisos)
    reservar/[slug]/   Página pública de reservas
    logo/[slug]/       Sirve el logo del negocio como imagen cacheada
  components/          Interfaz reutilizable
  lib/                 Sesión, fechas, dinero, horarios, consultas, temas y WhatsApp
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
