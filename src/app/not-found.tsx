import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-5xl font-bold text-brand-400">404</p>
      <h1 className="mt-3 text-xl font-bold text-white">No encontramos esta pagina</h1>
      <p className="mt-2 text-sm text-slate-400">
        Revisa el enlace. Si buscabas la pagina de reservas de un negocio, pide el enlace correcto.
      </p>
      <Link href="/" className="btn-primary mt-6">
        Ir al inicio
      </Link>
    </div>
  );
}
