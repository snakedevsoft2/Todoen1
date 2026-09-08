"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function DayPicker({
  basePath,
  day,
  min,
  max,
}: {
  basePath: string;
  day: string;
  min?: string;
  max?: string;
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
        startTransition(() => router.push(basePath + "?d=" + next));
      }}
    />
  );
}
