const MessageTemplate = require("../models/MessageTemplate");
const { buildTemplateMedia } = require("../utils/templateMedia");

async function listTemplates(req, res) {
  const templates = await MessageTemplate.find({
    owner: req.user._id,
    isActive: true,
  }).sort({ updatedAt: -1 });
  res.json({ templates });
}

async function createTemplate(req, res) {
  const { name } = req.body || {};
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const media = buildTemplateMedia(req.body || {});

  if (!name) {
    return res.status(400).json({ message: "Template name is required." });
  }
  if (!body && !media.mediaData) {
    return res.status(400).json({ message: "Template must include message text or media." });
  }

  const template = await MessageTemplate.create({
    owner: req.user._id,
    name: String(name).trim(),
    body,
    ...media,
  });
  return res.status(201).json({ template });
}

async function updateTemplate(req, res) {
  const { templateId } = req.params;
  const template = await MessageTemplate.findOne({ _id: templateId, owner: req.user._id });
  if (!template) {
    return res.status(404).json({ message: "Template not found." });
  }

  if (typeof req.body?.name === "string") {
    template.name = req.body.name.trim();
  }
  if (typeof req.body?.body === "string") {
    template.body = req.body.body.trim();
  }
  if (req.body?.clearMedia === true) {
    template.mediaType = null;
    template.mediaMimeType = null;
    template.mediaData = null;
    template.mediaFileName = null;
  } else if (req.body?.mediaData) {
    const media = buildTemplateMedia(req.body);
    template.mediaType = media.mediaType;
    template.mediaMimeType = media.mediaMimeType;
    template.mediaData = media.mediaData;
    template.mediaFileName = media.mediaFileName;
  }
  if (typeof req.body?.isActive === "boolean") {
    template.isActive = req.body.isActive;
  }
  if (!template.body && !template.mediaData) {
    return res.status(400).json({ message: "Template must include message text or media." });
  }

  await template.save();
  return res.json({ template });
}

async function disableTemplate(req, res) {
  const template = await MessageTemplate.findOneAndUpdate(
    { _id: req.params.templateId, owner: req.user._id },
    { isActive: false },
    { returnDocument: "after" },
  );
  if (!template) {
    return res.status(404).json({ message: "Template not found." });
  }
  return res.json({ template });
}

module.exports = {
  listTemplates,
  createTemplate,
  updateTemplate,
  disableTemplate,
};
