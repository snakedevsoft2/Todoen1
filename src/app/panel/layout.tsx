import { requireUser } from "@/lib/auth";
import { BUSINESS_LABEL, navFor } from "@/lib/nav";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { logoutAction } from "@/actions/auth";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const logout = (
    <form action={logoutAction}>
      <button type="submit" className="btn-ghost btn-sm w-full">
        <Icon name="logout" className="h-4 w-4" />
        Cerrar sesion
      </button>
    </form>
  );

  return (
    <Shell
      nav={navFor(user.businessType)}
      businessName={user.businessName}
      businessLabel={BUSINESS_LABEL[user.businessType]}
      ownerName={user.ownerName}
      bookingUrl={user.businessType === "BARBERIA" ? "/reservar/" + user.slug : undefined}
      logout={logout}
    >
      {children}
    </Shell>
  );
}
