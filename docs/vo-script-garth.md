# Voiceover script — Garth records, target ~2:20–2:30 spoken (v2, shortened)

**How to record:** QuickTime Player → File → New Audio Recording (or Voice
Memos). Quiet room, read naturally — no need to rush. One continuous take;
if you flub a line, pause and read that line again, I cut around it. Save
into `media/` in this repo (any filename) or tell Claude where it landed.

Numbers written as words. Em-dashes are breath pauses.

---

Ask an AI assistant to quote Isaiah fifty-three, verse five — word for word.
It answers instantly, confidently — and gets it wrong. Not badly wrong.
Almost right. Which is worse.

The founder of YouVersion — the Bible app with a billion installs — says the
best AI models misquote Scripture fifteen to sixty percent of the time. And
Scripture is already inside our AI conversations, quoted from statistical
memory. For Scripture, close isn't faithful.

So we built the missing bridge. The Scripture Grounding MCP — an open-source
server for the standard that connects tools to nearly every AI assistant:
Claude, ChatGPT, Cursor. One rule: the model never quotes from memory.

Three tools. Get passage — canonical text, live from the YouVersion Platform.
The Berean Standard Bible by default; two thousand translations with a free
key. Verify quote — hand it any AI quotation, and it runs a word-level
comparison against the canonical text — code, not another model grading its
own homework — and returns the verdict, and the correction. Grounded reply —
encouragement for a real moment, from Gloo AI Studio's values-aligned models,
allowed to quote only the text it just retrieved.

We measured it. Same model, thirty-four passages, every genre. From memory:
sixty-five percent exact. Grounded: one hundred percent. The methodology, the
corpus, and every raw output are in the open repo — reproducible with the
same free keys every participant gets. And the limitations are named right
next to the results, because trust is the product. Not solved — measured, and
materially smaller.

We run this retrieve-first pattern in production at Doxa, our encouragement
app. Opening the accuracy layer is our answer to the challenge YouVersion
issued: Scripture, present where people already are — games, IDEs, wearables,
every AI conversation on earth — word for word true.

The bridge is built. It's open. Connect it.
