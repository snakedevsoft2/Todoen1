# Reparto, Cuentas por pagar y Mejores clientes (Chopo Snacks)

Tres apartados que pidió Chopo Snacks. Solo los ve su administradora, **Juliana Intriago**:
no los ve el dueño si es otra persona, ni los vendedores, ni ningún otro negocio. Se la reconoce por
el nombre con que está en Equipo (`esAdminDeChopo` en `src/lib/chopo.ts`), entre como dueña o con
usuario de empleado. Si le cambian el nombre en Equipo, deja de verlos.

No son apartados del catálogo de módulos (si lo fueran, cualquier negocio del mismo tipo los podría
prender): se agregan a su menú en `src/app/panel/layout.tsx`, y cada página y cada acción vuelven a
comprobar quién es.

## Reparto

Reemplaza el Excel `2026 VENTAS REPARTO OCTUBRE-NOVIEMBRE.xlsx`. Pestañas en **Reparto**:

| Pestaña | Qué hace |
|---|---|
| Planillas | Abrir la planilla de un vendedor en un día (si ya existe, abre esa) y ver las del mes con su cuadre. |
| (planilla) | Salida y regreso de productos, ventas a crédito, cobros de cartera, gastos, entrega de efectivo y el cuadre en vivo. Guardar, cerrar (bloquea), reabrir (pide motivo y queda en el historial), anular (no cuenta en nada) o borrar (solo abierta). |
| Cartera | Lo que debe cada cliente, calculado de créditos y cobros, con antigüedad; cobros que no encontraron su documento. Excel. |
| Reportes | Consolidado por vendedor y general, ventas por producto, faltantes/sobrantes y gastos por categoría, por rango de fechas. Excel e imprimir/PDF. |
| Productos | Catálogo con código, precio vigente e historial de precios; enlace opcional a su producto de Inventario. |
| Clientes | Clientes de la ruta, su vendedor, y los nombres parecidos para juntarlos a mano. |
| Importar Excel | Subir un Excel con el mismo formato: primero revisa sin guardar nada, después importa. |

### Las cuentas

Están en un solo lugar, `src/lib/reparto.ts` (`calcularCuadre`), y las usan la pantalla, los reportes
y el importador. Plata en centavos enteros, como el resto de la aplicación.

```
total línea          = (carga − devol) × precio + unid.vend − dcto precio − dcto promoción − caducado × precio − devol. unidades
ventas diaria        = Σ total línea − otros descuentos
contado              = ventas − crédito
recibido             = contado + cartera (cobros y "DIF A FAVOR")
caja                 = recibido − pagos
sobrante / faltante  = caja − entregado   (positivo: faltante; negativo: sobrante; ±0,05 cuadra)
```

Las 43 planillas de octubre dan al centavo lo del Excel, y los totales del mes dan la tabla de la
sección 8 del pedido (`tests/reparto.test.ts`).

### Tablas

Todas nuevas (migración `20261031180000_reparto`), ninguna existente cambia: `RepartoProducto`,
`RepartoPrecio`, `RepartoCliente`, `RepartoPlanilla` (única por vendedor y día), `RepartoLinea`,
`RepartoCredito` (sin planilla = saldo inicial), `RepartoCobro` y `RepartoPago`. El vendedor es la
persona de Equipo (`Staff`). No se escribe nada en Ventas, Caja, Gastos, Clientes ni Cuentas por
cobrar, que ven los empleados.

### Importar el Excel

Desde la pantalla (**Reparto → Importar Excel**) o con el comando:

```bash
npm run importar:reparto -- --cuenta choposnacks@gmail.com            # ensayo: no escribe nada
npm run importar:reparto -- --cuenta choposnacks@gmail.com --aplicar  # importa
npm run importar:reparto -- --archivo otro.xlsx --cuenta ... --aplicar
npm run importar:reparto -- --archivo libro.xlsx --exportar-json prisma/datos/x.json
```

Sin `--archivo` usa `prisma/datos/reparto-octubre-2026.json` (el Excel de octubre ya leído). El
catálogo con códigos P001… e historial de precios está en `prisma/datos/reparto-catalogo.json`.

- **Ensayo primero**: dice qué crearía, si todo cuadra, los clientes parecidos y las diferencias de cartera.
- **Se puede repetir**: una planilla ya importada (mismo vendedor, fecha y `origenRef` "HOJA#fecha") se salta.
- **Todo o nada**: al final cada planilla se recalcula desde la base; si una no da lo del Excel, no se guarda nada.
- **Vendedores**: cada hoja es su vendedor (JAVIER → Javier, HENRY → Henry, JIMMY → Jimmy); la hoja
  SÁBADO es de quien dice el bloque (LUIS → LUIS ANDRIMBA). En la pantalla se escogen; en el comando,
  `--vendedor "LUIS=Luis Andrimba"`.
- **Clientes**: nunca se juntan solos. Los parecidos se listan y se juntan en Reparto → Clientes.

Decisiones tomadas con el Excel de octubre:

- La planilla SÁBADO dice 2026‑07‑02 en la cabecera, pero sus créditos y cobros son del 3 de octubre:
  se importa con fecha **2026‑10‑03** (`FECHAS_CORREGIDAS` en `src/lib/reparto-excel.ts`).
- La planilla de JAVIER del 22‑oct, sin productos y con 89,35 entregados (copiados del día anterior),
  **sí** se importa: el −77,70 de JAVIER en el mes solo cuadra con ella.
- El "dueño" de cada día es la hoja, aunque el bloque diga "jimy" o "HENRY"; queda anotado en la planilla.
- **Cartera inicial**: la lista "CUENTAS POR COBRAR" del primer día de cada hoja ya trae los
  movimientos de ese día; se le quitan los créditos de ese día y se le devuelven los cobros. Las
  "CUENTAS ATRASADAS" entran como saldo inicial con su historial en la nota. La cartera calculada se
  compara con la última lista del Excel y las diferencias se informan sin detener nada: esa lista se
  copiaba a mano y tenía saltos.
- Las hojas VEND5 y CONSOLID,MES no se importan: el consolidado se calcula (y agrupa por producto, no
  por nombre como el Excel, donde "PAPA GRANDE" y "PAPA GRANDE NAT" salían en cero).

## Cuentas por pagar

**Cuentas por pagar**: un botón por proveedor (el abierto en naranja) y su hoja como en el Excel
"CUENTAS POR PAGAR PROVEEDORES", con descuento, IVA (15 % en MARCSEAL, PIPAS, SURTIANDINOS…), precio
de venta y ganancia cuando los usa; pagos completos o abonos. **Importar desde Excel** lee ese libro:
compras por el rango que suma cada TOTAL, IVA de la fórmula, CANCELADO como pagado; la hoja PAY se
lee como cruce de cuentas (lo descontado de sus facturas queda pagado). Se puede repetir sin duplicar.

## Mejores clientes

Cuánto compra cada cliente (ventas con nombre y fiados) por mes, 90 días, año o todo, para darle
promociones. No cuenta los abonos de un fiado (sería contar dos veces) ni el mostrador.

## Comprobar

```bash
npx vitest run tests/reparto.test.ts tests/por-pagar.test.ts tests/mejores-clientes.test.ts
npm run dev   # y en otra terminal:
npm run verificar:reparto     # con REPARTO_XLSX=... PROVEEDORES_XLSX=... prueba también las importaciones
npm run verificar:por-pagar
npm run verificar:chopo
```

## Rollback

Las migraciones solo crean tablas y una columna; quitarlas no toca ningún dato que existía antes.

1. Quitar del menú los apartados: borrar las entradas de `MENU_ADMIN_CHOPO` en `src/lib/chopo.ts` y
   desplegar. Los datos quedan intactos, por si se quiere volver.
2. Para borrar también los datos de Reparto (no se recuperan):

   ```sql
   DROP TABLE IF EXISTS "RepartoPago", "RepartoCobro", "RepartoCredito", "RepartoLinea",
     "RepartoPlanilla", "RepartoCliente", "RepartoPrecio", "RepartoProducto" CASCADE;
   DROP TYPE IF EXISTS "RepartoEstado";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261031180000_reparto';
   ```

   De Cuentas por pagar:

   ```sql
   DROP TABLE IF EXISTS "PayablePayment", "PayableItem", "PayableBill", "PayableSupplier" CASCADE;
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261031150000_cuentas_por_pagar';
   ```

   `CASCADE` solo se lleva las llaves foráneas de esas mismas tablas. Después, quitar sus modelos de
   `prisma/schema.prisma`, borrar las carpetas de esas migraciones y el código (`src/lib/reparto*.ts`,
   `src/actions/reparto.ts`, `src/app/panel/reparto/`, `src/components/reparto/`; y `por-pagar*`).
