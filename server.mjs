import { createServer } from "node:http";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { passwordIssue } from "./password-policy.mjs";

const derive = promisify(scrypt);
const scryptOptions = { N: 2 ** 17, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const digestLength = 32;
// Keep the format and its cost settings with each digest for future upgrades.
const format = ["scrypt", scryptOptions.N, scryptOptions.r, scryptOptions.p].join("$");
const dummySalt = randomBytes(16);
let activeHashes = 0;

process.umask(0o077);
const db = new DatabaseSync(process.env.AUTH_DB || new URL("./accounts.sqlite", import.meta.url));
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
)`);
const insert = db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING");
const find = db.prepare("SELECT password_hash FROM users WHERE email = ?");

async function hashPassword(password) {
  const salt = randomBytes(16);
  const digest = await derive(password, salt, digestLength, scryptOptions);
  return [format, salt.toString("hex"), digest.toString("hex")].join("$");
}

async function verifyPassword(password, record) {
  const parts = record?.split("$");
  const valid = parts?.length === 6 && parts.slice(0, 4).join("$") === format
    && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{64}$/.test(parts[5]);
  const salt = valid ? Buffer.from(parts[4], "hex") : dummySalt;
  const expected = valid ? Buffer.from(parts[5], "hex") : Buffer.alloc(digestLength);
  const actual = await derive(password, salt, digestLength, scryptOptions);
  return timingSafeEqual(actual, expected) && Boolean(valid);
}

function reply(res, status, error) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(error ? { error } : { ok: true }));
}

async function authenticate(req, res, registering) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") {
    return reply(res, 415, "Send a JSON request.");
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32768) return reply(res, 413, "Request too large.");
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return reply(res, 400, "Invalid JSON.");
  }
  const { username, email, password } = body || {};
  if (typeof email !== "string" || typeof password !== "string" || !password) {
    return reply(res, 400, "Enter an email and password.");
  }
  const address = email.trim().toLowerCase();
  if (registering) {
    if (typeof username !== "string" || username.trim().length < 2 || username.trim().length > 40) {
      return reply(res, 400, "Enter a username of 2 to 40 characters.");
    }
    if (!/^[^\s@]+@[^\s@]+$/u.test(address)) return reply(res, 400, "Enter a valid email.");
    const issue = passwordIssue(password, username, address);
    if (issue) return reply(res, 400, issue);
  }

  if (activeHashes >= 2) return reply(res, 503, "Server busy. Please try again.");
  activeHashes++;
  try {
    if (registering) {
      const record = await hashPassword(password);
      const result = insert.run(username.trim(), address, record);
      if (!result.changes) return reply(res, 409, "An account already uses this email.");
      return reply(res, 201);
    }
    const valid = await verifyPassword(password, find.get(address)?.password_hash);
    if (!valid) return reply(res, 401, "Incorrect email or password.");
    return reply(res, 200);
  } finally {
    activeHashes--;
  }
}

const assets = new Map([
  ["/", ["index.html", "text/html"]],
  ["/index.html", ["index.html", "text/html"]],
  ["/style.css", ["style.css", "text/css"]],
  ["/script.js", ["script.js", "text/javascript"]],
  ["/password-policy.mjs", ["password-policy.mjs", "text/javascript"]]
]);
const server = createServer(async (req, res) => {
  try {
    const path = req.url.split("?")[0];
    if (req.method === "POST" && (path === "/api/register" || path === "/api/login")) {
      return await authenticate(req, res, path === "/api/register");
    }
    const asset = assets.get(path);
    if (req.method !== "GET" || !asset) return reply(res, 404, "Not found.");
    const content = await readFile(new URL(asset[0], import.meta.url));
    res.writeHead(200, { "Content-Type": asset[1] + "; charset=utf-8" });
    res.end(content);
  } catch {
    if (!res.headersSent) reply(res, 500, "Server error. Please try again.");
    else res.end();
  }
});
server.listen(Number(process.env.PORT || 3000), "127.0.0.1", () => {
  console.log(`Open http://127.0.0.1:${server.address().port}`);
});
