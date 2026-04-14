const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

// Define Schemas inline to avoid complex imports
const Contact = mongoose.model("Contact", new mongoose.Schema({ mobile: String }));
const CampaignMessage = mongoose.model("CampaignMessage", new mongoose.Schema({ recipient: String, recipientMobileNumber: String }));
const ReplyMessage = mongoose.model("ReplyMessage", new mongoose.Schema({ contactNumber: String, senderMobileNumber: String, recipientMobileNumber: String }));

function normalizeTo91(raw) {
  if (!raw || typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1);
  if (digits.length === 10) return "91" + digits;
  return null;
}

async function migrate() {
  let uri = "mongodb://127.0.0.1:27017/wa-web-bulk";
  
  // Try to find MONGO_URI from .env
  try {
    const envPath = path.join(__dirname, "..", ".env");
    if (fs.existsSync(envPath)) {
      const env = fs.readFileSync(envPath, "utf8");
      const match = env.match(/MONGO_URI=(.+)/);
      if (match) uri = match[1].trim();
    }
  } catch (err) {
    console.warn("Could not read .env file, using default URI.");
  }

  console.log(`Connecting to ${uri}...`);
  await mongoose.connect(uri);

  console.log("1. Migrating Contacts...");
  const contacts = await Contact.find({});
  let cCount = 0;
  for (const c of contacts) {
    const n = normalizeTo91(c.mobile);
    if (n && n !== c.mobile) {
      await Contact.updateOne({ _id: c._id }, { $set: { mobile: n } });
      cCount++;
    }
  }
  console.log(`   Updated ${cCount} contacts.`);

  console.log("2. Migrating CampaignMessages...");
  const campMsgs = await CampaignMessage.find({});
  let cmCount = 0;
  for (const m of campMsgs) {
    const update = {};
    const n1 = normalizeTo91(m.recipient);
    const n2 = normalizeTo91(m.recipientMobileNumber);
    if (n1 && n1 !== m.recipient) update.recipient = n1;
    if (n2 && n2 !== m.recipientMobileNumber) update.recipientMobileNumber = n2;
    
    if (Object.keys(update).length > 0) {
      await CampaignMessage.updateOne({ _id: m._id }, { $set: update });
      cmCount++;
    }
  }
  console.log(`   Updated ${cmCount} campaign messages.`);

  console.log("3. Migrating ReplyMessages...");
  const replyMsgs = await ReplyMessage.find({});
  let rCount = 0;
  for (const m of replyMsgs) {
    const update = {};
    const n1 = normalizeTo91(m.contactNumber);
    const n2 = normalizeTo91(m.senderMobileNumber);
    const n3 = normalizeTo91(m.recipientMobileNumber);
    if (n1 && n1 !== m.contactNumber) update.contactNumber = n1;
    if (n2 && n2 !== m.senderMobileNumber) update.senderMobileNumber = n2;
    if (n3 && n3 !== m.recipientMobileNumber) update.recipientMobileNumber = n3;

    if (Object.keys(update).length > 0) {
      await ReplyMessage.updateOne({ _id: m._id }, { $set: update });
      rCount++;
    }
  }
  console.log(`   Updated ${rCount} reply messages.`);

  await mongoose.disconnect();
  console.log("Done.");
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
