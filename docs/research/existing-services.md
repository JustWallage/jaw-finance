# Prior art: existing services for AI-driven transaction querying

This document surveys the existing apps and platforms we considered before deciding to build jaw-finance's AI tagging and natural-language querying in-house. It is a snapshot of the landscape at the time of research.

In 2026, the landscape for AI-driven transaction querying has moved from experimental features to standard offerings. Several apps now use RAG (or similar "grounded" AI techniques) to let you chat with your historical data.

Here are the primary apps and platforms currently using this technology:

### 1. Consumer Personal Finance Apps
These are the most accessible "ready-to-use" apps where you can simply ask questions about your spending.

* **Quicken Simplifi (Quicken Assist):** One of the most robust implementations. It features "Quicken Assist Chat," which uses RAG to search your specific transactions, account details, and savings goals. You can ask, "How much did I spend at Amazon last quarter?" and it retrieves the specific records to give you a cited summary.
* **Copilot Money:** Often cited as a leader in AI-integrated personal finance. It uses advanced "Intelligence" features to categorize and search transactions using natural language, effectively acting as a RAG interface for your bank feeds.
* **Monzo:** This neobank has integrated LLMs directly into its search and support workflows. It uses "representation learning" (transaction embeddings) to help users find specific behaviors and historical patterns through natural language search.
* **Rocket Money:** Uses AI-driven insights to scan historical transactions for recurring subscriptions and price hikes, though its natural language "chat" interface is more focused on guided navigation than a full open-ended RAG.

---

### 2. Enterprise & Business Tools
If you are looking at this from a business or "FinOps" perspective, these tools focus on deeper historical analysis of company spending.

* **CloudEagle.ai:** A leader in "AI FinOps." It uses RAG to analyze historical vendor transactions, software licenses, and renewal dates, allowing finance teams to ask things like, "Which of our SaaS contracts are underutilized based on last year's spend?"
* **Ramp:** Known for its "intelligence" layer, Ramp uses AI to scan historical receipts and transactions to automatically suggest optimizations and flag out-of-policy spending using the context of past behavior.
* **Microsoft Copilot Studio:** Many businesses now build their *own* custom transaction querying apps using this. It allows you to connect a "Copilot" to a private SQL database or SharePoint and use built-in RAG to answer employee questions about historical records.

---

### 3. Developer Platforms (To build your own)
If you want to build a RAG system for transaction querying, these are the "gold standard" frameworks in 2026:

* **LangChain / LangGraph:** The most popular orchestration framework. It has specific "Text-to-SQL" chains designed to turn a natural language question into a database query, then use RAG to summarize the results.
* **Vectara:** A "RAG-as-a-service" platform. You feed it your transaction CSVs or API data, and it handles the vectorization and retrieval automatically so you can build a chat interface on top of it.
* **Pinecone:** A vector database often used as the "memory" for historical transaction RAG systems, allowing for sub-50ms searches across millions of past purchases.

### Summary Table: Which one should you use?

| Use Case | Recommended App | Key AI Feature |
| :--- | :--- | :--- |
| **Personal Budgeting** | **Quicken Simplifi** | Quicken Assist Chat |
| **Tech-Forward Budgeting** | **Copilot Money** | AI Intelligence Search |
| **Business/SaaS Spend** | **CloudEagle.ai** | Predictive Spend Analysis |
| **Building Your Own** | **Vectara / LangChain** | Managed RAG Pipelines |