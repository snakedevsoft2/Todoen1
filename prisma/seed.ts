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
  services: { name: string; price: number; durationMin: number; category: string }[];
};

const DEMOS: Demo[] = [
  {
    email: "barberia@demo.com",
    businessName: "Barberia El Estilo",
    ownerName: "Luis Ramirez",
    slug: "barberia-el-estilo",
    type: "BARBERIA",
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

    if (demo.type === "BARBERIA") {
      const turns = [
        { time: "09:00", end: "09:30", client: "Carlos Perez", service: first },
        { time: "10:30", end: "11:10", client: "Jhon Cardona", service: second },
        { time: "14:00", end: "14:50", client: "Miguel Ruiz", service: third },
      ];

      for (const turn of turns) {
        await db.appointment.create({
          data: {
            userId: user.id,
            serviceId: turn.service.id,
            serviceName: turn.service.name,
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

      const attended = await db.appointment.findFirst({
        where: { userId: user.id, day, status: "ATENDIDO" },
      });
      if (attended) {
        await db.sale.create({
          data: {
            userId: user.id,
            day,
            total: attended.price,
            paymentMethod: "EFECTIVO",
            origin: "TURNO",
            clientName: attended.clientName,
            appointmentId: attended.id,
            items: {
              create: [{ serviceId: attended.serviceId, name: attended.serviceName, unitPrice: attended.price, qty: 1 }],
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
              { serviceId: first.id, name: first.name, unitPrice: first.price, qty: 2 },
              { serviceId: user.services[4].id, name: user.services[4].name, unitPrice: user.services[4].price, qty: 2 },
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
            create: [{ serviceId: second.id, name: second.name, unitPrice: second.price, qty: 1 }],
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
          orderId: paid.id,
          items: {
            create: paid.items.map((i) => ({
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
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
