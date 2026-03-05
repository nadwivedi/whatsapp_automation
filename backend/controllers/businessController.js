const mongoose = require("mongoose");
const { Business } = require("../models/Business");
const { BusinessCategory } = require("../models/BusinessCategory");

function normalizeText(raw, fallback = "") {
  if (raw == null) return fallback;
  if (typeof raw === "string") return raw.trim();
  return String(raw).trim();
}

function normalizeMobile(raw) {
  const cleaned = normalizeText(raw).replace(/[^\d+]/g, "");
  return cleaned;
}

function normalizeEmail(raw) {
  const value = normalizeText(raw);
  return value ? value.toLowerCase() : null;
}

function isValidMobile(mobile) {
  return /^\+?\d{8,15}$/.test(mobile);
}

function isValidEmail(email) {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function pickCategoryInput(input) {
  if (input == null) return "";
  if (typeof input === "object" && !Array.isArray(input)) {
    const byId = input.businessCategoryId || input.businessCategory || input._id || input.id;
    if (byId) return normalizeText(byId);
    const byName = input.categoryName || input.name;
    if (byName) return normalizeText(byName);
    return "";
  }
  return normalizeText(input);
}

function normalizeBusinessPayload(input = {}) {
  const businessName = normalizeText(input.businessName || input.name);
  const mobile = normalizeMobile(input.mobile || input.phoneNumber || input.phone);
  const email = normalizeEmail(input.email);
  const state = normalizeText(input.state);
  const district = normalizeText(input.district);
  const pincode = normalizeText(input.pincode || input.pinCode || input.zip || input.postalCode);
  const address = normalizeText(input.address || input.fullAddress);
  const categoryInput = pickCategoryInput(
    input.businessCategory ||
      input.businessCategoryId ||
      input.category ||
      input.categoryName ||
      input.businessCategoryName,
  );

  return {
    businessName,
    mobile,
    email,
    state,
    district,
    pincode,
    address,
    categoryInput,
  };
}

function validateBusinessPayload(payload) {
  const errors = [];

  if (!payload.businessName || payload.businessName.length < 2) {
    errors.push("businessName is required and must be at least 2 characters.");
  }

  if (!isValidMobile(payload.mobile)) {
    errors.push("mobile must be a valid number with 8 to 15 digits.");
  }

  if (!isValidEmail(payload.email)) {
    errors.push("email must be a valid email address.");
  }

  if (payload.pincode && !/^[A-Za-z0-9 -]{3,12}$/.test(payload.pincode)) {
    errors.push("pincode format is invalid.");
  }

  if (!payload.categoryInput) {
    errors.push("businessCategory is required.");
  }

  return errors;
}

async function buildCategoryLookup(ownerId) {
  const categories = await BusinessCategory.find({
    owner: ownerId,
    isActive: true,
  }).select("_id name nameKey");

  const byId = new Map();
  const byNameKey = new Map();
  for (const category of categories) {
    byId.set(String(category._id), category);
    byNameKey.set(String(category.nameKey || "").toLowerCase(), category);
  }

  return {
    byId,
    byNameKey,
  };
}

function resolveCategoryFromLookup(categoryInput, lookup) {
  const token = normalizeText(categoryInput);
  if (!token) return null;

  if (lookup.byId.has(token)) {
    return lookup.byId.get(token);
  }

  if (mongoose.Types.ObjectId.isValid(token)) {
    return null;
  }

  return lookup.byNameKey.get(token.toLowerCase()) || null;
}

async function listBusinesses(req, res) {
  const businesses = await Business.find({
    owner: req.user._id,
    isActive: true,
  })
    .populate("businessCategory", "name")
    .sort({ createdAt: -1 })
    .limit(5000);

  return res.json({ businesses });
}

async function createBusiness(req, res) {
  const payload = normalizeBusinessPayload(req.body || {});
  const errors = validateBusinessPayload(payload);
  if (errors.length) {
    return res.status(400).json({ message: errors[0] });
  }

  const lookup = await buildCategoryLookup(req.user._id);
  const category = resolveCategoryFromLookup(payload.categoryInput, lookup);
  if (!category) {
    return res.status(400).json({ message: "Selected business category is invalid." });
  }

  const business = await Business.create({
    owner: req.user._id,
    businessName: payload.businessName,
    mobile: payload.mobile,
    email: payload.email,
    state: payload.state,
    district: payload.district,
    pincode: payload.pincode,
    address: payload.address,
    businessCategory: category._id,
  });

  const hydrated = await Business.findById(business._id).populate("businessCategory", "name");
  return res.status(201).json({ business: hydrated });
}

async function deleteBusiness(req, res) {
  const business = await Business.findOneAndUpdate(
    { _id: req.params.businessId, owner: req.user._id, isActive: true },
    { isActive: false },
    { returnDocument: "after" },
  );

  if (!business) {
    return res.status(404).json({ message: "Business not found." });
  }

  return res.json({ business });
}

async function bulkInsertBusinesses(req, res) {
  const rawItems = Array.isArray(req.body)
    ? req.body
    : Array.isArray(req.body?.items)
      ? req.body.items
      : null;

  if (!rawItems) {
    return res.status(400).json({ message: "items must be a JSON array." });
  }
  if (!rawItems.length) {
    return res.status(400).json({ message: "items cannot be empty." });
  }
  if (rawItems.length > 5000) {
    return res.status(400).json({ message: "Bulk insert limit is 5000 records per request." });
  }

  const lookup = await buildCategoryLookup(req.user._id);
  const defaultCategoryInput = pickCategoryInput(
    req.body?.defaultCategory || req.body?.defaultCategoryId || req.body?.businessCategory,
  );
  const defaultCategory = defaultCategoryInput
    ? resolveCategoryFromLookup(defaultCategoryInput, lookup)
    : null;

  const docs = [];
  const errors = [];
  rawItems.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push({ index, message: "Each item must be an object." });
      return;
    }

    const payload = normalizeBusinessPayload(item);
    const validationErrors = validateBusinessPayload({
      ...payload,
      categoryInput: payload.categoryInput || defaultCategoryInput,
    });
    if (validationErrors.length) {
      errors.push({ index, message: validationErrors.join(" ") });
      return;
    }

    const category =
      resolveCategoryFromLookup(payload.categoryInput, lookup) ||
      defaultCategory;
    if (!category) {
      errors.push({
        index,
        message: `Category not found for item. Provided value: "${payload.categoryInput || defaultCategoryInput}".`,
      });
      return;
    }

    docs.push({
      owner: req.user._id,
      businessName: payload.businessName,
      mobile: payload.mobile,
      email: payload.email,
      state: payload.state,
      district: payload.district,
      pincode: payload.pincode,
      address: payload.address,
      businessCategory: category._id,
    });
  });

  if (errors.length) {
    return res.status(400).json({
      message: "Bulk insert validation failed.",
      errors: errors.slice(0, 100),
      totalErrors: errors.length,
    });
  }

  const inserted = await Business.insertMany(docs);
  const insertedIds = inserted.map((doc) => doc._id);
  const insertedBusinesses = await Business.find({
    _id: { $in: insertedIds },
    owner: req.user._id,
  })
    .populate("businessCategory", "name")
    .sort({ createdAt: -1 });

  return res.status(201).json({
    insertedCount: inserted.length,
    businesses: insertedBusinesses.slice(0, 100),
    message:
      inserted.length > 100
        ? "Businesses inserted. Response includes first 100 records."
        : "Businesses inserted.",
  });
}

module.exports = {
  listBusinesses,
  createBusiness,
  deleteBusiness,
  bulkInsertBusinesses,
};
