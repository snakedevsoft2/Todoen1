import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { LoginForm } from "@/components/LoginForm";
import { LoginShowcase } from "@/components/LoginShowcase";
import { AnimatedBackdrop } from "@/components/AnimatedBackdrop";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Si ya hay sesion no tiene sentido mostrar el formulario.
  if (await getCurrentUser()) redirect("/panel");

  return (
    <>
      <AnimatedBackdrop />

      <div className="min-h-dvh lg:grid lg:grid-cols-[1.05fr_minmax(0,470px)]">
        {/* Panel de bienvenida: en pantalla grande, donde sobra el espacio. */}
        <aside className="hidden border-r-2 border-edge lg:block">
          <LoginShowcase />
        </aside>

        <main className="flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-md">
            <div className="animate-entrar mb-6">
              {/* En celular no hay panel lateral, asi que la marca va aqui. */}
              <p className="font-display text-[32px] leading-none tracking-tight text-strong lg:hidden">
                {APP_NAME.slice(0, -1)}
                <span className="text-brand-600">{APP_NAME.slice(-1)}</span>
              </p>
              <h1 className="mt-3 font-display text-[26px] leading-none tracking-tight text-strong lg:mt-0 lg:text-[32px]">
                Entra a tu negocio
              </h1>
              <p className="mt-2 text-sm text-muted lg:hidden">{APP_TAGLINE}.</p>
              <p className="mt-2 hidden text-sm text-muted lg:block">
                Solo veras los datos de tu propio negocio.
              </p>
            </div>

            <div className="animate-entrar" style={{ animationDelay: "0.08s" }}>
              <LoginForm />
            </div>

            {/* En celular los negocios van debajo del formulario. */}
            <div className="mt-8 lg:hidden">
              <LoginShowcase compact />
            </div>

            <Link
              href="/"
              className="mt-6 block text-center text-xs font-semibold text-subtle hover:text-body"
            >
              Volver al inicio
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
