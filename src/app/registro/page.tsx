import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { RegistroForm } from "@/components/RegistroForm";
import { AnimatedBackdrop } from "@/components/AnimatedBackdrop";

export const dynamic = "force-dynamic";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; nombre?: string; google?: string }>;
}) {
  if (await getCurrentUser()) redirect("/panel");
  const params = await searchParams;
  const desdeGoogle = params.google === "1";

  return (
    <>
      <AnimatedBackdrop />

      <div className="mx-auto w-full max-w-lg px-4 py-10">
        <div className="animate-entrar mb-6 text-center">
          <Logo className="mx-auto h-16 w-16" />
          <p className="mt-3 font-display text-[30px] leading-none tracking-tight text-strong">
            {APP_NAME.slice(0, -1)}
            <span className="text-brand-600">{APP_NAME.slice(-1)}</span>
          </p>
          <h1 className="mt-3 font-display text-[22px] leading-none text-strong">Crear tu cuenta</h1>
          <p className="mt-2 text-sm text-muted">
            {desdeGoogle
              ? "Tu correo de Google todavia no tiene un negocio. Cuentanos cual es y lo creamos."
              : "Tu negocio queda separado del de los demas usuarios."}
          </p>
        </div>

        <div className="animate-entrar" style={{ animationDelay: "0.08s" }}>
          <RegistroForm defaultEmail={params.email} defaultName={params.nombre} />
        </div>
      </div>
    </>
  );
}
