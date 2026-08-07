# Project Manager Briefing

## WhatsApp Voice-to-Job-Card Converter

\---

### 1\. One-line summary

Ramesh forwards a customer's WhatsApp voice note to our system; the system transcribes it, understands it, and turns it into an organized Job Card — automatically, with no app for Ramesh to learn.

\---

### 2\. The problem we're solving

Millions of small service providers (electricians, plumbers, AC techs) in India run their entire business over phone calls and WhatsApp voice notes. They lose bookings because details get forgotten or buried in chat history, and they have neither the time nor patience to adopt a "proper business app" with logins and forms.

**Our approach:** meet them exactly where they already are. No behavior change required — just automatic organization of what they're already doing.

\---

### 3\. How it works (plain English)

|Step|What happens|
|-|-|
|1|Customer sends Ramesh a WhatsApp voice note|
|2|Ramesh forwards it to our system's WhatsApp number|
|3|Speech-to-Text AI (Whisper) transcribes the voice note|
|4|Reasoning AI (Claude) extracts who/what/where/when|
|5|System builds a structured Job Card|
|6|Ramesh gets an auto-reply on WhatsApp + sees it on a dashboard|

\---

### 4\. Tech stack

|Component|Role|Why this choice|
|-|-|-|
|Twilio WhatsApp API|Send/receive WhatsApp messages programmatically|Fastest sandbox setup — no business verification delay|
|Whisper API (OpenAI)|Voice note → text|Handles Hindi/English code-switching reasonably well|
|Claude API (Anthropic)|Text → structured job fields|Strong structured-JSON extraction, low hallucination when prompted to null-out unknowns|
|Firebase Firestore|Job card storage|No schema migrations, real-time listeners, fast to set up|
|React dashboard|Visual job list for Ramesh|Familiar, live-updating, minimal UI overhead|

\---

### 5\. System architecture

```
Customer/Ramesh (WhatsApp)
        │
        ▼
Twilio Webhook ──▶ Backend Server (Node/Express)
        │
        ├── Voice note? ──▶ Whisper API ──▶ transcript
        └── Text? ──────────────────────────▶ transcript
        │
        ▼
Claude API (extraction) ──▶ structured JSON job card
        │
        ▼
Firestore (persisted, deduped by WhatsApp message ID)
        │
        ├──▶ WhatsApp auto-reply to Ramesh (confirmation)
        └──▶ React Dashboard (live job list)
```

\---

### 6\. Module breakdown \& status tracking

|#|Module|Deliverable|Status|
|-|-|-|-|
|1|WhatsApp ingress|Webhook receives \& logs messages|✅ Built|
|2|Voice → text|Whisper transcription pipeline|✅ Built|
|3|Text → structured data|Claude extraction + JSON validation|✅ Built|
|4|Database layer|Firestore save/fetch/update, dedupe|✅ Built|
|5|End-to-end pipeline wiring|Full automated flow|✅ Built|
|6|WhatsApp reply|Auto-confirmation message|✅ Built|
|7|Web dashboard|Live job list, filters, transcript view|✅ Built|
|8|Status management|Mark in-progress / done|✅ Built|
|9|Polish \& demo prep|Real-audio testing, edge cases|⬜ Pending team testing|

\---

### 7\. Known risks / things to flag upward

* **24-hour WhatsApp session window**: outbound messages outside 24hrs of the customer's last message require pre-approved templates. Not an issue for demo; flag as a production consideration.
* **Accented/mixed-language audio**: Whisper handles Hinglish reasonably, but must be validated against real customer-style voice notes before demo day, not the night before.
* **LLM output reliability**: extraction prompt is instructed to return `null` rather than guess — code additionally validates JSON shape before writing to DB, so a malformed LLM response fails loudly instead of corrupting a job card.
* **Idempotency**: webhook retries (common with Twilio/Meta) are deduped using the WhatsApp message ID as the Firestore document key — no duplicate job cards from retried deliveries.

\---

### 8\. What's explicitly out of scope (v1)

* Multi-technician / team support (single-user "Ramesh" model only)
* Customer-facing status updates (only Ramesh gets notified for now)
* Payment or invoicing features
* Non-WhatsApp channels (SMS, email)

\---

### 9\. Demo narrative (suggested)

1. Send a realistic Hinglish voice note ("Bhaiya mera fan kharab hai...") to the sandbox number.
2. Show the auto-reply landing in WhatsApp within seconds.
3. Switch to the dashboard — job card already live.
4. Click "Mark as Done" — show it update instantly.
5. Close with the one-liner: *"Ramesh didn't change a single thing about how he works. We just gave him a secretary that never sleeps."*

