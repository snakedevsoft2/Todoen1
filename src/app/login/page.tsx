import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";
import { facebookEnabled } from "@/lib/facebook";
import { mailEnabled } from "@/lib/mail";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { CanalesOficiales } from "@/components/CanalesOficiales";
import { LoginForm } from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; cambiada?: string }>;
}) {
  // Si ya hay sesion no tiene sentido mostrar el formulario.
  if (await getCurrentUser()) redirect("/panel");
  const { error, cambiada } = await searchParams;

  return (
    <div className="auth-page flex flex-col bg-[#F5F4FB]">
      <header className="px-6 py-6 sm:px-10">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <Logo className="h-8 w-8" />
          <span className="text-[17px] font-bold tracking-[-0.01em] text-slate-900">
            {APP_NAME.slice(0, -1)}
            <span className="text-brand-600">{APP_NAME.slice(-1)}</span>
          </span>
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-6">
        <div className="w-full max-w-[440px] rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.12)] sm:p-10">
          <LoginForm
            googleReady={googleEnabled()}
            facebookReady={facebookEnabled()}
            resetReady={mailEnabled()}
            error={error}
            cambiada={cambiada === "1"}
          />
        </div>
      </main>

      {/* Quien no logra entrar necesita por donde escribirnos, y este es el
          sitio donde ya esta atascado. */}
      <footer className="mx-auto w-full max-w-[440px] px-5 pb-10">
        <div className="border-t border-slate-200 pt-5">
          <p className="text-center text-[12px] text-slate-400">
            Escribenos por nuestros canales oficiales
          </p>
          <CanalesOficiales className="mt-3" />
        </div>
      </footer>
    </div>
  );
}
