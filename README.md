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

1. Consigue una base de datos PostgreSQL. Sirve el plan gratuito de **Neon**, **Supabase** o
   **Vercel Postgres**. Copia la cadena de conexión.
2. Sube este proyecto a GitHub e impórtalo en Vercel.
3. En Vercel, en **Settings → Environment Variables**, agrega:
   - `DATABASE_URL` con la cadena de conexión.
   - `AUTH_SECRET` con una cadena larga y aleatoria.
4. Despliega. El comando de build ya corre `prisma generate`, aplica las migraciones y compila:

   ```
   prisma generate && prisma migrate deploy && next build
   ```

   No hay que ejecutar migraciones a mano: la primera vez que despliegues, Vercel crea las tablas.

5. Entra a tu dominio y crea la cuenta de cada negocio. Cada uno entra con su propio correo.

> El enlace público de reservas de la barbería queda en
> `https://tu-dominio.vercel.app/reservar/tu-negocio`. Ese enlace se comparte por WhatsApp y no
> necesita que el cliente cree cuenta.

---

## Estructura

```
prisma/
  schema.prisma        Modelo de datos
  migrations/          Migración inicial de PostgreSQL
  seed.ts              Datos de ejemplo
src/
  actions/             Server Actions: auth, catálogo, turnos, cuentas, ventas, gastos, caja, ajustes
  app/
    page.tsx           Presentación
    login, registro    Acceso
    panel/             Panel privado de cada negocio
    reservar/[slug]/   Página pública de reservas
  components/          Interfaz reutilizable
  lib/                 Sesión, fechas, dinero, horarios, consultas
  middleware.ts        Protección de rutas
```

## Pruebas hechas

La aplicación se probó de punta a punta en un navegador real (Microsoft Edge, en vista de
escritorio y de celular) contra la compilación de producción y una base PostgreSQL real.
Las 54 comprobaciones pasan: ingreso y registro, reserva de turno por el cliente, bloqueo de la
hora ya tomada, rechazo de horas fuera del horario y del domingo, cierre de venta del turno,
venta directa, gastos, cierre de caja con su diferencia, cuenta por mesa con descuento, edición
del catálogo, reportes, navegación en celular, cierre de sesión y, sobre todo, que un negocio no
alcance los datos de otro.

## Notas técnicas

- El dinero se guarda en enteros (pesos, sin centavos) para evitar errores de redondeo. La moneda
  se elige en Ajustes.
- Las fechas del negocio se guardan como texto `YYYY-MM-DD` calculado en la zona horaria del
  negocio, así el corte del día nunca se corre por UTC.
- Los formularios también funcionan con JavaScript desactivado (mejora progresiva).
- Un turno tiene índice único por negocio, día y hora, de modo que dos clientes no pueden quedarse
  con el mismo cupo aunque envíen al mismo tiempo.
