// dev-node.mjs — Node-only dev harness for Cloudflare Pages Functions.
// Serves app/public/ as static files and routes /api/* to the Pages
// Functions in app/functions/api/, without requiring `wrangler pages dev`
// (which needs workerd, unavailable on this host).
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(__dirname, "..");
const publicDir = path.join(appDir, "public");
const port = Number(process.env.PORT) || 8788;

// ---- env: read app/.dev.vars (KEY=VALUE lines) if present, else process.env ----
function loadDevVars() {
  const devVarsPath = path.join(appDir, ".dev.vars");
  const env = {};
  if (fs.existsSync(devVarsPath)) {
    const text = fs.readFileSync(devVarsPath, "utf8");
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      env[key] = value;
    }
  }
  return {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
  };
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ---- build a fetch Request from an incoming node request ----
async function toFetchRequest(req) {
  const url = `http://localhost:${port}${req.url}`;
  const method = req.method || "GET";
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  let body;
  if (method !== "GET" && method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = chunks.length ? Buffer.concat(chunks) : undefined;
  }
  return new Request(url, { method, headers, body });
}

// ---- stream a fetch Response to the node response ----
async function sendFetchResponse(res, response) {
  res.statusCode = response.status;
  for (const [key, value] of response.headers) {
    res.setHeader(key, value);
  }
  if (!response.body) {
    res.end();
    return;
  }
  const nodeStream = Readable.fromWeb(response.body);
  nodeStream.pipe(res);
}

async function serveStatic(req, res, pathname) {
  let relPath = pathname === "/" ? "/index.html" : pathname;
  let filePath = path.join(publicDir, decodeURIComponent(relPath));

  // prevent path traversal outside publicDir
  if (!filePath.startsWith(publicDir)) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }

  try {
    let stat = await fsp.stat(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stat = await fsp.stat(filePath);
    }
    const data = await fsp.readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentTypeFor(filePath));
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("not found");
  }
}

async function handleApiExplain(req, res) {
  const { onRequestPost } = await import("../functions/api/explain.js");
  const request = await toFetchRequest(req);
  const env = loadDevVars();
  const ctx = {
    request,
    env,
    waitUntil: (p) => p.catch(() => {}),
  };
  const response = await onRequestPost(ctx);
  await sendFetchResponse(res, response);
}

async function handleApiWeather(req, res) {
  let mod;
  try {
    mod = await import("../functions/api/weather.js");
  } catch {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  const handler = mod.onRequestGet;
  if (typeof handler !== "function") {
    res.statusCode = 404;
    res.end("not found");
    return;
  }
  const request = await toFetchRequest(req);
  const env = loadDevVars();
  const ctx = {
    request,
    env,
    waitUntil: (p) => p.catch(() => {}),
  };
  const response = await handler(ctx);
  await sendFetchResponse(res, response);
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, `http://localhost:${port}`).pathname;

    if (req.method === "POST" && pathname === "/api/explain") {
      await handleApiExplain(req, res);
      return;
    }
    if (req.method === "GET" && pathname === "/api/weather") {
      await handleApiWeather(req, res);
      return;
    }
    if (pathname.startsWith("/api/")) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`internal error: ${err && err.stack ? err.stack : String(err)}`);
  }
});

server.listen(port, () => {
  console.log(`dev-node: serving ${publicDir} + /api/* on http://localhost:${port}`);
});
