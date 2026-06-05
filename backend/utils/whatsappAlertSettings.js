const WHATSAPP_ALERT_SERVICES = [
  { key: 'fitness', label: 'Fitness' },
  { key: 'tax', label: 'Tax' },
  { key: 'puc', label: 'PUC' },
  { key: 'gps', label: 'GPS' },
  { key: 'nationalPermit', label: 'NP' },
  { key: 'statePermit', label: 'State Permit' },
  { key: 'busPermit', label: 'Bus Permit' },
  { key: 'temporaryPermit', label: 'Temp Permit' },
  { key: 'insurance', label: 'Insurance' }
]

const DEFAULT_ALERT_RULE = {
  enabled: true,
  beforeDays: [7, 3],
  sendOnExpiryDay: true,
  sendAfterExpiry: false,
  afterDays: [7, 10]
}

const normalizeDays = (value, fallback = [], options = {}) => {
  const { allowZero = false } = options
  const rawValues = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map(item => item.trim())

  const normalized = [...new Set(
    rawValues
      .map(item => Number(item))
      .filter(item => Number.isInteger(item) && item <= 365 && (allowZero ? item >= 0 : item > 0))
  )].sort((a, b) => a - b)

  return normalized.length ? normalized : fallback
}

const normalizeAlertRule = (rule = {}, legacySetting = {}) => {
  const beforeDays = normalizeDays(
    rule.beforeDays,
    legacySetting.daysBeforeExpiry !== undefined ? [legacySetting.daysBeforeExpiry] : DEFAULT_ALERT_RULE.beforeDays
  )

  const afterDays = normalizeDays(rule.afterDays, legacySetting.gracePeriodDays || DEFAULT_ALERT_RULE.afterDays)

  return {
    enabled: rule.enabled !== false,
    beforeDays: beforeDays.length ? beforeDays : DEFAULT_ALERT_RULE.beforeDays,
    sendOnExpiryDay: rule.sendOnExpiryDay !== undefined ? rule.sendOnExpiryDay === true : legacySetting.sendOnExpiryDay !== false,
    sendAfterExpiry: rule.sendAfterExpiry !== undefined ? rule.sendAfterExpiry === true : legacySetting.enableGracePeriodAlerts === true,
    afterDays: afterDays.length ? afterDays : DEFAULT_ALERT_RULE.afterDays
  }
}

const normalizeAlertSettings = (setting = {}) => {
  const existingRules = setting.alertRules || {}
  const alertRules = {}

  WHATSAPP_ALERT_SERVICES.forEach(service => {
    alertRules[service.key] = normalizeAlertRule(existingRules[service.key], setting)
  })

  return {
    alertRules,
    services: WHATSAPP_ALERT_SERVICES
  }
}

module.exports = {
  WHATSAPP_ALERT_SERVICES,
  DEFAULT_ALERT_RULE,
  normalizeAlertSettings,
  normalizeAlertRule,
  normalizeDays
}
