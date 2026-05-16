const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const { Campaign } = require('./models/Campaign');
const { WaAccount } = require('./models/WaAccount');
const { CampaignMessage } = require('./models/CampaignMessage');
const { UserSetting } = require('./models/UserSetting');

async function check() {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/wa-web-bulk';
    console.log('Connecting to:', uri);
    await mongoose.connect(uri);
    
    const c = await Campaign.findOne({ status: { $in: ['queued', 'running', 'failed', 'completed'] } }).sort({ updatedAt: -1 });
    const a = await WaAccount.find({ isActive: true }).select('name phoneNumber status lastError sentToday dailyLimit owner');
    
    console.log('--- LATEST CAMPAIGN ---');
    if (c) {
      console.log(`ID: ${c._id}`);
      console.log(`Title: ${c.title}`);
      console.log(`Status: ${c.status}`);
      console.log(`Last Error: ${c.lastError}`);
    }

    console.log('\n--- ACCOUNTS ---');
    for (const acc of a) {
       console.log(`Account: ${acc.name} (${acc.phoneNumber || 'N/A'})`);
       console.log(`  Status: ${acc.status}`);
       console.log(`  Sent/Limit: ${acc.sentToday}/${acc.dailyLimit || 'Default'}`);
       
       const settings = await UserSetting.findOne({ owner: acc.owner });
       if (settings) {
          console.log(`  Default Daily/Hourly: ${settings.perMobileDailyLimit}/${settings.perMobileHourlyLimit}`);
       } else {
          console.log(`  Settings not found for owner ${acc.owner}`);
       }
    }

    const m = await CampaignMessage.find({ status: 'pending' }).limit(5);
    console.log('\n--- PENDING MESSAGES ---');
    console.log(`Total Pending: ${await CampaignMessage.countDocuments({ status: 'pending' })}`);
    m.forEach(msg => {
       console.log(`  To: ${msg.recipient}, AccountID: ${msg.account}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Check failed:', err);
    process.exit(1);
  }
}

check();
