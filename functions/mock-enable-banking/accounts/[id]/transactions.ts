import type { EBEnv } from "../../../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

const MOCK_TRANSACTIONS = [
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

export const onRequestGet: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  return Response.json({
    transactions: MOCK_TRANSACTIONS,
    continuation_key: null,
  });
};
