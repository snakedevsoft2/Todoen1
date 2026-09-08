import { requireSession } from "@/lib/auth";
import { BUSINESS_LABEL, logoUrl, navFor } from "@/lib/nav";
import { ROLE_LABEL } from "@/lib/staff";
import { Shell } from "@/components/Shell";
import { Icon } from "@/components/Icon";
import { logoutAction } from "@/actions/auth";
import { ThemeStyle } from "@/components/ThemeStyle";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { user, staff } = await requireSession();

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
        nav={navFor(user.businessType, staff.role)}
        businessName={user.businessName}
        businessLabel={BUSINESS_LABEL[user.businessType]}
        ownerName={staff.name}
        roleLabel={ROLE_LABEL[staff.role] ?? "Barbero"}
        staffColor={staff.color}
        logo={logoUrl(user.slug, user.logo, user.updatedAt)}
        bookingUrl={user.businessType === "BARBERIA" ? "/reservar/" + user.slug : undefined}
        logout={logout}
      >
        {children}
      </Shell>
    </>
  );
}
