import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
 
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });
 
const EXTRACTION_PROMPT = `You will receive either an audio voice note or a text message from a customer in India, sent to a small service provider (electrician, plumber, etc). The customer may speak in any Indian language or dialect (Tamil, Telugu, Kannada, Malayalam, Hindi, Bengali, Marathi, etc.), a mix of English and a regional language, or plain English. Do not assume the language in advance — detect it from the audio/text itself.
 
Your job: listen to / read the message, and return ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:
{
  "customer_name": string or null,
  "issue": string,
  "issue_ta": string,
  "location": string or null,
  "location_ta": string or null,
  "urgency": "low" | "medium" | "high" | null,
  "requested_time": string or null,
  "requested_time_ta": string or null,
  "alternate_contact": string or null,
  "property_type": "house" | "shop" | "office" | null,
  "appliance_brand": string or null,
  "payment_preference": string or null,
  "transcript": string
}
 
Rules:
- "transcript" must be your best-effort transcription of the spoken words, in the original language the customer spoke. If the input was already text, echo it back here.
- If a field is not clearly mentioned, use null. Never invent or guess details.
- "issue" should always be filled in with your best short summary of the problem, in English.
- "issue_ta" must be the Tamil translation of "issue". Always fill this in (never null), regardless of what language the customer originally spoke.
- "location" should be in English (transliterate place names as needed). "location_ta" must be the Tamil version of the same location. If location is null, location_ta is also null.
- "requested_time" should be in English. "requested_time_ta" must be the Tamil version of the same time. If requested_time is null, requested_time_ta is also null.
- "alternate_contact": only fill this if the customer explicitly mentions a backup/alternate phone number in the message. Otherwise null.
- "urgency": words meaning "now", "urgent", "immediately" in any Indian language = high. Words meaning "tomorrow", "day after" = low/medium. If unclear, use null.
- "property_type": only fill this if the customer clearly indicates whether it's a home, shop, or office (e.g. "en veetla", "en kadaila", "office la"). Otherwise null. Must be exactly one of "house", "shop", "office", or null — do not invent other values.
- "appliance_brand": only fill this if the customer mentions a specific brand or model of the appliance/equipment involved (e.g. "LG AC", "Havells switch"). Otherwise null.
- "payment_preference": only fill this if the customer explicitly mentions how they intend to pay (e.g. "GPay", "cash", "UPI"). Otherwise null.
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
async function callGemini(parts) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set in .env file");
 
  const response = await axios.post(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
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
  return text;
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
    "customer_name",
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
    "transcript",
  ];
  for (const key of requiredKeys) {
    if (!(key in parsed)) {
      throw new Error(`Extraction output missing required key: ${key}`);
    }
  }
  return parsed;
}
 
/**
 * Handles a voice note — downloads audio and sends directly to Gemini.
 * Gemini transcribes AND extracts job details (in English + Tamil) in one call.
 */
export async function processVoiceNote(mediaUrl) {
  const { base64Data, mimeType } = await downloadMediaAsBase64(mediaUrl);
  const parts = [
    { text: EXTRACTION_PROMPT },
    { inlineData: { data: base64Data, mimeType } },
  ];
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