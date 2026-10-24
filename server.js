// Local dev server: serves public/ and the same /api/chat endpoint that runs as a Vercel function in production.
// Run: npm install && npm start   (reads ANTHROPIC_API_KEY from .env if present)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import handler from "./api/chat.js";
import { describe } from "./lib/chat.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, "public");
const PORT = Number(process.env.PORT) || 8787;

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".glb": "model/gltf-binary", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function serveStatic(req, res) {
  const url = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(PUBLIC, url === "/" ? "index.html" : url);
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

http.createServer((req, res) => {
  if (req.url === "/api/chat") return handler(req, res);
  serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`Alon AI on http://localhost:${PORT}  (${describe()})`);
});
