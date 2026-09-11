import Link from "next/link";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { Icon } from "@/components/Icon";
import { AnimatedBackdrop } from "@/components/AnimatedBackdrop";
import { CanalesOficiales } from "@/components/CanalesOficiales";
import { Logo } from "@/components/Logo";

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
    icon: "shirt",
    title: "Tienda de ropa con inventario",
    text: "Cada prenda con su foto, sus tallas y sus colores. La venta descuenta el stock sola, te avisa cuando una talla se esta acabando y publica tu catalogo en un enlace.",
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
      <AnimatedBackdrop />

      <header className="animate-entrar flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo className="h-14 w-14 shrink-0 sm:h-16 sm:w-16" />
          <div>
          <p className="font-display text-[34px] leading-none tracking-tight text-strong sm:text-[42px]">
            {APP_NAME.slice(0, -1)}
            <span className="text-brand-600">{APP_NAME.slice(-1)}</span>
          </p>
          <h1 className="mt-2 text-lg font-semibold text-body sm:text-xl">
            {APP_TAGLINE}, en una sola app
          </h1>
          </div>
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="card">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon name={f.icon} />
              </div>
              <h3 className="text-base font-semibold text-strong">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.text}</p>
            </article>
          ))}
        </div>

        <div className="card flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-strong">Listo para empezar</h3>
            <p className="mt-1 text-sm text-muted">
              Crea tu cuenta, elige tu tipo de negocio y la app arranca con un catalogo de ejemplo.
            </p>
          </div>
          <Link href="/registro" className="btn-primary">
            <Icon name="plus" className="h-4 w-4" />
            Crear mi cuenta
          </Link>
        </div>
      </section>

      <footer className="mt-12 border-t border-line pt-8 text-center">
        <p className="text-xs text-subtle">Funciona en celular, tablet y computador.</p>
        <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.04em] text-muted">
          Canales oficiales
        </p>
        <CanalesOficiales className="mt-3" />
      </footer>
    </div>
  );
}
