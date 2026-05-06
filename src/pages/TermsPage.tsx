export default function TermsPage() {
  return (
    <div className="prose prose-invert mx-auto max-w-3xl px-4 py-12">
      <h1>Terms &amp; Conditions</h1>

      <h2>Welcome to jaw-finance</h2>
      <p>
        By using jaw-finance, you agree to the following terms regarding the
        aggregation and display of your personal financial data.
      </p>

      <h2>1. Service Description</h2>
      <p>
        jaw-finance is a personal finance dashboard. We connect to your bank
        accounts using Enable Banking (our Account Information Service Provider
        aggregator) to fetch, categorize, and display your transaction history.
      </p>

      <h2>2. Bank Connectivity (PSD2)</h2>
      <p>
        To provide this service, you must explicitly authorize jaw-finance to
        access your bank data via Open Banking (PSD2) protocols. This
        authorization is valid for a limited time (typically 180 days) and must
        be actively renewed by you. You can revoke this connection at any time
        via your bank&apos;s portal or within the jaw-finance interface.
      </p>

      <h2>3. Limitation of Liability</h2>
      <p>
        The data presented in jaw-finance is for informational purposes only and
        does not constitute financial advice. While we strive for accuracy, we
        cannot guarantee that the transaction categorization or AI-generated
        summaries are completely free of errors.
      </p>
    </div>
  );
}
