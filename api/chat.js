// POST /api/chat - streams Alon AI's reply as Server-Sent Events:
// mood {name}, status {state}, text {delta}, done, error {message}
import { chat, cleanHistory, rateLimited, errorMessage } from "../lib/chat.js";

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body; // already parsed by Vercel
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 100_000) throw new Error("too large");
  }
  return JSON.parse(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }); return res.end(); }

  const ip = req.headers["x-forwarded-for"]?.split(",")[0].trim() || req.socket.remoteAddress;
  if (rateLimited(ip)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Slow down, ser - too many messages. Try again in a few minutes." }));
  }
  let messages;
  try { messages = cleanHistory((await readJson(req)).messages); } catch { messages = null; }
  if (!messages) { res.writeHead(400); return res.end(); }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  const send = (event, data = {}) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  try {
    await chat(messages, send);
    send("done");
  } catch (err) {
    send("error", { message: errorMessage(err) });
  }
  res.end();
}
