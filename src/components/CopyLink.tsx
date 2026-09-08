"use client";

import { useState } from "react";
import { Icon } from "./Icon";

export function CopyLink({ path, label = "Copiar enlace" }: { path: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = typeof window === "undefined" ? path : window.location.origin + path;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copia este enlace:", url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={copy} className="btn-ghost btn-sm">
      <Icon name={copied ? "check" : "link"} className="h-4 w-4" />
      {copied ? "Copiado" : label}
    </button>
  );
}
