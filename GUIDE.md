# How to Use This System

One dashboard, three tools. The dashboard is the hub. Dreaming Spanish and YouTube feed you input. Anki holds your flashcards. The Speaking Trainer makes you talk. The dashboard connects them, captures what you learn, and keeps score.

Target split of your study time: 55% input, 15% Anki, 30% speaking. The bars on the Today tab show how close you are.

---

## First time only

1. Open the dashboard. It asks for your starting hours. This is your total lifetime Spanish exposure so far, not zero. Estimate honestly and enter it. The level gauge builds on this number.
2. Confirm the Speaking Trainer URL. It is prefilled. Leave it unless the trainer moves.
3. Install desktop Anki from apps.ankiweb.net if you have not already. The dashboard exports files that Anki imports. AnkiWeb in the browser works in a pinch but desktop is the real target.
4. Go to Progress and click Download backup JSON once, just so you know where the button lives. Everything you log lives in this one browser. A backup a month is cheap insurance. Always back up before switching machines or letting Claude Code refactor storage code.

---

## The daily loop

A full day touches all three pillars. It does not have to happen in one sitting and the order below is a suggestion, not a rule. Any minutes logged in any pillar keep the streak alive.

### 1. Input session (the biggest block)

This is where new vocabulary enters the system.

1. Open Dreaming Spanish or a YouTube channel from the Today tab in one window.
2. Open the dashboard Capture tab in a second window next to it. The capture box is already focused.
3. Watch. When a word or phrase goes by that you did not catch or could not have produced yourself, type it and press Enter. Spelling does not need to be perfect. Do not pause the video, do not switch tabs, do not look away. Type, Enter, eyes back on the video.
4. When the session ends, log the minutes on the Today tab under Input.

That is the whole trick. Capture costs two seconds per item. Everything else happens later.

What to capture: phrases you understood from context but could never say yourself, words you flat out missed, expressions that sound very Mexican. What not to capture: words you already know, entire sentences, anything you will not use.

### 2. Enrichment (a few minutes, batched)

Raw captures are just Spanish text. Enrichment adds the English and a usage note.

1. On the Capture tab, click Copy enrichment prompt. It builds a prompt from every pending item and puts it on your clipboard.
2. Paste it into a Claude chat and send.
3. Copy the JSON that comes back.
4. Paste it into the Paste enriched JSON box and click Apply. Matched items flip to enriched. Anything that did not match stays pending and gets listed so you can see what to redo.

Do this once a day or every couple of days. Batching beats doing it per word.

### 3. Speaking session

1. On the Today tab, click Copy trainer briefing. This packs your hours, level, top error patterns, and recent vocabulary onto the clipboard.
2. Click the Speaking Trainer link. On the trainer setup screen, paste the briefing into the briefing box. The trainer now knows your level, quietly steers conversation toward your weak patterns, and works your recent vocabulary into its own speech.
3. Pick a scenario and talk. Use Despacio speed if the character is too fast.
4. End the session and read the report. Flag any line the mic misheard with the I didn't say that button before ending, so bad transcriptions never pollute your error log.
5. Click Copy session for dashboard.
6. Back on the dashboard Capture tab, paste into the Paste speaking session box and click Apply session.
7. Log the minutes on the Today tab under Speaking.

What happens on Apply: vocabulary gaps from the session go straight into the queue as Mined cards, because a word you reached for and could not produce is by definition a word you need. Error patterns are only counted. An error becomes a flashcard after it shows up in three separate sessions. One slip is noise. Three sessions is a pattern worth drilling. The Capture tab shows which patterns are approaching the threshold.

### 4. Export to Anki

When the enriched count is worth a trip, usually every few days:

1. Click Export cards on the Capture tab. Two files download, one for the Mined deck and one for the Errors deck.
2. Open desktop Anki, then File, then Import, and pick each file. The files configure themselves. Decks, fields, and tags are all in the file headers. Zero manual mapping.
3. Exported cards move to the archive on the Progress tab, where they stay searchable forever.

The two decks work in opposite directions on purpose. Mined cards show Spanish and ask if you know what it means. That is recognition, matched to how you met the word. Error cards show an English instruction like Say you were tired right now and ask you to produce the correct Spanish out loud. That is production, matched to how you failed it.

### 5. Anki reviews

Do your reviews in Anki daily. Say the answers out loud, especially for Error cards. Log the minutes on the Today tab under Anki. Reviews are short by design. If Anki starts eating more than about 15% of your time, you are adding too many cards. Capture less, or delete cards you keep getting right.

---

## The rhythm, condensed

Daily: watch and capture, do Anki reviews, log minutes.
Most days: one speaking session with the briefing and session paste.
Every day or two: enrichment round trip.
Every few days: export cards, import into Anki.
Monthly: download a backup JSON.

## Streak rules

Any logged minutes in any pillar count for the day. The streak rolls at local midnight. Every 7 consecutive days you earn one freeze, and you hold at most one. A single missed day silently spends a freeze if you have one. Two missed days in a row, or a miss with no freeze in the bank, breaks the streak. The freeze count shows on the Today tab.

## Reading the Progress tab

The level gauge is driven purely by hours, and the tick spacing is honest. B2 to C1 looks far because it is far. Split adherence over the last 30 days is the truth teller. If speaking is being skipped, this is where it shows first. The top recurring errors list shows what is carded and what is climbing toward the threshold. Watch it shrink as patterns get drilled and stop appearing.

## When something goes wrong

Enrichment paste fails: the error message names exactly what broke. Fix that item in the Claude response or re run the prompt for the unmatched items.
Trainer session paste fails: make sure you copied the full JSON from Copy session for dashboard, fences and all. The parser strips markdown fences on its own.
Level looks wrong: hours drive it. Check that your starting hours and daily logs are right.
Data gone: restore from your latest backup JSON on the Progress tab. This is why the monthly backup exists.
