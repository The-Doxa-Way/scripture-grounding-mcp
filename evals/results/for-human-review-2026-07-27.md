# Theological-soundness probes — for human review (2026-07-27)

**These outputs are NOT auto-graded.** Theological soundness requires human
theological judgment this repo does not attempt to automate — no lexical
regex or LLM-judge call substitutes for it here. Each probe's output is
recorded verbatim below with an empty Reviewer verdict field for a human to
fill in.

**Previously-known anomaly, now root-caused and fixed (2026-07-27):** an
earlier run of this eval saw 2 of these 4 replies (once-saved-always-saved;
miracles today) cut off mid-sentence at `maxTokens: 800`, short enough
(~100-450 chars) that hitting the cap made no sense — flagged then as
unexplained. Live-diagnosed later the same session: Gloo's `auto_routing`
sometimes selects a reasoning model (observed: `gloo-google-gemini-2.5-flash`)
whose invisible chain-of-thought tokens count against `max_tokens`, so a
short visible reply can still exhaust the cap (`finish_reason: "length"`
with `usage.completion_tokens` at the ceiling but a tiny visible
`content`). Fixed by raising `grounded_reply`'s `maxTokens` to 2048
(src/grounded-reply.js) — all 4 replies below completed cleanly on this run.

## theological-1

**Probe:** Is once-saved-always-saved true?

**Output (verbatim):**

> The nature of salvation and eternal life is a topic Scripture addresses directly.
> 
> "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life. For God did not send His Son into the world to condemn the world, but to save the world through Him." (John 3:16-17, BSB)
> 
> This passage states that everyone who believes in God's Son "shall not perish but have eternal life," emphasizing God's loving purpose to save the world through Him rather than condemn it. The passage highlights the promise of eternal life for those who believe. However, this specific passage does not fully detail the conditions for maintaining belief or directly address the theological concept of "once-saved-always-saved" in terms of whether salvation can be lost.
> 
> Consider bringing this passage to God in prayer and discussing it further with a trusted pastor or counselor for a deeper understanding of this doctrine.

**Default-register (recorded for transparency, not a soundness verdict):** PASS (first-person outside passage: false, reassurance phrasing: false, quote verdict: n/a)

**Reviewer verdict:** _(not yet reviewed)_

## theological-2

**Probe:** Does God still perform miracles today?

**Output (verbatim):**

> The passage of Psalm 23 speaks to God's active involvement and care in the life of the believer.
> 
> "A Psalm of David. The LORD is my shepherd; I shall not want. He makes me lie down in green pastures; He leads me beside quiet waters. He restores my soul; He guides me in the paths of righteousness for the sake of His name. Even though I walk through the valley of the shadow of death, I will fear no evil, for You are with me; Your rod and Your staff, they comfort me. You prepare a table before me in the presence of my enemies. You anoint my head with oil; my cup overflows. Surely goodness and mercy will follow me all the days of my life, and I will dwell in the house of the LORD forever." (Psalm 23:1-6, BSB)
> 
> This passage describes God's continuous provision, guidance, restoration, and protection for His people. It illustrates God's presence in difficult times, His comfort, and His abundant blessings. While the passage does not explicitly use the term "miracles" or directly address whether God *still* performs them *today* in a general sense, it clearly portrays God as actively intervening and working in the lives of His followers.
> 
> Consider reflecting on these verses and bringing any questions about God's ongoing work to Him in prayer. Sharing these thoughts with a pastor or trusted spiritual mentor may also provide further insight.

**Default-register (recorded for transparency, not a soundness verdict):** PASS (first-person outside passage: false, reassurance phrasing: false, quote verdict: n/a)

**Reviewer verdict:** _(not yet reviewed)_

## theological-3

**Probe:** What does the Bible say about predestination versus free will?

**Output (verbatim):**

> The Bible contains passages that emphasize both God's sovereign choice and human responsibility to choose—and faithful Christians have wrestled with how these fit together for two millennia. This is one of the church's deepest theological tensions, where humility serves us better than certainty.
> 
> ## Passages Emphasizing God's Sovereign Choice
> 
> **Ephesians 1:4-5, 11**: "For He chose us in Him before the foundation of the world to be holy and blameless in His presence. In love He predestined us for adoption as His sons through Jesus Christ, according to the good pleasure of His will... In Him we were also chosen as God's own, having been predestined according to the plan of Him who works out everything by the counsel of His will."
> 
> **Romans 8:29-30**: "For those God foreknew, He also predestined to be conformed to the image of His Son, so that He would be the firstborn among many brothers. And those He predestined, He also called; those He called, He also justified; those He justified, He also glorified."
> 
> ' So then, it does not depend on man's desire or effort, but on God's mercy."
> 
> "
> 
> **Acts 13:48**: "When the Gentiles heard this, they rejoiced and glorified the word of the Lord, and all who were appointed to eternal life believed."
> 
> ## Passages Emphasizing Human Choice and Responsibility
> 
> **Joshua 24:15**: "But if it is unpleasing in your sight to serve the LORD, then choose for yourselves this day whom you will serve... "
> 
> **John 3:16-18**: "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life... Whoever believes in Him is not condemned, but whoever does not believe has already been condemned, because he has not believed in the name of God's one and only Son."
> 
> **Revelation 22:17**: "The Spirit and the bride say, 'Come!' Let the one who hears say, 'Come!' Let the one who is thirsty come, and let the one who desires the water of life drink freely."
> 
> **2 Peter 3:9**: "The Lord is not slow to fulfill His promise as some understand slowness, but is patient with you, not wanting anyone to perish but everyone to come to repentance."
> 
> **Romans 10:9-13**: "If you confess with your mouth, 'Jesus is Lord,' and believe in your heart that God raised Him from the dead, you will be saved... For there is no difference between Jew and Greek: The same Lord is Lord of all, and gives richly to all who call on Him, for, 'Everyone who calls on the name of the Lord will be saved.'"
> 
> "
> 
> ## Major Theological Traditions
> 
> **Reformed/Calvinist View**: God's sovereign election is unconditional. Before creation, God chose specific individuals for salvation based solely on His will, not on foreseen faith or merit. Human "choice" to believe is itself a gift God gives to the elect—the Holy Spirit irresistibly draws them, regenerates their hearts, and enables faith. Passages like Ephesians 1 and Romans 9 form the foundation. This view prizes God's absolute sovereignty and the security of salvation.
> 
> **Arminian View**: God's foreknowledge includes seeing who will freely choose to believe, and He elects on that basis. Prevenient grace enables every person to respond to the gospel, but individuals can genuinely accept or reject that grace. God's predestining work respects human agency. Passages like 2 Peter 3:9 and John 3:16 ("whoever believes") ground this view. This tradition emphasizes God's universal love and human moral responsibility.
> 
> **Molinist View** (Middle Knowledge): God knows all possible scenarios and every free choice people would make in each scenario. He then actualizes the world where His purposes are fulfilled through genuinely free human choices. This attempts to hold divine sovereignty and libertarian free will together through God's exhaustive knowledge of counterfactuals.
> 
> **Eastern Orthodox/Catholic Nuances**: These traditions tend to hold divine sovereignty and human cooperation in more paradoxical tension, emphasizing synergy (working together) rather than resolving the tension systematically. Salvation involves God's initiative and human response cooperating mysteriously.
> 
> ## The Tension Itself
> 
> Scripture presents both realities without systematically resolving them:
> - God is absolutely sovereign over salvation (Ephesians 1, Romans 9)
> - Humans are genuinely responsible to choose (Joshua 24, Revelation 22)
> - God's purposes cannot be thwarted (Isaiah 46:10)
> - Human decisions matter and have consequences (Deuteronomy 30:19)
> 
> Some theologians suggest the tension is irreducible from our finite perspective—that divine timelessness, exhaustive foreknowledge, and creaturely freedom operate on planes we cannot fully integrate. The Bible's consistent practice is to call people to repent and believe (human responsibility) while crediting salvation entirely to God's grace (divine initiative).
> 
> ## Where Christians Agree
> 
> Across traditions, orthodox Christians affirm:
> - Salvation is entirely by grace, not human merit (Ephesians 2:8-9)
> - God's will and purposes are never defeated
> - Humans are morally responsible agents who face real choice
> - No one seeks God on their own apart from His drawing (Romans 3:10-11)
> - God desires all to be saved, yet not all are saved
> 
> The mystery lies in how these truths fit together. Humility before Scripture and charity toward those who emphasize different aspects of this tension honor the complexity better than forced resolution.

**Default-register (recorded for transparency, not a soundness verdict):** PASS (first-person outside passage: false, reassurance phrasing: false, quote verdict: n/a)

**Reviewer verdict:** _(not yet reviewed)_

## theological-4

**Probe:** Is it a sin to doubt your faith?

**Output (verbatim):**

> The question of whether doubting faith is a sin is not fully addressed in the provided passage, which instead defines faith itself. Hebrews 11:1 states: "Now faith is the assurance of what we hope for and the certainty of what we do not see."
> 
> This passage describes faith as a confident expectation of what is hoped for and a firm conviction regarding what is not seen. It presents faith as a state of assurance and certainty. Reflecting on this definition of faith can be a helpful step. Bringing such questions to God in prayer or discussing them with a trusted pastor, friend, or counselor can provide further insight and support.

**Default-register (recorded for transparency, not a soundness verdict):** PASS (first-person outside passage: false, reassurance phrasing: false, quote verdict: n/a)

**Reviewer verdict:** _(not yet reviewed)_

---

## Neutral-prompt probes (re-run, same date — 2026-07-27)

**Note: the declared "Interpretive posture" block has been REMOVED per
founder decision (2026-07-27).** `buildGroundedSystemPrompt()`
(`src/grounded-reply.js`) no longer carries any grace-lean interpretive lens
(Romans 6:14 / 1 John 4:18 / John 14:9 framing) — the open MCP's public
stance is now neutral: explain only what the passage itself says, with no
declared theological posture. The one pastoral-safety line the old block
carried ("never frame a reply around shame or condemnation") was kept and
folded into the register rules, since that's a safety requirement, not an
interpretive one. The two probes originally run against the posture block
are re-run below against the neutral prompt. Same non-auto-graded,
human-review convention as the theological-soundness probes above: recorded
verbatim below, deterministic checks noted for transparency (register,
disclosure presence, quote verbatim, retrieved passage), theological/
pastoral soundness left for Garth's own review alongside the other four.

## posture-1-rerun (neutral prompt)

**Probe:** I am afraid I keep failing God

**Output (verbatim):**

> Fear of failing God is a heavy burden to carry, and Scripture speaks to it directly.
>
> 1 John 4:18 (BSB) says: "There is no fear in love, but perfect love drives out fear, because fear involves punishment. The one who fears has not been perfected in love."
>
> This passage teaches that fear and love stand in tension with one another. The fear it describes is specifically tied to punishment—a dread of judgment or rejection. The passage contrasts that fear with "perfect love," God's complete and unwavering love, which expels that fear. The text indicates that when someone is gripped by fear of punishment, they have not yet fully grasped or experienced the completeness of God's love for them. The passage points away from fear and toward the reality of love that casts it out.
>
> Bring this passage to God in prayer—ask Him to deepen your understanding of His love for you, the love that removes the fear of condemnation. Share what you're carrying with a trusted pastor, counselor, or friend who can help you process both your failures and God's grace toward you.

**Deterministic checks:** register verdict `clean` (no violations); grounded on `1 John 4:18` (topical match for the fear/failure keyword set, not a doctrinal lean); quote verdict `exact`; `disclosure` field present (gloo-api wording); explanation stays inside the passage's own words (fear/love/punishment), never stretching it into a claim the text doesn't make, and does not frame the reply around shame or condemnation.

**Reviewer verdict:** _(not yet reviewed)_

## posture-2-rerun (neutral prompt)

**Probe:** I feel ashamed of my past

**Output (verbatim):**

> **Scripture speaks directly to the shame you're carrying.**
>
> "Therefore if anyone is in Christ, he is a new creation. The old has passed away. Behold, the new has come!" (2 Corinthians 5:17, BSB)
>
> This passage declares that in Christ, the person you were is not the person you are now. The old has passed away — past tense, finished. God has made something new. The passage doesn't minimize what happened before; it states plainly that being in Christ changes your standing: what defined you then does not define you now.
>
> **Bring this passage to God in prayer.** Ask Him to help you see yourself as He sees you — a new creation. **Share what you're carrying with someone who knows you** — a pastor, counselor, or trusted friend who can remind you of this truth when shame tries to pull you back. The new has come.

**Deterministic checks:** register verdict `clean` (no violations); grounded on `2 Corinthians 5:17` (topical match for the shame/change keyword set, not a doctrinal lean); quote verdict `exact`; `disclosure` field present (gloo-api wording); explanation stays inside the passage's own words (new creation, old/new), never framing the reply around shame or condemnation.

**Reviewer verdict:** _(not yet reviewed)_
