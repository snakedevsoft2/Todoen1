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
- **Promociones al por mayor** en el mismo catálogo: escalas por cantidad (*desde 6 prendas 10%
  menos, desde 12 un 20%*) que el cliente ve de una y que el pedido aplica solo. Ver
  **[Promociones al por mayor](#promociones-al-por-mayor)**.
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
7. Las líneas de una venta y de una cuenta abierta llevan **el dueño escrito en la fila**, no
   heredado del padre. Así el aislamiento no depende de que quien escriba una consulta se
   acuerde de pasar por la venta o por la cuenta.
8. Hay **17 pruebas automáticas** (`npm test`) que crean dos negocios con datos iguales y
   comprueban que ninguno alcanza una sola fila del otro: ni leyendo, ni buscando por id, ni
   editando, ni borrando. Corren contra la base de datos de verdad y limpian lo suyo al terminar.

Las pruebas se probaron rompiendo el aislamiento a mano —insertando una línea de venta con el
dueño equivocado por SQL directo, saltándose la aplicación— y comprobando que fallan. Una prueba
que nunca falla no protege nada.

---

## Panel de la plataforma (`/admin`)

Para el dueño de Todoen1, no para los clientes. Muestra quién se registró, quién sigue entrando y
qué se le puede prender o apagar a cada cuenta.

### Quién entra

Tu correo va en la variable `ADMIN_EMAILS` del `.env` (varios separados por coma):

```
ADMIN_EMAILS="tucorreo@gmail.com"
```

**Va en una variable de entorno y no en una columna de la base a propósito:** así no hay ninguna
pantalla, ninguna acción y ninguna consulta que pueda volver administrador a nadie. Para dar ese
poder hay que entrar al servidor y cambiar la configuración. Si la variable está vacía, no hay
administrador y el panel no existe para nadie — esa es la posición segura.

Quien no sea administrador y escriba `/admin` no ve un "no tienes permiso": vuelve a su panel,
como si la dirección no existiera. En Vercel se pone la variable en **Settings → Environment
Variables**.

### Lo que se ve y lo que NO

| Se ve | No se ve |
|---|---|
| Nombre del negocio, tipo, correo, teléfono | Sus ventas, sus clientes, sus deudores |
| Cuándo se registró y cuándo entró por última vez | Sus precios, sus fotos, su catálogo |
| Cuántas ventas/gastos/productos tiene | **Qué** vendió, a quién y por cuánto |
| Qué apartados abre y cuántos días | Nada de su contenido |

A los clientes se les prometió que nadie ve lo suyo. Un panel de administración no es una excusa
para romper esa promesa: es justo donde más fácil sería romperla sin darse cuenta. Por eso el
límite está escrito en el código y comprobado con pruebas.

### Lo que se puede hacer

- **Apagarle un apartado a una cuenta.** Desaparece de su menú y no lo puede volver a prender
  desde adentro. Tres estados: *De fábrica* (lo que le toca por su oficio), *Apagado*, *Prendido*
  (para estrenarle algo antes que a los demás).
- **Suspender una cuenta.** Nadie de ese negocio puede entrar, ni el dueño ni sus empleados. **No
  borra nada** y se deshace cuando quieras. Pide un motivo y escribir el nombre del negocio, para
  que no pase de un clic distraído. Al cliente se le explica y se le da el WhatsApp de soporte.
- **Quitarle el acceso a una persona** dentro de una cuenta, sin tocar el resto del negocio.

**Ni el administrador puede saltarse la regla de los oficios:** no se le puede dar la agenda por
hora a un restaurante desde aquí. Tampoco se pueden apagar Resumen, Ajustes ni Soporte, ni
suspender tu propia cuenta.

### Cómo se comprueba

- `npm test` — 28 pruebas, 11 de ellas del panel: que apagarle algo a una cuenta no toque a las
  demás, que el interruptor del administrador mande sobre el del cliente, y que suspender no borre
  nada.
- `npm run verificar:admin` — recorre el panel en un navegador de verdad (necesita `npm start`
  corriendo): que un cliente cualquiera no alcance `/admin` ni la ficha de otro negocio, que una
  cuenta suspendida quede por fuera y que su sesión abierta se caiga.

---

## El menú lo arma cada persona

La aplicación tiene veinte apartados porque sirve para negocios muy distintos. Nadie los necesita
todos, así que **el menú no es fijo**.

- **El catálogo vive en la base de datos** (`Module`, `BusinessTypeModule`), no en el código. De
  ahí salen el menú, el configurador y la guía, así que los tres no pueden desfasarse entre sí.
- **Si un oficio no tiene fila para un apartado, ese apartado no existe para él.** Ni apagado. Es
  la razón por la que la agenda por hora es de barbería (y de servicios) y no puede aparecerse en
  un restaurante por un descuido de código.
- **Cada persona arma el suyo**, no el negocio: al dueño le sirven reportes y proveedores, y al
  que solo vende le estorban. Se guarda en `WorkspaceConfig`.
- **Apagar no borra.** El apartado sigue funcionando si se entra por su dirección; solo deja de
  ocupar un renglón.
- Lo que se estrene después aparece solo al final, en vez de quedar invisible para siempre.

De fábrica, una tienda de ropa ve 13 apartados; con el arreglo **Lo esencial** quedan 7.

### "Otro negocio"

El quinto tipo, para el que no encaja en los otros cuatro: una ferretería, una papelería, un
taller, una veterinaria.

Va **al revés que los demás**: en los otros se entrega poco de fábrica y la persona prende lo que
le falte. Aquí no podemos adivinar el oficio, así que se le entrega casi todo —inventario,
catálogo, ventas, gastos, caja, portafolio, reportes, equipo— y el primer paso del instructivo es
justamente **apagar lo que le sobre**. Cartera, cuentas abiertas, proveedores, avisos y el
asistente le quedan disponibles pero apagados.

Lo único que **no** lleva es la agenda por hora: esa sigue siendo de barbería.

Su catálogo arranca con dos productos llamados *"(cámbiame)"*, para que se vea de una que hay que
reemplazarlos, en vez de inventarle platos o cortes que no tienen nada que ver con lo suyo.

### Las tres capas del instructivo

1. **Asistente de bienvenida** (`/panel/bienvenida`) — cuatro pasos la primera vez: qué es esto,
   qué necesitas ver, ajusta tu menú, tu primer paso. Tiene *Saltar por ahora* en todos los pasos
   y **retoma donde se dejó** si se sale a mitad.
2. **Instructivo** — el recorrido pantalla por pantalla, después de armar el menú.
3. **Guía** (`/panel/guia`) — buscador para una duda suelta. Entiende cómo habla la gente: buscar
   *fiado* encuentra Cartera, que en ninguna parte dice "fiado". No exige tildes.

Las tres se pueden volver a abrir desde **Soporte**.

### Qué se mide y qué no

Se anota **una sola fila por apartado, por persona y por día** (`ModuleEvent`): solo para poder
decir *"llevas dos meses sin abrir Proveedores, ¿lo apagas?"* en vez de adivinar. No se guarda
cuánto tiempo, ni qué se tocó, ni qué se escribió.

---

## Instalación local

```bash
npm install
```

Copia `.env.example` a `.env`. Si tienes Docker, la base de datos de pruebas se levanta sola:

```bash
npm run db:up          # PostgreSQL en el puerto 55432
npx prisma migrate deploy
npm run db:modulos     # el catálogo de apartados (obligatorio: de ahí sale el menú)
npm run seed           # datos de ejemplo (opcional)
npm run dev
```

`npm run db:modulos` se puede correr las veces que sea: actualiza lo que cambió, crea lo nuevo y
borra lo que ya no aplica. En Vercel corre solo dentro de `npm run build`, así que un texto
corregido llega sin tocar la base a mano.

Para correr las pruebas de aislamiento:

```bash
npm test
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

### Si olvidaste tu contraseña

La app no tiene «olvidé mi contraseña», y la que está guardada **no se puede recuperar**: en la
base solo vive su hash de bcrypt, que va en un solo sentido a propósito. Lo que sí se puede es
reemplazarla desde la terminal, con la base prendida:

```bash
node scripts/cambiar-clave.mjs tucorreo@gmail.com "la-clave-nueva"
```

Sirve igual para la cuenta del negocio y para el usuario de un empleado o barbero. Si la recuerdas
y solo quieres cambiarla, se hace en **Ajustes** dentro del panel, que pide la actual.

**El panel de la plataforma (`/admin`) no tiene contraseña propia**: se entra con la cuenta de
siempre, y aparece solo si ese correo está en `ADMIN_EMAILS`. Para dar o quitar ese permiso hay que
tocar la configuración del servidor, no una pantalla.

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

### Portafolio público (los cuatro negocios)

Cada negocio tiene su propia página en `/catalogo/<tu-negocio>`, que se comparte **por enlace o por
QR**. Es lo mismo para la barbería que para la tienda de ropa: cambia lo que se muestra, no la idea.

- **Fotos para todo.** El corte, el plato y la prenda entran igual: cada item lleva su foto, y se
  marca con *Mostrar en mi portafolio*.
- **El cliente arma su pedido** ahí mismo — toca lo que quiere, ajusta cantidades, pone su nombre y
  una nota, y el pedido sale **escrito por WhatsApp**. No se cobra en la página: el negocio confirma
  y cobra como siempre lo ha hecho.
- **Editable** desde `/panel/portafolio`: portada, titular, presentación, nota del pedido, mostrar u
  ocultar los precios, y un interruptor para publicarlo o apagarlo.
- **Vista previa en vivo**, dentro de un marco de celular al lado del formulario. Lo que se escribe
  se ve al instante, sin guardar ni recargar — incluida la portada apenas se sube. En celular se
  alterna con un botón, porque no caben las dos cosas al tiempo.
- **Código QR** generado en el servidor como SVG (`/qr/<tu-negocio>`), para pegar en la vitrina o el
  mostrador. Se imprime del tamaño que sea sin pixelarse. Sale de la misma librería que ya lee los
  códigos de barras, así que no agrega peso.
- La **barbería** además muestra un botón a su agenda, que sigue siendo solo suya.

### Promociones al por mayor

El apartado del catálogo para quien compra en cantidad. Se arma en `/panel/portafolio`, en
**Promociones al por mayor**, y viene **apagado** hasta que el dueño lo encienda.

- **Escalas por cantidad.** Cada escala dice *desde cuántas unidades* arranca y *cuánto se descuenta*
  a cada una (1% a 90%), con un nombre opcional (*media docena*, *paca*). Hasta 6 escalas, y no se
  permiten dos con la misma cantidad: si hubiera un «desde 6 con 10%» y otro «desde 6 con 20%», el
  pedido no sabría cuál cobrar.
- **El descuento es en porcentaje, no en precio fijo.** Así sirve para todo el catálogo de una vez y
  no hay que volver a tocarlo cada vez que sube el precio de una prenda.
- **Se cuentan las unidades del pedido completo**, no las de cada referencia. El mayorista casi
  siempre surte tallas y colores distintos: tres camisas y tres pantalones son seis prendas y le da
  la escala de seis.
- **Al lado de cada escala se ve el precio real.** El panel toma una prenda de verdad de tu catálogo
  y muestra a cómo queda, para que veas que un 40% te come la utilidad **antes** de publicarlo.
- **En el catálogo público** sale un bloque con las escalas arriba de las prendas, un botón *Compro
  al por mayor* en la portada, y debajo del precio de cada prenda el precio de mayorista de entrada.
- **El pedido lo aplica solo.** Apenas el cliente alcanza una escala se le recalcula cada renglón, se
  le muestra el total anterior tachado y cuánto se ahorra. Si todavía no llega, se le dice cuántas
  unidades le faltan para la siguiente. El mensaje de WhatsApp sale con el precio ya descontado: si
  el negocio viera otra cifra distinta a la que vio el cliente, el descuento se volvería una pelea.
- **Condiciones del mayorista**: un texto propio para el pedido mínimo, la forma de pago o los
  despachos a otras ciudades.

Las cuentas viven en [`src/lib/wholesale.ts`](src/lib/wholesale.ts), aparte de la base de datos
porque las usan el servidor y el navegador, y están cubiertas en
[`tests/mayoristas.test.ts`](tests/mayoristas.test.ts).

### Asistente con IA

Un chat en `/panel/asistente` que responde sobre el negocio y sobre cómo se hace algo en la app.

**Para activarlo** hay que poner `GEMINI_API_KEY`. Sin ella el apartado avisa que falta la clave y el
resto de la app sigue igual. Opcionalmente `GEMINI_MODEL` cambia el modelo; por defecto
`gemini-2.0-flash`.

#### Cómo sacar la clave (gratis)

Google AI Studio **no se instala**: es una página web. Solo hay que entrar y copiar una clave.

1. Entra a **https://aistudio.google.com** y inicia sesión con tu cuenta de Google (la misma sirve
   para el login con Google).
2. Acepta los términos si te los pide.
3. En el menú de la izquierda busca **"Get API key"** (o entra directo a
   **https://aistudio.google.com/apikey**).
4. Toca **"Create API key"**. Te va a pedir un proyecto de Google Cloud: si no tienes ninguno, elige
   **"Create API key in new project"** y él lo crea solo. No hay que configurar nada más.
5. Copia la clave. Empieza por `AIza...`. **Cópiala en ese momento**, porque después se muestra
   tapada.

#### Dónde ponerla

**En tu computador**, en el archivo `.env` de la raíz del proyecto:

```
GEMINI_API_KEY=AIza...tu-clave
```

**En Vercel**, en *Settings → Environment Variables*: nombre `GEMINI_API_KEY`, valor la clave, y
márcala para *Production*, *Preview* y *Development*. Después hay que **volver a desplegar** para que
la tome.

#### Sobre el costo

El plan gratuito da un límite de peticiones por minuto y por día que le sobra a un negocio: cada
pregunta del asistente son unos 600 tokens. Si algún día se pasa, la app lo dice con un mensaje
(*"Se acabaron las consultas gratuitas por hoy"*) y no cobra nada ni se rompe.

**No compartas esa clave ni la subas al repositorio.** El `.env` ya está en `.gitignore`. Si se te
escapa, en la misma página de AI Studio la puedes borrar y crear otra.

Lo que lo hace útil no es el modelo, es **el contexto**: antes de cada respuesta se arma un resumen
con las cifras reales del negocio — ventas de hoy y del mes, comparación con los 30 días anteriores,
lo más vendido, inventario con las tallas en rojo, agenda y cartera. Por eso puede decir *"te estás
quedando sin la M"* en vez de *"revisa tu inventario"*. El resumen pesa unos 480 tokens.

Decisiones que importan:

- **El resumen se arma en el servidor**, a partir del negocio de la sesión. El navegador no decide de
  qué negocio son los números.
- **Solo van cifras y nombres de productos.** Nada de datos de clientes: no hacen falta para
  aconsejar y no tienen por qué salir del negocio.
- **La conversación no se guarda.** Viaja completa desde el navegador en cada pregunta y se pierde al
  recargar. Son consejos, no un registro del negocio.
- **`temperature` en 0.3** y una regla dura en el prompt: usar solo los números del resumen y decir
  "eso no lo tengo a la mano" antes que inventar. Un consejo con cifras inventadas hace más daño que
  no dar consejo.
- Nada rompe la pantalla: cuota agotada, clave mala o demora salen como un aviso legible.

### Cartera

Para lo que fiaste y todavía no te han pagado. En `/panel/cartera`.

- **Quién debe, cuánto, desde cuándo y próximo vencimiento.** El estado se calcula solo: al día,
  vence pronto (3 días o menos), vence hoy o vencida hace N días.
- **Cobro por WhatsApp** con el mensaje ya escrito, y el tono cambia según esté vencida o no. Si el
  negocio tiene CallMeBot o Meta, el cobro sale solo desde `/api/recordatorios` — como mucho **uno
  cada 3 días** por deuda, para no acosar al cliente.
- **Historial de pagos** con el saldo que quedaba después de cada abono.
- **Comprobante en PDF** de cada abono, con la cuenta completa, para mandárselo al cliente.

**La decisión que importa: no contar la plata dos veces.** Al anotar la deuda se pregunta si la venta
ya se registró en Ventas:

- Si **no** se registró (el fiado típico: entregaste la mercancía sin cobrar), cada abono entra como
  **venta del día en que lo recibes**, con origen `CARTERA`.
- Si **sí** se registró, los abonos solo bajan el saldo — esa plata ya se contó cuando hiciste la
  venta, y volver a sumarla inflaría la caja.

Borrar un abono deshace también la venta que generó, si la hubo. Una deuda con abonos no se borra: se
anula, para no perder el rastro de la plata que sí entró.

### La pantalla de ingreso

Tiene su propio juego de estilos (`.auth-*` en `globals.css`), aparte del resto de la aplicación. Es
deliberado: el panel es de bloques marcados porque se usa a diario y se lee de lejos; la puerta de
entrada busca lo contrario — sobria, con aire, bordes de un píxel y sombras que casi no se ven.

- **Dos columnas en escritorio.** A la izquierda no hay una ilustración: es un fragmento del panel de
  verdad (métricas, ingresos de la semana, últimos movimientos) conectado con líneas finas. En móvil
  desaparece y manda el formulario.
- **"Recordarme" hace algo de verdad**: sin marcar, la cookie no lleva `maxAge` y el navegador la
  borra al cerrarse. Es lo que se espera en el computador del local, donde entra más de una persona.
- **"¿Olvidaste tu contraseña?"** va al WhatsApp de soporte con el correo ya escrito. Todavía no hay
  recuperación por correo (haría falta un servicio de envío), y un enlace muerto sería peor.

### Ingresar con Google

Además del correo y contraseña, se puede entrar con Google. Está hecho a mano contra el protocolo de
Google (no con una librería de autenticación completa) porque la app ya tiene su propia sesión, y una
librería de esas querría mandar en todo eso.

**Para activarlo hay que crear un cliente OAuth en Google Cloud** y poner dos variables:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

En el cliente OAuth, la URI de redirección autorizada es `https://tu-dominio/auth/google/callback`
(y `http://localhost:3000/auth/google/callback` para probar en local).

Sin esas variables el botón simplemente no aparece y todo lo demás sigue funcionando igual.

Quien entra con Google entra al mismo sitio y con los mismos permisos que entraría con su contraseña:
se busca su correo entre los dueños y entre los empleados. Si el correo no está en ningún negocio, lo
mandamos a crear la cuenta con el correo y el nombre ya puestos, porque para abrir un negocio hacen
falta datos que Google no da.

### Recordatorio de turno para el cliente (barbería)

Al reservar, el cliente decide si quiere que le recuerden su turno por WhatsApp — viene marcado, pero
se puede quitar. Es su teléfono, así que la decisión es suya.

- En **Turnos** aparece la lista de los recordatorios de mañana. Cada uno abre WhatsApp con el
  mensaje ya escrito, así que **funciona sin configurar nada**. Los que ya se mandaron se quedan
  visibles para saber por dónde va, y se pueden deshacer.
- Si el negocio configuró CallMeBot o Meta, `/api/recordatorios` los manda solo. Está pensado para
  Vercel Cron una vez al día y se protege con `CRON_SECRET`. Solo marca como enviado lo que salió de
  verdad: si falla, queda pendiente en Turnos para mandarlo a mano.

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
