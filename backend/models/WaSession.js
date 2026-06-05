const mongoose = require('mongoose')

const waSessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  sessionId: {
    type: String,
    unique: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['disconnected', 'qr_ready', 'initializing', 'authenticated', 'auth_failure'],
    default: 'disconnected'
  },
  qrCodeDataUrl: {
    type: String,
    default: null
  },
  phoneNumber: {
    type: String,
    default: null
  },
  lastConnectedAt: {
    type: Date
  },
  lastError: {
    type: String,
    default: null
  }
}, {
  timestamps: true
})

module.exports = mongoose.model('WaSession', waSessionSchema)
