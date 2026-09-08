import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Si ya hay sesion no tiene sentido mostrar el formulario.
  if (await getCurrentUser()) redirect("/panel");

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300">
          Todo en uno
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">Entrar a tu negocio</h1>
        <p className="mt-1 text-sm text-slate-400">Solo veras los datos de tu propio negocio.</p>
      </div>

      <LoginForm />

      <Link href="/" className="mt-6 text-center text-xs text-slate-500 hover:text-slate-300">
        Volver al inicio
      </Link>
    </div>
  );
}
