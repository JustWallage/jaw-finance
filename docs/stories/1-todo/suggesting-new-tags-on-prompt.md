Either via a prompt directly, or automatically when the user asks for a subset (eg give me the total cost of my holiday to spain this september), then an AI should perhaps create additional tags that are relevant for the query (eg: vacation/summer/spain-september-2026).
The reasoning field is perfect for this, it will give the tagging AI much more context to apply valid tags.

This could also be done using a general prompt to make the AI create new tags (though no-one will probably use this). I think it makes more sense to bundle it into another prompt that the user will use already.

Perhaps it makes sense to run a nightly evaluation (or together with the merge tags eval) of the tags/transactions to determine new relevant tags (like vacations)


IDEA: give tags a start- and end date, optional, that makes the tagging AI already auto not include certain tags if they aren't relevant to that transaction
