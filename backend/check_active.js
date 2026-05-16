const mongoose = require('mongoose');
const { Campaign } = require('./models/Campaign');
const { CampaignMessage } = require('./models/CampaignMessage');
const { WaAccount } = require('./models/WaAccount');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/wa-web-bulk');
  console.log('--- ALL ACTIVE CAMPAIGNS ---');
  const campaigns = await Campaign.find({ status: { $in: ['queued', 'running', 'paused'] } }).sort({ createdAt: 1 });
  console.log(`Found ${campaigns.length} active campaigns.`);
  for (const c of campaigns) {
    console.log(`[${c.status}] ${c.title} (${c._id}) Created: ${c.createdAt}`);
    console.log(`  Owner: ${c.owner}`);
    console.log(`  Error: ${c.lastError}`);
  }
  process.exit(0);
}
check();
