function normalizeNumber(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }

  return null;
}

function toWhatsAppRecipient(raw) {
  const normalized = normalizeNumber(raw);
  if (!normalized) {
    return null;
  }
  return `91${normalized}`;
}

function parseRecipients(inputText) {
  const text = typeof inputText === "string" ? inputText : "";
  const rawTokens = text.split(/[\n,\s;]+/g).filter(Boolean);
  const uniqueNumbers = new Set();

  for (const token of rawTokens) {
    const normalized = normalizeNumber(token);
    if (normalized) {
      uniqueNumbers.add(normalized);
    }
  }

  return Array.from(uniqueNumbers);
}

module.exports = {
  normalizeNumber,
  parseRecipients,
  toWhatsAppRecipient,
};
