-- Pasa la plata guardada a la unidad minima de cada moneda.
--
-- Antes toda la plata se guardaba como entero de unidades enteras: 20000 era
-- veinte mil pesos. Eso funciona en pesos, donde nadie cobra centavos, pero
-- hace imposible un precio de $0.40 en dolares: el campo no dejaba escribirlo
-- y, si lo dejaba, se guardaba como 0.
--
-- Ahora la plata se guarda en la unidad mas pequena de su moneda: el peso en
-- Colombia, el centavo en dolares, euros o soles. Las cuentas que ya usaban
-- una moneda con centavos tenian sus valores en unidades enteras, asi que hay
-- que multiplicarlos por cien para que en pantalla sigan viendo exactamente lo
-- mismo que veian ayer.
--
-- Las cuentas en pesos, que son casi todas, no se tocan.
DO $$
DECLARE
  tabla  TEXT;
  columna TEXT;
  pares  TEXT[][] := ARRAY[
    ['Debt','amount'], ['Debt','principal'],
    ['DebtPayment','amount'],
    ['Service','price'], ['Service','cost'],
    ['ProductVariant','price'], ['ProductVariant','cost'],
    ['StockMove','unitCost'],
    ['Appointment','price'],
    ['OrderItem','unitPrice'],
    ['Sale','total'],
    ['SaleItem','unitPrice'],
    ['Expense','amount'],
    ['CashClosure','openingAmount'], ['CashClosure','totalSales'],
    ['CashClosure','totalCash'], ['CashClosure','totalCard'],
    ['CashClosure','totalTransfer'], ['CashClosure','totalOther'],
    ['CashClosure','totalExpenses'], ['CashClosure','netTotal'],
    ['CashClosure','countedCash'], ['CashClosure','difference']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(pares, 1) LOOP
    tabla := pares[i][1];
    columna := pares[i][2];
    EXECUTE format(
      'UPDATE %I SET %I = %I * 100
         WHERE %I IS NOT NULL
           AND "userId" IN (
             SELECT id FROM "User"
              WHERE currency NOT IN (''COP'',''CLP'',''PYG'',''JPY'',''KRW'',''ISK'',''VND'')
           )',
      tabla, columna, columna, columna
    );
  END LOOP;
END $$;
