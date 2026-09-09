# Ask about this bill (grounded chat)

The bottom of an expanded bill's detail panel has an **Ask about this bill** section. Starter chips (from the digest key points) or a typed question stream an answer that is grounded in the digest, the CRS summary, and the stored bill text, and cites by indented verbatim passages labelled with the section. Selecting text in the summary and choosing **Ask about this** attaches the passage to the next question.

## Sub-features

- `chat-section` renders region `Ask about this bill` (heading + note `Answers quote the bill’s text.`) at the bottom of `Details for <topic>`, with starter chips and a textbox `Ask about this bill` plus a `Send` button.
- `chat-answer` streams an assistant bubble (`Answering…` while streaming) whose verified quotes render as `figure.bill-chat-quote` blockquotes with a section caption (for example `Sec. 2. Permitting deadlines · Bill text`) and a `Share this passage` button.
- `chat-ask-about-this` — the selection toolbar `Selected text actions` gains `Ask about this`; the selection becomes an inline attachment chip on the composer (with `Remove`) and focuses the textbox.
- `chat-share-passage` — `Share this passage` opens dialog `Share this quote` through the share-quote flow (`source: "bill_text"`).
- `chat-refusal` — when the evidence does not cover the question, the bubble is styled `bill-chat-bubble--refused` and no passages render.
- `chat-error` — a provider failure shows `role="alert"` `The chat service failed. Try again shortly.` with `Retry`; a blank bubble is never shown.

## How to get to it (user POV)

- Expand a timeline bill and scroll to **Ask about this bill**; tap a starter chip or type a question and press Enter / **Send**.
- Select text in **What it does** / **Key points** / CRS summary and tap **Ask about this**.

## Driving it with verify-congress-tracker

Preconditions:

- Doctor reports a seeded feed. Visible energy topic is `House passes a broad energy permitting and production package` (H.R. 1); the seed writes four `bill_text_sections` for it (`Sec. 1.`–`Sec. 4.`).
- `workers/senate_data_worker/.dev.vars` has a real `OPENROUTER_API_KEY` (the verify Worker calls OpenRouter). Without it the section renders but every question ends in `chat-error`.
- Chamber is `All` and the searchbox is empty. Desktop viewport (1280×800).

- **Expand the energy bill.** Run `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser goto --path /`, `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role heading --name "Chronological timeline"`, then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "/House passes a broad energy permitting/" --nth 0` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role region --name "/Details for House passes a broad energy/"`.
- **Find the chat section.** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser scroll --role heading --name "Ask about this bill"` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser find --role textbox --name "Ask about this bill"` reports 1 match and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser find --selector ".bill-chat-suggestion"` reports the starter chips.
- **Proof (before).** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/bill-chat/chat-empty-desktop.png`.
- **Ask a question.** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser fill --role textbox --name "Ask about this bill" --value "How long does the Secretary have to finish an environmental review?"` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Send" --exact`. A user bubble appears and the assistant bubble shows `Answering…`.
- **Wait for the answer.** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --selector ".bill-chat-quote" --timeout-ms 60000`. Read the passages with `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser eval --js "[...document.querySelectorAll('.bill-chat-quote')].map(f => f.querySelector('blockquote').textContent + ' — ' + f.querySelector('figcaption').textContent)"`. Every blockquote must be a verbatim substring of the seeded section bodies (whitespace-normalized).
- **Proof (answer).** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser snapshot --aria --path artifacts/verify/bill-chat/chat-answer.aria.txt` and `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/bill-chat/chat-answer-desktop.png`.
- **Ask about this (selection).** Build a selection inside What it does as in `share-quote.md`, wait ~150 ms, then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Ask about this"`. The composer shows an attachment chip (`.bill-chat-attachment`) whose `title` is the selected text, and the textbox has focus (`document.activeElement.getAttribute('aria-label') === 'Ask about this bill'`).
- **Proof (attachment).** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser screenshot --path artifacts/verify/bill-chat/chat-attachment-desktop.png`.
- **Share a passage.** `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser click --role button --name "Share this passage" --nth 0` then `./.cursor/skills/verify-congress-tracker/bin/verify-congress-tracker browser wait --role dialog --name "Share this quote"`. The URL in the sheet contains `&quote=`.
- **Mobile.** Override to 390×844 (SKILL.md **Mobile proof**), re-expand the bill, and save `chat-answer-390.png` after the answer lands.

## Gotchas

- The answer comes from a free OpenRouter model, so wording varies between runs; assert on the presence of `.bill-chat-quote` and that every blockquote is verbatim from the seeded sections, not on the prose.
- The chat is `POST /chat/bill` on the Worker. Vite proxies `/chat` to 8788 in the verify stack; the helper's `api` subcommand is GET-only and cannot exercise it — drive the UI.
- Daily caps (`chat_usage`) are per client per UTC day; the verify D1 is disposable, so a fresh launch resets them, and `npm run seed` also clears `chat_usage` on the shared local D1. A `429` shows `chat-error` with the cap message.
- Each expanded bill has its own conversation (`useChat` id `bill-chat-<bill>`). Collapsing and re-expanding a row keeps the thread for the session.
