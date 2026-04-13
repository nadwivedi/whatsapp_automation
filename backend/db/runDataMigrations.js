const mongoose = require("mongoose");

function normalizeContactMobile(raw) {
  const digits = String(raw || "").replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  if (digits.length === 10) {
    return digits;
  }
  return digits;
}

async function renameCollectionIfNeeded(db, names, from, to) {
  if (!names.has(from) || names.has(to)) return false;
  await db.collection(from).rename(to);
  names.delete(from);
  names.add(to);
  return true;
}

async function migrateContactsCollection(db, names) {
  if (!names.has("contacts")) return;

  const contacts = db.collection("contacts");

  await contacts.updateMany(
    { businessName: { $exists: true }, name: { $exists: false } },
    { $rename: { businessName: "name" } },
  );
  await contacts.updateMany(
    { contactName: { $exists: true }, name: { $exists: false } },
    { $rename: { contactName: "name" } },
  );
  await contacts.updateMany(
    { businessCategory: { $exists: true } },
    { $rename: { businessCategory: "contactCategory" } },
  );

  const indexes = await contacts.indexes();
  const dropCandidates = ["userId_1_businessName_1_mobile_1", "userId_1_contactName_1_mobile_1", "businessCategory_1"];
  for (const indexName of dropCandidates) {
    if (indexes.some((index) => index.name === indexName)) {
      await contacts.dropIndex(indexName);
    }
  }

  await contacts.createIndex({ userId: 1, name: 1, mobile: 1 });
  await contacts.createIndex({ contactCategory: 1 });

  const rows = await contacts.find(
    { mobile: { $exists: true, $type: "string", $ne: "" } },
    { projection: { _id: 1, mobile: 1 } },
  ).toArray();

  for (const row of rows) {
    const normalizedMobile = normalizeContactMobile(row.mobile);
    if (!normalizedMobile || normalizedMobile === row.mobile) continue;
    await contacts.updateOne(
      { _id: row._id },
      { $set: { mobile: normalizedMobile } },
    );
  }
}

async function runDataMigrations() {
  const db = mongoose.connection.db;
  if (!db) return;

  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = new Set(collections.map((item) => item.name));

  await renameCollectionIfNeeded(db, names, "businesscategories", "contactcategories");
  await renameCollectionIfNeeded(db, names, "businesses", "contacts");
  await migrateContactsCollection(db, names);
}

module.exports = runDataMigrations;
