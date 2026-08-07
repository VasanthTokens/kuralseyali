import express from "express";
import { processVoiceNote, processTextMessage } from "../services/gemini.js";
import { saveJobCard } from "../services/sheets.js";
import {
  formatJobCardMessage,
  sendWhatsAppReply,
  buildSpokenJobSummary,
  sendWhatsAppVoiceNote,
} from "../services/whatsapp.js";
 
const router = express.Router();
 
/**
 * Twilio hits this endpoint for every inbound WhatsApp message.
 * Payload includes NumMedia (0 if text-only), MediaUrl0 for the first
 * attachment, MessageSid (unique ID, used for idempotency), From, Body.
 */
router.post("/", async (req, res) => {
  // Respond to Twilio immediately so it doesn't retry while we do slow work
  res.status(200).send("OK");
 
  const { MessageSid, From, Body, NumMedia, MediaUrl0 } = req.body;
 
  try {
    let fields;
 
    if (Number(NumMedia) > 0 && MediaUrl0) {
      // One Gemini call handles transcription + extraction together
      fields = await processVoiceNote(MediaUrl0);
    } else {
      if (!Body || !Body.trim()) {
        console.warn(`Empty text message ${MessageSid}, skipping.`);
        return;
      }
      fields = await processTextMessage(Body);
    }
 
    const { created, jobId } = await saveJobCard({
      messageId: MessageSid,
      customerPhone: From,
      fields,
      rawTranscript: fields.transcript,
    });
 
    if (!created) {
      console.log(`Duplicate webhook delivery for ${MessageSid}, skipped.`);
      return;
    }
 
    const confirmationMessage = formatJobCardMessage(fields);
    await sendWhatsAppReply(From, confirmationMessage);
 
    // Also send a short spoken Tamil summary — helpful for people who
    // understand spoken Tamil more comfortably than reading it.
    try {
      const spokenSummary = buildSpokenJobSummary(fields);
      await sendWhatsAppVoiceNote(From, spokenSummary);
    } catch (voiceErr) {
      // Voice note is a bonus, not critical — don't fail the whole job
      // just because TTS/audio delivery had an issue.
      console.error(`Failed to send Tamil voice note for ${MessageSid}:`, voiceErr);
    }
 
    console.log(`Job card ${jobId} created and confirmed.`);
  } catch (err) {
    console.error(`Failed to process message ${MessageSid}:`, err);
    // In production: push to a dead-letter log/collection for manual review
    // rather than silently failing.
  }
});
 
export default router;
 