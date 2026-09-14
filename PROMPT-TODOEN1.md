Usa la siguiente información como contexto completo de mi aplicación Todoen1. Cuando te pida ideas, textos, cambios, soporte o planes de trabajo, básate en lo que la app ya tiene y no inventes funciones que no están aquí.

# Todoen1: qué es

Todoen1 es una aplicación web tipo SaaS, en español de Colombia, para administrar negocios pequeños desde el celular o el computador. Por defecto usa pesos colombianos y la zona horaria America/Bogota.

- **Registro:** cada negocio se registra con su tipo y tiene su propio espacio. Los datos de un negocio nunca se cruzan con los de otro.
- **Equipo:** el dueño invita a su gente, cada persona con su propio usuario, y cada quien ve solo lo que le corresponde.
- **Diseño:** pensada primero para el celular y con textos escritos para un tendero, no para un programador.

# Tecnología

- **Código:** Next.js 15 (App Router, Server Components, Server Actions), React 19, TypeScript y Tailwind.
- **Datos:** Prisma 6 con PostgreSQL.
- **Despliegue:** Vercel, desde la rama main del repositorio de GitHub snakedevsoft2/Todoen1.
- **Inteligencia artificial:** Google Gemini, con el modelo gemini-3.6-flash por defecto y cambio automático a modelos de respaldo.
- **Mensajería:** WhatsApp Cloud API de Meta (webhook y plantillas) y correo con Resend.
- **Documentos:**
  - PDF armados en el navegador con jsPDF y pdf-lib.
  - Lectura de texto (OCR en español) con tesseract.js, servido desde la propia app.
  - Lector de códigos de barras con @zxing.
- **Sin conexión:** trabajador de fondo (service worker) y colas en IndexedDB.
- **Pruebas:** Vitest con base de datos real y recorridos automáticos en navegador con Playwright.

# Tipos de negocio

Se eligen al registrarse y **se pueden cambiar después sin crear otra cuenta**. El cambio no borra datos y reinicia el menú al del tipo nuevo.

- Barbería
- Restaurante
- Comidas rápidas
- Tienda de ropa
- Cartera y cobranza (préstamos por cuotas)
- Gestor de asistencia
- Otro negocio

Hay tres tipos más preparados en el catálogo que todavía no se pueden elegir: Distribuidora, Servicios y Freelance.

Cada tipo trae de fábrica:
- su menú;
- su color;
- nombres propios, como "Barberos", "Cobradores", "Personal", "Prendas" o "Cortes y servicios";
- productos de ejemplo.

# Acceso y cuentas

- **Ingreso:** registro con correo y contraseña, y también ingreso con Google y con Facebook.
- **Recuperar la contraseña:** por correo o con una pregunta de seguridad.
- **Roles:**
  - El dueño ve todo.
  - El equipo (barbero, vendedor, empleado o cobrador) ve solo lo suyo.
  - El empleado del gestor de asistencia solo ve Marcar, Novedades, Reportes, Escáner y Perfil.
- **Perfil:** cada persona edita su perfil y su foto.
- **Menú:**
  - Bienvenida y guía de inicio.
  - "Armar mi menú" para esconder y ordenar apartados. Lo escondido no se borra.
- **Seguridad:** freno a intentos repetidos de ingreso. Una cuenta suspendida no puede entrar.

# Apartados

## Fijos
- **Resumen del día:** ventas, gastos, pendientes y avisos.
- **Ajustes:**
  - datos del negocio, horario, moneda y zona horaria;
  - enlace del catálogo;
  - contraseña y pregunta de seguridad;
  - cambiar el tipo de negocio.
- **Soporte:** abre WhatsApp con el nombre del negocio ya escrito.

## Operación
- **Turnos (barbería):**
  - agenda por hora y por barbero;
  - reserva pública en /reservar/<negocio>, donde el cliente elige barbero;
  - el turno atendido se cierra como venta.
- **Cuentas abiertas (restaurante y comidas rápidas):**
  - por mesa, domicilio o mostrador;
  - se agregan productos y descuentos;
  - al cerrar la cuenta queda como venta.
- **Inventario:**
  - por talla y color, con stock mínimo, costo y precio propio;
  - movimientos con motivo: entrada, salida y conteo físico;
  - código de barras con la cámara del celular o con pistola lectora;
  - alertas de bajo stock y fotos de cada prenda.
- **Ventas:**
  - venta con productos del catálogo o con valor suelto;
  - quién atendió y método de pago;
  - factura en PDF por WhatsApp o correo;
  - al borrar una venta, la mercancía vuelve al inventario;
  - **funciona sin señal**.
- **Gastos:** por categoría.
- **Cartera o Cuentas por cobrar:**
  - fiados y préstamos por cuotas;
  - abonos y comprobantes;
  - cobro por WhatsApp con el mensaje ya escrito.
- **Cierre de caja:** efectivo esperado contra efectivo contado, diferencia, historial y opción de reabrir.
- **Productos y servicios:** catálogo con precios, fotos y escalas de precios por mayor.
- **Proveedores:** en el tipo cartera se llama "Quién me presta".

## Crecimiento
- **Clientes (CRM):**
  - ficha única de cada cliente, con sus compras, citas, deudas y reportes;
  - etiquetas y segmentos;
  - registro de llamadas y mensajes;
  - seguimientos y tareas;
  - embudo de ventas con oportunidades por etapa;
  - importación de clientes;
  - mensajes y recordatorios automáticos programados por WhatsApp (con plantilla de Meta) y correo, también a un segmento completo.
- **Mi portafolio:**
  - página pública en /catalogo/<negocio>, con portada, fotos y precios;
  - carrito que manda el pedido por WhatsApp;
  - código QR y tarjeta para compartir en redes.
- **Reportes:**
  - comparación con la semana anterior, lo más vendido y el mejor día;
  - utilidad después de gastos;
  - resultados por empleado con su comisión;
  - exportación a CSV (Excel) de ventas, gastos, inventario y movimientos.
- **IA Snake:**
  - chat que responde con los números reales del negocio;
  - botón flotante con el logo y el aviso "Habla con nuestra IA Snake".
- **Agente IA:**
  - contesta solo a los clientes en el chat de la página pública y en WhatsApp;
  - responde dudas con lo publicado y con lo que el dueño le enseña;
  - agenda turnos o toma pedidos y los deja en Clientes con un seguimiento;
  - el dueño ve cada conversación;
  - trae un botón para probar la conexión con la IA.
- **Avisos:** recordatorios automáticos por WhatsApp (la cita de mañana, la cuota del día) e historial de envíos.
- **Escáner de documentos:**
  - fotos convertidas en un PDF limpio: modo documento, girar y ordenar páginas;
  - paso a texto con OCR en español;
  - compartir y guardar en "Mis documentos";
  - **funciona sin señal**.
- **Guía:** explicaciones cortas con buscador.

## Gestor de asistencia
- **Marcar:**
  - una entrada y una salida por día, con hora, GPS y distancia al sitio;
  - **funciona sin señal** y se envía solo;
  - los marcajes no se editan: se anulan escribiendo el motivo.
- **Planilla:** quién entró y quién falta, más el reporte de horas trabajadas por rango de fechas, exportable.
- **Sitios:** sedes u obras con ubicación y radio.
- **Novedades:**
  - permisos, incapacidades y llegadas tarde, con foto del soporte;
  - el administrador aprueba o rechaza con una nota;
  - **funciona sin señal**.
- **Reportes de visita en PDF:**
  - título, sitio, cliente y qué se hizo;
  - fotos con descripción, observaciones y evidencias en PDF adjuntas;
  - logo del negocio y personal del día con sus horas;
  - le llegan al administrador y se comparten por WhatsApp;
  - **funcionan sin señal**.
- **Textos:** adaptados a un negocio que no vende.

## Configuración
- **Equipo:** usuarios, color, comisión, activar o desactivar.
- **Personalizar:** logo, color y tema claro u oscuro.
- **Sitios:** sedes con ubicación y radio.
- **Armar mi menú:** esconder y ordenar apartados.

# Funcionamiento sin internet

Estas pantallas funcionan sin internet:
- Marcar
- Novedades
- Reportes de visita
- Ventas
- Escáner (PDF y paso a texto)

Condición: cada teléfono debe abrirlas una vez con señal.

Todo lo que se hace sin señal se guarda en el teléfono con una llave única. Cuando vuelve la señal se sube solo, sin duplicarse ni descontar el inventario dos veces. En un teléfono compartido, lo pendiente de una persona no se sube con la sesión de otra.

Las demás pantallas muestran un aviso "Sin conexión" con enlaces a las que sí funcionan.

# Panel de la plataforma (administrador de Todoen1)

En /admin el administrador puede:
- ver la lista de cuentas y el detalle de cada una;
- suspender y reactivar cuentas;
- cambiar la clave de una cuenta;
- cambiar el tipo de negocio;
- encender o apagar apartados por cuenta ("Qué puede usar").

# Páginas públicas

- /registro, /login y /recuperar
- /catalogo/<negocio>, con el chat del agente IA
- /reservar/<negocio> (solo barbería)
- /qr/<negocio>

# Configuración externa necesaria

- **Base de datos:** DATABASE_URL.
- **Gemini:** GEMINI_API_KEY, con la facturación activa en Google AI Studio.
- **Correo:** RESEND_API_KEY y MAIL_FROM.
- **Tareas programadas:** CRON_SECRET, para recordatorios y envíos programados.
- **WhatsApp:** token de Meta, WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET y una plantilla aprobada.
- **Ingreso social:** credenciales de Google y de Facebook.
- **Panel de la plataforma:** ADMIN_EMAILS.

# Principios de la app

- Aislamiento total entre negocios.
- Nada se cobra ni se cuenta dos veces.
- Lo registrado en asistencia no se edita: se anula con motivo.
- Primero el celular.
- Lenguaje sencillo.
- Cada apartado se adapta al tipo de negocio.
