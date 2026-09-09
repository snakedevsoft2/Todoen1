import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { RegistroForm } from "@/components/RegistroForm";
import { AnimatedBackdrop } from "@/components/AnimatedBackdrop";

export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  if (await getCurrentUser()) redirect("/panel");

  return (
    <>
      <AnimatedBackdrop />

      <div className="mx-auto w-full max-w-lg px-4 py-10">
        <div className="animate-entrar mb-6 text-center">
          <p className="font-display text-[32px] leading-none tracking-tight text-strong">
            {APP_NAME.slice(0, -1)}
            <span className="text-brand-600">{APP_NAME.slice(-1)}</span>
          </p>
          <h1 className="mt-3 font-display text-[22px] leading-none text-strong">Crear tu cuenta</h1>
          <p className="mt-2 text-sm text-muted">
            Tu negocio queda separado del de los demas usuarios.
          </p>
        </div>

        <div className="animate-entrar" style={{ animationDelay: "0.08s" }}>
          <RegistroForm />
        </div>
      </div>
    </>
  );
}
