const mongoose = require("mongoose");
const { Contact } = require("../models/contact");
const { ContactCategory } = require("../models/contactCategory");

function normalizeText(raw, fallback = "") {
  if (raw == null) return fallback;
  if (typeof raw === "string") return raw.trim();
  return String(raw).trim();
}

function normalizeMobile(raw) {
  return normalizeText(raw).replace(/[^\d+]/g, "");
}

function normalizeEmail(raw) {
  const value = normalizeText(raw);
  return value ? value.toLowerCase() : null;
}

function normalizePincode(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return Number.NaN;
    return Math.trunc(raw);
  }

  const text = normalizeText(raw);
  if (!text) return null;
  if (!/^\d+$/.test(text)) return Number.NaN;
  return Number(text);
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
    const byId = input.contactCategoryId || input.contactCategory || input._id || input.id;
    if (byId) return normalizeText(byId);
    const byName = input.categoryName || input.name;
    if (byName) return normalizeText(byName);
    return "";
  }
  return normalizeText(input);
}

function normalizeContactPayload(input = {}) {
  const contactName = normalizeText(input.contactName || input.businessName || input.name);
  const mobile = normalizeMobile(input.mobile || input.phoneNumber || input.phone);
  const email = normalizeEmail(input.email);
  const state = normalizeText(input.state).toLowerCase();
  const district = normalizeText(input.district).toLowerCase();
  const pincode = normalizePincode(input.pincode || input.pinCode || input.zip || input.postalCode);
  const address = normalizeText(input.address || input.fullAddress);
  const categoryInput = pickCategoryInput(
    input.contactCategory ||
      input.contactCategoryId ||
      input.businessCategory ||
      input.businessCategoryId ||
      input.category ||
      input.categoryName ||
      input.contactCategoryName ||
      input.businessCategoryName,
  );

  return {
    contactName,
    mobile,
    email,
    state,
    district,
    pincode,
    address,
    categoryInput,
  };
}

function validateContactPayload(payload) {
  const errors = [];

  if (!payload.contactName || payload.contactName.length < 2) {
    errors.push({
      field: "contactName",
      message: "contactName is required and must be at least 2 characters.",
    });
  }

  if (!isValidMobile(payload.mobile)) {
    errors.push({
      field: "mobile",
      message: "mobile must be a valid number with 8 to 15 digits.",
    });
  }

  if (!isValidEmail(payload.email)) {
    errors.push({
      field: "email",
      message: "email must be a valid email address.",
    });
  }

  if (
    payload.pincode != null &&
    (!Number.isInteger(payload.pincode) || payload.pincode < 100000 || payload.pincode > 999999)
  ) {
    errors.push({
      field: "pincode",
      message: "pincode must be a 6-digit number.",
    });
  }

  if (!payload.categoryInput) {
    errors.push({
      field: "contactCategory",
      message: "contactCategory is required.",
    });
  }

  return errors;
}

async function buildCategoryLookup(userId) {
  const categories = await ContactCategory.find({ userId }).select("_id name nameKey");

  const byId = new Map();
  const byNameKey = new Map();
  for (const category of categories) {
    byId.set(String(category._id), category);
    byNameKey.set(String(category.nameKey || "").toLowerCase(), category);
  }

  return { byId, byNameKey };
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

async function listContacts(req, res) {
  const contacts = await Contact.find({ userId: req.user._id })
    .populate("contactCategory", "name")
    .sort({ createdAt: -1 })
    .limit(5000);

  return res.json({ contacts });
}

async function createContact(req, res) {
  const payload = normalizeContactPayload(req.body || {});
  const errors = validateContactPayload(payload);
  if (errors.length) {
    return res.status(400).json({ message: errors[0].message, errors });
  }

  const lookup = await buildCategoryLookup(req.user._id);
  const category = resolveCategoryFromLookup(payload.categoryInput, lookup);
  if (!category) {
    return res.status(400).json({ message: "Selected contact category is invalid." });
  }

  const contact = await Contact.create({
    userId: req.user._id,
    contactName: payload.contactName,
    mobile: payload.mobile,
    email: payload.email,
    state: payload.state,
    district: payload.district,
    pincode: payload.pincode,
    address: payload.address,
    contactCategory: category._id,
  });

  const hydrated = await Contact.findById(contact._id).populate("contactCategory", "name");
  return res.status(201).json({ contact: hydrated });
}

async function deleteContact(req, res) {
  const contact = await Contact.findOneAndDelete({
    _id: req.params.contactId,
    userId: req.user._id,
  });

  if (!contact) {
    return res.status(404).json({ message: "Contact not found." });
  }

  return res.json({ contact });
}

async function bulkInsertContacts(req, res) {
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
    return res.status(400).json({ message: "Bulk insert limit is 5000 contacts per request." });
  }

  const lookup = await buildCategoryLookup(req.user._id);
  const defaultCategoryInput = pickCategoryInput(
    req.body?.defaultCategory ||
      req.body?.defaultCategoryId ||
      req.body?.contactCategory ||
      req.body?.businessCategory,
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

    const payload = normalizeContactPayload(item);
    const validationErrors = validateContactPayload({
      ...payload,
      categoryInput: payload.categoryInput || defaultCategoryInput,
    });
    if (validationErrors.length) {
      validationErrors.forEach((fieldError) => {
        errors.push({
          index,
          field: fieldError.field,
          message: fieldError.message,
        });
      });
      return;
    }

    const category = resolveCategoryFromLookup(payload.categoryInput, lookup) || defaultCategory;
    if (!category) {
      errors.push({
        index,
        field: "contactCategory",
        message: `Category not found for item. Provided value: "${payload.categoryInput || defaultCategoryInput}".`,
      });
      return;
    }

    docs.push({
      userId: req.user._id,
      contactName: payload.contactName,
      mobile: payload.mobile,
      email: payload.email,
      state: payload.state,
      district: payload.district,
      pincode: payload.pincode,
      address: payload.address,
      contactCategory: category._id,
    });
  });

  if (errors.length) {
    return res.status(400).json({
      message: "Bulk insert validation failed.",
      errors: errors.slice(0, 100),
      totalErrors: errors.length,
    });
  }

  const inserted = await Contact.insertMany(docs);
  const insertedIds = inserted.map((doc) => doc._id);
  const contacts = await Contact.find({
    _id: { $in: insertedIds },
    userId: req.user._id,
  })
    .populate("contactCategory", "name")
    .sort({ createdAt: -1 });

  return res.status(201).json({
    insertedCount: inserted.length,
    contacts: contacts.slice(0, 100),
    message:
      inserted.length > 100
        ? "Contacts inserted. Response includes first 100 records."
        : "Contacts inserted.",
  });
}

module.exports = {
  listContacts,
  createContact,
  deleteContact,
  bulkInsertContacts,
};
