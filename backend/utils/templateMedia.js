const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

function parseDataUrl(input) {
  if (typeof input !== "string" || !input.startsWith("data:")) {
    throw new Error("Media must be a valid data URL.");
  }

  const match = input.match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error("Media data URL format is invalid.");
  }

  const mimeType = match[1].toLowerCase();
  const base64Data = match[2];
  const mediaType = mimeType.startsWith("image/")
    ? "image"
    : mimeType.startsWith("video/")
      ? "video"
      : null;

  if (!mediaType) {
    throw new Error("Only image and video uploads are supported.");
  }

  const padding = base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
  const bytes = Math.floor((base64Data.length * 3) / 4) - padding;
  if (bytes > MAX_MEDIA_BYTES) {
    throw new Error("Media is too large. Max allowed size is 8MB.");
  }

  return {
    mediaType,
    mediaMimeType: mimeType,
    mediaData: input,
  };
}

function normalizeMediaFilename(name) {
  if (typeof name !== "string" || !name.trim()) {
    return null;
  }
  return name.trim().slice(0, 180);
}

function buildTemplateMedia(payload = {}) {
  if (!payload.mediaData) {
    return {
      mediaType: null,
      mediaMimeType: null,
      mediaData: null,
      mediaFileName: null,
    };
  }

  const parsed = parseDataUrl(payload.mediaData);
  return {
    ...parsed,
    mediaFileName: normalizeMediaFilename(payload.mediaFileName),
  };
}

module.exports = {
  MAX_MEDIA_BYTES,
  parseDataUrl,
  buildTemplateMedia,
};
