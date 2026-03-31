import type { EBEnv } from "../../../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

/** Fixed recent transactions returned when no date range is specified or for the current period. */
const RECENT_TRANSACTIONS = [
  {
    entry_reference: "MOCK-TX-001",
    transaction_amount: { currency: "EUR", amount: "1250.00" },
    credit_debit_indicator: "CRDT",
    status: "BOOK",
    booking_date: "2025-01-15",
    transaction_date: "2025-01-15",
    value_date: "2025-01-15",
    debtor: { name: "Employer BV" },
    remittance_information: ["Salary January 2025"],
  },
  {
    entry_reference: "MOCK-TX-002",
    transaction_amount: { currency: "EUR", amount: "42.50" },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    booking_date: "2025-01-14",
    transaction_date: "2025-01-14",
    value_date: "2025-01-14",
    creditor: { name: "Albert Heijn" },
    remittance_information: ["Groceries"],
  },
  {
    entry_reference: "MOCK-TX-003",
    transaction_amount: { currency: "EUR", amount: "9.99" },
    credit_debit_indicator: "DBIT",
    status: "BOOK",
    booking_date: "2025-01-13",
    transaction_date: "2025-01-13",
    value_date: "2025-01-13",
    creditor: { name: "Netflix" },
    remittance_information: ["Monthly subscription"],
  },
  {
    entry_reference: "MOCK-TX-004",
    transaction_amount: { currency: "EUR", amount: "500.00" },
    credit_debit_indicator: "CRDT",
    status: "BOOK",
    booking_date: "2025-01-12",
    transaction_date: "2025-01-12",
    value_date: "2025-01-12",
    debtor: { name: "Jan de Vries" },
    remittance_information: ["Rent share January"],
  },
  {
    entry_reference: "MOCK-TX-005",
    transaction_amount: { currency: "EUR", amount: "15.80" },
    credit_debit_indicator: "DBIT",
    status: "PDNG",
    booking_date: "2025-01-11",
    transaction_date: "2025-01-11",
    value_date: "2025-01-11",
    creditor: { name: "Thuisbezorgd.nl" },
    remittance_information: ["Food delivery"],
  },
];

/** Deterministic mock transaction templates applied per month. */
const MONTHLY_TEMPLATES = [
  { ref_suffix: "salary", amount: "3200.00", indicator: "CRDT", debtor: "Employer BV", info: "Monthly salary" },
  { ref_suffix: "rent", amount: "1100.00", indicator: "DBIT", creditor: "Woning BV", info: "Rent payment" },
  { ref_suffix: "groceries", amount: "187.50", indicator: "DBIT", creditor: "Albert Heijn", info: "Groceries" },
];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function generateHistoricalTransactions(dateFrom: string, dateTo: string) {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to = new Date(dateTo + "T00:00:00Z");
  const transactions = [];

  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor <= to) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const dateStr = `${year}-${pad(month)}-15`;
    const d = new Date(dateStr + "T00:00:00Z");

    if (d >= from && d <= to) {
      for (const tmpl of MONTHLY_TEMPLATES) {
        transactions.push({
          entry_reference: `MOCK-HIST-${year}-${pad(month)}-${tmpl.ref_suffix}`,
          transaction_amount: { currency: "EUR", amount: tmpl.amount },
          credit_debit_indicator: tmpl.indicator,
          status: "BOOK",
          booking_date: dateStr,
          transaction_date: dateStr,
          value_date: dateStr,
          ...(tmpl.debtor ? { debtor: { name: tmpl.debtor } } : {}),
          ...(tmpl.creditor ? { creditor: { name: tmpl.creditor } } : {}),
          remittance_information: [`${tmpl.info} ${year}-${pad(month)}`],
        });
      }
    }

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return transactions;
}

export const onRequestGet: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const url = new URL(context.request.url);
  const dateFrom = url.searchParams.get("date_from");
  const dateTo = url.searchParams.get("date_to");

  // If both date_from and date_to are provided, return deterministic historical data
  if (dateFrom && dateTo) {
    return Response.json({
      transactions: generateHistoricalTransactions(dateFrom, dateTo),
      continuation_key: null,
    });
  }

  // Default: return recent fixed transactions
  return Response.json({
    transactions: RECENT_TRANSACTIONS,
    continuation_key: null,
  });
};
