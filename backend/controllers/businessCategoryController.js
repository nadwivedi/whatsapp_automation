const { Business } = require("../models/Business");
const { BusinessCategory } = require("../models/BusinessCategory");

function normalizeName(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeDescription(raw) {
  return typeof raw === "string" ? raw.trim() : "";
}

async function listBusinessCategories(req, res) {
  const categories = await BusinessCategory.find({
    owner: req.user._id,
    isActive: true,
  }).sort({ name: 1 });
  return res.json({ categories });
}

async function createBusinessCategory(req, res) {
  const name = normalizeName(req.body?.name);
  const description = normalizeDescription(req.body?.description);

  if (name.length < 2) {
    return res.status(400).json({ message: "Category name must be at least 2 characters." });
  }

  try {
    const category = await BusinessCategory.create({
      owner: req.user._id,
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

async function updateBusinessCategory(req, res) {
  const category = await BusinessCategory.findOne({
    _id: req.params.categoryId,
    owner: req.user._id,
    isActive: true,
  });
  if (!category) {
    return res.status(404).json({ message: "Business category not found." });
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

async function deleteBusinessCategory(req, res) {
  const category = await BusinessCategory.findOne({
    _id: req.params.categoryId,
    owner: req.user._id,
    isActive: true,
  });
  if (!category) {
    return res.status(404).json({ message: "Business category not found." });
  }

  const linkedBusinesses = await Business.countDocuments({
    owner: req.user._id,
    businessCategory: category._id,
    isActive: true,
  });

  if (linkedBusinesses > 0) {
    return res.status(409).json({
      message: `This category is used by ${linkedBusinesses} business record(s). Reassign them first.`,
    });
  }

  category.isActive = false;
  await category.save();
  return res.json({ category });
}

module.exports = {
  listBusinessCategories,
  createBusinessCategory,
  updateBusinessCategory,
  deleteBusinessCategory,
};
