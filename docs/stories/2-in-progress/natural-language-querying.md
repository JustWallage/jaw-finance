Asking your bank things like: How much did I spend on summer holidays in the last 3 years? And how much did it increase over the years?
For now there should be an endpoint (or change the 'by-tags' endpoint) to query based on a set of tag patterns. It must accept:
- A date range (optional, none means scan over all transactions)
- A list of tag query selectors (no limit on the amount), the selectors can consist of this pattern (is that called a glob pattern?) parent1/child1/grandchild1, */child2, */child3/grandchild3, */*/grandchild4, parent4/*/grandchild4, etc


Then an AI model must first create the right query based on the user's tags, then it will query the results and get the results and display a nicely formatted overview, perhaps a grapqh or something. I think it'd be nice if I'd create a set of standard components to use for this (graph, table, etc) and then the AI can decide which ones to use based on the query and the results. For example, if the user asks for a breakdown of their spending by category, the AI could decide to use a pie chart to display the results. If the user asks for a list of transactions that match a certain criteria, the AI could decide to use a table to display the results.


It should determine a AND and OR pattern as well. Also, it must be able to add a date range for it. And perhaps if a relevant tag has the optional date range filled, then the AI can already automatically use that same date range for the query.

