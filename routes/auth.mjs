import { Router, json } from "express";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { passwordIssue } from "../public/js/password-policy.mjs";

const derive = promisify(scrypt);
const scryptOptions = { N: 2 ** 17, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const digestLength = 32;
// Keep the format and its cost settings with each digest for future upgrades.
const format = ["scrypt", scryptOptions.N, scryptOptions.r, scryptOptions.p].join("$");
const dummySalt = randomBytes(16);
let activeHashes = 0;

const db = new DatabaseSync(process.env.AUTH_DB || new URL("../accounts.sqlite", import.meta.url));
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
)`);
const insert = db.prepare("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING");
const find = db.prepare("SELECT id, password_hash FROM users WHERE email = ?");

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
  return res.status(status).json(error ? { error } : { ok: true });
}

async function authenticate(req, res, registering) {
  if (!req.is("application/json")) return reply(res, 415, "Send a JSON request.");
  const { username, email, password } = req.body || {};
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
    const user = find.get(address);
    const valid = await verifyPassword(password, user?.password_hash);
    if (!valid) return reply(res, 401, "Incorrect email or password.");
    startSession(req, res, user.id);
    return reply(res, 200);
  } finally {
    activeHashes--;
  }
}

const router = Router();
const cookieName = "football_session";
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

const addSession = db.prepare(
  "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"
);
const deleteSession = db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?");
const deleteExpiredSessions = db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?");
const findSessionUser = db.prepare(`
  SELECT users.id, users.username AS name, users.email
  FROM auth_sessions
  JOIN users ON users.id = auth_sessions.user_id
  WHERE token_hash = ? AND expires_at > ?
`);

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function requestToken(req) {
  const match = req.headers.cookie?.match(/(?:^|;\s*)football_session=([a-f0-9]{64})(?:;|$)/);
  return match?.[1];
}

export function sessionUser(req) {
  const token = requestToken(req);
  return token && findSessionUser.get(tokenHash(token), Date.now());
}

function startSession(req, res, userId) {
  const now = Date.now();
  const previousToken = requestToken(req);
  if (previousToken) deleteSession.run(tokenHash(previousToken));
  deleteExpiredSessions.run(now);
  const token = randomBytes(32).toString("hex");
  addSession.run(tokenHash(token), userId, now + sessionLifetime);
  res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionLifetime });
}

router.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.post("/register", json({ limit: "32kb" }), (req, res) => authenticate(req, res, true));
router.post("/login", json({ limit: "32kb" }), (req, res) => authenticate(req, res, false));
router.get("/me", (req, res) => {
  const user = sessionUser(req);
  if (!user) return reply(res, 401, "Log in first.");
  return res.json({ user });
});
router.post("/logout", (req, res) => {
  const token = requestToken(req);
  if (token) deleteSession.run(tokenHash(token));
  res.clearCookie(cookieName, cookieOptions);
  return reply(res, 200);
});

router.use((error, _req, res, _next) => {
  if (error.type === "entity.too.large") return reply(res, 413, "Request too large.");
  if (error.type === "entity.parse.failed") return reply(res, 400, "Invalid JSON.");
  console.error("Auth error:", error);
  return reply(res, 500, "Could not complete the request.");
});

export { db as accountsDb };
export default router;
