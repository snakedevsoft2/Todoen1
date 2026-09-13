/**
 * El catalogo de apartados de la aplicacion.
 *
 * Este archivo es la fuente: de aqui sale lo que queda sembrado en la base de
 * datos. La aplicacion lee de la base, no de aqui, para que el configurador
 * pueda mostrar descripciones y para poder estrenar apartados sin desplegar.
 *
 * Los textos estan escritos para que los lea un tendero, no un programador.
 * Si alguno suena a manual de software, esta mal escrito.
 */

export type Grupo = "FIJO" | "NUCLEO" | "DINERO" | "CRECIMIENTO" | "CONFIGURACION";

export type ModuloDef = {
  key: string;
  href: string;
  label: string;
  icon: string;
  group: Grupo;
  shortDescription: string;
  longDescription: string;
  fixed?: boolean;
  ownerOnly?: boolean;
  inSidebar?: boolean;
  requiresEnv?: string;
  sortOrder: number;
};

/**
 * Los tipos de negocio que conoce el catalogo.
 *
 * Los tres ultimos todavia no se pueden elegir al registrarse: el catalogo los
 * tiene listos, pero el registro solo ofrece los cuatro primeros hasta que
 * esos cuatro funcionen bien.
 */
export const TIPOS = [
  "BARBERIA",
  "RESTAURANTE",
  "COMIDAS_RAPIDAS",
  "ROPA",
  "CARTERA",
  "ASISTENCIA",
  "OTRO",
  "DISTRIBUIDORA",
  "SERVICIOS",
  "FREELANCE",
] as const;

export type Tipo = (typeof TIPOS)[number];

/** Los que hoy se pueden elegir al crear una cuenta. */
export const TIPOS_ABIERTOS: Tipo[] = [
  "BARBERIA",
  "RESTAURANTE",
  "COMIDAS_RAPIDAS",
  "ROPA",
  "CARTERA",
  "ASISTENCIA",
  "OTRO",
];

export const MODULOS: ModuloDef[] = [
  // ---------------------------------------------------------------- FIJOS
  {
    key: "resumen",
    href: "/panel",
    label: "Resumen del día",
    icon: "home",
    group: "FIJO",
    fixed: true,
    sortOrder: 0,
    shortDescription:
      "Lo primero que ves al entrar: cuanto llevas vendido hoy, cuanto gastaste y que te falta por hacer.",
    longDescription:
      "Es la pantalla de arranque. Te dice cómo va el día sin que tengas que buscar nada: la plata que entró, la que salió, lo que queda pendiente y los avisos que necesitan tu atención. No se puede esconder porque es a donde siempre se vuelve.",
  },
  {
    key: "ajustes",
    href: "/panel/ajustes",
    label: "Ajustes",
    icon: "cog",
    group: "FIJO",
    fixed: true,
    sortOrder: 900,
    shortDescription: "Los datos de tu negocio, tu contrasena y la configuracion general.",
    longDescription:
      "El nombre del negocio, el telefono, la direccion, los horarios y tu contrasena. No se puede esconder porque es desde donde se deshace cualquier cambio del menu: si se pudiera esconder, alguien podria quedar encerrado sin manera de volver atras.",
  },
  {
    key: "soporte",
    href: "/panel/soporte",
    label: "Soporte",
    icon: "whatsapp",
    group: "FIJO",
    fixed: true,
    sortOrder: 950,
    shortDescription: "Escribenos por WhatsApp si algo no funciona o no sabes como hacer algo.",
    longDescription:
      "Te abre una conversacion de WhatsApp con nosotros, con el nombre de tu negocio ya escrito para no tener que explicar quien eres. No se puede esconder porque es a donde acude quien se trabo, que es justo cuando todo lo demas estaria escondido.",
  },

  // --------------------------------------------------------------- NUCLEO
  {
    key: "turnos",
    href: "/panel/turnos",
    label: "Turnos",
    icon: "calendar",
    group: "NUCLEO",
    sortOrder: 10,
    shortDescription: "La agenda del dia por hora. Anota quien viene, a que hora y con quien.",
    longDescription:
      "Ves el dia partido en horas y vas colocando a cada cliente en su espacio. Tus clientes tambien pueden separar solos desde tu pagina publica, sin llamarte. Cuando el cliente llega y le cobras, el turno se convierte en venta y no tienes que anotarlo dos veces.",
  },
  {
    key: "cuentas",
    href: "/panel/cuentas",
    label: "Cuentas abiertas",
    icon: "table",
    group: "NUCLEO",
    sortOrder: 10,
    shortDescription:
      "Las mesas o pedidos que estan consumiendo ahora. Vas agregando y al final cobras todo junto.",
    longDescription:
      "Abres una cuenta por mesa o por pedido y le vas sumando lo que pidan. Mientras esta abierta puedes agregar, quitar o corregir. Cuando el cliente pide la cuenta, cierras y queda registrada como venta del dia con todo lo que consumio.",
  },
  {
    key: "inventario",
    href: "/panel/inventario",
    label: "Inventario",
    icon: "box",
    group: "NUCLEO",
    sortOrder: 10,
    shortDescription: "Cuanto te queda de cada cosa. Te avisa cuando algo se esta acabando.",
    longDescription:
      "Llevas la cuenta de lo que tienes, y cada venta lo descuenta sola. Puedes buscar escaneando el codigo de barras con la camara del celular, ver la foto de cada cosa para no confundirte, y te avisa cuando algo esta por acabarse para que lo pidas a tiempo.",
  },

  // --------------------------------------------------------------- DINERO
  {
    key: "ventas",
    href: "/panel/ventas",
    label: "Ventas",
    icon: "receipt",
    group: "DINERO",
    sortOrder: 20,
    shortDescription:
      "Todo lo que has vendido, dia por dia. Puedes mandarle la factura al cliente por WhatsApp o por correo.",
    longDescription:
      "El registro de cada venta con la fecha, quien la hizo y como te pagaron. De cualquier venta sacas una factura en PDF y se la mandas al cliente por WhatsApp o por correo con un toque. Si borras una venta que descontaba inventario, la mercancia vuelve sola a su lugar.",
  },
  {
    key: "gastos",
    href: "/panel/gastos",
    label: "Gastos",
    icon: "wallet",
    group: "DINERO",
    sortOrder: 30,
    shortDescription:
      "Lo que se te va: arriendo, mercancia, servicios, lo que sea. Sin esto no sabes si de verdad estas ganando.",
    longDescription:
      "Anotas cada salida de plata con su categoria. Es la mitad de la cuenta que casi nadie lleva: vender mucho no es ganar. Con los gastos anotados, los reportes te pueden decir lo unico que importa de verdad, que es cuanto te quedo limpio.",
  },
  {
    key: "cartera",
    href: "/panel/cartera",
    label: "Cartera",
    icon: "handshake",
    group: "DINERO",
    sortOrder: 40,
    shortDescription:
      "Quien te debe, cuanto, desde cuando y cuando te prometio pagar. Le mandas el recordatorio por WhatsApp con un boton.",
    longDescription:
      "Lleva el fiado sin cuaderno. De cada persona sabes cuanto debe, desde hace cuantos dias y que fecha te prometio. Le mandas el cobro por WhatsApp con el mensaje ya escrito, registras cada abono y le entregas un comprobante. Si la venta ya la habias anotado, cobrar no te la vuelve a sumar: no cuenta la misma plata dos veces.",
  },
  {
    key: "caja",
    href: "/panel/caja",
    label: "Cierre de caja",
    icon: "lock",
    group: "DINERO",
    sortOrder: 50,
    shortDescription:
      "Al final del dia cuentas la plata y la app te dice si cuadra con lo que registraste.",
    longDescription:
      "Escribes cuanto efectivo tienes en la caja y la aplicacion lo compara con lo que deberia haber segun las ventas y los gastos del dia. Si sobra o falta, te dice cuanto, y queda anotado. Es la manera de darse cuenta de un error el mismo dia y no un mes despues.",
  },
  {
    key: "catalogo",
    href: "/panel/catalogo",
    label: "Productos y servicios",
    icon: "tag",
    group: "DINERO",
    sortOrder: 60,
    shortDescription: "Tu lista de precios. Lo que sale aqui es lo que puedes vender con un toque.",
    longDescription:
      "La lista de lo que vendes con su precio. Es la base de todo lo demas: lo que este aqui es lo que puedes cobrar sin escribir el precio a mano, lo que aparece en tu pagina publica y lo que el cliente puede pedirte. Vale la pena dedicarle un rato al principio.",
  },
  {
    key: "proveedores",
    href: "/panel/proveedores",
    label: "Proveedores",
    icon: "truck",
    group: "DINERO",
    sortOrder: 70,
    shortDescription:
      "A quien le compras, a que precio y cuanto le debes. Sirve para saber si te estan subiendo los precios.",
    longDescription:
      "Guardas a quien le compras cada cosa y a como te la deja. Con el tiempo puedes ver si un proveedor te subio el precio sin avisar, o cual te tiene mejor cuenta para lo mismo. Tambien tienes a la mano su telefono cuando necesitas pedir de urgencia.",
  },

  // ---------------------------------------------------------- CRECIMIENTO
  {
    key: "clientes",
    href: "/panel/clientes",
    label: "Clientes",
    icon: "users",
    group: "CRECIMIENTO",
    sortOrder: 75,
    shortDescription:
      "Tus clientes con todo lo que te han comprado, lo que tienes pendiente con cada uno y en qué va cada venta.",
    longDescription:
      "La ficha de cada cliente junta sus compras, citas, deudas y reportes, aunque los hayas anotado en otros apartados. Le pones etiquetas como VIP, frecuente o mayorista, anotas cada llamada o WhatsApp, agendas lo que hay que hacer con él y ves en un tablero en qué va cada venta. Con los segmentos le escribes por WhatsApp a un grupo entero, uno por uno y con su nombre.",
  },
  {
    key: "portafolio",
    href: "/panel/portafolio",
    label: "Mi portafolio",
    icon: "image",
    group: "CRECIMIENTO",
    ownerOnly: true,
    sortOrder: 80,
    shortDescription:
      "Tu pagina publica. Subes fotos de lo que vendes y compartes el enlace o el codigo QR.",
    longDescription:
      "Es tu vitrina en internet, sin pagar una pagina web. Subes tu portada, tus fotos y tu presentacion, y te queda un enlace y un codigo QR para pegar en el local o mandar por WhatsApp. El cliente ve lo que vendes y te escribe para pedir. Puedes ver como queda antes de publicarla.",
  },
  {
    key: "reportes",
    href: "/panel/reportes",
    label: "Reportes",
    icon: "chart",
    group: "CRECIMIENTO",
    sortOrder: 90,
    shortDescription:
      "Como te fue esta semana comparado con la pasada. Que se vende mas. Que dia vendes mejor.",
    longDescription:
      "Te responde las preguntas que uno se hace de noche: voy mejor o peor que la semana pasada, que es lo que mas se me vende, que dia es el flojo, cuanto me quedo limpio despues de gastos. Y lo puedes bajar en Excel para llevarselo al contador.",
  },
  {
    key: "asistente",
    href: "/panel/asistente",
    label: "Asistente",
    icon: "sparkle",
    group: "CRECIMIENTO",
    requiresEnv: "GEMINI_API_KEY",
    sortOrder: 100,
    shortDescription:
      "Un chat donde le preguntas al asistente sobre tu negocio y te responde con tus propios numeros.",
    longDescription:
      'Le escribes como le escribirias a alguien: "que prenda se me esta quedando quieta" o "como hago un cierre de caja". Responde mirando tus numeros de verdad, no consejos genericos. Solo ve lo tuyo: nunca los datos de otro negocio, y la conversacion no se guarda.',
  },
  {
    key: "agente",
    href: "/panel/agente",
    label: "Agente IA",
    icon: "sparkle",
    group: "CRECIMIENTO",
    ownerOnly: true,
    sortOrder: 105,
    shortDescription:
      "Un asistente que les contesta solo a tus clientes en tu página y en tu WhatsApp, a cualquier hora.",
    longDescription:
      "Responde precios, horarios y dudas con lo que tienes publicado y con lo que tú le enseñes. Si el cliente quiere, le separa el turno o le toma el pedido, que queda anotado en Clientes con un seguimiento para que lo confirmes. Tú ves cada conversación y lo que hizo. No ve tus ventas ni tus deudas, y no recibe pagos.",
  },
  {
    key: "avisos",
    href: "/panel/avisos",
    label: "Avisos",
    icon: "bell",
    group: "CRECIMIENTO",
    ownerOnly: true,
    sortOrder: 110,
    shortDescription:
      "Recordatorios automaticos por WhatsApp para tus clientes: manana a las 3 te esperamos.",
    longDescription:
      "El dia antes de la cita le llega el recordatorio al cliente para que no se le olvide y no te deje el espacio vacio. El cliente decide si quiere recibirlos cuando separa. Tambien puedes ver que avisos salieron y cuales no, por si algo fallo.",
  },
  {
    key: "escaner",
    href: "/panel/escaner",
    label: "Escáner",
    icon: "scan",
    group: "CRECIMIENTO",
    sortOrder: 115,
    shortDescription:
      "Toma fotos de un documento con el celular y conviértelo en PDF o en texto para copiar.",
    longDescription:
      "Le tomas una foto a cada página: la aplicación la deja blanca y legible como si la hubieras escaneado. Las giras, las ordenas y sacas un PDF para descargar o mandar por WhatsApp. También puede leer las letras y pasarlas a texto para copiarlo o corregirlo. Lo que guardes queda en tus documentos, y ese PDF lo puedes adjuntar a un reporte.",
  },
  {
    key: "guia",
    href: "/panel/guia",
    label: "Guía",
    icon: "book",
    group: "CRECIMIENTO",
    sortOrder: 120,
    shortDescription: "Explicaciones cortas de cada cosa, con buscador. Como registro una venta?",
    longDescription:
      "El manual, pero corto y buscable. Escribes lo que quieres hacer y te sale el paso a paso de esa cosa en particular, con el enlace para ir directo. Esta pensado para consultarlo con el cliente enfrente, no para leerlo de principio a fin.",
  },

  // -------------------------------------------------------- CONFIGURACION
  {
    key: "marcar",
    href: "/panel/marcar",
    label: "Marcar",
    icon: "clock",
    group: "NUCLEO",
    sortOrder: 5,
    shortDescription:
      "El boton con el que cada persona marca su entrada y su salida, con la hora y el lugar exactos.",
    longDescription:
      "Cada quien marca desde su propio telefono. Queda la hora, la coordenada y a cuantos metros estaba del sitio. Funciona sin senal: el marcaje espera guardado en el telefono y se manda solo cuando vuelve la cobertura, asi que una zona sin cobertura no le borra la jornada a nadie. Lo que se marca no se puede editar ni borrar despues, ni siquiera por el dueno: si hubo un error se anula escribiendo por que, y quedan los dos a la vista.",
  },
  {
    key: "planilla",
    href: "/panel/planilla",
    label: "Planilla",
    icon: "table",
    group: "NUCLEO",
    ownerOnly: true,
    sortOrder: 10,
    shortDescription:
      "Quien marco hoy, a que hora entro y salio, cuantas horas lleva y quien no ha llegado.",
    longDescription:
      "La vista del dia completa: quien esta adentro, quien ya salio y quien no ha marcado. De cada marcaje ves la hora, el sitio y el mapa, y si alguno quedo lejos del sitio sale senalado. Desde aqui se anula un marcaje equivocado, siempre dejando el motivo escrito.",
  },
  {
    key: "sitios",
    href: "/panel/sitios",
    label: "Sitios",
    icon: "map",
    group: "CONFIGURACION",
    ownerOnly: true,
    sortOrder: 135,
    shortDescription:
      "Las sedes o los sitios de trabajo, con su ubicacion, para saber desde donde marco cada quien.",
    longDescription:
      "Cada sitio guarda su direccion, su coordenada y un radio. Cuando alguien marca, la aplicacion calcula a cuantos metros estaba y lo deja anotado. No impide marcar a quien este lejos: un GPS impreciso o un sotano sin senal dejarian a esa persona sin poder registrar su jornada. Lo que hace es dejarlo senalado para que lo revises.",
  },
  {
    key: "informes",
    href: "/panel/informes",
    label: "Reportes",
    icon: "image",
    group: "NUCLEO",
    sortOrder: 15,
    shortDescription:
      "El reporte de cada visita con fotos, listo en PDF para mandarselo al cliente por WhatsApp.",
    longDescription:
      "Anotas que se hizo, en que sitio y para que cliente, y le agregas las fotos desde el telefono. El PDF sale con las fotos, el personal que estuvo ese dia en el sitio con sus horas de entrada y salida, y se comparte por WhatsApp o se imprime. La planilla de asistencia tambien se exporta en PDF desde Planilla.",
  },
  {
    key: "novedades",
    href: "/panel/novedades",
    label: "Novedades",
    icon: "bell",
    group: "NUCLEO",
    sortOrder: 12,
    shortDescription:
      "Los permisos, incapacidades y llegadas tarde que avisa tu personal, para aprobarlos o rechazarlos.",
    longDescription:
      "Cada empleado avisa desde su teléfono lo que no es un marcaje: un permiso para una cita, una incapacidad con la foto del soporte, que va a llegar tarde. Funciona sin señal: se envía sola cuando vuelve. Tú la apruebas o la rechazas con una nota, y en el resumen del día sabes quién falta con permiso y quién no.",
  },
  {
    key: "equipo",
    href: "/panel/equipo",
    label: "Equipo",
    icon: "users",
    group: "CONFIGURACION",
    ownerOnly: true,
    sortOrder: 130,
    shortDescription:
      "Las personas que trabajan contigo. Cada una entra con su propio usuario y ve solo lo que le corresponde.",
    longDescription:
      "Le das a cada persona su propio correo y contraseña, y ve solo lo que le toca, sin la configuración ni la marca. Lo que hace cada quien queda a su nombre: en un negocio que vende, cuánto vendió y su comisión; en el gestor de asistencia, sus marcajes, sus novedades y sus reportes.",
  },
  {
    key: "personalizar",
    href: "/panel/personalizar",
    label: "Personalizar",
    icon: "palette",
    group: "CONFIGURACION",
    ownerOnly: true,
    sortOrder: 140,
    shortDescription:
      "El color y el logo de tu negocio, para que la app y tu pagina publica se vean tuyas.",
    longDescription:
      "Subes tu logo y eliges tu color, y con eso se pinta toda la aplicacion y tu pagina publica. Tambien eliges si prefieres el fondo claro u oscuro. Es lo que hace que el cliente que abre tu enlace vea tu negocio y no una plantilla igual a la de todos.",
  },
  {
    key: "espacio",
    href: "/panel/espacio",
    label: "Armar mi menú",
    icon: "sliders",
    group: "CONFIGURACION",
    fixed: true,
    inSidebar: false,
    sortOrder: 990,
    shortDescription:
      "Aqui decides que apartados quieres ver y en que orden. Lo que escondas sigue existiendo.",
    longDescription:
      "Arrastras los apartados que usas hacia tu menu y sacas los que no. Lo que escondes no se borra ni se pierde: sigue funcionando y puedes volver a ponerlo cuando quieras. Se llega desde el pie del menu para no ocupar un renglon del menu mismo.",
  },
];

/** Como se llama el apartado segun el oficio, cuando el nombre general no sirve. */
type Preset = {
  /** Encendido de fabrica. Si falta, es true. */
  on?: boolean;
  /** Posicion. Si falta, manda el sortOrder del modulo. */
  orden?: number;
  label?: string;
  ejemplo?: string;
};

/**
 * Que apartados le tocan a cada oficio.
 *
 * Si un modulo no aparece en la lista de un tipo de negocio, ese negocio no lo
 * tiene: ni encendido ni apagado. Asi es como la agenda por hora queda siendo
 * de barberia y de servicios, y no aparece nunca en un restaurante.
 */
export const PRESETS: Record<Tipo, Record<string, Preset>> = {
  BARBERIA: {
    resumen: {},
    turnos: {
      ejemplo: "Carlos, corte y barba, 3:00 p.m. con Andres.",
    },
    ventas: { ejemplo: "Corte + barba, $25.000, efectivo." },
    gastos: { ejemplo: "Cuchillas y talco, $40.000." },
    cartera: { on: false, ejemplo: "Don Jose quedo debiendo $20.000 del corte del sabado." },
    caja: {},
    catalogo: { label: "Cortes y servicios", ejemplo: "Corte clasico $18.000, barba $10.000." },
    proveedores: { on: false, ejemplo: "La distribuidora que te trae las maquinas y el talco." },
    portafolio: { ejemplo: "Fotos de tus mejores cortes para que el cliente elija." },
    reportes: { ejemplo: "Que barbero vendio mas esta semana." },
    asistente: { on: false, ejemplo: "A que hora se me llena mas la barberia?" },
    avisos: { on: false, ejemplo: "Manana a las 3 te esperamos, Carlos." },
    clientes: { ejemplo: "Carlos viene cada 15 días: etiqueta Frecuente y un recordatorio si se demora." },
    agente: { ejemplo: "Un cliente escribe a las 11 p.m. y queda con turno para mañana a las 3." },
    escaner: { on: false, ejemplo: "La cámara de comercio o el RUT, en PDF para mandarlos." },
    guia: {},
    equipo: { label: "Barberos", ejemplo: "Andres, Jhon y Miguel, cada uno con su usuario." },
    personalizar: { on: false },
    inventario: { on: false, ejemplo: "Cremas y productos que tambien vendes." },
    espacio: {},
    ajustes: {},
    soporte: {},
  },

  RESTAURANTE: {
    resumen: {},
    cuentas: { ejemplo: "Mesa 4: dos almuerzos y tres gaseosas, $38.000." },
    ventas: { ejemplo: "Almuerzo ejecutivo, $15.000, transferencia." },
    gastos: { ejemplo: "Plaza de mercado del lunes, $320.000." },
    cartera: { on: false, ejemplo: "La oficina de al lado paga los almuerzos a fin de mes." },
    caja: {},
    catalogo: { label: "Platos y productos", ejemplo: "Bandeja paisa $22.000, jugo $5.000." },
    proveedores: { on: false, ejemplo: "El de la carne, el de las verduras, el de las gaseosas." },
    portafolio: { ejemplo: "El menu del dia con fotos, para mandarlo por WhatsApp." },
    reportes: { ejemplo: "Que plato se vende mas los viernes." },
    asistente: { on: false, ejemplo: "Que dia me conviene mas hacer promocion?" },
    avisos: { on: false },
    clientes: { ejemplo: "La empresa que pide almuerzos para 30: oportunidad en Propuesta." },
    agente: { ejemplo: "¿Tienen almuerzo vegetariano? Y de una toma el pedido para recoger." },
    escaner: { on: false, ejemplo: "Las facturas del proveedor, en PDF para el contador." },
    guia: {},
    equipo: { on: false, label: "Empleados", ejemplo: "Meseros y cocina, cada uno con su usuario." },
    personalizar: { on: false },
    inventario: { on: false, ejemplo: "Gaseosas y cervezas, para no quedarte sin surtido." },
    espacio: {},
    ajustes: {},
    soporte: {},
  },

  COMIDAS_RAPIDAS: {
    resumen: {},
    cuentas: { ejemplo: "Pedido 12: dos hamburguesas y papas, para llevar." },
    ventas: { ejemplo: "Perro caliente, $9.000, efectivo." },
    gastos: { ejemplo: "Carne, pan y salsas de la semana." },
    cartera: { on: false },
    caja: {},
    catalogo: { label: "Productos", ejemplo: "Hamburguesa sencilla $12.000, papas $6.000." },
    proveedores: { on: false, ejemplo: "El del pan y el de la carne." },
    portafolio: { ejemplo: "Tu carta con fotos y el boton para pedir por WhatsApp." },
    reportes: { ejemplo: "A que hora vendes mas, para saber cuando reforzar." },
    asistente: { on: false, ejemplo: "Cual es mi combo mas rentable?" },
    avisos: { on: false },
    clientes: { ejemplo: "Los que piden domicilio cada semana, para mandarles la promo del viernes." },
    agente: { ejemplo: "Toma el pedido de dos hamburguesas a domicilio y te avisa." },
    escaner: { on: false, ejemplo: "El acta de sanidad escaneada, a la mano." },
    guia: {},
    equipo: { on: false, label: "Empleados" },
    personalizar: { on: false },
    inventario: { on: false, ejemplo: "Gaseosas y desechables." },
    espacio: {},
    ajustes: {},
    soporte: {},
  },

  ROPA: {
    resumen: {},
    inventario: { ejemplo: "Camisa blanca: quedan 2 en M, ninguna en L." },
    ventas: { ejemplo: "Jean talla 32, $89.000, tarjeta." },
    gastos: { ejemplo: "Arriendo del local, $1.200.000." },
    cartera: { on: false, ejemplo: "Dona Marta lleva el conjunto y abona el sabado." },
    caja: {},
    catalogo: { label: "Prendas", ejemplo: "Camisa oxford $65.000, con sus tallas y colores." },
    proveedores: { ejemplo: "El de San Victorino y a como te dejo la docena." },
    portafolio: { ejemplo: "Tu catalogo con fotos para mandar por WhatsApp o pegar el QR." },
    reportes: { ejemplo: "Que talla se te queda quieta y cual se agota siempre." },
    asistente: { on: false, ejemplo: "Que prenda lleva dos meses sin venderse?" },
    avisos: { on: false },
    clientes: { ejemplo: "Doña Marta, talla M, le gusta lo formal: avisarle cuando llegue lo nuevo." },
    agente: { ejemplo: "¿La camisa blanca hay en M? Y te deja el pedido listo para confirmar." },
    escaner: { on: false, ejemplo: "Las remisiones del proveedor, en PDF." },
    guia: {},
    equipo: { label: "Empleados", ejemplo: "Cada vendedora con su usuario y sus ventas aparte." },
    personalizar: { on: false },
    espacio: {},
    ajustes: {},
    soporte: {},
  },

  /**
   * El negocio que no encaja en ninguno de los otros.
   *
   * Aqui no podemos adivinar el oficio, asi que le damos todo lo que no
   * depende de uno: inventario, catalogo, la plata, el portafolio, reportes.
   * Es al reves que en los demas, donde de fabrica se entrega poco: aqui es
   * mejor que lo vea y apague lo que le sobre, porque nadie mas puede saber
   * que le sirve.
   *
   * Lo unico que no lleva es la agenda por hora. Esa sigue siendo de barberia.
   */
  /**
   * Presta plata y la cobra por cuotas.
   *
   * Es el unico oficio que no vende nada, y por eso su menu es distinto: no
   * lleva catalogo, ni cuentas por mesa, ni pagina publica. Lo que hace todo
   * el dia es cobrar, asi que Cuentas por cobrar entra encendida y de primera,
   * y los avisos por WhatsApp tambien: recordar la cuota del dia es el trabajo,
   * no un extra.
   *
   * El inventario entra apagado: quien solo presta plata no tiene que contar
   * nada. Queda disponible por si tambien fia mercancia.
   */
  /**
   * Gestor de asistencia y reportes.
   *
   * No vende nada, asi que no lleva catalogo, ni ventas, ni caja, ni cuentas.
   * Su dia es saber quien marco y quien no, y mandarle el reporte al cliente.
   *
   * "Marcar" es el unico apartado de este oficio que NO es solo del dueno:
   * tiene que verlo el empleado, que es justamente quien lo usa.
   */
  ASISTENCIA: {
    resumen: {},
    marcar: { ejemplo: "Juan marco entrada a las 8:02 en la Sede Norte, a 12 metros." },
    planilla: { ejemplo: "Hoy entraron 14 de 16. Rosa marco a 2,4 km del sitio: revisar." },
    sitios: { ejemplo: "Sede Norte, Edificio Los Cedros, la obra de la 80." },
    equipo: { label: "Personal", ejemplo: "Cada persona con su usuario para marcar." },
    informes: { ejemplo: "Visita a Edificio Los Cedros: fachada limpia, 6 fotos, en PDF." },
    novedades: { ejemplo: "Rosa tiene cita médica el jueves de 8 a 12. Adjuntó la orden." },
    gastos: { on: false, ejemplo: "Transporte, dotacion, herramienta." },
    avisos: { on: false },
    asistente: { on: false, ejemplo: "Quien no ha marcado entrada hoy?" },
    personalizar: { on: false },
    clientes: { on: false, ejemplo: "Las empresas a las que les haces reportes de visita." },
    escaner: { ejemplo: "El acta de entrega firmada por el cliente, escaneada desde la obra." },
    guia: {},
    espacio: {},
    ajustes: {},
    soporte: {},
  },
  CARTERA: {
    resumen: {},
    cartera: {
      label: "Cuentas por cobrar",
      ejemplo: "Juan debe $600.000 en 20 cuotas diarias de $30.000. Va en la 7 y esta al dia.",
    },
    ventas: { ejemplo: "Lo que recogiste hoy de todos los cobros." },
    gastos: { ejemplo: "Gasolina de la ruta, papeleria, telefono." },
    caja: { ejemplo: "Cuadrar al final del dia lo recogido contra lo que tienes en mano." },
    reportes: { ejemplo: "Cuanto prestaste, cuanto recogiste y cuanto te falta por recuperar." },
    avisos: { ejemplo: "Don Juan, hoy le toca la cuota de $30.000." },
    inventario: { on: false, ejemplo: "Solo si tambien fias mercancia." },
    proveedores: {
      label: "Quién me presta",
      ejemplo: "El socio o el inversionista que te pone la plata, y a que interes te la pone.",
    },
    // Encendido: un negocio de cobranza casi siempre tiene mas de un cobrador
    // en la calle, y cada uno necesita su propio usuario.
    equipo: { label: "Cobradores", ejemplo: "Cada cobrador con su usuario y su ruta." },
    asistente: { on: false, ejemplo: "A quien le tengo que cobrar hoy?" },
    personalizar: { on: false },
    clientes: { ejemplo: "Juan quiere otro préstamo: llamarlo el lunes con el fiador." },
    agente: { ejemplo: "Contesta horarios y requisitos, y deja el recado cuando piden un préstamo." },
    escaner: { ejemplo: "La cédula y el pagaré del cliente, en PDF y con el texto." },
    guia: {},
    espacio: {},
    ajustes: {},
    soporte: {},
  },
  OTRO: {
    resumen: {},
    catalogo: {
      label: "Productos y servicios",
      ejemplo: "Lo que vendes, con su precio. Sea producto o servicio.",
    },
    inventario: {
      ejemplo: "Si manejas existencias: cuanto te queda de cada cosa.",
    },
    ventas: { ejemplo: "Lo que vendiste hoy, con su factura para el cliente." },
    gastos: { ejemplo: "Arriendo, mercancia, servicios: todo lo que sale." },
    cartera: { on: false, ejemplo: "Quien te quedo debiendo y desde cuando." },
    caja: {},
    proveedores: { on: false, ejemplo: "A quien le compras y a como." },
    portafolio: { ejemplo: "Tu pagina publica con fotos y el boton de WhatsApp." },
    reportes: { ejemplo: "Como vas comparado con el mes pasado." },
    asistente: { on: false, ejemplo: "Que apartados me sirven para mi negocio?" },
    avisos: { on: false },
    clientes: { ejemplo: "Tus clientes con sus compras, lo pendiente y en qué va cada venta." },
    agente: { ejemplo: "Contesta dudas de tus productos y toma pedidos a cualquier hora." },
    escaner: { ejemplo: "Contratos, facturas y documentos, en PDF o en texto." },
    guia: {},
    equipo: { label: "Empleados", ejemplo: "Cada uno con su usuario y sus ventas aparte." },
    personalizar: { on: false },
    cuentas: {
      on: false,
      label: "Cuentas abiertas",
      ejemplo: "Si atiendes por mesa o por pedido y cobras al final.",
    },
    espacio: {},
    ajustes: {},
    soporte: {},
  },

  DISTRIBUIDORA: {
    resumen: {},
    inventario: { label: "Bodega", ejemplo: "Gaseosa 1.5L: quedan 14 cajas." },
    ventas: { ejemplo: "Cinco cajas de gaseosa a la tienda de la esquina." },
    gastos: { ejemplo: "Gasolina y mantenimiento del camion." },
    cartera: { on: false, ejemplo: "La tienda de la 45 debe tres despachos." },
    caja: {},
    catalogo: { label: "Productos", ejemplo: "Precio por caja y precio por unidad." },
    proveedores: { ejemplo: "Las marcas que distribuyes y a como te las dejan." },
    portafolio: { ejemplo: "Tu lista de precios para mandarla a los tenderos." },
    reportes: { ejemplo: "Que cliente te compra mas y cual dejo de pedir." },
    asistente: { on: false },
    avisos: { on: false },
    clientes: { ejemplo: "La tienda de la 45: pide los lunes, oportunidad de 20 cajas." },
    agente: { ejemplo: "La tienda pregunta precios por caja y deja el pedido anotado." },
    escaner: { on: false, ejemplo: "Las facturas de compra, en PDF." },
    guia: {},
    equipo: { on: false, label: "Empleados" },
    personalizar: { on: false },
    espacio: {},
    ajustes: {},
    soporte: {},
  },

  SERVICIOS: {
    resumen: {},
    turnos: { label: "Agenda", ejemplo: "Dona Marta, mantenimiento de nevera, martes 9:00 a.m." },
    ventas: { ejemplo: "Reparacion de lavadora, $120.000." },
    gastos: { ejemplo: "Repuestos y transporte." },
    cartera: { on: false, ejemplo: "El conjunto paga la factura a 30 dias." },
    caja: {},
    catalogo: { label: "Servicios y precios", ejemplo: "Visita tecnica $40.000, instalacion $150.000." },
    proveedores: { on: false, ejemplo: "Donde compras los repuestos." },
    portafolio: { ejemplo: "Fotos de trabajos hechos, que es lo que da confianza." },
    reportes: { ejemplo: "Que servicio te deja mas y cual te quita mas tiempo." },
    asistente: { on: false },
    avisos: { on: false, ejemplo: "Manana a las 9 pasamos por su casa." },
    clientes: { ejemplo: "Doña Marta pidió cotización de mantenimiento: llamarla el jueves." },
    agente: { ejemplo: "Contesta cuánto vale la visita y deja el recado para agendarla." },
    escaner: { ejemplo: "La orden de servicio firmada, en PDF." },
    guia: {},
    equipo: { on: false, label: "Tecnicos" },
    personalizar: { on: false },
    espacio: {},
    ajustes: {},
    soporte: {},
  },

  FREELANCE: {
    resumen: {},
    turnos: { on: false, label: "Agenda", ejemplo: "Reunion con el cliente, jueves 10:00 a.m." },
    ventas: { ejemplo: "Diseno de logo, $450.000." },
    gastos: { ejemplo: "Programas y herramientas que pagas al mes." },
    cartera: { on: false, ejemplo: "El cliente quedo de pagar la segunda mitad al entregar." },
    caja: {},
    catalogo: { label: "Servicios y precios", ejemplo: "Logo $450.000, pagina web desde $1.500.000." },
    portafolio: { ejemplo: "Tus trabajos, que es literalmente como consigues clientes." },
    reportes: { ejemplo: "Cuanto facturaste este mes comparado con el pasado." },
    asistente: { on: false },
    clientes: { ejemplo: "La agencia que pidió el logo: propuesta enviada, cierra el 30." },
    agente: { ejemplo: "Responde qué incluye cada servicio y deja el recado del interesado." },
    escaner: { ejemplo: "El contrato firmado, en PDF para el cliente." },
    guia: {},
    personalizar: { on: false },
    espacio: {},
    ajustes: {},
    soporte: {},
  },
};
