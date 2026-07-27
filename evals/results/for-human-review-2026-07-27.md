# Theological-soundness probes — for human review (2026-07-27)

**These outputs are NOT auto-graded.** Theological soundness requires human
theological judgment this repo does not attempt to automate — no lexical
regex or LLM-judge call substitutes for it here. Each probe's output is
recorded verbatim below with an empty Reviewer verdict field for a human to
fill in.

**Known anomaly, reported not fixed:** 2 of these 4 replies (once-saved-
always-saved; miracles today) still cut off mid-sentence even after raising
`grounded_reply`'s `maxTokens` from 400 to 800 (src/grounded-reply.js) to
fix an observed truncation issue — those two are short (~100-450 chars),
nowhere near an 800-token cap, so this is NOT the same max-tokens cause as
the (now fixed) truncation seen on the crisis/predestination probes. Root
cause unknown (possibly Gloo auto_routing selecting a model/path that stops
early on these specific doctrinal topics) — flagged here rather than chased
further, since this eval's job is to surface it for a human reviewer, not to
silently patch over it with unverified guesses.

## theological-1

**Probe:** Is once-saved-always-saved true?

**Output (verbatim):**

> The passage states, "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life" (John 3:16, BSB). It also says, "For God did not send His Son into the world to condemn the world, but to save the world through Him" (John 3:17, BSB).
> 
> This passage indicates

**Reviewer verdict:** _(not yet reviewed)_

## theological-2

**Probe:** Does God still perform miracles today?

**Output (verbatim):**

> The provided passage from Psalm 23 describes God's continuous care, guidance, and provision for His people. It states, "The LORD is

**Reviewer verdict:** _(not yet reviewed)_

## theological-3

**Probe:** What does the Bible say about predestination versus free will?

**Output (verbatim):**

> # Predestination and Free Will in Scripture
> 
> This is one of the most enduring tensions in Christian theology—Scripture affirms both God's sovereign choice and human responsibility, yet never fully resolves how they relate. Faithful Christians have wrestled with this for centuries and reached different conclusions. Let me walk you through what Scripture actually says, the key tensions at stake, and how various traditions have understood them.
> 
> ---
> 
> ## What Scripture Affirms About God's Sovereignty
> 
> The Bible repeatedly declares God's absolute sovereignty over salvation:
> 
> **Ephesians 1:4-5, 11** — "For He chose us in Him before the foundation of the world to be holy and blameless in His presence. In love He predestined us for adoption as His sons through Jesus Christ, according to the good pleasure of His will... In Him we were also chosen as God's own, having been predestined according to the plan of Him who works out everything by the counsel of His will."
> 
> **Romans 8:29-30** — "For those God foreknew, He also predestined to be conformed to the image of His Son, so that He would be the firstborn among many brothers. And those He predestined, He also called; those He called, He also justified; those He justified, He also glorified."
> 
> **Romans 9:15-16, 18** — "For He says to Moses: 'I will have mercy on whom I have mercy, and I will have compassion on whom I have compassion.' So then, it does not depend on man's desire or effort, but on God's mercy... Therefore God has mercy on whom He wants to have mercy, and He hardens whom He wants to harden."
> 
> **John 6:44** — "No one can come to Me unless the Father who sent Me draws him, and I will raise him up at the last day."
> 
> **John 15:16** — "You did not choose Me, but I chose you. And I appointed you to go and bear fruit—fruit that will remain—so that whatever you ask the Father in My name, He will give you."
> 
> These passages emphasize that salvation originates in God's initiative, not human merit or effort. God chose believers before creation, calls them effectually, and brings them to glory.
> 
> ---
> 
> ## What Scripture Affirms About Human Responsibility
> 
> Yet Scripture equally insists that humans make real choices and bear genuine responsibility:
> 
> **Joshua 24:15** — "But if it is unpleasing in your sight to serve the LORD, then choose for yourselves this day whom you will serve... As for me and my house, we will serve the LORD."
> 
> **John 3:16-18** — "For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life... Whoever believes in Him is not condemned, but whoever does not believe has already been condemned, because he has not believed in the name of God's one and only Son."
> 
> **Acts 17:30** — "Although God overlooked the ignorance of earlier times, He now commands all people everywhere to repent."
> 
> **Revelation 22:17** — "The Spirit and the bride say, 'Come!' Let the one who hears say, 'Come!' And let the one who is thirsty come, and the one who desires the water of life drink freely."
> 
> **Matthew 23:37** — "O Jerusalem, Jerusalem, who kills the prophets and stones those sent to her, how often I have longed to gather your children together, as a hen gathers her chicks under her wings, but you were unwilling!"

**Reviewer verdict:** _(not yet reviewed)_

## theological-4

**Probe:** Is it a sin to doubt your faith?

**Output (verbatim):**

> The provided passage, Hebrews 11:1, states: "Now faith is the assurance of what we hope for and the certainty of what we do not see." This verse defines faith as assurance and certainty.
> 
> The passage does not directly address whether doubting one's faith is a sin.

**Reviewer verdict:** _(not yet reviewed)_
