import { getUserEmail, type EBEnv } from "../lib/enable-banking";
import { assignTagConsolidated } from "../lib/tag-utils";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

interface SeedTransaction {
  remittance_info: string | null;
  counterparty_name: string | null;
  tag_paths: string[];
}

interface SeedBody {
  transactions: SeedTransaction[];
}

export const onRequestPost: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  const { env } = context;
  const userEmail = getUserEmail(context.request, env.ENVIRONMENT);
  const body = (await context.request.json()) as SeedBody;

  for (const transaction of body.transactions) {
    const row = await env.DB.prepare(
      `INSERT INTO transactions (account_uid, amount, currency, credit_debit, status, booking_date, counterparty_name, remittance_info, user_email)
       VALUES ('mock-seed', '0.00', 'EUR', 'DBIT', 'BOOK', date('now'), ?, ?, ?)
       RETURNING id`,
    )
      .bind(transaction.counterparty_name ?? null, transaction.remittance_info ?? null, userEmail)
      .first<{ id: number }>();

    const transactionId = row?.id;
    if (!transactionId) continue;

    for (const tagPath of transaction.tag_paths) {
      await assignTagConsolidated(
        env.DB,
        transactionId,
        userEmail,
        tagPath,
        "user",
        "confirmed",
        null,
      );
    }
  }

  return Response.json({ ok: true });
};
