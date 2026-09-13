import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { APP_NAME } from "@/lib/brand";
import { Logo } from "@/components/Logo";
import { CanalesOficiales } from "@/components/CanalesOficiales";
import { RegistroForm } from "@/components/RegistroForm";
import { AnimatedBackdrop } from "@/components/AnimatedBackdrop";

export const dynamic = "force-dynamic";

export default async function RegistroPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; nombre?: string; google?: string; facebook?: string }>;
}) {
  if (await getCurrentUser()) redirect("/panel");
  const params = await searchParams;
  const desdeGoogle = params.google === "1";
  const desdeFacebook = params.facebook === "1";

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
            {desdeGoogle || desdeFacebook
              ? "Tu correo de " +
                (desdeGoogle ? "Google" : "Facebook") +
                " todavía no tiene un negocio. Cuéntanos cuál es y lo creamos."
              : "Tu negocio queda separado del de los demás usuarios."}
          </p>
        </div>

        <div className="animate-entrar" style={{ animationDelay: "0.08s" }}>
          <RegistroForm defaultEmail={params.email} defaultName={params.nombre} />
        </div>

        <div className="mt-8 border-t border-line pt-6 text-center">
          <p className="text-xs text-subtle">Cualquier duda, escríbenos</p>
          <CanalesOficiales className="mt-3" />
        </div>
      </div>
    </>
  );
}
