import express from "express";
import { processVoiceNote, processTextMessage } from "../services/gemini.js";
import { saveJobCard } from "../services/sheets.js";
import {
  formatJobCardMessage,
  sendWhatsAppReply,
  buildSpokenJobSummary,
  sendWhatsAppVoiceNote,
  forwardWhatsAppMedia,
} from "../services/whatsapp.js";
import { translateStatusPhrase } from "../services/gemini.js";
import { languageCodeFor } from "../services/timbre.js";

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
  const technicianNumber = process.env.TECHNICIAN_WHATSAPP_NUMBER;
  const isForwardedByTechnician = technicianNumber && From === technicianNumber;

  try {
    let fields;

    if (Number(NumMedia) > 0 && MediaUrl0) {
      // One Gemini call handles transcription + extraction + classification
      fields = await processVoiceNote(MediaUrl0);
    } else {
      if (!Body || !Body.trim()) {
        console.warn(`Empty text message ${MessageSid}, skipping.`);
        return;
      }
      fields = await processTextMessage(Body);
    }

    // Not a job — just a greeting/small talk/unrelated question. Skip
    // job-card creation entirely: translate into Tamil and forward
    // straight to the technician (plus the original voice note, if any).
    if (fields.message_type === "general") {
      const technicianMsg = `💬 *Message (not a job) / செய்தி*\n${fields.general_translation_ta}`;
      if (technicianNumber) {
        await sendWhatsAppReply(technicianNumber, technicianMsg);
        if (Number(NumMedia) > 0 && MediaUrl0) {
          await forwardWhatsAppMedia(technicianNumber, MediaUrl0);
        }
      } else {
        console.warn("TECHNICIAN_WHATSAPP_NUMBER not set — general message not forwarded.");
      }
      console.log(`General message ${MessageSid} translated and forwarded, no job card created.`);
      return;
    }

    const { created, jobId } = await saveJobCard({
      messageId: MessageSid,
      customerPhone: From,
      fields,
      rawTranscript: fields.transcript,
      // Workflow 1 (customer messages Twilio directly) -> "whatsapp".
      // Workflow 2 (technician forwarded it) -> "sms", since the real
      // customer's number is still unknown/unlinked at this point, and
      // once linked via the dashboard it'll receive updates over SMS.
      source: isForwardedByTechnician ? "sms" : "whatsapp",
    });

    if (!created) {
      console.log(`Duplicate webhook delivery for ${MessageSid}, skipped.`);
      return;
    }

    // Customer gets a short acknowledgment only, translated into their
    // own language — but ONLY if this message came directly from the
    // customer. If the technician forwarded it (Flow 2), `From` is his
    // own number — sending the ack there would just message himself.
    // In that case, the ack is sent later, once he links the real
    // customer number from the dashboard (see /customer-phone route).
    let customerAck = null;
    if (!isForwardedByTechnician) {
      customerAck = await translateStatusPhrase("received", fields.language);
      await sendWhatsAppReply(From, customerAck);
    }

    // Full bilingual job card + Tamil voice note go to the technician —
    // he only uses WhatsApp, so this is his primary way of seeing new jobs.
    try {
      if (technicianNumber) {
        const confirmationMessage = formatJobCardMessage(fields);
        await sendWhatsAppReply(technicianNumber, confirmationMessage);

        const spokenSummary = buildSpokenJobSummary(fields);
        await sendWhatsAppVoiceNote(technicianNumber, spokenSummary);
      } else {
        console.warn("TECHNICIAN_WHATSAPP_NUMBER not set — technician not notified.");
      }
    } catch (technicianErr) {
      console.error(`Failed to notify technician for ${MessageSid}:`, technicianErr);
    }

    // Customer also gets a short voice reply in their OWN language (Gnani Timbre).
    if (customerAck) {
      try {
        await sendWhatsAppVoiceNote(From, customerAck, languageCodeFor(fields.language));
      } catch (voiceErr) {
        console.error(`Failed to send customer voice reply for ${MessageSid}:`, voiceErr.message);
      }
    }

    console.log(`Job card ${jobId} created and confirmed.`);
  } catch (err) {
    console.error(`Failed to process message ${MessageSid}:`, err);
    // In production: push to a dead-letter log/collection for manual review
    // rather than silently failing.
  }
});

export default router;