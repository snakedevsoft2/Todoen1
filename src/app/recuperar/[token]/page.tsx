import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { MINIMO_CLAVE, revisarEnlace, TEXTO_INVALIDO } from "@/lib/reset";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/Icon";
import { CanalesOficiales } from "@/components/CanalesOficiales";
import { ClaveNuevaForm } from "@/components/ClaveNuevaForm";
import { AuthVisual } from "@/components/AuthVisual";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Poner contraseña nueva",
  // El enlace lleva el token: que no quede en ningun buscador.
  robots: { index: false, follow: false },
};

/** El marco es el mismo de ingresar, para que no se sienta otra aplicacion. */
function Marco({ children }: { children: React.ReactNode }) {
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

          {children}
        </div>

        <div className="mx-auto mt-10 w-full max-w-[400px] border-t border-slate-200 pt-5">
          <p className="text-center text-[12px] text-slate-400">
            Escríbenos por nuestros canales oficiales
          </p>
          <CanalesOficiales className="mt-3" />
        </div>
      </main>
    </div>
  );
}

export default async function ClaveNuevaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const revision = await revisarEnlace(decodeURIComponent(token));

  // Enlace vencido, ya usado o inventado. Se explica cual de los tres es y se
  // deja el camino para pedir otro, que es lo unico que resuelve.
  if (!revision.ok) {
    return (
      <Marco>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Icon name="alert" className="h-6 w-6" />
        </div>

        <h1 className="mt-5 text-[28px] font-bold leading-tight tracking-[-0.02em] text-slate-900">
          Este enlace ya no sirve
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-500">
          {TEXTO_INVALIDO[revision.motivo]}
        </p>

        <Link href="/recuperar" className="auth-btn-primary mt-7">
          Pedir un enlace nuevo
        </Link>

        <p className="mt-6 text-center text-[14px] text-slate-500">
          ¿Ya te acordaste de tu contraseña?{" "}
          <Link href="/login" className="auth-link">
            Ingresar
          </Link>
        </p>
      </Marco>
    );
  }

  return (
    <Marco>
      <ClaveNuevaForm
        token={decodeURIComponent(token)}
        correo={revision.enlace.email}
        minimo={MINIMO_CLAVE}
      />
    </Marco>
  );
}
