/**
 * Datos de ejemplo: crea las tres cuentas (barberia, restaurante y comidas
 * rapidas) con catalogo, turnos, ventas y gastos del dia.
 *
 * Uso: npm run seed
 */
import "dotenv/config";
import { PrismaClient, type BusinessType } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

function today(timezone = "America/Bogota") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type Demo = {
  email: string;
  businessName: string;
  ownerName: string;
  slug: string;
  type: BusinessType;
  brandColor: string;
  theme: string;
  tagline: string;
  logo: string;
  services: { name: string; price: number; durationMin: number; category: string }[];
};

/** Numero de la demo que recibe los avisos de WhatsApp. */
const DEMO_WHATSAPP = "573174485643";

const DEMOS: Demo[] = [
  {
    email: "barberia@demo.com",
    businessName: "Barberia El Estilo",
    ownerName: "Luis Ramirez",
    slug: "barberia-el-estilo",
    type: "BARBERIA",
    brandColor: "#4f46e5",
    theme: "claro",
    tagline: "Cortes clasicos y barberia moderna",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5NiA5NiI+PHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiByeD0iMjIiIGZpbGw9IiMxMTE4MjciLz48dGV4dCB4PSI0OCIgeT0iNjIiIGZvbnQtZmFtaWx5PSJTZWdvZSBVSSxBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjQyIiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjZjlmYWZiIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5CRTwvdGV4dD48L3N2Zz4=",
    services: [
      { name: "Corte clasico", price: 20000, durationMin: 30, category: "Cortes" },
      { name: "Corte degradado", price: 25000, durationMin: 40, category: "Cortes" },
      { name: "Corte + barba", price: 32000, durationMin: 50, category: "Cortes" },
      { name: "Barba y perfilado", price: 15000, durationMin: 20, category: "Barba" },
      { name: "Cejas", price: 6000, durationMin: 15, category: "Extras" },
    ],
  },
  {
    email: "restaurante@demo.com",
    businessName: "Restaurante Doña Rosa",
    ownerName: "Rosa Medina",
    slug: "restaurante-dona-rosa",
    type: "RESTAURANTE",
    brandColor: "#b91c1c",
    theme: "claro",
    tagline: "Comida casera todos los dias",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5NiA5NiI+PHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiByeD0iMjIiIGZpbGw9IiM3ZjFkMWQiLz48dGV4dCB4PSI0OCIgeT0iNjIiIGZvbnQtZmFtaWx5PSJTZWdvZSBVSSxBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjQyIiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjZmVmMmYyIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5EUjwvdGV4dD48L3N2Zz4=",
    services: [
      { name: "Almuerzo del dia", price: 15000, durationMin: 30, category: "Platos" },
      { name: "Bandeja paisa", price: 28000, durationMin: 30, category: "Platos" },
      { name: "Sancocho de gallina", price: 22000, durationMin: 30, category: "Platos" },
      { name: "Jugo natural", price: 6000, durationMin: 30, category: "Bebidas" },
      { name: "Gaseosa personal", price: 4000, durationMin: 30, category: "Bebidas" },
    ],
  },
  {
    email: "rapidas@demo.com",
    businessName: "Comidas Rapidas El Punto",
    ownerName: "Andres Gomez",
    slug: "comidas-rapidas-el-punto",
    type: "COMIDAS_RAPIDAS",
    brandColor: "#ea580c",
    theme: "oscuro",
    tagline: "Hamburguesas y perros a la plancha",
    logo: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA5NiA5NiI+PHJlY3Qgd2lkdGg9Ijk2IiBoZWlnaHQ9Ijk2IiByeD0iMjIiIGZpbGw9IiNjMjQxMGMiLz48dGV4dCB4PSI0OCIgeT0iNjIiIGZvbnQtZmFtaWx5PSJTZWdvZSBVSSxBcmlhbCxzYW5zLXNlcmlmIiBmb250LXNpemU9IjQyIiBmb250LXdlaWdodD0iNzAwIiBmaWxsPSIjZmZmN2VkIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj5FUDwvdGV4dD48L3N2Zz4=",
    services: [
      { name: "Hamburguesa sencilla", price: 14000, durationMin: 30, category: "Hamburguesas" },
      { name: "Hamburguesa doble carne", price: 22000, durationMin: 30, category: "Hamburguesas" },
      { name: "Perro caliente", price: 11000, durationMin: 30, category: "Perros" },
      { name: "Salchipapa", price: 13000, durationMin: 30, category: "Papas" },
      { name: "Gaseosa 400ml", price: 4000, durationMin: 30, category: "Bebidas" },
    ],
  },
];

async function main() {
  const day = today();
  const passwordHash = await bcrypt.hash("demo1234", 10);

  for (const demo of DEMOS) {
    await db.user.deleteMany({ where: { email: demo.email } });

    const user = await db.user.create({
      data: {
        email: demo.email,
        passwordHash,
        ownerName: demo.ownerName,
        businessName: demo.businessName,
        businessType: demo.type,
        slug: demo.slug,
        phone: "300 000 0000",
        address: "Calle 10 #4-20",
        brandColor: demo.brandColor,
        theme: demo.theme,
        tagline: demo.tagline,
        logo: demo.logo,
        whatsappNumber: DEMO_WHATSAPP,
        whatsappProvider: "enlace",
        notifyOnBooking: true,
        services: {
          create: demo.services.map((s) => ({
            name: s.name,
            price: s.price,
            durationMin: s.durationMin,
            category: s.category,
            bookable: demo.type === "BARBERIA",
          })),
        },
      },
      include: { services: true },
    });

    const [first, second, third] = user.services;

    // El dueno siempre queda como la primera persona que atiende.
    const owner = await db.staff.create({
      data: {
        userId: user.id,
        name: demo.ownerName,
        role: "DUENO",
        color: demo.brandColor,
        phone: "300 000 0000",
      },
    });

    // La barberia de la demo trae un segundo barbero con su propio usuario.
    const segundo =
      demo.type === "BARBERIA"
        ? await db.staff.create({
            data: {
              userId: user.id,
              name: "Andres Lopez",
              email: "barbero@demo.com",
              passwordHash,
              role: "BARBERO",
              color: "#16a34a",
              commissionPct: 40,
              phone: "301 222 3344",
            },
          })
        : null;

    if (demo.type === "BARBERIA") {
      const turns = [
        { time: "09:00", end: "09:30", client: "Carlos Perez", service: first, staff: owner },
        { time: "09:00", end: "09:40", client: "Duvan Rios", service: second, staff: segundo },
        { time: "10:30", end: "11:10", client: "Jhon Cardona", service: second, staff: owner },
        { time: "11:00", end: "11:20", client: "Steven Mora", service: third, staff: segundo },
        { time: "14:00", end: "14:50", client: "Miguel Ruiz", service: third, staff: owner },
      ];

      for (const turn of turns) {
        await db.appointment.create({
          data: {
            userId: user.id,
            serviceId: turn.service.id,
            serviceName: turn.service.name,
            staffId: (turn.staff ?? owner).id,
            staffName: (turn.staff ?? owner).name,
            price: turn.service.price,
            clientName: turn.client,
            clientPhone: "310 555 1234",
            day,
            startTime: turn.time,
            endTime: turn.end,
            status: turn.time === "09:00" ? "ATENDIDO" : "CONFIRMADO",
          },
        });
      }

      const atendidos = await db.appointment.findMany({
        where: { userId: user.id, day, status: "ATENDIDO" },
      });
      for (const attended of atendidos) {
        await db.sale.create({
          data: {
            userId: user.id,
            day,
            total: attended.price,
            paymentMethod: "EFECTIVO",
            origin: "TURNO",
            clientName: attended.clientName,
            staffId: attended.staffId,
            appointmentId: attended.id,
            items: {
              create: [{ userId: user.id, serviceId: attended.serviceId, name: attended.serviceName, unitPrice: attended.price, qty: 1 }],
            },
          },
        });
      }
    } else {
      await db.order.create({
        data: {
          userId: user.id,
          label: "Mesa 3",
          day,
          items: {
            create: [
              { userId: user.id, serviceId: first.id, name: first.name, unitPrice: first.price, qty: 2 },
              { userId: user.id, serviceId: user.services[4].id, name: user.services[4].name, unitPrice: user.services[4].price, qty: 2 },
            ],
          },
        },
      });

      const paid = await db.order.create({
        data: {
          userId: user.id,
          label: "Mesa 1",
          day,
          status: "PAGADA",
          items: {
            create: [{ userId: user.id, serviceId: second.id, name: second.name, unitPrice: second.price, qty: 1 }],
          },
        },
        include: { items: true },
      });

      await db.sale.create({
        data: {
          userId: user.id,
          day,
          total: paid.items.reduce((s, i) => s + i.unitPrice * i.qty, 0),
          paymentMethod: "TARJETA",
          origin: "ORDEN",
          clientName: paid.label,
          staffId: owner.id,
          orderId: paid.id,
          items: {
            create: paid.items.map((i) => ({
              userId: user.id,
              serviceId: i.serviceId,
              name: i.name,
              unitPrice: i.unitPrice,
              qty: i.qty,
            })),
          },
        },
      });
    }

    await db.expense.createMany({
      data: [
        { userId: user.id, day, description: "Insumos del dia", amount: 25000, category: "Insumos" },
        { userId: user.id, day, description: "Transporte", amount: 8000, category: "Transporte" },
      ],
    });

    console.log("Cuenta lista: " + demo.email + " / demo1234");
    if (segundo) console.log("  Segundo barbero: " + segundo.email + " / demo1234");
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
