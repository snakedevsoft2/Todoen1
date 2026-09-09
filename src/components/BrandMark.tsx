/* eslint-disable @next/next/no-img-element */

/**
 * Marca del negocio: su logo si lo subio, o sus iniciales si todavia no.
 * Usamos <img> normal porque el logo viene como data URL desde la base de datos.
 */
export function BrandMark({
  name,
  logo,
  size = "md",
  className = "",
}: {
  name: string;
  logo?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const box = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-14 w-14 text-base",
    xl: "h-20 w-20 text-xl",
  }[size];

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  if (logo) {
    return (
      <span
        className={
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-edge bg-panel " +
          box +
          " " +
          className
        }
      >
        <img src={logo} alt={name} className="h-full w-full object-contain p-1" />
      </span>
    );
  }

  return (
    <span
      className={
        "inline-flex shrink-0 items-center justify-center rounded-xl border-2 border-edge bg-brand-600 font-display tracking-wide text-on-brand " +
        box +
        " " +
        className
      }
    >
      {initials || "N"}
    </span>
  );
}
