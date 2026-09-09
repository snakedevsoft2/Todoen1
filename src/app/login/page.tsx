import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";
import { LoginShowcase } from "@/components/LoginShowcase";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Si ya hay sesion no tiene sentido mostrar el formulario.
  if (await getCurrentUser()) redirect("/panel");

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_minmax(0,480px)]">
      {/* Panel vivo: solo en pantalla grande, donde sobra el espacio. */}
      <aside className="hidden border-r-2 border-edge bg-surface lg:block">
        <LoginShowcase />
      </aside>

      <main className="flex min-h-dvh flex-col justify-center px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-600 lg:hidden">
              Todo en uno
            </p>
            <h1 className="mt-2 font-display text-[28px] leading-none tracking-tight text-strong sm:text-[34px]">
              Entra a tu negocio
            </h1>
            <p className="mt-2 text-sm text-muted">Solo veras los datos de tu propio negocio.</p>
          </div>

          <LoginForm />

          <Link
            href="/"
            className="mt-6 block text-center text-xs font-semibold text-subtle hover:text-body"
          >
            Volver al inicio
          </Link>
        </div>
      </main>
    </div>
  );
}
