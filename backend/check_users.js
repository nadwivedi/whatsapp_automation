const mongoose = require('mongoose');
const { User } = require('./models/User');

async function check() {
  await mongoose.connect('mongodb://127.0.0.1:27017/wa-web-bulk');
  const users = await User.find({});
  for (const u of users) {
    console.log(`${u._id} ${u.mobileNumber} ${u.name}`);
  }
  process.exit(0);
}
check();
