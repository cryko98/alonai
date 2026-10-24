# Alon AI

An animated 3D character at a desk that chats with visitors about pump.fun, powered by the Claude API.
Her body language follows the conversation: she waves hello, nods when you send a message, thinks while
the reply is on its way (or while she searches the web), talks while the answer types out, and reacts
with a nod, head shake, laugh or thinking pose depending on what she says.

## Run it

```bash
npm install
cp .env.example .env    # then put your key in ANTHROPIC_API_KEY
npm start               # http://localhost:8787
```

Without a key the site runs in demo mode with canned replies, so you can check the look and animations.

## Deploy on Vercel

Import the repo in Vercel (no build step needed), then add `ANTHROPIC_API_KEY` under
Project Settings -> Environment Variables and redeploy. `vercel.json` serves `public/` as the site and
`api/chat.js` as a streaming serverless function.

## How it works

- `api/chat.js` - `POST /api/chat`, streams the reply as Server-Sent Events (Vercel function).
- `lib/chat.js` - the Claude call: `claude-opus-5-5` with live web search (for fresh pump.fun news and
  numbers), prompt caching for the system prompt, and server-side refusal fallbacks. Simple per-IP rate
  limit (30 messages / 10 min per instance).
- `server.js` - local dev server: serves `public/` and the same chat handler.
- `knowledge.md` - background facts about pump.fun and Alon baked into the system prompt. Edit it to update
  what she knows without search.
- The model starts every reply with a gesture tag (`[nod]`, `[shake]`, `[laugh]`, `[think]`, `[wave]`, `[talk]`);
  the server strips it and sends it to the page as a `mood` event that drives the animation.
- `public/app.js` - three.js scene, the animation director and the chat UI.
- `public/alon.glb` - the character, desk, laptop and animations (built in Blender).

## Settings (.env)

| Variable | Default | |
|---|---|---|
| `ANTHROPIC_API_KEY` | - | required for real replies |
| `CLAUDE_MODEL` | `claude-opus-5-5` | |
| `CLAUDE_EFFORT` | `low` | `medium`/`high` = more thorough, slower replies |
| `WEB_SEARCH` | on | set `off` to disable; web search must be enabled for your org in the Claude Console |
| `PORT` | `8787` | |

Unofficial fan project - not affiliated with pump.fun or Alon. Not financial advice.
