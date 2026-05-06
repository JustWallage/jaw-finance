export default function PrivacyPage() {
  return (
    <div className="prose prose-invert mx-auto max-w-3xl px-4 py-12">
      <h1>Data Privacy &amp; Consent Policy</h1>

      <h2>How We Handle Your Data</h2>
      <p>
        Your privacy is critical. Because we handle highly sensitive financial
        data, we adhere to strict data processing standards (GDPR).
      </p>

      <h2>1. What We Store</h2>
      <p>
        When you connect your bank, we store your transaction history (including
        amounts, dates, counterparties, and descriptions) in our database
        (Cloudflare D1), hosted within the European Union. All data is strictly
        scoped to your authenticated email address.
      </p>

      <h2>2. Artificial Intelligence Processing</h2>
      <p>
        To automatically categorize your transactions and answer natural language
        queries, jaw-finance sends your transaction descriptions and counterparty
        names to Cloudflare Workers AI (utilizing Meta&apos;s Llama models).
      </p>
      <ul>
        <li>
          <strong>Important:</strong> Your financial data is sent to this model
          strictly for real-time inference. It is <strong>not</strong> used to
          train the base AI models, and the prompt context is discarded after the
          response is generated.
        </li>
      </ul>

      <h2>3. Purpose Limitation</h2>
      <p>
        We use your data solely to provide you with the jaw-finance dashboard
        features. We do not sell your data to third parties, nor do we use it for
        advertising purposes.
      </p>

      <h2>4. Right to be Forgotten</h2>
      <p>
        You own your data. If you wish to delete your account, you have the
        right to request full deletion of your profile. Upon deletion, all
        transaction records, tags, and bank connection tokens associated with
        your email address will be permanently purged from our database.
      </p>
    </div>
  );
}
