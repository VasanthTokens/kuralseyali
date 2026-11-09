import twilio from "twilio";
import googleTTS from "google-tts-api";
import { synthesizeToPublicUrl } from "./timbre.js";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const URGENCY_TAMIL = {
  low: "குறைவு",
  medium: "நடுத்தரம்",
  high: "அதிகம்",
};

const PROPERTY_TYPE_TAMIL = {
  house: "வீடு",
  shop: "கடை",
  office: "அலுவலகம்",
};

const STATUS_TAMIL_LABELS = {
  Pending: "நிலுவையில்",
  "In Progress": "நடந்து கொண்டிருக்கிறது",
  Done: "முடிந்தது",
  pending: "நிலுவையில்",
  in_progress: "நடந்து கொண்டிருக்கிறது",
  done: "முடிந்தது ✅",
};

/**
 * Formats the extracted job card fields into a bilingual (Tamil + English)
 * WhatsApp confirmation message. Values for issue/location/requested_time
 * use the *_ta fields for the Tamil block, so it reads fully in Tamil
 * regardless of what language the customer originally spoke in.
 *
 * property_type / appliance_brand / payment_preference / access_notes are
 * optional extras — only shown when the customer actually mentioned them,
 * so the card stays clean for jobs where they weren't given.
 */
export function formatJobCardMessage(fields, status = "Pending") {
  const statusTamil = STATUS_TAMIL_LABELS[status] || status;
  const urgencyTamil = URGENCY_TAMIL[fields.urgency] || "குறிப்பிடப்படவில்லை";
  const propertyTypeTamil = PROPERTY_TYPE_TAMIL[fields.property_type];

  let tamilCard =
    `📋 *வேலை அட்டை*\n` +
    `வாடிக்கையாளர்: ${fields.customer_name_ta || fields.customer_name || "குறிப்பிடப்படவில்லை"}\n` +
    `பிரச்சனை: ${fields.issue_ta || fields.issue}\n` +
    `இடம்: ${fields.location_ta || fields.location || "குறிப்பிடப்படவில்லை"}\n` +
    (fields.access_notes_ta || fields.access_notes ? `வழி குறிப்பு: ${fields.access_notes_ta || fields.access_notes}\n` : "") +
    `மாற்று தொடர்பு எண்: ${fields.alternate_contact || "இல்லை"}\n` +
    `கோரப்பட்ட நேரம்: ${fields.requested_time_ta || fields.requested_time || "குறிப்பிடப்படவில்லை"}\n` +
    `அவசரம்: ${urgencyTamil}`;
  if (propertyTypeTamil) tamilCard += `\nஇடத்தின் வகை: ${propertyTypeTamil}`;
  if (fields.appliance_brand) tamilCard += `\nசாதனம்/பிராண்ட்: ${fields.appliance_brand}`;
  if (fields.payment_preference) tamilCard += `\nபணம் செலுத்தும் முறை: ${fields.payment_preference}`;
  tamilCard += `\nநிலை: ${statusTamil}`;

  let englishCard =
    `📋 *JOB CARD*\n` +
    `Customer: ${fields.customer_name || "Not mentioned"}\n` +
    `Problem: ${fields.issue}\n` +
    `Location: ${fields.location || "Not mentioned"}\n` +
    (fields.access_notes ? `Access notes: ${fields.access_notes}\n` : "") +
    `Alternate contact: ${fields.alternate_contact || "None"}\n` +
    `Requested time: ${fields.requested_time || "Not mentioned"}\n` +
    `Urgency: ${fields.urgency || "Not specified"}`;
  if (fields.property_type) englishCard += `\nProperty type: ${fields.property_type}`;
  if (fields.appliance_brand) englishCard += `\nAppliance/brand: ${fields.appliance_brand}`;
  if (fields.payment_preference) englishCard += `\nPayment preference: ${fields.payment_preference}`;
  englishCard += `\nStatus: ${status}`;

  const dashboardLink =
    `\n\n📊 எல்லா வேலைகளையும் பார்க்க / View all jobs:\n${process.env.DASHBOARD_URL}`;

  return `${tamilCard}\n\n---\n\n${englishCard}${dashboardLink}`;
}

/**
 * Formats a status-change notification (e.g. sent to the customer when
 * the electrician marks a job In Progress / Done from the dashboard).
 * `job` is a row object from sheets.js (rowToObject), so fields are
 * plain English only — this message stays bilingual using what's available.
 */
export function formatStatusUpdateMessage(job, newStatus) {
  const statusTamil = STATUS_TAMIL_LABELS[newStatus] || newStatus;
  const statusEnglish =
    { pending: "Pending", in_progress: "In Progress", done: "Done ✅" }[newStatus] || newStatus;

  return (
    `📋 *Job Update / பணி புதுப்பிப்பு*\n\n` +
    `Customer: ${job.customer_name || "—"}\n` +
    `Issue: ${job.issue}\n` +
    `Status: ${statusEnglish}\n\n` +
    `---\n\n` +
    `வாடிக்கையாளர்: ${job.customer_name || "—"}\n` +
    `பிரச்சனை: ${job.issue_ta || job.issue}\n` +
    `நிலை: ${statusTamil}`
  );
}

/**
 * Builds a short, natural spoken-Tamil sentence summarizing the job —
 * for people who understand spoken Tamil more comfortably than reading it.
 * Job-related details (problem, location, time, urgency) are spoken first;
 * secondary/contact details (name, alternate contact) come after.
 * property_type / appliance_brand / payment_preference are spoken only if
 * the customer actually mentioned them.
 */
export function buildSpokenJobSummary(fields) {
  const name = fields.customer_name_ta || fields.customer_name;
  const issue = fields.issue_ta || fields.issue;
  const location = fields.location_ta || fields.location;
  const accessNotes = fields.access_notes_ta || fields.access_notes;
  const urgency = URGENCY_TAMIL[fields.urgency];
  const requestedTime = fields.requested_time_ta || fields.requested_time;
  const propertyTypeTamil = PROPERTY_TYPE_TAMIL[fields.property_type];
  const altContact = fields.alternate_contact;
  const payment = fields.payment_preference;

  let text = ``;
  if (name) text += ` வாடிக்கையாளர் பெயர்: ${name}.`;
  text += ` பிரச்சனை: ${issue}.`;
  if (location) text += ` இடம்: ${location}.`;
  if (accessNotes) text += ` வழி குறிப்பு: ${accessNotes}.`;
  if (urgency) text += ` அவசரம்: ${urgency}.`;
  if (requestedTime) text += ` கோரப்பட்ட நேரம்: ${requestedTime}.`;
  if (propertyTypeTamil) text += ` இடத்தின் வகை: ${propertyTypeTamil}.`;
  if (altContact) text += ` மாற்று தொடர்பு எண்: ${altContact}.`;
  if (payment) text += ` பணம் செலுத்தும் முறை: ${payment}.`;
  text += ` தற்போதைய நிலை: நிலுவையில்.`;

  return text;
}

/**
 * Builds a short spoken-Tamil sentence for a status change (In Progress / Done).
 */
export function buildSpokenStatusUpdate(job, newStatus) {
  const statusTamil = STATUS_TAMIL_LABELS[newStatus] || newStatus;
  return `உங்கள் வேலையின் நிலை புதுப்பிக்கப்பட்டது. பிரச்சனை: ${job.issue_ta || job.issue}. நிலை: ${statusTamil}.`;
}

export async function sendWhatsAppReply(toNumber, message) {
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: toNumber,
    body: message,
  });
}

/**
 * Sends a plain SMS to the customer. Used for customer-facing status
 * updates (received / started / finished) in Workflow 2 (forwarded
 * messages), because the customer's number was never joined to the
 * Twilio WhatsApp sandbox — SMS has no such opt-in restriction.
 * On a trial Twilio account this still requires the destination number
 * to be a Verified Caller ID in the Twilio Console.
 */
export async function sendSMS(toNumber, message) {
  const plainNumber = toNumber.replace("whatsapp:", "");
  await client.messages.create({
    from: process.env.TWILIO_SMS_NUMBER,
    to: plainNumber,
    body: message,
  });
}

/**
 * Sends a voice note on WhatsApp.
 * First choice: Gnani Timbre (natural Indian voices, 10 languages).
 * Backup: Google Translate's free TTS, so a Timbre problem never breaks the app.
 * languageCode: "ta-IN" for the technician (default), or the customer's language.
 */
export async function sendWhatsAppVoiceNote(toNumber, text, languageCode = "ta-IN") {
  try {
    const url = await synthesizeToPublicUrl(text, languageCode);
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: toNumber,
      mediaUrl: [url],
    });
    console.log(`Timbre voice note sent (${languageCode}).`);
    return;
  } catch (err) {
    console.error("Timbre failed, using Google TTS backup:", err.message);
  }

  if (languageCode === "auto") return; // Google needs a fixed language
  const audioUrls = googleTTS
    .getAllAudioUrls(text, {
      lang: languageCode.split("-")[0],
      slow: false,
      host: "https://translate.google.com",
    })
    .map((item) => item.url);

  // Twilio's WhatsApp channel only delivers the first mediaUrl in an array,
  // so long text (split into ~200-char clips) is sent as separate messages.
  for (const url of audioUrls) {
    await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: toNumber,
      mediaUrl: [url],
    });
  }
}

/**
 * Forwards an already-hosted media file (e.g. a customer's original voice
 * note) as-is to a WhatsApp number — used for general/non-job messages,
 * where we just relay the original audio alongside its Tamil translation
 * instead of running it through TTS.
 */
export async function forwardWhatsAppMedia(toNumber, mediaUrl) {
  await client.messages.create({
    from: process.env.TWILIO_WHATSAPP_NUMBER,
    to: toNumber,
    mediaUrl: [mediaUrl],
  });
}