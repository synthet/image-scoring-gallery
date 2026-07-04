# /wiki-query — Search the docs wiki to answer a question

Use when answering a question using the wiki as the primary knowledge source, or when the user wants to search docs for a topic.

## Inputs

- A question or topic to search for.
- Optional: `--file-back` to save the answer as a new wiki page.

## Steps

1. **Search `docs/`** for pages relevant to the question — grep content, scan `docs/README.md` index, check filenames.
2. **Read** the most relevant pages (up to 5–6).
3. **Synthesize** an answer from wiki content. Cite sources with page links.
4. **Note gaps** — if the wiki cannot fully answer the question, say what's missing. Optionally check code or config to fill gaps.
5. If `--file-back`: propose a filename and category, write the answer as a new wiki page, update `docs/README.md` index and `docs/log.md`.

## Done when

- Question is answered with citations to wiki pages.
- Gaps are noted if the wiki is incomplete.
- If file-back: new page exists in the wiki, index and log updated.

## Checklist

- [ ] Answer cites wiki sources with page links
- [ ] Knowledge gaps noted if wiki is incomplete
- [ ] If filed back: page follows naming conventions
- [ ] If filed back: index and log updated
