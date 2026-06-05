import { useState, useEffect } from 'react'
import { toast } from 'react-toastify'
import { getWhatsAppSettings, updateWhatsAppSettings } from '../../api/whatsappSettingsApi'

const services = [
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

const defaultRule = {
  enabled: true,
  beforeDays: [7],
  sendOnExpiryDay: true,
  sendAfterExpiry: false,
  afterDays: [7, 10]
}

const beforeDayOptions = [30, 15, 10, 7, 5, 3, 1]
const afterDayOptions = [1, 3, 5, 7, 10, 15, 30]

const parseDays = (value) => {
  const parsed = String(value || '')
    .split(/[,\s]+/)
    .map(item => Number(item.trim()))
    .filter(item => Number.isInteger(item) && item > 0 && item <= 365)

  return [...new Set(parsed)].sort((a, b) => a - b)
}

const normalizeBeforeInput = (value, keepExpiryDay) => {
  const cleaned = String(value || '')
    .replace(/expiry\s*day/ig, '')
    .replace(/expiryday/ig, '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .join(', ')

  return keepExpiryDay
    ? [cleaned, 'expiryday'].filter(Boolean).join(', ')
    : cleaned
}

const formatBeforeDays = (rule, isFocused = false) => [
  ...(rule.beforeDays || []),
  ...(!isFocused && rule.sendOnExpiryDay ? ['expiryday'] : [])
].join(', ')

const formatDays = (days = []) => days.join(', ')

const normalizeRules = (rules = {}) => {
  const normalized = {}
  services.forEach(service => {
    normalized[service.key] = {
      ...defaultRule,
      ...(rules[service.key] || {}),
      beforeDays: rules[service.key]?.beforeDays?.length ? parseDays(rules[service.key].beforeDays.join(',')) : defaultRule.beforeDays,
      afterDays: rules[service.key]?.afterDays?.length ? parseDays(rules[service.key].afterDays.join(',')) : defaultRule.afterDays
    }
  })
  return normalized
}

const WhatsAppSettings = () => {
  const [settings, setSettings] = useState({
    alertRules: normalizeRules(),
    maxMessagesPerDay: 30,
    maxMessagesPerHour: 5
  })
  const [draftInputs, setDraftInputs] = useState({})
  const [focusedInputs, setFocusedInputs] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = async () => {
    try {
      const res = await getWhatsAppSettings()
      setSettings({
        ...res,
        alertRules: normalizeRules(res?.alertRules)
      })
      setDraftInputs({})
    } catch (error) {
      toast.error('Failed to load WhatsApp settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  const updateRule = (serviceKey, patch) => {
    setSettings(prev => ({
      ...prev,
      alertRules: {
        ...prev.alertRules,
        [serviceKey]: {
          ...prev.alertRules[serviceKey],
          ...patch
        }
      }
    }))
  }

  const toggleDay = (serviceKey, field, day) => {
    const rule = settings.alertRules[serviceKey]
    const selected = new Set(rule[field] || [])
    if (selected.has(day)) {
      selected.delete(day)
    } else {
      selected.add(day)
    }
    updateRule(serviceKey, { [field]: [...selected].sort((a, b) => a - b) })
  }

  const toggleExpiryDay = (serviceKey, beforeInputKey, currentRule) => {
    const nextValue = !currentRule.sendOnExpiryDay
    updateRule(serviceKey, { sendOnExpiryDay: nextValue })
    setDraftInputs(prev => ({
      ...prev,
      [beforeInputKey]: formatBeforeDays({ ...currentRule, sendOnExpiryDay: nextValue }, focusedInputs[beforeInputKey])
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        ...settings,
        alertRules: normalizeRules(settings.alertRules)
      }
      const response = await updateWhatsAppSettings(payload)
      setSettings({
        ...response,
        alertRules: normalizeRules(response?.alertRules)
      })
      setDraftInputs({})
      toast.success('WhatsApp settings updated successfully')
    } catch (error) {
      toast.error('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className='bg-white rounded-xl p-6 shadow-lg border border-green-200 mt-4'>
        <p className='text-sm font-semibold text-gray-600'>Loading WhatsApp settings...</p>
      </div>
    )
  }

  return (
    <div className='bg-white rounded-xl p-6 shadow-lg border border-green-200 mt-4'>
      <div className='flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4'>
        <div className='flex items-center gap-3'>
          <div className='w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center text-white text-xl'>
            WA
          </div>
          <div>
            <h2 className='text-base font-bold text-gray-800'>WhatsApp Automated Settings</h2>
            <p className='text-[11px] text-gray-500'>Choose which expiry alerts should be sent for each work type.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className='px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition text-sm disabled:opacity-60'
        >
          {saving ? 'Saving...' : 'Save WhatsApp Settings'}
        </button>
      </div>

      <div className='mb-4 grid grid-cols-1 md:grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4'>
        <div>
          <label className='text-xs font-semibold text-gray-700 block mb-1'>Max Messages Per Day</label>
          <input
            type='number'
            min='1'
            value={settings.maxMessagesPerDay || 30}
            onChange={(e) => setSettings(prev => ({ ...prev, maxMessagesPerDay: Number(e.target.value) || 1 }))}
            className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-xs'
          />
        </div>
        <div>
          <label className='text-xs font-semibold text-gray-700 block mb-1'>Max Messages Per Hour</label>
          <input
            type='number'
            min='1'
            value={settings.maxMessagesPerHour || 5}
            onChange={(e) => setSettings(prev => ({ ...prev, maxMessagesPerHour: Number(e.target.value) || 1 }))}
            className='w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-xs'
          />
        </div>
      </div>

      <div className='space-y-3'>
        {services.map(service => {
          const rule = settings.alertRules[service.key] || defaultRule
          const beforeInputKey = `${service.key}.beforeDays`
          const afterInputKey = `${service.key}.afterDays`
          return (
            <div key={service.key} className='rounded-xl border border-gray-200 bg-white p-4 shadow-sm'>
              <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                <div className='min-w-[150px]'>
                  <label className='flex items-center gap-2'>
                    <input
                      type='checkbox'
                      checked={rule.enabled}
                      onChange={(e) => updateRule(service.key, { enabled: e.target.checked })}
                      className='w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500'
                    />
                    <span className='text-xs font-black text-gray-800'>{service.label}</span>
                  </label>
                  <p className='mt-1 text-[10px] text-gray-500'>{rule.enabled ? 'Messages enabled' : 'Messages disabled'}</p>
                </div>

                <div className='grid flex-1 grid-cols-1 gap-4 xl:grid-cols-2'>
                  <div className={!rule.enabled ? 'opacity-50 pointer-events-none' : ''}>
                    <label className='block text-[10px] font-bold uppercase text-gray-600 mb-2'>Before Expiry Days</label>
                    <div className='flex flex-wrap gap-2'>
                      {beforeDayOptions.map(day => (
                        <button
                          key={day}
                          type='button'
                          onClick={() => toggleDay(service.key, 'beforeDays', day)}
                          className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold transition ${
                            rule.beforeDays.includes(day)
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-green-300'
                          }`}
                        >
                          {day}d
                        </button>
                      ))}
                      <button
                        type='button'
                        onClick={() => toggleExpiryDay(service.key, beforeInputKey, rule)}
                        className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold transition ${
                          rule.sendOnExpiryDay
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-green-300'
                        }`}
                      >
                        Expiry Day
                      </button>
                    </div>
                    <input
                      type='text'
                      value={draftInputs[beforeInputKey] ?? formatBeforeDays(rule, focusedInputs[beforeInputKey])}
                      onFocus={() => {
                        setFocusedInputs(prev => ({ ...prev, [beforeInputKey]: true }))
                        setDraftInputs(prev => ({
                          ...prev,
                          [beforeInputKey]: normalizeBeforeInput(prev[beforeInputKey] ?? formatBeforeDays(rule, false), false)
                        }))
                      }}
                      onBlur={() => {
                        setFocusedInputs(prev => ({ ...prev, [beforeInputKey]: false }))
                        setDraftInputs(prev => ({
                          ...prev,
                          [beforeInputKey]: formatBeforeDays(settings.alertRules[service.key] || defaultRule, false)
                        }))
                      }}
                      onChange={(e) => {
                        const value = e.target.value
                        const shouldSendOnExpiryDay = /expiry\s*day|expiryday|0/i.test(value) || rule.sendOnExpiryDay
                        setDraftInputs(prev => ({ ...prev, [beforeInputKey]: value }))
                        updateRule(service.key, {
                          beforeDays: parseDays(value),
                          sendOnExpiryDay: shouldSendOnExpiryDay
                        })
                      }}
                      placeholder='e.g. 30, 15, 7, expiryday'
                      className='mt-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-green-500'
                    />
                  </div>

                  <div className={!rule.enabled ? 'opacity-50 pointer-events-none' : ''}>
                    <label className='mb-2 flex items-center gap-2 text-[10px] font-bold uppercase text-gray-600'>
                      <span>After Expiry Days</span>
                      <span className='inline-flex items-center rounded border border-gray-200 bg-gray-50 p-0.5'>
                        <input
                          type='checkbox'
                          checked={rule.sendAfterExpiry}
                          onChange={(e) => updateRule(service.key, { sendAfterExpiry: e.target.checked })}
                          className='w-2.5 h-2.5 rounded border-gray-300 text-green-600 focus:ring-green-500'
                        />
                      </span>
                    </label>
                    <div className={`space-y-2 ${!rule.sendAfterExpiry ? 'opacity-50 pointer-events-none' : ''}`}>
                      <div className='flex flex-wrap gap-2'>
                        {afterDayOptions.map(day => (
                          <button
                            key={day}
                            type='button'
                            onClick={() => toggleDay(service.key, 'afterDays', day)}
                            className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold transition ${
                              rule.afterDays.includes(day)
                                ? 'border-red-500 bg-red-50 text-red-700'
                                : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-red-300'
                            }`}
                          >
                            {day}d
                          </button>
                        ))}
                      </div>
                      <input
                        type='text'
                        value={draftInputs[afterInputKey] ?? formatDays(rule.afterDays)}
                        onChange={(e) => {
                          const value = e.target.value
                          setDraftInputs(prev => ({ ...prev, [afterInputKey]: value }))
                          updateRule(service.key, { afterDays: parseDays(value) })
                        }}
                        placeholder='e.g. 7, 10'
                        className='w-full rounded-lg border border-gray-300 px-3 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-green-500'
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default WhatsAppSettings
