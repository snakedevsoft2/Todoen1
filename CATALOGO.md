# Espacio de trabajo configurable — propuesta para aprobar

Este documento tiene tres partes:

1. **Cómo quedó el aislamiento entre cuentas** (lo que el prompt pedía primero).
2. **El esquema de datos** que propongo.
3. **El catálogo completo de módulos**, con la descripción que va a leer el cliente.

Al final hay **4 decisiones** que necesito que tomes. No toco la interfaz hasta que
me des el visto bueno.

---

## 1. Cómo quedó el aislamiento entre cuentas

### Qué encontré

Revisé las 16 tablas y todas las consultas de la aplicación. **No encontré ninguna
fuga real de datos entre cuentas.** Todas las consultas ya filtraban por el dueño.

Pero encontré una debilidad de fondo: en dos tablas (`OrderItem`, las líneas de una
cuenta abierta, y `SaleItem`, las líneas de una venta) **el dueño no estaba escrito en
la fila**. Se sabía de quién era la línea solo preguntándole a la venta o a la cuenta
que la contenía. Eso funciona mientras quien escribe la consulta se acuerde de pasar
por el padre. El día que a alguien se le olvide, la fuga aparece y nadie se entera.

### Qué cambié

- Le agregué la columna del dueño a `OrderItem` y a `SaleItem`, con índice y con
  borrado en cascada.
- Escribí la migración a mano (`20260909224520_dueno_en_lineas`) porque la que genera
  Prisma automáticamente **habría borrado** las 6 líneas de cuentas y las 4 líneas de
  ventas que ya existían. La mía las conserva: crea la columna vacía, la rellena
  mirando el padre de cada fila, y solo entonces la vuelve obligatoria.
- Verifiqué con SQL directo: **0 filas con el dueño equivocado**, y las 10 filas
  siguen ahí.
- Actualicé los 6 lugares del código que crean estas líneas para que graben el dueño.

### La red de seguridad

Escribí **12 pruebas automáticas** (`tests/aislamiento.test.ts`) que corren contra la
base de datos de verdad. Crean dos tiendas de ropa con datos iguales y comprueban que
ninguna alcanza una sola fila de la otra: ni leyendo, ni buscando por id, ni
editando, ni borrando. También comprueban que borrar una cuenta se lleva lo suyo y
no toca a la otra.

**Y probé las pruebas.** Metí a mano una línea de venta con el dueño equivocado,
saltándome el código de la aplicación. La prueba la detectó y falló. Después la
borré y volvieron a pasar las 12. Una prueba que nunca falla no protege nada.

Se corren con `npm test`.

---

## 2. Esquema de datos que propongo

Hoy el menú vive en un archivo de código (`src/lib/nav.ts`). Para que sea configurable
de verdad tiene que vivir en la base de datos. Propongo cuatro tablas nuevas:

| Tabla | Para qué sirve |
|---|---|
| `Module` | El catálogo maestro: los ~20 apartados que existen, con su nombre, su ícono, su dirección y las descripciones que lee el cliente. |
| `BusinessTypeModule` | Qué módulos le tocan a cada tipo de negocio, en qué orden, y cuáles vienen encendidos de fábrica. Aquí es donde vive la regla de que **los turnos son solo de barbería**. |
| `WorkspaceConfig` | El espacio de trabajo de cada persona: qué módulos tiene visibles y en qué orden los puso. Reemplaza los campos `navHidden` y `navOrder` que hoy están sueltos en `Staff`. |
| `ModuleEvent` | Registro de uso: qué módulo se abrió y cuándo. Sirve para sugerirle al cliente que apague lo que nunca usa. |

**Lo que NO propongo cambiar, y por qué:**

El prompt pedía una tabla `memberships` y renombrar el dueño a `account_id`. La
aplicación **ya tiene las dos cosas, con otro nombre**: la tabla `Staff` ya es la
membresía (dice qué persona pertenece a qué negocio y con qué rol), y `userId` ya es
el identificador de la cuenta. Renombrar 16 tablas y todas sus consultas tomaría
varios días, tiene riesgo de romper cosas que hoy funcionan, y el cliente no vería
ninguna diferencia. Si algún día una persona necesita entrar a dos negocios distintos
con el mismo correo, ahí sí vale la pena. Hoy no.

---

## 3. Catálogo completo de módulos

Esta es la parte que te pido leer con calma: **son los textos que va a ver el cliente**
cuando arme su espacio de trabajo. Si alguno no se entiende o no suena a como habla
un tendero colombiano, dímelo y lo cambio.

Columna "De fábrica": ✅ viene encendido, ⬜ existe pero apagado, — no aplica a ese negocio.

### Siempre visibles (no se pueden esconder)

**Resumen del día** · `/panel`
> Lo primero que ves al entrar: cuánto llevas vendido hoy, cuánto gastaste y qué te falta por hacer.

Sin esto no hay a dónde volver. Va fijo en los siete negocios.

**Ajustes** · `/panel/ajustes`
> Los datos de tu negocio, tu contraseña y la configuración general.

Va fijo porque es desde donde se deshace cualquier cambio del menú. Si se pudiera
esconder, alguien quedaría encerrado.

**Soporte** · `/panel/soporte`
> Escríbenos por WhatsApp si algo no funciona o no sabes cómo hacer algo.

Va fijo porque es a donde acude quien se trabó, que es justo cuando todo lo demás
estaría escondido.

### El corazón de cada negocio

| Módulo | Barbería | Restaurante | Comidas rápidas | Ropa | Distribuidora | Servicios | Freelance |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Turnos** | ✅ | — | — | — | — | ✅ | ⬜ |
| **Cuentas abiertas** | — | ✅ | ✅ | — | — | — | — |
| **Inventario** | ⬜ | ⬜ | ⬜ | ✅ | ✅ | — | — |

**Turnos** · `/panel/turnos`
> La agenda del día por hora. Anota quién viene, a qué hora y con quién.
>
> *En barbería:* "Carlos, corte y barba, 3:00 p.m. con Andrés."
> *En servicios:* "Doña Marta, mantenimiento de nevera, martes 9:00 a.m."

Este es el módulo del que hablamos: **la agenda por hora con reserva pública es de
barbería.** Se la abro también a "servicios" porque un técnico agenda visitas igual
que un barbero agenda cortes. Restaurante, comidas rápidas y ropa **no la tienen ni
apagada**: no aparece en su lista para nada.

**Cuentas abiertas** · `/panel/cuentas`
> Las mesas o pedidos que están consumiendo ahora. Vas agregando y al final cobras todo junto.
>
> *En restaurante:* "Mesa 4: dos almuerzos y tres gaseosas, $38.000."

**Inventario** · `/panel/inventario`
> Cuánto te queda de cada cosa. Te avisa cuando algo se está acabando.
>
> *En ropa:* por talla y color — "Camisa blanca: quedan 2 en M, ninguna en L."
> *En distribuidora:* por caja o unidad — "Gaseosa 1.5L: quedan 14 cajas."

### El dinero (todos los negocios lo tienen)

**Ventas** · `/panel/ventas` — ✅ de fábrica en los siete
> Todo lo que has vendido, día por día. Puedes mandarle la factura al cliente por WhatsApp o por correo.

**Gastos** · `/panel/gastos` — ✅ de fábrica en los siete
> Lo que se te va: arriendo, mercancía, servicios, lo que sea. Sin esto no sabes si de verdad estás ganando.

**Cartera** · `/panel/cartera` — ⬜ apagado de fábrica en todos
> Quién te debe, cuánto, desde cuándo y cuándo te prometió pagar. Le mandas el recordatorio por WhatsApp con un botón.
>
> *Ejemplo:* "Don José debe $150.000 desde hace 12 días. Prometió pagar el viernes."

Apagado de fábrica a propósito: no todo el mundo fía. El que fía lo va a buscar.

**Cierre de caja** · `/panel/caja` — ✅ de fábrica en los siete
> Al final del día cuentas la plata y la app te dice si cuadra con lo que registraste.

**Productos y servicios** · `/panel/catalogo` — ✅ de fábrica en los siete
> Tu lista de precios. Lo que sale aquí es lo que puedes vender con un toque.
>
> *En barbería:* cortes y servicios. *En ropa:* prendas. *En restaurante:* platos.

**Proveedores** · `/panel/proveedores` — ✅ en ropa y distribuidora, ⬜ en el resto
> A quién le compras, a qué precio y cuánto le debes. Sirve para saber si te están subiendo los precios.

### Lo que hace crecer el negocio

**Mi portafolio** · `/panel/portafolio` — ✅ de fábrica en los siete (solo dueño)
> Tu página pública. Subes fotos de lo que vendes y compartes el enlace o el código QR.
> El cliente ve tu catálogo y te pide por WhatsApp.

Es el único módulo que da valor **antes** de que el cliente cargue datos. Por eso va
encendido siempre.

**Reportes** · `/panel/reportes` — ✅ de fábrica en los siete
> Cómo te fue esta semana comparado con la pasada. Qué se vende más. Qué día vendes mejor.
> Puedes bajarlo en Excel para el contador.

**Asistente** · `/panel/asistente` — ⬜ apagado de fábrica en todos
> Un chat donde le preguntas al asistente sobre tu negocio y te responde con tus propios números.
>
> *Ejemplo:* "¿Qué prenda se me está quedando quieta?" o "¿Cómo hago un cierre de caja?"

Apagado porque necesita una llave de Google configurada. Si no está configurada, el
módulo ni siquiera aparece en la lista.

**Avisos** · `/panel/avisos` — ⬜ apagado de fábrica (solo dueño)
> Recordatorios automáticos por WhatsApp para tus clientes: "Mañana a las 3 te esperamos."
> El cliente decide si quiere recibirlos.

### Configuración

**Equipo** · `/panel/equipo` — ✅ en barbería y ropa, ⬜ en el resto (solo dueño)
> Las personas que trabajan contigo. Cada una entra con su propio usuario y ves cuánto vendió cada quien.
>
> *En barbería* se llama "Barberos". *En ropa* y en los demás, "Empleados".

**Personalizar** · `/panel/personalizar` — ⬜ apagado de fábrica (solo dueño)
> El color y el logo de tu negocio, para que la app y tu página pública se vean tuyas.

**Armar mi menú** · `/panel/espacio` — siempre accesible desde el pie del menú
> Aquí decides qué apartados quieres ver y en qué orden. Lo que escondas sigue existiendo.

**Guía** · `/guia` — nuevo, ✅ de fábrica en los siete
> Explicaciones cortas de cada cosa, con buscador. "¿Cómo registro una venta?"

---

## 4. Las 4 decisiones que necesito de ti

### Decisión 1 — ¿Cómo blindamos el aislamiento de aquí en adelante?

**Opción A (la que recomiendo):** dejarlo como está ahora — el filtro por dueño en
cada consulta, más las 12 pruebas automáticas, más una revisión automática que no
deje subir código con una consulta sin filtro.
*A favor:* ya funciona y ya está probado. Cero riesgo.

**Opción B:** activar RLS de Postgres, que es una barrera dentro de la base de datos
misma.
*A favor:* protege incluso si el código se equivoca.
*En contra:* Prisma no lo soporta bien con conexiones compartidas, hay que reescribir
cómo la app se conecta a la base, y en Vercel esto suele dar problemas. Son varios
días y puede tumbar cosas que hoy funcionan.

### Decisión 2 — ¿Qué hago con la pantalla "Armar mi menú" que ya existe?

**Opción A (la que recomiendo):** mejorarla — dejarle los mismos botones que ya
funcionan y **agregarle** el arrastrar con el dedo o el mouse.
*A favor:* los botones siguen sirviendo si el arrastre falla en algún teléfono.

**Opción B:** rehacerla desde cero solo con arrastre.
*En contra:* arrastrar en un celular viejo es incómodo y no siempre responde.

### Decisión 3 — ¿Entran ahora los 3 negocios nuevos?

Distribuidora, servicios y freelance. El catálogo de arriba ya los contempla.

**Opción A (la que recomiendo):** dejar el catálogo listo para ellos, pero **no
abrirlos al registro todavía**. Primero que los cuatro que existen funcionen bien.

**Opción B:** abrirlos ya, con los módulos que aparecen en la tabla.

### Decisión 4 — La foto de una prenda es pública si alguien adivina la dirección

Hoy, `/foto/<id-de-la-prenda>` abre la imagen sin pedir contraseña. Hace falta
adivinar un identificador largo y aleatorio, así que no es fácil, pero es real.

**Opción A (la que recomiendo):** dejarlo abierto. Esas fotos son justo las que el
cliente publica en su portafolio; cerrarlas rompería la página pública.

**Opción B:** cerrar las fotos de prendas que no estén publicadas en el portafolio.
Es media hora de trabajo.

---

**Cuando me digas las cuatro respuestas, sigo con el orden que pide el prompt:**
catálogo y configuración en base de datos → menú lateral leído de la base →
configurador con arrastre → asistente de bienvenida en 4 pasos → instructivo y guía.
