import express from "express";
import { getAllJobCards, updateJobStatus, updateCustomerPhone } from "../services/sheets.js";
import { sendWhatsAppReply } from "../services/whatsapp.js";
import { translateStatusPhrase } from "../services/gemini.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const jobs = await getAllJobCards();
    res.json(jobs);
  } catch (err) {
    console.error("Failed to fetch job cards:", err);
    res.status(500).json({ error: "Failed to fetch job cards" });
  }
});

router.patch("/:jobId/customer-phone", async (req, res) => {
  const { jobId } = req.params;
  const { phone } = req.body;

  if (!phone || !phone.trim()) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  const cleaned = phone.trim();
  if (!/^\+?\d{10,15}$/.test(cleaned)) {
    return res.status(400).json({ error: "Invalid phone number format" });
  }

  try {
    const job = await updateCustomerPhone(jobId, cleaned);

    // This is the moment the REAL customer number is linked (Flow 2) —
    // send the "request received" acknowledgment now, translated into
    // their language, since the earlier webhook couldn't reach them yet.
    // Sent over WhatsApp — requires this customer number to have joined
    // the Twilio sandbox first (pre-join before any live demo).
    try {
      const ackMessage = await translateStatusPhrase("received", job.language);
      await sendWhatsAppReply(job.customer_phone, ackMessage);
    } catch (ackErr) {
      console.error(`Failed to send ack after phone link for ${jobId}:`, ackErr);
    }

    res.json({ success: true, customer_phone: job.customer_phone });
  } catch (err) {
    console.error("Failed to update customer phone:", err);
    res.status(500).json({ error: "Failed to update customer phone" });
  }
});

router.patch("/:jobId/status", async (req, res) => {
  const { jobId } = req.params;
  const { status } = req.body;

  const validStatuses = ["pending", "in_progress", "done"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }

  try {
    const job = await updateJobStatus(jobId, status);

    // Notify the customer on WhatsApp — plain text only, in the customer's
    // original language (falls back to English). No voice note for status
    // updates, only for the initial job card.
    if (job.customer_phone && (status === "in_progress" || status === "done")) {
      const message = await translateStatusPhrase(status, job.language);
      await sendWhatsAppReply(job.customer_phone, message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to update job status:", err);
    res.status(500).json({ error: "Failed to update job status" });
  }
});

export default router;