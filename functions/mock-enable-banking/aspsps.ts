import type { EBEnv } from "../lib/enable-banking";

interface MockEnv extends EBEnv {
  ENVIRONMENT?: string;
}

const MOCK_ASPSPS = [
  { name: "bunq", country: "NL", logo: "https://enablebanking.com/brands/NL/bunq/", bic: "BUNQNL2A" },
  { name: "ING", country: "NL", logo: "https://enablebanking.com/brands/NL/ING/", bic: "INGBNL2A" },
  { name: "Rabobank", country: "NL", logo: "https://enablebanking.com/brands/NL/Rabobank/", bic: "RABONL2U" },
  { name: "ABN AMRO", country: "NL", logo: "https://enablebanking.com/brands/NL/ABN%20AMRO/", bic: "ABNANL2A" },
  { name: "N26", country: "DE", logo: "https://enablebanking.com/brands/DE/N26/", bic: "NTSBDEB1" },
  { name: "Revolut", country: "LT", logo: "https://enablebanking.com/brands/LT/Revolut/", bic: "REVOLT21" },
];

export const onRequestGet: PagesFunction<MockEnv> = async (context) => {
  if (context.env.ENVIRONMENT === "production") {
    return new Response("Not Found", { status: 404 });
  }

  return Response.json({ aspsps: MOCK_ASPSPS });
};
