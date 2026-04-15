Introduce tags. An expense can have multiple tags. They must be assigned either automatically, manually, or via an AI script. 

Everything should be done by tags, all labeling, grouping, etc. Long term/often used tags, but also short term tags for eg a vacation. The idea is to assign all relevant tags to a payment, so eg a vacation spending should get both `vacation` and `vacation-malaga-2026`, this way we can easily aggregate on either tag instead of only assigning `vacation-malaga-2026` and somehow also marking this payment as `vacation` to be able to aggregate on that, just add both.

Disadvantage, if a tag is added later, eg `vacation-summer`, then all previous payments must be evaluated again to possible assign this tag to those as well.

Alternative: create hierarchical categories, so eg `vacation` is a category, `vacation-summer` is a subcategory, and `vacation-malaga-2026` is a sub-subcategory. This way we can easily aggregate on any level of the hierarchy, and if we add a new category later, we can just assign the relevant subcategories to it, or we can add new subcateogries to existing parent categories.

Maybe the best option is a combination of both, tags are hierarchical, and a payment can get a tag from any level, yet if it receives a tag from a child level, it implicitely also has the parent tag. A decision to make then is how to handle removing a child tag, does it then also auto removes the parent tag? Or should it retain the parent tag? And. should we store with a tag whether it was assigned directly or because of a child tag being assinged to it.


recurring
recurring-monthly
recurring-quarterly
recurring-yearly

vacation
vacation-malaga-2026
vacation-summer
vacation-2026



Some tags will be assigned automatically, eg income & expense, some manually, some via an AI script that does this.