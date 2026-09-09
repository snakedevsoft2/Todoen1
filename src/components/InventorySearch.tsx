"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanButton, useScannerWedge } from "./ScanButton";
import { Icon } from "./Icon";

/**
 * Buscador del inventario, con lector de codigo de barras.
 *
 * El codigo escaneado entra como cualquier busqueda: la pagina ya busca por
 * nombre, marca, talla, color y codigo. Si el codigo corresponde a una sola
 * talla, la pagina la deja lista en "Mover stock" para cargar o descontar de
 * una vez.
 *
 * Escuchamos tambien la pistola lectora en toda la pagina: en un local se
 * dispara sin tocar la pantalla.
 */
export function InventorySearch({
  categories,
  defaultQuery,
  defaultCategory,
  filtro,
}: {
  categories: string[];
  defaultQuery: string;
  defaultCategory: string;
  filtro: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(defaultQuery);
  const [category, setCategory] = useState(defaultCategory);
  const [ultimo, setUltimo] = useState("");

  const buscar = useCallback(
    (texto: string, categoria = category) => {
      const sp = new URLSearchParams();
      if (texto) sp.set("q", texto);
      if (categoria) sp.set("cat", categoria);
      if (filtro !== "todos") sp.set("filtro", filtro);
      const s = sp.toString();
      router.push("/panel/inventario" + (s ? "?" + s : ""));
    },
    [category, filtro, router]
  );

  const escaneado = useCallback(
    (code: string) => {
      setUltimo(code);
      setQuery(code);
      // Al escanear buscamos en todo el inventario: el codigo ya es unico y
      // filtrar por categoria solo esconderia lo que la persona busca.
      setCategory("");
      buscar(code, "");
    },
    [buscar]
  );

  useScannerWedge(escaneado);

  return (
    <div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          buscar(query.trim());
        }}
      >
        {/* El escaneo es lo que mas se usa, asi que va junto al campo y
            con el color de la marca, no escondido entre los otros botones. */}
        <div className="flex gap-2">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Prenda, talla, color o codigo"
          />
          <ScanButton
            onScan={escaneado}
            className="btn-primary shrink-0"
            title="Escanear codigo de barras"
          />
        </div>

        <div className="flex gap-2">
          <select
            className="input"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              buscar(query.trim(), e.target.value);
            }}
          >
            <option value="">Todas las categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button className="btn-ghost shrink-0" type="submit">
            <Icon name="search" className="h-4 w-4" />
            Buscar
          </button>
        </div>
      </form>

      {ultimo && (
        <p className="mt-2 text-xs text-muted">
          Codigo leido: <strong className="text-strong">{ultimo}</strong>
        </p>
      )}

      <p className="mt-2 text-xs text-subtle">
        Tambien puedes usar una pistola lectora: dispara sobre esta pagina y busca sola.
      </p>
    </div>
  );
}
