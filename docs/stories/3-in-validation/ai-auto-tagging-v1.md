Definitions:
- AI: a custom AI/ML model that is trained on the user's transactions + tags
- LLM: An off the shelve AI model (probably GLM 4.7 Flash because it's free) that can assign tags based on transactions' metadata (amount, income/expense, recipient (name+iban), description, datetime)

I want a system to auto tag transactions. We're going to use Cloudflare's Workers AI service to do this. 

Auto tagging should do the following:

1. Assigning existing tags to new transactions
   1. When a new transaction is added for the first time, they should go through the AI or LLM flow, LLM flow is easier for now
2. Assigning existing tags to existing transactions
   1. EG When new tags have been added, questions: 
      1. Should we then go through all transactions again (long list, many tokens)
      2. Or can we make some kind of preselection of similar transactions and only evaluate those for the new tags?
      3. Perhaps a custom AI model that is custom trained for the user with their transactions and tags as data input to create custom weights for them (not sure how exactly this works), this should then quickly & cheaply be able to determine whether existing transactions should get the new tag. However, if there's only a single transaction for this new tag, how can the custom AI know which the transactions the tag applies to if it has only a single datapoint with that tag? Perhaps we can let an LLM determine what types of transactions (what set of tags) would fit this new tag, and then filter on those, and let LLM again assign the tag or not to each
         1. The custom AI model should also be trained on all users' transactions to become a better model in general, and work well for new users that have no custom tags yet
      4. For now let's not do this, only tag new transactions with the new tags
3. Determine possible new tags (current set of tags must be provided to the LLM so it knows what already exists)
   1. Do we need to confirm new tags with the user?
   2. LLM Should get a description on how tags work and what types of tags are expected
4. Merging existing tags
   1. When LLM decides some two tags are similar (eg food & diner), then it should suggest the merge to the user who can then accept or reject the merge
   2. If the user doesn't accept, this merge should be stored and perhaps added to the prompt to prevent the LLM from suggesting the same merge again


