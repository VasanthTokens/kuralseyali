import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Folder where generated voice files are saved. index.js serves it at /audio
export const AUDIO_DIR = path.join(__dirname, "..", "audio");

// Language name (as Gemini returns it) -> Gnani language code
const LANGUAGE_CODES = {
  tamil: "ta-IN",
  telugu: "te-IN",
  kannada: "kn-IN",
  malayalam: "ml-IN",
  hindi: "hi-IN",
  marathi: "mr-IN",
  punjabi: "pa-IN",
  bengali: "bn-IN",
  gujarati: "gu-IN",
  english: "en-IN",
};

export function languageCodeFor(languageName) {
  return LANGUAGE_CODES[(languageName || "").toLowerCase().trim()] || "auto";
}

function deleteOldAudioFiles() {
  try {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const file of fs.readdirSync(AUDIO_DIR)) {
      const full = path.join(AUDIO_DIR, file);
      if (fs.statSync(full).mtimeMs < oneHourAgo) fs.unlinkSync(full);
    }
  } catch {
    // cleaning up is optional, never block on it
  }
}

/**
 * Text-to-speech with Gnani Timbre.
 * Saves the audio as an mp3 in /audio and returns a public URL that Twilio
 * can download (it uses PUBLIC_BASE_URL, your ngrok address).
 */
export async function synthesizeToPublicUrl(text, languageCode = "auto") {
  const apiKey = process.env.GNANI_API_KEY;
  if (!apiKey) throw new Error("GNANI_API_KEY is not set in .env file");

  const baseUrl = (process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) throw new Error("PUBLIC_BASE_URL is not set in .env file (use your ngrok https address)");

  const res = await fetch("https://api.vachana.ai/api/v1/tts/inference", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key-ID": apiKey,
    },
    body: JSON.stringify({
      text,
      model: process.env.GNANI_TTS_MODEL || "timbre-v3.0",
      voice: process.env.GNANI_TTS_VOICE || "Shivani",
      language: languageCode,
      speed: 1.0,
      audio_config: {
        sample_rate: 24000,
        num_channels: 1,
        container: "mp3",
        bitrate: "64k",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Timbre TTS failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length < 200) throw new Error("Timbre TTS returned empty audio");

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  deleteOldAudioFiles();
  const fileName = `${crypto.randomUUID()}.mp3`;
  fs.writeFileSync(path.join(AUDIO_DIR, fileName), audio);

  return `${baseUrl}/audio/${fileName}`;
}
