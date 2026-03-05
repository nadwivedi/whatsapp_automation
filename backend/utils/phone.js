function normalizeNumber(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return null;
  }
  return digits;
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
};
