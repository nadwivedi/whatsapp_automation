const mongoose = require('mongoose');
const { Campaign } = require('./models/Campaign');
const { CampaignMessage } = require('./models/CampaignMessage');
const { WaAccount } = require('./models/WaAccount');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/wa-web-bulk');
  const accId = '6a055f1744de8807f206cb77';
  const acc = await WaAccount.findById(accId);
  console.log(`Account ${accId}: status=${acc ? acc.status : 'NOT FOUND'} owner=${acc ? acc.owner : 'N/A'}`);
  
  const campaigns = await Campaign.find({ 
    $or: [
      { account: accId },
      { accounts: accId }
    ]
  }).sort({ createdAt: -1 }).limit(5);
  
  console.log(`Found ${campaigns.length} campaigns associated with this account.`);
  for (const c of campaigns) {
    console.log(`[${c.status}] ${c.title} (${c._id}) Owner: ${c.owner}`);
  }
  process.exit(0);
}
check();
