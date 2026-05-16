const mongoose = require('mongoose');
const { Campaign } = require('./models/Campaign');
const { CampaignMessage } = require('./models/CampaignMessage');
const { WaAccount } = require('./models/WaAccount');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/wa-web-bulk');
  console.log('--- CAMPAIGNS ---');
  const campaigns = await Campaign.find({}).sort({ createdAt: -1 }).limit(5);
  for (const c of campaigns) {
    console.log(`Campaign: ${c.title} (${c._id}) Status: ${c.status} Error: ${c.lastError}`);
    const pending = await CampaignMessage.countDocuments({ campaign: c._id, status: 'pending' });
    console.log(`  Pending messages: ${pending}`);
    for (const accId of c.accounts || []) {
      const acc = await WaAccount.findById(accId);
      console.log(`  Account ${accId}: ${acc ? acc.status : 'NOT FOUND'} (${acc ? acc.phoneNumber : ''})`);
    }
  }
  process.exit(0);
}
check();
