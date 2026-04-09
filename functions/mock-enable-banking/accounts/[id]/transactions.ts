import type { EBEnv } from "../../../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

interface TemplateEntry {
  ref_suffix: string;
  amount: string;
  indicator: string;
  debtor?: string;
  creditor?: string;
  info: string;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
}

/** Recent transactions for current account (with IBAN) with dates relative to today. */
function getRecentTransactions() {
  return [
    {
      entry_reference: "MOCK-TX-001",
      transaction_amount: { currency: "EUR", amount: "1250.00" },
      credit_debit_indicator: "CRDT",
      status: "BOOK",
      booking_date: daysAgo(1),
      transaction_date: daysAgo(1),
      value_date: daysAgo(1),
      debtor: { name: "Employer BV" },
      remittance_information: ["Salary"],
    },
    {
      entry_reference: "MOCK-TX-002",
      transaction_amount: { currency: "EUR", amount: "42.50" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: daysAgo(2),
      transaction_date: daysAgo(2),
      value_date: daysAgo(2),
      creditor: { name: "Albert Heijn" },
      remittance_information: ["Groceries"],
    },
    {
      entry_reference: "MOCK-TX-003",
      transaction_amount: { currency: "EUR", amount: "9.99" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: daysAgo(3),
      transaction_date: daysAgo(3),
      value_date: daysAgo(3),
      creditor: { name: "Netflix" },
      remittance_information: ["Monthly subscription"],
    },
    {
      entry_reference: "MOCK-TX-004",
      transaction_amount: { currency: "EUR", amount: "500.00" },
      credit_debit_indicator: "CRDT",
      status: "BOOK",
      booking_date: daysAgo(4),
      transaction_date: daysAgo(4),
      value_date: daysAgo(4),
      debtor: { name: "Jan de Vries" },
      remittance_information: ["Rent share"],
    },
    {
      entry_reference: "MOCK-TX-005",
      transaction_amount: { currency: "EUR", amount: "15.80" },
      credit_debit_indicator: "DBIT",
      status: "PDNG",
      booking_date: daysAgo(5),
      transaction_date: daysAgo(5),
      value_date: daysAgo(5),
      creditor: { name: "Thuisbezorgd.nl" },
      remittance_information: ["Food delivery"],
    },
  ];
}

/** Recent transactions for savings account (without IBAN). */
function getSavingsTransactions() {
  return [
    {
      entry_reference: "MOCK-SAV-001",
      transaction_amount: { currency: "EUR", amount: "200.00" },
      credit_debit_indicator: "CRDT",
      status: "BOOK",
      booking_date: daysAgo(1),
      transaction_date: daysAgo(1),
      value_date: daysAgo(1),
      debtor: { name: "Current Account" },
      remittance_information: ["Savings transfer"],
    },
    {
      entry_reference: "MOCK-SAV-002",
      transaction_amount: { currency: "EUR", amount: "0.12" },
      credit_debit_indicator: "CRDT",
      status: "BOOK",
      booking_date: daysAgo(3),
      transaction_date: daysAgo(3),
      value_date: daysAgo(3),
      debtor: { name: "Bank Interest" },
      remittance_information: ["Monthly interest"],
    },
    {
      entry_reference: "MOCK-SAV-003",
      transaction_amount: { currency: "EUR", amount: "50.00" },
      credit_debit_indicator: "DBIT",
      status: "BOOK",
      booking_date: daysAgo(5),
      transaction_date: daysAgo(5),
      value_date: daysAgo(5),
      creditor: { name: "Current Account" },
      remittance_information: ["Emergency withdrawal"],
    },
  ];
}

/** Deterministic mock transaction templates applied per month. */
const MONTHLY_TEMPLATES: TemplateEntry[] = [
  {
    ref_suffix: "salary",
    amount: "3200.00",
    indicator: "CRDT",
    debtor: "Employer BV",
    info: "Monthly salary",
  },
  {
    ref_suffix: "rent",
    amount: "1100.00",
    indicator: "DBIT",
    creditor: "Woning BV",
    info: "Rent payment",
  },
  {
    ref_suffix: "groceries",
    amount: "187.50",
    indicator: "DBIT",
    creditor: "Albert Heijn",
    info: "Groceries",
  },
];

/** Deterministic mock transaction templates applied per month for savings. */
const MONTHLY_SAVINGS_TEMPLATES: TemplateEntry[] = [
  {
    ref_suffix: "transfer-in",
    amount: "200.00",
    indicator: "CRDT",
    debtor: "Current Account",
    info: "Monthly savings",
  },
  {
    ref_suffix: "interest",
    amount: "0.12",
    indicator: "CRDT",
    debtor: "Bank Interest",
    info: "Interest payment",
  },
];

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function generateHistoricalTransactions(
  dateFrom: string,
  dateTo: string,
  isSavings: boolean,
) {
  const from = new Date(dateFrom + "T00:00:00Z");
  const to = new Date(dateTo + "T00:00:00Z");
  const transactions = [];
  const templates = isSavings ? MONTHLY_SAVINGS_TEMPLATES : MONTHLY_TEMPLATES;
  const refPrefix = isSavings ? "MOCK-SAV-HIST" : "MOCK-HIST";

  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
  );
  while (cursor <= to) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const dateStr = `${year}-${pad(month)}-15`;
    const d = new Date(dateStr + "T00:00:00Z");

    if (d >= from && d <= to) {
      for (const tmpl of templates) {
        transactions.push({
          entry_reference: `${refPrefix}-${year}-${pad(month)}-${tmpl.ref_suffix}`,
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
  const accountId = (context.params as { id: string }).id;
  const isSavings = accountId.endsWith("-savings");

  // If both date_from and date_to are provided, return deterministic historical data
  if (dateFrom && dateTo) {
    return Response.json({
      transactions: generateHistoricalTransactions(dateFrom, dateTo, isSavings),
      continuation_key: null,
    });
  }

  const recentTxns = isSavings
    ? getSavingsTransactions()
    : getRecentTransactions();

  // If only date_from is provided (refresh flow), filter recent transactions
  if (dateFrom) {
    return Response.json({
      transactions: recentTxns.filter((tx) => tx.booking_date >= dateFrom),
      continuation_key: null,
    });
  }

  // Default: return recent fixed transactions
  return Response.json({
    transactions: recentTxns,
    continuation_key: null,
  });
};
