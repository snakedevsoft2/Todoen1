import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { RegistroForm } from "@/components/RegistroForm";

export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  if (await getCurrentUser()) redirect("/panel");

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <div className="mb-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300">
          Todo en uno
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">Crear tu cuenta</h1>
        <p className="mt-1 text-sm text-slate-400">
          Tu negocio queda separado del de los demas usuarios.
        </p>
      </div>

      <RegistroForm />
    </div>
  );
}
