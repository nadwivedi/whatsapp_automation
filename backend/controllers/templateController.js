const MessageTemplate = require("../models/MessageTemplate");

async function listTemplates(_req, res) {
  const templates = await MessageTemplate.find({ isActive: true }).sort({ updatedAt: -1 });
  res.json({ templates });
}

async function createTemplate(req, res) {
  const { name, body } = req.body || {};
  if (!name || !body) {
    return res.status(400).json({ message: "Both template name and body are required." });
  }

  const template = await MessageTemplate.create({
    name: String(name).trim(),
    body: String(body).trim(),
  });
  return res.status(201).json({ template });
}

async function updateTemplate(req, res) {
  const { templateId } = req.params;
  const update = {};

  if (typeof req.body?.name === "string") {
    update.name = req.body.name.trim();
  }
  if (typeof req.body?.body === "string") {
    update.body = req.body.body.trim();
  }
  if (typeof req.body?.isActive === "boolean") {
    update.isActive = req.body.isActive;
  }

  const template = await MessageTemplate.findByIdAndUpdate(templateId, update, {
    returnDocument: "after",
  });

  if (!template) {
    return res.status(404).json({ message: "Template not found." });
  }

  return res.json({ template });
}

async function disableTemplate(req, res) {
  const template = await MessageTemplate.findByIdAndUpdate(
    req.params.templateId,
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
