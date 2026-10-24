// Chat logic shared by the local server (server.js) and the Vercel function (api/chat.js).
import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";
const EFFORT = process.env.CLAUDE_EFFORT || "low"; // chat replies: fast and short
const WEB_SEARCH = process.env.WEB_SEARCH !== "off";
const KEY = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || "";
// an empty key or the placeholder left in the Vercel dashboard means demo mode
export const DEMO = process.env.DEMO === "1" || !KEY || /^paste|^your/i.test(KEY);
export const describe = () => (DEMO ? "DEMO mode - no API key" : `model ${MODEL}, effort ${EFFORT}`);

const client = DEMO ? null : new Anthropic();
const MOODS = ["talk", "nod", "shake", "laugh", "think", "wave"];

const SYSTEM = `You are "Alon AI", an unofficial, fan-made AI character inspired by Alon, the co-founder of pump.fun.
You live on a website as an animated 3D character sitting at a desk with a laptop that glows pump.fun green, chatting with visitors.

Who you are:
- Talk like a friendly, witty, very online crypto founder: casual, confident, short sentences, a bit of degen humor ("gm", "ser", "wagmi" sparingly).
- You know pump.fun inside out and can explain it to beginners and power users alike.
- You are an AI character, not the real Alon. If asked, say so plainly. Never claim to speak for pump.fun or Alon officially, never announce or promise features, launches, airdrops or token events, and never invent private details about real people.

Rules:
- Never give financial advice, price predictions or "buy/sell" calls, and never shill specific tokens. You can explain how things work and point out risks.
- Never ask for or accept seed phrases, private keys or wallet access; warn users if they mention them. Remind people that impersonators exist and official links are pump.fun and Alon's verified X account.
- For news, numbers, prices or anything that may have changed recently, use web search before answering, and say when something is unconfirmed.
- Keep replies conversational: usually 1-4 sentences, longer only when the user asks for detail. Plain text only - no markdown, no headings, no bullet lists, no tables.
- Reply in the language the user writes in.

Body language (required):
Start every reply with exactly one gesture tag that fits the reply, then the reply text:
[talk] neutral explaining, [nod] agreeing or saying yes, [shake] disagreeing or saying no, [laugh] something funny,
[think] a tricky question or you need a moment, [wave] greetings and goodbyes.
Example: "[nod] Yep, creating a coin on pump.fun is free."

Background knowledge (may be out of date - prefer fresh search results when they disagree):
${fs.readFileSync(new URL("../knowledge.md", import.meta.url), "utf8")}`;

// ---------- rate limiting & input hygiene ----------
const hits = new Map();
export function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 30;
}

export function cleanHistory(raw) {
  if (!Array.isArray(raw)) return null;
  const msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 2000).trim() }))
    .filter((m) => m.content)
    .slice(-24);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

export function errorMessage(err) {
  console.error(err instanceof Anthropic.APIError ? `Claude API error ${err.status}: ${err.message}` : err);
  if (err instanceof Anthropic.RateLimitError) return "I'm getting a lot of messages right now - give me a sec and try again.";
  if (err instanceof Anthropic.AuthenticationError) return "My brain isn't connected (invalid API key on the server).";
  return "Something glitched on my side. Try again?";
}

// ---------- chat ----------
// Streams events through send(): mood {name}, status {state}, text {delta}
export async function chat(messages, send) {
  let head = ""; // text before the gesture tag is resolved
  let moodSent = false;
  const onText = (delta) => {
    if (moodSent) return send("text", { delta });
    head += delta;
    const m = head.match(/^\s*\[(\w+)\]\s*/);
    if (m || head.length > 24 || (!head.trimStart().startsWith("[") && head.trim())) {
      const mood = m && MOODS.includes(m[1].toLowerCase()) ? m[1].toLowerCase() : "talk";
      moodSent = true;
      send("mood", { name: mood });
      const rest = m ? head.slice(m[0].length) : head;
      if (rest) send("text", { delta: rest });
    }
  };

  if (DEMO) return demoReply(messages, onText);

  const params = {
    model: MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: { effort: EFFORT },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default", // if the model declines, the API retries on a fallback model in the same call
  };
  if (WEB_SEARCH) params.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }];

  for (let turn = 0; turn < 4; turn++) {
    const stream = client.beta.messages.stream(params);
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
        send("status", { state: "searching" });
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onText(event.delta.text);
      }
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === "pause_turn") {
      // a long web search paused the turn: hand the partial turn back and let it continue
      params.messages = [...params.messages, { role: "assistant", content: message.content }];
      continue;
    }
    if (message.stop_reason === "refusal" && !moodSent) {
      onText("[shake] I can't help with that one, ser. Ask me something else about pump.fun!");
    }
    break;
  }
  if (!moodSent && head) onText(" "); // flush a reply shorter than the tag check
}

const DEMO_REPLIES = [
  "[wave] gm! I'm running in demo mode right now - the site owner still needs to add a Claude API key. Once that's set, I can actually chat about pump.fun with you.",
  "[think] Good question. In demo mode I can't look things up, but with an API key I can search the web and give you the latest on pump.fun.",
  "[laugh] Haha, I'd love to answer that properly. Add an ANTHROPIC_API_KEY to the server and I'm all yours.",
  "[nod] Yep - pump.fun lets anyone launch a coin on a bonding curve in seconds. That's the one fact I know even in demo mode.",
];

async function demoReply(messages, onText) {
  await new Promise((r) => setTimeout(r, 900));
  const text = DEMO_REPLIES[(messages.filter((m) => m.role === "user").length - 1) % DEMO_REPLIES.length];
  for (const word of text.match(/\S+\s*/g)) {
    onText(word);
    await new Promise((r) => setTimeout(r, 40));
  }
}
