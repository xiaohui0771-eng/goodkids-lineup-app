const crypto = require("crypto");
const {
  appendSetCookie,
  parseCookies,
  serializeCookie,
} = require("./http");

const ADMIN_COOKIE_NAME = "lineup_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "line-up-admin";
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || "line-up-local-session-secret";
}

function isSecureRequest(request) {
  return request.headers["x-forwarded-proto"] === "https" || Boolean(request.socket?.encrypted);
}

function signPayload(payload) {
  return crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function createSessionToken() {
  const payload = JSON.stringify({
    role: "admin",
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${signPayload(encodedPayload)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return false;
  }

  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return false;
  }

  const expectedSignature = signPayload(encodedPayload);

  if (signature.length !== expectedSignature.length) {
    return false;
  }

  const isValidSignature = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );

  if (!isValidSignature) {
    return false;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    return payload.role === "admin" && Number(payload.exp) > Date.now();
  } catch (_error) {
    return false;
  }
}

function setAdminSession(response, request) {
  appendSetCookie(response, serializeCookie(ADMIN_COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "Lax",
    secure: isSecureRequest(request),
  }));
}

function clearAdminSession(response, request) {
  appendSetCookie(response, serializeCookie(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "Lax",
    secure: isSecureRequest(request),
  }));
}

function isAdminAuthenticated(request) {
  const cookies = parseCookies(request.headers.cookie);
  return verifySessionToken(cookies[ADMIN_COOKIE_NAME]);
}

function isPasswordValid(password) {
  const provided = Buffer.from(String(password || ""), "utf8");
  const expected = Buffer.from(getAdminPassword(), "utf8");

  if (provided.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(provided, expected);
}

module.exports = {
  clearAdminSession,
  isAdminAuthenticated,
  isPasswordValid,
  setAdminSession,
};
