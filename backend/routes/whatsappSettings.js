const express = require('express')
const router = express.Router()
const WhatsAppSetting = require('../models/WhatsAppSetting')
const { normalizeAlertSettings } = require('../utils/whatsappAlertSettings')

router.get('/', async (req, res) => {
  try {
    let setting = await WhatsAppSetting.findOne({ userId: req.user._id })
    if (!setting) {
      setting = await WhatsAppSetting.create({
        userId: req.user._id
      })
    }
    const normalized = normalizeAlertSettings(setting.toObject())
    res.json({
      ...setting.toObject(),
      alertRules: normalized.alertRules,
      services: normalized.services
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

router.put('/', async (req, res) => {
  try {
    const {
      daysBeforeExpiry,
      sendOnExpiryDay,
      enableGracePeriodAlerts,
      gracePeriodDays,
      alertRules,
      maxMessagesPerDay,
      maxMessagesPerHour
    } = req.body

    let setting = await WhatsAppSetting.findOne({ userId: req.user._id })
    if (!setting) {
      setting = new WhatsAppSetting({ userId: req.user._id })
    }

    if (daysBeforeExpiry !== undefined) setting.daysBeforeExpiry = daysBeforeExpiry
    if (sendOnExpiryDay !== undefined) setting.sendOnExpiryDay = sendOnExpiryDay
    if (enableGracePeriodAlerts !== undefined) setting.enableGracePeriodAlerts = enableGracePeriodAlerts
    if (gracePeriodDays !== undefined) setting.gracePeriodDays = gracePeriodDays
    if (alertRules !== undefined) setting.alertRules = normalizeAlertSettings({ ...setting.toObject(), alertRules }).alertRules
    if (maxMessagesPerDay !== undefined) setting.maxMessagesPerDay = maxMessagesPerDay
    if (maxMessagesPerHour !== undefined) setting.maxMessagesPerHour = maxMessagesPerHour

    await setting.save()
    const normalized = normalizeAlertSettings(setting.toObject())
    res.json({
      ...setting.toObject(),
      alertRules: normalized.alertRules,
      services: normalized.services
    })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
})

module.exports = router
