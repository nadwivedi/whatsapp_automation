const express = require('express')
const router = express.Router()
const whatsappService = require('../services/whatsappService')
const MessageLog = require('../models/MessageLog')

router.get('/status', async (req, res) => {
  try {
    const userId = req.user._id
    const session = await whatsappService.getSessionStatus(userId)

    res.json({
      ...(session ? session.toObject() : {}),
      isStopped: whatsappService.isClientStopped(userId),
      clientActive: whatsappService.isClientConnected(userId)
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post('/start', async (req, res) => {
  try {
    const userId = req.user._id
    whatsappService.initializeSession(userId)
    res.json({ message: 'Session start initiated. Check status for QR or connection update.' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post('/send', async (req, res) => {
  try {
    const userId = req.user._id
    const { chatId, text } = req.body

    if (!chatId || !text) {
      return res.status(400).json({ message: 'Please provide chatId/targetNumber and text payload' })
    }

    const result = await whatsappService.sendWhatsAppMessage(userId, chatId, text)
    res.json({ message: 'Dynamic send successful', result })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post('/stop', async (req, res) => {
  try {
    const userId = req.user._id
    await whatsappService.destroySession(userId, true)
    res.json({ message: 'WhatsApp session stopped. Auth saved. Tap Start to resume.' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post('/logout', async (req, res) => {
  try {
    const userId = req.user._id
    await whatsappService.logoutSession(userId)
    res.json({ message: 'Logged out and session data cleared. You will need to scan QR again.' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.post('/renew-qr', async (req, res) => {
  try {
    const userId = req.user._id
    await whatsappService.destroySession(userId)
    whatsappService.initializeSession(userId)
    res.json({ message: 'QR renewal initiated. New QR will appear shortly.' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.get('/logs', async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const logs = await MessageLog.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalLogs = await MessageLog.countDocuments({ userId });
    const totalPages = Math.ceil(totalLogs / limit);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todaySentCount = await MessageLog.countDocuments({
      userId,
      status: 'sent',
      createdAt: { $gte: startOfDay }
    });

    res.json({ logs, totalPages, currentPage: page, totalLogs, todaySentCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
})

router.delete('/logs/:id', async (req, res) => {
  try {
    const userId = req.user._id
    const logId = req.params.id

    const result = await MessageLog.findOneAndDelete({ _id: logId, userId })
    if (!result) {
      return res.status(404).json({ message: 'Log not found or not authorized' })
    }
    res.json({ message: 'Message log deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
