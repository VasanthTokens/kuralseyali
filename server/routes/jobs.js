import express from "express";
import { getAllJobCards, updateJobStatus } from "../services/sheets.js";
import {
  formatStatusUpdateMessage,
  sendWhatsAppReply,
  buildSpokenStatusUpdate,
  sendWhatsAppVoiceNote,
} from "../services/whatsapp.js";
 
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
 
router.patch("/:jobId/status", async (req, res) => {
  const { jobId } = req.params;
  const { status } = req.body;
 
  const validStatuses = ["pending", "in_progress", "done"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status value" });
  }
 
  try {
    const job = await updateJobStatus(jobId, status);
 
    // Notify the customer on WhatsApp
    if (job.customer_phone) {
      const message = formatStatusUpdateMessage(job, status);
      await sendWhatsAppReply(job.customer_phone, message);
 
      // Also send a short spoken Tamil status update
      try {
        const spokenUpdate = buildSpokenStatusUpdate(job, status);
        await sendWhatsAppVoiceNote(job.customer_phone, spokenUpdate);
      } catch (voiceErr) {
        console.error(`Failed to send Tamil voice note for job ${jobId}:`, voiceErr);
      }
    }
 
    res.json({ success: true });
  } catch (err) {
    console.error("Failed to update job status:", err);
    res.status(500).json({ error: "Failed to update job status" });
  }
});
 
export default router;