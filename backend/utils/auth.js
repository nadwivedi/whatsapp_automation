const { createHmac, randomBytes, scryptSync, timingSafeEqual } = require("crypto");
const settings = require("../config/settings");

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padLength)}`, "base64").toString("utf8");
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== "string" || !storedHash.includes(":")) {
    return false;
  }

  const [salt, expectedHex] = storedHash.split(":");
  const derivedHex = scryptSync(password, salt, 64).toString("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const derived = Buffer.from(derivedHex, "hex");

  if (expected.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(expected, derived);
}

function signAuthToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + settings.authTokenTtlSeconds,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedBody = toBase64Url(JSON.stringify(body));
  const signature = createHmac("sha256", settings.authSecret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedBody}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string") {
    throw new Error("Missing token.");
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid token format.");
  }

  const [encodedHeader, encodedBody, providedSignature] = parts;
  const expectedSignature = createHmac("sha256", settings.authSecret)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new Error("Invalid token signature.");
  }

  const payload = JSON.parse(fromBase64Url(encodedBody));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) {
    throw new Error("Token expired.");
  }

  return payload;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
};
