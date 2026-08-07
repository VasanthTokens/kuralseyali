# 📋 kuralseyali — WhatsApp Voice-to-Job-Card Converter

Turn a customer's WhatsApp voice note into an organized, bilingual job card — automatically, with zero app to learn.

---

## The problem

Millions of small service providers in India — electricians, plumbers, AC technicians — run their entire business through phone calls and WhatsApp voice notes. Job details get forgotten or buried in chat history, and there's neither the time nor the appetite to adopt a "proper business app" with logins and forms.

**This project meets them exactly where they already are.** No behavior change required — a customer sends a voice note the way they always have; the system quietly organizes it behind the scenes.

## Who it's for

- **The customer** (e.g. Vasanth) — speaks naturally in their own language, in a voice note, the way they'd talk to any tradesperson. No app, no form, no typing.
- **The electrician** (e.g. Mano) — gets a clean, bilingual job card on WhatsApp the instant a request comes in, and a live dashboard to manage everything without needing to scroll back through chat history.

Because the system detects and translates *any* Indian language, a Tamil-speaking electrician can take jobs from customers anywhere in India — Kerala, Karnataka, Andhra Pradesh, wherever — and still read every job card in Tamil.

---

## How it works

| Step | What happens |
|---|---|
| 1 | Customer sends a WhatsApp voice note (or text) describing the problem, in any language |
| 2 | Twilio's WhatsApp Sandbox receives it and hits our webhook |
| 3 | Google Gemini transcribes the audio **and** extracts structured job details in a single API call |
| 4 | The job card is saved to Google Sheets (acting as a free, zero-setup database) |
| 5 | A bilingual (Tamil + English) job card is sent back on WhatsApp automatically |
| 6 | A short spoken **Tamil voice note** summarizing the job is also sent right after — for customers who understand spoken Tamil better than they read it |
| 7 | The job also appears instantly on a live web dashboard |
| 8 | When the electrician marks a job **In Progress** or **Done** on the dashboard, the customer is automatically notified back on WhatsApp — bilingually, with a spoken Tamil status update too |

### Architecture

```
Customer (WhatsApp voice note / text)
        │
        ▼
Twilio WhatsApp Sandbox ──▶ Express webhook (/webhook)
        │
        ▼
Gemini API (gemini-3.1-flash-lite)
  — transcribes audio AND extracts structured fields
  — returns both English and Tamil versions of each field
        │
        ▼
Google Sheets (job card storage, deduped by WhatsApp MessageSid)
        │
        ├──▶ WhatsApp auto-reply to customer (bilingual job card)
        │        └──▶ Google TTS (Tamil) ──▶ spoken Tamil voice note
        └──▶ React dashboard (live job list, filters, status controls)
                     │
                     ▼
        Mark "In Progress" / "Done" ──▶ WhatsApp status update to customer
                                              └──▶ spoken Tamil status voice note
```

---

## Tech stack

| Component | Role | Why this choice |
|---|---|---|
| **Twilio WhatsApp Sandbox** | Send/receive WhatsApp messages | Fastest way to prototype — no WhatsApp Business verification needed for a demo |
| **Google Gemini API** (`gemini-3.1-flash-lite`) | Voice transcription **and** structured field extraction, in one call | Handles audio input directly (no separate speech-to-text step needed); free tier gives 500 requests/day, comfortably more than a solo tradesperson needs |
| **Google Sheets API** | Job card storage | Zero schema setup, human-readable, free, and the electrician (or a developer) can open it directly if needed |
| **React + Vite** | Live dashboard | Familiar, fast dev server, polls the backend every 5s for near-real-time updates |
| **ngrok** (static free domain) | Exposes local server to the internet for Twilio's webhook | Free permanent subdomain — no need to update Twilio's webhook URL every time the tunnel restarts |
| **Express (Node.js)** | Backend server | Simple, minimal, easy to reason about for a small webhook + REST API |
| **`google-tts-api`** (npm) | Text-to-speech for the spoken Tamil voice note | Free, no API key — wraps Google Translate's TTS engine and hands back a public audio URL Twilio can fetch directly, no hosting needed |

---

## Key design decisions

- **One AI call does two jobs.** Instead of a separate transcription step (e.g. Whisper) and a separate extraction step (e.g. a second LLM call), Gemini's multimodal input takes the raw audio and returns transcription + structured JSON in a single request — simpler pipeline, fewer points of failure, and it fits inside the free tier.
- **Bilingual by default, not as an afterthought.** Every job card and status update is generated in **both English and Tamil**, side by side. The extraction prompt asks Gemini to return dedicated `_ta` (Tamil) fields for the issue, location, and requested time — not just translated labels around English text — so the Tamil block reads naturally regardless of what language the customer originally spoke.
- **Language-agnostic input.** The extraction prompt explicitly does not assume Hindi/English; it instructs Gemini to detect and handle any Indian language or dialect. This is what lets a Tamil Nadu electrician take jobs from customers anywhere in the country.
- **The dashboard is optional, not required.** Since the target user primarily lives in WhatsApp, every meaningful update (new job, status change) is pushed to WhatsApp automatically. The dashboard link is included in the very first job card message, so it's discoverable without needing separate onboarding — but nothing breaks if the electrician never opens it.
- **Idempotent by design.** Twilio (like most webhook providers) may retry a delivery. Every job card is deduped using the WhatsApp `MessageSid` as a unique key before writing to the sheet, so retries never create duplicate job cards.
- **Fails loudly, not silently.** Gemini's output is validated against a required-keys schema before it's ever written to the sheet. A malformed AI response throws an error and gets logged — it does not silently corrupt a job card with partial data.
- **Voice, not just text, for the Tamil reader gap.** A lot of small-business customers speak and understand Tamil fluently but aren't confident readers — older customers especially. Rather than assume everyone reads the text job card, a short spoken Tamil summary (issue + location + status only, not the whole card) is sent as a WhatsApp voice note right after. Currently Tamil-only; kept intentionally short so it doesn't turn into a tedious robotic-voice reading of every field.

---

## Project structure

```
whatsapp-job-card-project/
├── server/                        Backend (Node.js + Express)
│   ├── index.js                   App entry point, mounts routes
│   ├── routes/
│   │   ├── webhook.js             Receives inbound Twilio WhatsApp messages
│   │   └── jobs.js                REST API consumed by the dashboard (list + status update)
│   ├── services/
│   │   ├── gemini.js              Audio download + Gemini transcription/extraction
│   │   ├── sheets.js              Google Sheets read/write (the "database")
│   │   └── whatsapp.js            Bilingual message formatting + Twilio send + Tamil TTS voice notes
│   ├── .env                       Local secrets (not committed)
│   ├── .env.example               Template showing which keys are needed
│   └── google-service-account.json   Google service account credentials (not committed)
│
└── dashboard/                     Frontend (React + Vite)
    ├── index.html
    └── src/
        ├── App.jsx                Job board UI — list, filters, status actions
        └── main.jsx
```

---

## Setup

### Prerequisites
- Node.js installed
- A free [Twilio](https://twilio.com) account (WhatsApp Sandbox)
- A free [Google AI Studio](https://aistudio.google.com/apikey) account for a Gemini API key
- A Google Cloud service account with Sheets API access, and a Google Sheet named `JobCards` shared with that service account's email
- [ngrok](https://ngrok.com/download) (free account, with a static domain claimed under **Domains** in the ngrok dashboard)

### 1. Install dependencies

```bash
cd server
npm install
npm install google-tts-api   # Tamil voice-note TTS

cd ../dashboard
npm install
```

### 2. Configure environment variables

Copy `server/.env.example` to `server/.env` and fill in:

```
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

GEMINI_API_KEY=your_gemini_api_key

GOOGLE_SERVICE_ACCOUNT_PATH=./google-service-account.json
GOOGLE_SHEET_ID=your_google_sheet_id

DASHBOARD_URL=http://localhost:5173

PORT=3000
```

Place your downloaded `google-service-account.json` file inside `server/`.

### 3. Run all three processes (three terminals)

**Terminal 1 — backend**
```bash
cd server
npm start
```

**Terminal 2 — tunnel (exposes the backend to the internet)**
```bash
ngrok http --url=your-static-domain.ngrok-free.dev 3000
```

**Terminal 3 — dashboard**
```bash
cd dashboard
npm run dev
```
Open `http://localhost:5173`.

### 4. Point Twilio at your tunnel

Twilio Console → Messaging → Try it out → Send a WhatsApp message → Sandbox settings → set **"When a message comes in"** to:
```
https://your-static-domain.ngrok-free.dev/webhook
```
Save. Because ngrok's static domain never changes between restarts, this only needs to be done once.

### 5. Join the sandbox and test

Send `join <your-sandbox-code>` to the Twilio Sandbox WhatsApp number, then send a real voice note describing a problem. Within seconds you should get a bilingual job card back on WhatsApp, see a new row in your Google Sheet, and see the job appear on the dashboard.

---

## Known limitations (by design, for v1)

- **Twilio Sandbox, not a verified WhatsApp Business number.** Every customer number needs to send a join code before messaging works, and that opt-in expires after 72 hours. This is a testing/demo limitation only — a production deployment would move to a Twilio-approved WhatsApp Business Sender, which removes this requirement entirely.
- **Runs on ngrok + localhost**, not a deployed server. The backend and dashboard currently run on a developer's machine; for real day-to-day use by an electrician, both would need to be deployed (e.g. Render, Fly.io, or an always-free cloud VM) so nothing depends on a laptop staying on.
- **Gemini free tier: 500 requests/day.** Comfortable for a solo tradesperson's real volume and for demos, but worth knowing if usage scales up.
- **Single technician model.** The dashboard currently assumes one electrician managing all jobs — no multi-technician assignment yet.
- **No payments or invoicing.** Out of scope for v1; this is purely job intake and status tracking.
- **Voice notes are Tamil-only, and use an unofficial TTS endpoint.** `google-tts-api` wraps Google Translate's TTS engine — free and reliable in practice, but undocumented, so it could change or rate-limit without warning. Fine for a demo; worth revisiting for production. Other languages (Telugu, Kannada, Malayalam, Hindi) aren't wired up yet, even though text extraction already detects them.

---

## Possible next steps

- Move off the Twilio Sandbox to a verified WhatsApp Business number for real customers
- Deploy the backend and dashboard so the system runs independently of a personal laptop
- Multi-technician support (assign jobs to different workers)
- Basic analytics (jobs per week, average time-to-done)
- SMS fallback for customers without WhatsApp
- Spoken voice notes for other detected languages (Telugu, Kannada, Malayalam, Hindi), not just Tamil
