# Kural Seyali: Solution Pitch

**Voice-to-job-card assistant for small service businesses, built with Gnani AI Prisma + Timbre**
By Ponvasanth S | The Great Indian AI Internship Challenge

---

## The problem

Electricians, plumbers and other local technicians get most of their requests on WhatsApp as **voice notes**. Customers speak in their own language (Tamil, Malayalam, Hindi, Telugu and more), so the technician has to listen again and again, then write down the address, the problem and the timing by hand. Details get missed, jobs get delayed, and customers never know if they were understood.

## The solution

A customer sends **one WhatsApp voice note in any Indian language**. Kural Seyali turns it into a clear **job card in Tamil and English** for the technician, with a **Tamil voice summary**, and replies to the customer **in the language they spoke**, as text and as a voice note.

## How it works

1. **Customer** sends a WhatsApp voice note (via Twilio WhatsApp).
2. **Gnani Prisma v3.0** converts the speech to text and detects the language automatically.
3. **Gemini** reads the text and fills a structured job card: customer name, problem, location, urgency, requested time, access notes, property type, appliance brand and payment preference.
4. **Gnani Timbre** creates a natural Tamil voice summary for the technician, and a voice reply for the customer in their own language.
5. **Technician** receives the Tamil + English card and the Tamil voice note on WhatsApp. Every job is saved on a live dashboard and in Google Sheets.

If a customer only asks a question (for example, "are you free tomorrow?"), it is translated into Tamil and forwarded, instead of creating an empty job card.

## How Gnani models are used

| Model | Role in the product |
| :-- | :-- |
| **Prisma** (speech-to-text) | Understands the customer's voice note and detects the language, including mixed speech such as Malayalam with English words like "wiring" and "switch board" |
| **Timbre** (text-to-speech) | Speaks the Tamil summary to the technician and the confirmation to the customer in their own language |

## Impact

- A technician can serve customers who speak a language he does not understand.
- No manual note-taking: the job card is ready the moment the voice note arrives.
- Customers get an instant reply in their own language, so they know they were heard.

## Tested

Tamil, Malayalam and Hindi voice notes, using one phone as the customer and another as the technician.

## Built with

Gnani Prisma, Gnani Timbre, Gemini, Twilio WhatsApp, Node.js, Express, React and Google Sheets.

## Next steps

Longer voice notes, worker languages beyond Tamil, and a production WhatsApp Business setup so any small shop can use it.

---

Code: https://github.com/VasanthTokens/kuralseyali
Demo video: see the LinkedIn post shared in the submission form.
