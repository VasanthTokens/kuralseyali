import dotenv from "dotenv";
dotenv.config();

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { AUDIO_DIR } from "./services/timbre.js";

import webhookRouter from "./routes/webhook.js";
import jobsRouter from "./routes/jobs.js";

const app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use("/audio", express.static(AUDIO_DIR));
app.use("/webhook", webhookRouter);
app.use("/api/jobs", jobsRouter);

app.get("/", (req, res) => {
  res.send("WhatsApp Voice-to-Job-Card Converter is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});