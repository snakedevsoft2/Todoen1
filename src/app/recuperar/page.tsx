import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { CanalesOficiales } from "@/components/CanalesOficiales";
import { PedirEnlaceForm } from "@/components/PedirEnlaceForm";
import { AuthVisual } from "@/components/AuthVisual";

export const dynamic = "force-dynamic";

export const metadata = { title: "Recuperar contraseña" };

/**
 * Pedir el enlace para cambiar la contrasena olvidada.
 *
 * Se deja abierta aunque haya sesion: en el computador del local puede estar
 * abierta la cuenta de otro, y mandar a la persona al panel del companero en
 * vez de dejarla recuperar la suya no le sirve de nada.
 */
export default async function RecuperarPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="auth-page lg:grid lg:grid-cols-[1fr_minmax(0,540px)] xl:grid-cols-[1.15fr_minmax(0,560px)]">
      <aside className="hidden border-r border-slate-200 bg-slate-50/60 lg:block">
        <AuthVisual />
      </aside>

      <main className="flex min-h-dvh flex-col justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <Logo className="h-9 w-9" />
            <span className="text-[19px] font-bold tracking-[-0.01em] text-slate-900">
              {APP_NAME.slice(0, -1)}
              <span className="text-brand-600">{APP_NAME.slice(-1)}</span>
            </span>
          </div>

          <PedirEnlaceForm defaultEmail={email} />
        </div>

        <div className="mx-auto mt-10 w-full max-w-[400px]">
          <Link
            href="/"
            className="text-[13px] text-slate-400 transition-colors hover:text-slate-600"
          >
            Volver al inicio
          </Link>

          <div className="mt-6 border-t border-slate-200 pt-5">
            <p className="text-center text-[12px] text-slate-400">
              Escríbenos por nuestros canales oficiales
            </p>
            <CanalesOficiales className="mt-3" />
          </div>
        </div>
      </main>
    </div>
  );
}
