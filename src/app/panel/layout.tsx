import { requireUser } from "@/lib/auth";
import { BUSINESS_LABEL, logoUrl, navFor } from "@/lib/nav";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { logoutAction } from "@/actions/auth";
import { ThemeStyle } from "@/components/ThemeStyle";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  const logout = (
    <form action={logoutAction}>
      <button type="submit" className="btn-ghost btn-sm w-full justify-start">
        <Icon name="logout" className="h-4 w-4" />
        Cerrar sesion
      </button>
    </form>
  );

  return (
    <>
      <ThemeStyle brandColor={user.brandColor} theme={user.theme} />
      <Shell
        nav={navFor(user.businessType)}
        businessName={user.businessName}
        businessLabel={BUSINESS_LABEL[user.businessType]}
        ownerName={user.ownerName}
        logo={logoUrl(user.slug, user.logo, user.updatedAt)}
        bookingUrl={user.businessType === "BARBERIA" ? "/reservar/" + user.slug : undefined}
        logout={logout}
      >
        {children}
      </Shell>
    </>
  );
}
