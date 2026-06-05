const mongoose = require('mongoose')

const whatsappSettingSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  daysBeforeExpiry: {
    type: Number,
    default: 7
  },
  sendOnExpiryDay: {
    type: Boolean,
    default: true
  },
  enableGracePeriodAlerts: {
    type: Boolean,
    default: false
  },
  gracePeriodDays: {
    type: [Number],
    default: [7, 15]
  },
  alertRules: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  maxMessagesPerDay: {
    type: Number,
    default: 30
  },
  maxMessagesPerHour: {
    type: Number,
    default: 5
  }
}, {
  timestamps: true
})

module.exports = mongoose.model('WhatsAppSetting', whatsappSettingSchema)
