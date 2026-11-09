import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const EXTRACTION_PROMPT = `You will receive either an audio voice note or a text message from a customer in India, sent to a small service provider (electrician, plumber, etc). The customer may speak in any Indian language or dialect (Tamil, Telugu, Kannada, Malayalam, Hindi, Bengali, Marathi, etc.), a mix of English and a regional language, or plain English. Do not assume the language in advance — detect it from the audio/text itself.

First, classify the message as one of:
- "job_card" — the message contains actual service/job-relevant information: a problem/issue to fix, a location, urgency, a requested time, payment preference, access instructions, customer name, alternate contact, property type, or appliance/brand details.
- "general" — anything else: greetings ("hi", "hello", vanakkam), small talk, thanks, or a question not describing a job (e.g. "are you available on Friday?", "what's your rate?", "where is your shop?"). Use this whenever the message does NOT describe an actual problem/request needing a job card.

Your job: listen to / read the message, and return ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "message_type": "job_card" | "general",
  "customer_name": string or null,
  "customer_name_ta": string or null,
  "issue": string or null,
  "issue_ta": string or null,
  "location": string or null,
  "location_ta": string or null,
  "urgency": "low" | "medium" | "high" | null,
  "requested_time": string or null,
  "requested_time_ta": string or null,
  "alternate_contact": string or null,
  "property_type": "house" | "shop" | "office" | null,
  "appliance_brand": string or null,
  "payment_preference": string or null,
  "access_notes": string or null,
  "access_notes_ta": string or null,
  "general_translation_ta": string or null,
  "transcript": string,
  "language": string
}

Rules:
- "message_type": "job_card" if the message describes a real problem/request; "general" otherwise (greetings, small talk, unrelated questions).
- If "message_type" is "job_card": fill "issue" and "issue_ta" (never null in this case), and all other job fields as described below. "general_translation_ta" must be null.
- If "message_type" is "general": set "issue", "issue_ta", "location", "location_ta", "urgency", "requested_time", "requested_time_ta", "alternate_contact", "property_type", "appliance_brand", "payment_preference", "access_notes", "access_notes_ta" all to null. Instead, fill "general_translation_ta" with a natural, polite Tamil translation of the customer's full message — this is what gets forwarded to the technician.
- "transcript" must be your best-effort transcription of the spoken words, in the original language the customer spoke. If the input was already text, echo it back here. Always filled, regardless of message_type.
- "language": the name of the language the customer spoke/wrote in (e.g. "Tamil", "Hindi", "Telugu", "English", "Malayalam"). If it's a mix of English and a regional language, use the regional language name. Never null — default to "English" if genuinely unclear.
- If a job field is not clearly mentioned (in a job_card message), use null. Never invent or guess details.
- "customer_name": only fill this if the customer states their name. Otherwise null. Keep it in English/Latin script as spoken.
- "customer_name_ta" must be the Tamil rendering of the customer's name (transliterated into Tamil script). If customer_name is null, this is also null.
- "issue_ta" must be the Tamil translation of "issue" when message_type is job_card.
- "location" should be in English (transliterate place names as needed). "location_ta" must be the Tamil version of the same location. If location is null, location_ta is also null.
- "requested_time" should be in English. "requested_time_ta" must be the Tamil version of the same time. If requested_time is null, requested_time_ta is also null.
- "alternate_contact": only fill this if the customer explicitly mentions a backup/alternate phone number in the message. Otherwise null.
- "urgency": words meaning "now", "urgent", "immediately" in any Indian language = high. Words meaning "tomorrow", "day after" = low/medium. If unclear, use null.
- "property_type": only fill this if the customer clearly indicates whether it's a home, shop, or office (e.g. "en veetla", "en kadaila", "office la"). Otherwise null. Must be exactly one of "house", "shop", "office", or null — do not invent other values.
- "appliance_brand": only fill this if the customer mentions a specific brand or model of the appliance/equipment involved (e.g. "LG AC", "Havells switch"). Otherwise null.
- "payment_preference": only fill this if the customer explicitly mentions how they intend to pay (e.g. "GPay", "cash", "UPI"). Otherwise null.
- "access_notes": only fill this if the customer mentions how to access the location or reach them there (e.g. "gate will be open", "ask the watchman", "call before coming", "second floor", a landmark). Otherwise null. Keep it short, in English.
- "access_notes_ta" must be the Tamil translation of access_notes. If access_notes is null, this is also null.
- Keep "location" and "requested_time" close to the speaker's own words, translated to English.`;

/**
 * Downloads a Twilio-hosted media file as base64.
 */
async function downloadMediaAsBase64(mediaUrl) {
  const response = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    auth: {
      username: process.env.TWILIO_ACCOUNT_SID,
      password: process.env.TWILIO_AUTH_TOKEN,
    },
  });
  const mimeType = response.headers["content-type"] || "audio/ogg";
  const base64Data = Buffer.from(response.data).toString("base64");
  return { base64Data, mimeType };
}

/**
 * Calls Gemini API using x-goog-api-key header auth (works with AQ.-prefixed
 * AI Studio keys). Model: gemini-3.1-flash-lite (500 requests/day on free tier).
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Models are tried in order. If the first one is overloaded (503) or does not
// exist (404), we move on to the next one. You can change the list in .env:
// GEMINI_MODELS=model-one,model-two,model-three
const GEMINI_MODELS = (
  process.env.GEMINI_MODELS || "gemini-3.5-flash-lite,gemini-3.5-flash,gemini-3.1-flash-lite"
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

async function callGemini(parts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env file");

  const triesPerModel = 2;
  let lastError = null;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= triesPerModel; attempt++) {
      try {
        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          { contents: [{ parts }] },
          {
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey,
            },
          }
        );

        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from Gemini");
        if (model !== GEMINI_MODELS[0]) console.log(`Gemini answered using backup model: ${model}`);
        return text;
      } catch (err) {
        const status = err.response?.status;
        const detail = err.response?.data?.error?.message || err.message;
        // Short, clean error (the full axios error would print the API key in the logs)
        lastError = new Error(status ? `Gemini API error ${status} (${model}): ${detail}` : err.message);

        const temporary = [429, 500, 503, 504].includes(status);
        if (temporary && attempt < triesPerModel) {
          console.warn(`Gemini ${model} is busy (status ${status}). Retrying in 3s...`);
          await sleep(3000);
          continue;
        }
        console.warn(`Gemini ${model} failed (${status || "no status"}). Trying next model...`);
        break; // go to the next model
      }
    }
  }
  throw lastError || new Error("All Gemini models failed");
}

function parseAndValidate(rawText) {
  const cleaned = rawText.replace(/```json|```/g, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse Gemini output as JSON: ${err.message}\nRaw: ${rawText}`);
  }

  const requiredKeys = [
    "message_type",
    "customer_name",
    "customer_name_ta",
    "issue",
    "issue_ta",
    "location",
    "location_ta",
    "urgency",
    "requested_time",
    "requested_time_ta",
    "alternate_contact",
    "property_type",
    "appliance_brand",
    "payment_preference",
    "access_notes",
    "access_notes_ta",
    "general_translation_ta",
    "transcript",
    "language",
  ];
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`Extraction output missing required key: ${key}`);
    }
  }
  return parsed;
}

/**
 * Maps the audio mime type Twilio gives us to a file extension.
 * Gnani decides if the format is supported from the file name extension.
 */
function extensionFor(mimeType) {
  const m = (mimeType || "").toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("flac")) return "flac";
  return "ogg"; // WhatsApp voice notes are ogg by default
}

/**
 * Speech-to-text with Gnani Prisma v3.0.
 * language_code=indic-auto lets Prisma detect the language by itself.
 * Limits (from Gnani docs): audio up to 30 seconds, 1 request at a time.
 * Returns { text, lang } where lang is e.g. "ta-IN" or "ml-IN".
 */
async function transcribeWithPrisma(base64Data, mimeType) {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) throw new Error("GNANI_API_KEY is not set in .env file");

  const audioBuffer = Buffer.from(base64Data, "base64");
  const form = new FormData();
  form.append(
    "audio_file",
    new Blob([audioBuffer], { type: mimeType || "audio/ogg" }),
    `voice.${extensionFor(mimeType)}`
  );
  form.append("model", "prisma-v3.0");
  form.append("language_code", "indic-auto");
  form.append("format", "transcribe");

  const res = await fetch("https://api.vachana.ai/stt/v3", {
    method: "POST",
    headers: { "X-API-Key-ID": apiKey },
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(`Prisma STT failed (${res.status}): ${JSON.stringify(data)}`);
  }
  return {
    text: (data.transcript || "").trim(),
    lang: data.detected_language_code || null,
  };
}

/**
 * Handles a voice note.
 * Step 1: Gnani Prisma listens to the audio and returns the text + language.
 * Step 2: Gemini reads that text and makes the job card (English + Tamil).
 * If Prisma fails for any reason, we fall back to the old way (Gemini
 * listens to the audio itself) so the app never breaks during a demo.
 */
export async function processVoiceNote(mediaUrl) {
  const { base64Data, mimeType } = await downloadMediaAsBase64(mediaUrl);

  let prisma = null;
  try {
    prisma = await transcribeWithPrisma(base64Data, mimeType);
    if (!prisma.text) throw new Error("Prisma returned an empty transcript");
    console.log(`Prisma heard (${prisma.lang}): ${prisma.text}`);
  } catch (err) {
    console.error("Prisma failed, falling back to Gemini audio:", err.message);
    prisma = null;
  }

  const parts = prisma
    ? [
        { text: EXTRACTION_PROMPT },
        {
          text:
            `The following is the exact transcript of the customer's voice note ` +
            `(speech recognition detected language code: ${prisma.lang || "unknown"}).\n\n${prisma.text}`,
        },
      ]
    : [{ text: EXTRACTION_PROMPT }, { inlineData: { data: base64Data, mimeType } }];

  const rawText = await callGemini(parts);
  return parseAndValidate(rawText);
}

/**
 * Handles a plain text message.
 */
export async function processTextMessage(text) {
  const parts = [
    { text: EXTRACTION_PROMPT },
    { text },
  ];
  const rawText = await callGemini(parts);
  return parseAndValidate(rawText);
}

/**
 * Translates the two fixed status-update phrases ("job started" / "job done")
 * into the customer's original language. Falls back to English text if the
 * language is English or the call fails — status updates should never block
 * on a translation error.
 */
export async function translateStatusPhrase(status, language) {
  const englishPhrase =
    status === "received"
      ? "Your request has been received. We'll start soon."
      : status === "in_progress"
      ? "Your job has started."
      : "Your job is complete.";

  if (!language || language.toLowerCase() === "english") {
    return englishPhrase;
  }

  try {
    const prompt =
      `Translate this exact sentence into ${language}, the way a polite ` +
      `service business would address a customer — respectful and formal, ` +
      `never casual or familiar. Use respectful pronouns/verb forms ` +
      `(e.g. formal "you", polite verb conjugations), the way you'd speak ` +
      `to an elder or a customer, not a friend. ` +
      `Return ONLY the translated sentence, nothing else, no quotes, no explanation.\n\n` +
      `"${englishPhrase}"`;
    const rawText = await callGemini([{ text: prompt }]);
    return rawText.trim();
  } catch (err) {
    console.error(`Failed to translate status phrase to ${language}:`, err);
    return englishPhrase;
  }
}