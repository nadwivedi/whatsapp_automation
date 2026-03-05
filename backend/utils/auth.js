const { createHmac, randomBytes, scryptSync, timingSafeEqual } = require("crypto");

const AUTH_SECRET = process.env.AUTH_SECRET || "change-this-secret-in-production";
const AUTH_TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 7);
const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "wa_auth_session";
const AUTH_COOKIE_SAME_SITE = process.env.AUTH_COOKIE_SAME_SITE || "lax";
const AUTH_COOKIE_SECURE =
  process.env.AUTH_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";

function safeTimingEqual(leftValue, rightValue) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

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
  return safeTimingEqual(Buffer.from(derivedHex, "hex"), Buffer.from(expectedHex, "hex"));
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

  if (!safeTimingEqual(signature, expectedSignature)) {
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

function parseCookieHeader(cookieHeader) {
  const pairs = String(cookieHeader || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);

  const cookies = {};
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 1) continue;

    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (_error) {
      cookies[key] = value;
    }
  }
  return cookies;
}

function readAuthTokenFromRequest(req) {
  const header = req?.headers?.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme === "Bearer" && token) {
    return token;
  }

  const cookies = parseCookieHeader(req?.headers?.cookie || "");
  return cookies[AUTH_COOKIE_NAME] || "";
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: AUTH_COOKIE_SECURE,
    sameSite: AUTH_COOKIE_SAME_SITE,
    maxAge: AUTH_TOKEN_TTL_SECONDS * 1000,
    path: "/",
  };
}

function attachAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...getAuthCookieOptions(),
    maxAge: 0,
  });
}

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_TTL_SECONDS,
  hashPassword,
  verifyPassword,
  signAuthToken,
  verifyAuthToken,
  readAuthTokenFromRequest,
  attachAuthCookie,
  clearAuthCookie,
  issueToken,
  verifyToken,
};
