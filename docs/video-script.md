# Video script — "The Model Never Quotes From Memory" (≤3:00)

Faceless screencast + captions + music. No talking head. Voiceover optional (calm,
unhurried); every line also appears as an on-screen caption so it works muted.
Record at 1920×1080, dark terminal + light Bible-text panels for contrast.

**Production rules (Doxa + challenge constraints):** no "it's not X, it's Y"
constructions; never claim the problem is "solved"; no YouVersion/Gloo logo use
beyond nominative text mentions; music must be cleared for YouTube (use a
licensed library track); BSB text only on screen.

---

## 0:00–0:25 — The problem, live

*Screen: a bare AI chat. Type:* "Quote Isaiah 53:5 exactly."
*The reply renders. Then our diff overlay lights up three wrong words in red
against the canonical text.*

CAPTION: Ask an AI to quote Scripture. It answers from memory.
CAPTION: YouVersion's founder: the best models misquote Scripture 15–60% of the time.
CAPTION: It sounds right. That's the problem.

## 0:25–0:45 — Why it matters

*Screen: the red diff lingers; slow zoom.*

CAPTION: Billions of conversations now happen inside AI assistants.
CAPTION: Scripture is already in those conversations — close enough isn't enough.

## 0:45–1:45 — The bridge, working

*Screen: one line in a config file, then the same chat, same question.*

CAPTION: This is an MCP server — the open standard every major AI surface speaks.
CAPTION: One rule: the model never quotes from memory.

*Demo beats, real screen recordings (no mockups — judges verify against the repo):*
1. `get_passage` → John 3:16, BSB, exact, cited — fetched live from the YouVersion Platform API.
2. `verify_quote` → paste the 0:00 misquote → verdict **misquote**, red/green word diff, corrected text returned.
3. `grounded_reply` → "I'm anxious about my future" → Gloo AI Studio's values-aligned model responds; Philippians 4:6–7 appears **verbatim**, cited; caption: retrieval first, generation second.

CAPTION: Canonical text from the YouVersion Platform. Values-aligned generation from Gloo AI Studio. Verification is code — a word-level diff, no model grading itself.

## 1:45–2:20 — Receipts

*Screen: benchmark bar chart animating: ungrounded vs grounded exact-quote rate;
then the limitations list, plainly shown.*

CAPTION: Same model, [BM:N] passages — narrative, poetry, prophecy, epistles.
CAPTION: Exact quotes: [BM:ungrounded]% from memory → [BM:grounded]% grounded.
CAPTION: Not solved. Measured, reproducible, and materially smaller — with the failure modes named in the repo.

## 2:20–3:00 — The frontier

*Screen: fast montage, all real: the MCP inside an IDE agent citing a verse in a
code comment context; a ChatGPT custom GPT answering with BSB text; Claude
Desktop; then the fixture JSON with its provenance block.*

CAPTION: Works in Claude, ChatGPT, Cursor — anywhere MCP goes, in any of 2,000+ languages via YouVersion.
CAPTION: Free. Open source. Works with no keys at all on the public-domain Berean Standard Bible.
CAPTION: Scripture, present where people already are — and word-for-word true.

*Final frame, still, 4 seconds:*

**The bridge is built. It's open. Connect it.**
`github.com/The-Doxa-Way/scripture-grounding-mcp`

---

## Shot list / assets needed
- [ ] Screen rec: ungrounded misquote (pick the worst real example from the benchmark run — authentic, not staged)
- [ ] Screen rec: the three tool demos (single continuous session where possible)
- [ ] Benchmark chart animation (render from benchmark/results/ with a small script — no hand-drawn numbers)
- [ ] IDE + custom GPT + Claude Desktop b-roll (each ≥5s, real)
- [ ] Licensed music track (YouTube-safe), captions file
- [ ] Upload public to YouTube (unlisted is NOT enough per rules — judges must access without login; public)
