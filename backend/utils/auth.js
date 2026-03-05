const { createHmac, randomBytes, scryptSync, timingSafeEqual } = require("crypto");

const AUTH_SECRET = process.env.AUTH_SECRET || "change-this-secret-in-production";
const AUTH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);

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
  return timingSafeEqual(Buffer.from(derivedHex, "hex"), Buffer.from(expectedHex, "hex"));
}

function issueToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const body = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + AUTH_TOKEN_TTL_SECONDS,
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedBody = toBase64Url(JSON.stringify(body));
  const signature = createHmac("sha256", AUTH_SECRET)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${encodedHeader}.${encodedBody}.${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const [encodedHeader, encodedBody, signature] = token.split(".");
  if (!encodedHeader || !encodedBody || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", AUTH_SECRET)
    .update(`${encodedHeader}.${encodedBody}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encodedBody));
  } catch (_error) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (!payload?.exp || now >= payload.exp) {
    return null;
  }

  return payload;
}

function signAuthToken(payload) {
  return issueToken(payload);
}

function verifyAuthToken(token) {
  const payload = verifyToken(token);
  if (!payload) {
    throw new Error("Invalid token");
  }
  return payload;
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  issueToken,
  verifyToken,
};
