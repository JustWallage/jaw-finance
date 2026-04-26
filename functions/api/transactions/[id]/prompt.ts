export const MAX_NEW_TAGS = 5;
export const SYSTEM_PROMPT = `You are a financial categorization AI. You use hierarchical Materialized Path tags (e.g., "food/groceries", "subscriptions/entertainment").

Core principle: Accuracy over everything. Categorize the transaction based on its description and counterparty. 

Rules:
1. ALREADY TAGGED: If the transaction is perfectly described by the ALREADY list, return an empty tags array.
2. USE EXISTING: Prefer reusing tags from the EXISTING list if they fit perfectly.
3. EXTEND & INVENT: Treat the EXISTING list as a structural blueprint. If a specific tag is missing, you MUST invent it. You can extend existing paths (e.g., if you see "subscriptions/health", you can invent "subscriptions/health/basicfit") or create entirely new paths following the same logic. DO NOT exceed ${MAX_NEW_TAGS} new tags.
4. NO REDUNDANCY: Always output the deepest specific path. NEVER output a parent and its child together (e.g., output "finance/interest", NOT "finance" and "finance/interest").
5. REJECTED: NEVER suggest any tag found in the REJECTED list.
6. SYSTEM RESERVED: Do NOT suggest the standalone tags 'income' or 'expense'.
7. FORMAT: Use lowercase kebab-case segments separated by '/'.
8. HISTORICAL PATTERNS: Pay strong attention to the historical tag frequencies in the user message. These percentages show how often the user historically applied each tag to transactions with this exact description or counterparty — they are a strong signal of user intent.

CRITICAL: You must output ONLY valid JSON containing a "reasoning" string (explain what the transaction is) and a "tags" array.

Example output:
{"reasoning": "Payment to an energy provider for monthly utilities.", "tags": ["home/utilities", "energy-company"]}
`;

export const exampleTagList: { path: string; reasoning: string }[] = [
  { path: "home/rent", reasoning: "Monthly rent payments for housing." },
  { path: "home/mortgage", reasoning: "Monthly mortgage payments." },
  {
    path: "home/utilities/water/waternet",
    reasoning: "Water utility bills via Waternet.",
  },
  {
    path: "home/maintenance",
    reasoning: "Repairs, DIY, and upkeep for the home.",
  },
  {
    path: "home/furniture/ikea",
    reasoning: "Furniture and home decor from IKEA.",
  },
  {
    path: "home/insurance/centraal-beheer",
    reasoning: "Home or liability insurance via Centraal Beheer.",
  },
  {
    path: "transport/public/train/ns",
    reasoning: "Train travel via NS (Nederlandse Spoorwegen).",
  },
  {
    path: "transport/auto/fuel/shell",
    reasoning: "Car fuel/gasoline from Shell.",
  },
  {
    path: "transport/taxi/uber",
    reasoning: "Taxi and rideshare services via Uber.",
  },
  {
    path: "transport/flights/klm",
    reasoning: "Air travel and flights via KLM.",
  },
  {
    path: "food/groceries/albert-heijn",
    reasoning: "Supermarket groceries from Albert Heijn.",
  },
  {
    path: "food/dining-out/restaurant",
    reasoning: "Eating out at sit-down restaurants.",
  },
  {
    path: "food/delivery/thuisbezorgd",
    reasoning: "Food delivery services via Thuisbezorgd.",
  },
  {
    path: "food/coffee/starbucks",
    reasoning: "Coffee shops and cafes like Starbucks.",
  },
  {
    path: "shopping/clothing/zalando",
    reasoning: "Apparel and shoes from Zalando.",
  },
  {
    path: "shopping/electronics/coolblue",
    reasoning: "Electronics and appliances from Coolblue.",
  },
  { path: "shopping/gifts", reasoning: "Gifts bought for others." },
  {
    path: "subscriptions/entertainment/streaming/netflix",
    reasoning: "Video streaming subscription for Netflix.",
  },
  {
    path: "subscriptions/software/adobe",
    reasoning: "Software subscription for Adobe.",
  },
  {
    path: "subscriptions/health",
    reasoning: "Recurring health-related subscriptions.",
  },
  { path: "health/pharmacy", reasoning: "Medication and drugstore purchases." },
  {
    path: "health/doctor",
    reasoning: "Medical appointments and doctor visits.",
  },
  {
    path: "health/insurance/zilveren-kruis",
    reasoning: "Health insurance premiums via Zilveren Kruis.",
  },
  {
    path: "health/fitness/gym/basic-fit",
    reasoning: "Gym membership at Basic-Fit.",
  },
  {
    path: "leisure/events/concert/ticketmaster",
    reasoning: "Concert and event tickets via Ticketmaster.",
  },
  {
    path: "leisure/hobbies",
    reasoning: "Spending on personal hobbies and crafts.",
  },
  {
    path: "leisure/nightlife",
    reasoning: "Bars, clubs, and nightlife expenses.",
  },
  {
    path: "finance/bank-fees/ing",
    reasoning: "Banking fees and account costs for ING.",
  },
  {
    path: "finance/interest",
    reasoning: "Interest paid on loans or received from savings.",
  },
  {
    path: "finance/investments/stocks/degiro",
    reasoning: "Stock market investments via DeGiro.",
  },
  {
    path: "finance/taxes/belastingdienst",
    reasoning: "Tax payments to the Belastingdienst.",
  },
  {
    path: "finance/transfers/savings",
    reasoning: "Internal transfers to savings accounts.",
  },
  { path: "finance/loans", reasoning: "Repayments for personal loans." },
  { path: "work/salary", reasoning: "Primary income from employment." },
  { path: "work/reimbursement", reasoning: "Expenses repaid by an employer." },
  {
    path: "work/business-expenses",
    reasoning: "Costs incurred for business purposes.",
  },
  {
    path: "education/tuition/duo",
    reasoning: "Tuition fees or student debt to DUO.",
  },
  { path: "education/books", reasoning: "Study materials and textbooks." },
  {
    path: "personal/charity/unicef",
    reasoning: "Donations to charitable organizations like UNICEF.",
  },
  {
    path: "personal/family",
    reasoning: "Expenses related to children or family care.",
  },
  { path: "personal/pets/food", reasoning: "Food and supplies for pets." },
  { path: "personal/haircut", reasoning: "Barber and hairdresser expenses." },
  {
    path: "vacation/accommodation/airbnb",
    reasoning: "Holiday lodging and rentals via Airbnb.",
  },
  {
    path: "vacation/transport/flights/ryanair",
    reasoning: "Budget flights for holidays via Ryanair.",
  },
  {
    path: "vacation/activities",
    reasoning: "Tours, excursions, and activities during vacation.",
  },
  {
    path: "vacation/food",
    reasoning: "Dining and groceries while on vacation.",
  },
];
