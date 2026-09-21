// Vercel serverless function: server-side text-to-speech proxy.
//
//   GET  /api/tts                        -> { provider: "deepgram" | "elevenlabs" | "none" }
//   GET  /api/tts?text=...&voice=...     -> audio/mpeg stream (lets <audio src> start playing
//                                           while the rest of the clip is still downloading)
//   POST /api/tts { text, voice }        -> audio/mpeg stream
//
// Audio is piped straight from the provider as chunks arrive; nothing is buffered here.
//
// Keys live only in environment variables and never reach the client.
//   DEEPGRAM_API_KEY      Deepgram Aura-2 (voice = Aura-2 Spanish voice name, e.g. "javier")
//   ELEVENLABS_API_KEY    ElevenLabs (ELEVENLABS_VOICE_ID / ELEVENLABS_MODEL_ID optional)
//   TTS_PROVIDER          "deepgram" | "elevenlabs" | "none" — overrides auto-detection

import { Readable } from "node:stream";

const MAX_CHARS = 1500;
const DEFAULT_ELEVEN_VOICE = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_ELEVEN_MODEL = "eleven_multilingual_v2";

function pickProvider() {
  const forced = (process.env.TTS_PROVIDER || "").trim().toLowerCase();
  if (forced === "deepgram" || forced === "elevenlabs" || forced === "none") return forced;
  if (process.env.DEEPGRAM_API_KEY) return "deepgram";
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  return "none";
}

function readBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === "object" && !Buffer.isBuffer(b)) return b;
  try {
    return JSON.parse(Buffer.isBuffer(b) ? b.toString("utf8") : String(b));
  } catch (e) {
    return {};
  }
}

function readQuery(req) {
  const q = req.query;
  if (q && typeof q === "object") return q;
  try {
    const u = new URL(req.url || "/", "http://localhost");
    return Object.fromEntries(u.searchParams.entries());
  } catch (e) {
    return {};
  }
}

function firstString(v) {
  if (Array.isArray(v)) v = v[0];
  return typeof v === "string" ? v : "";
}

function sanitizeVoice(v) {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return /^[a-z0-9-]{1,40}$/.test(s) ? s : "javier";
}

async function upstreamFor(provider, text, voice) {
  if (provider === "deepgram") {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) return null;
    const model = "aura-2-" + sanitizeVoice(voice) + "-es";
    return fetch("https://api.deepgram.com/v1/speak?model=" + encodeURIComponent(model), {
      method: "POST",
      headers: { Authorization: "Token " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
  }
  if (provider === "elevenlabs") {
    const key = process.env.ELEVENLABS_API_KEY;
    if (!key) return null;
    const voiceId = (process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVEN_VOICE).trim();
    const modelId = (process.env.ELEVENLABS_MODEL_ID || DEFAULT_ELEVEN_MODEL).trim();
    return fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voiceId) + "?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text, model_id: modelId })
      }
    );
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  let params;
  if (req.method === "GET") {
    params = readQuery(req);
    if (!firstString(params.text).trim()) {
      res.setHeader("Content-Type", "application/json");
      res.status(200).end(JSON.stringify({ provider: pickProvider() }));
      return;
    }
  } else if (req.method === "POST") {
    params = readBody(req);
  } else {
    res.setHeader("Allow", "GET, POST");
    res.status(405).end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  const provider = pickProvider();
  if (provider === "none") {
    res.status(503).end(JSON.stringify({ error: "no TTS provider configured" }));
    return;
  }

  const text = firstString(params.text).trim().slice(0, MAX_CHARS);
  if (!text) {
    res.status(400).end(JSON.stringify({ error: "text required" }));
    return;
  }

  let upstream;
  try {
    upstream = await upstreamFor(provider, text, firstString(params.voice));
  } catch (e) {
    res.status(502).end(JSON.stringify({ error: "tts upstream unreachable" }));
    return;
  }
  if (!upstream) {
    res.status(503).end(JSON.stringify({ error: "no TTS provider configured" }));
    return;
  }
  if (!upstream.ok) {
    // Do not forward the upstream body: it can echo request details we don't want to leak.
    res.status(502).end(JSON.stringify({ error: "tts upstream error", status: upstream.status }));
    return;
  }

  res.status(200);
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Accept-Ranges", "none");
  if (upstream.body && typeof Readable.fromWeb === "function") {
    // Pipe chunk-by-chunk; the client can begin playback before the upstream finishes.
    const src = Readable.fromWeb(upstream.body);
    src.on("error", () => res.end());
    res.on("close", () => src.destroy());
    src.pipe(res);
  } else if (upstream.body && typeof upstream.body.getReader === "function") {
    const reader = upstream.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } catch (e) {
    }
    res.end();
  } else {
    res.end(Buffer.from(await upstream.arrayBuffer()));
  }
}
