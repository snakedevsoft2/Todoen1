import Link from "next/link";
import { Icon } from "@/components/Icon";

const FEATURES = [
  {
    icon: "scissors",
    title: "Barberia con turnos",
    text: "Tus clientes separan el cupo desde un enlace propio, de lunes a sabado entre 9:00 am y 8:00 pm. Tu ves la hora, el cliente y que corte pidio.",
  },
  {
    icon: "table",
    title: "Restaurante por cuentas",
    text: "Abre una cuenta por mesa o domicilio, agrega platos, y cierrala cuando pagan. La venta queda registrada al instante.",
  },
  {
    icon: "receipt",
    title: "Comidas rapidas al mostrador",
    text: "Registra la venta en dos toques desde el celular y lleva el total del dia sin cuadernos.",
  },
  {
    icon: "wallet",
    title: "Gastos y ganancia real",
    text: "Anota lo que gastaste en el dia y la aplicacion te muestra cuanto te queda limpio.",
  },
  {
    icon: "lock",
    title: "Cierre de caja",
    text: "Cierra el dia con el total por efectivo, tarjeta y transferencia, y compara con la plata contada a mano.",
  },
  {
    icon: "tag",
    title: "Tu propio catalogo",
    text: "Cada negocio agrega, edita y desactiva sus servicios o productos con su precio y duracion.",
  },
];

export default function LandingPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300">
            Todo en uno
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white sm:text-3xl">
            Ventas, turnos y caja en una sola app
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/login" className="btn-ghost">
            Entrar
          </Link>
          <Link href="/registro" className="btn-primary">
            Crear cuenta
          </Link>
        </div>
      </header>

      <section className="mt-10 grid gap-4 sm:mt-14">
        <div className="card">
          <h2 className="text-lg font-semibold text-white sm:text-xl">
            Un negocio, un usuario, datos separados
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
            Cada persona crea su cuenta y trabaja solo dentro de su negocio. La barberia no ve las
            ventas del restaurante, y el restaurante no ve las del puesto de comidas rapidas. Cada
            dueno edita su propio catalogo, su horario y su caja.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="badge border-brand-500/30 bg-brand-500/10 text-brand-300">Barberia</span>
            <span className="badge border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
              Restaurante
            </span>
            <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-300">
              Comidas rapidas
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="card">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300">
                <Icon name={f.icon} />
              </div>
              <h3 className="text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.text}</p>
            </article>
          ))}
        </div>

        <div className="card flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">Listo para empezar</h3>
            <p className="mt-1 text-sm text-slate-400">
              Crea tu cuenta, elige tu tipo de negocio y la app arranca con un catalogo de ejemplo.
            </p>
          </div>
          <Link href="/registro" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" />
            Crear mi cuenta
          </Link>
        </div>
      </section>

      <footer className="mt-12 text-center text-xs text-slate-500">
        Funciona en celular, tablet y computador.
      </footer>
    </div>
  );
}
