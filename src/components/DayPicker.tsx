"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function DayPicker({
  basePath,
  day,
  min,
  max,
  extraQuery,
}: {
  basePath: string;
  day: string;
  min?: string;
  max?: string;
  /** Parametros de mas para conservar al cambiar de dia, ej "s=<servicio>". */
  extraQuery?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <input
      className="input max-w-[200px]"
      type="date"
      value={day}
      min={min}
      max={max}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value;
        if (!next) return;
        const query = "?d=" + next + (extraQuery ? "&" + extraQuery : "");
        startTransition(() => router.push(basePath + query));
      }}
    />
  );
}
