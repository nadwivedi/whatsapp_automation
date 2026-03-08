const { Contact } = require("../models/contact");
const { ContactCategory } = require("../models/contactCategory");

function normalizeName(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeDescription(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

async function listContactCategories(req, res) {
  const categories = await ContactCategory.find({
    userId: req.user._id,
  }).sort({ name: 1 });
  return res.json({ categories });
}

async function createContactCategory(req, res) {
  const name = normalizeName(req.body?.name);
  const description = normalizeDescription(req.body?.description);

  if (name.length < 2) {
    return res.status(400).json({ message: "Category name must be at least 2 characters." });
  }

  try {
    const category = await ContactCategory.create({
      userId: req.user._id,
      name,
      description,
    });
    return res.status(201).json({ category });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A category with this name already exists." });
    }
    throw error;
  }
}

async function updateContactCategory(req, res) {
  const category = await ContactCategory.findOne({
    _id: req.params.categoryId,
    userId: req.user._id,
  });
  if (!category) {
    return res.status(404).json({ message: "Contact category not found." });
  }

  const hasName = Object.prototype.hasOwnProperty.call(req.body || {}, "name");
  const hasDescription = Object.prototype.hasOwnProperty.call(req.body || {}, "description");
  if (!hasName && !hasDescription) {
    return res.status(400).json({ message: "At least one field is required: name or description." });
  }

  if (hasName) {
    const name = normalizeName(req.body?.name);
    if (name.length < 2) {
      return res.status(400).json({ message: "Category name must be at least 2 characters." });
    }
    category.name = name;
  }

  if (hasDescription) {
    category.description = normalizeDescription(req.body?.description);
  }

  try {
    await category.save();
    return res.json({ category });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "A category with this name already exists." });
    }
    throw error;
  }
}

async function deleteContactCategory(req, res) {
  const category = await ContactCategory.findOne({
    _id: req.params.categoryId,
    userId: req.user._id,
  });
  if (!category) {
    return res.status(404).json({ message: "Contact category not found." });
  }

  const linkedContacts = await Contact.countDocuments({
    userId: req.user._id,
    contactCategory: category._id,
  });

  if (linkedContacts > 0) {
    return res.status(409).json({
      message: `This category is used by ${linkedContacts} contact record(s). Reassign them first.`,
    });
  }

  await category.deleteOne();
  return res.json({ category });
}

module.exports = {
  listContactCategories,
  createContactCategory,
  updateContactCategory,
  deleteContactCategory,
};
