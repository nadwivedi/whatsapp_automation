const mongoose = require('mongoose');
const { Campaign } = require('./models/Campaign');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/wa-web-bulk');
  const campaigns = await Campaign.find({}).sort({ createdAt: -1 }).limit(10);
  for (const c of campaigns) {
    console.log(`${c._id} status=${c.status} title=${c.title} owner=${c.owner}`);
  }
  process.exit(0);
}
check();
