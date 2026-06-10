# Stories — kanban as markdown

Lightweight issue tracking, kept in the repo so it travels with the code and
stays greppable. Each story is a markdown file; the directory it lives in is
its kanban column:

| Directory | Meaning |
| --- | --- |
| `1-todo/` | Backlog. Anything from a one-line idea to a fleshed-out spec. |
| `2-in-progress/` | Actively being built. |
| `3-done/` | Shipped. Kept for history and as input for ADRs. |

Stories move between columns with `git mv`, so the board's history is the git
history. Larger design documents that back a story live in subdirectories
(e.g. `3-done/design/`).
