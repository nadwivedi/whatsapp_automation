import React, { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-toastify'
import { getWhatsAppStatus, startWhatsAppSession, stopWhatsAppSession, logoutWhatsAppSession, renewWhatsAppQR, getWhatsAppLogs, deleteWhatsAppLog } from '../../api/whatsappApi'

const statusConfig = {
  authenticated: {
    label: '✅ Connected',
    color: 'bg-green-100 text-green-700 border-green-300',
    card: 'bg-green-50 border-green-200'
  },
  qr_ready: {
    label: '📱 Scan QR Code',
    color: 'bg-orange-100 text-orange-700 border-orange-300',
    card: 'bg-orange-50 border-orange-200'
  },
  initializing: {
    label: '⏳ Connecting...',
    color: 'bg-blue-100 text-blue-700 border-blue-300',
    card: 'bg-blue-50 border-blue-200'
  },
  auth_failure: {
    label: '❌ Auth Failed',
    color: 'bg-red-100 text-red-700 border-red-300',
    card: 'bg-red-50 border-red-200'
  },
  disconnected: {
    label: '🔌 Disconnected',
    color: 'bg-gray-100 text-gray-700 border-gray-300',
    card: 'bg-gray-50 border-gray-200'
  }
}

const WhatsApp = () => {
  const [statusInfo, setStatusInfo] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [todaySentCount, setTodaySentCount] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all')

  const fetchStatus = useCallback(async () => {
    try {
      const res = await getWhatsAppStatus()
      setStatusInfo(res)
    } catch (error) {
      console.error('[WhatsApp] Status fetch error:', error)
    }
  }, [])

  const fetchLogs = useCallback(async (currentPage = page) => {
    try {
      const res = await getWhatsAppLogs(null, currentPage)
      setLogs(res.logs || [])
      setTotalPages(res.totalPages || 1)
      setTodaySentCount(res.todaySentCount || 0)
    } catch (error) {
      console.error('[WhatsApp] Logs fetch error:', error)
    }
  }, [page])

  useEffect(() => {
    const init = async () => {
      await fetchStatus()
      await fetchLogs(1)
      setLoading(false)
    }
    init()
  }, [fetchStatus, fetchLogs])

  useEffect(() => {
    const currentStatus = statusInfo?.status || 'disconnected'
    const isActivelyConnecting = ['qr_ready', 'initializing'].includes(currentStatus)
    const intervalMs = isActivelyConnecting ? 400 : 5000

    const interval = setInterval(fetchStatus, intervalMs)
    return () => clearInterval(interval)
  }, [statusInfo?.status, fetchStatus])

  const doAction = async (action, successMsg) => {
    setActionBusy(action)
    try {
      if (action === 'start') await startWhatsAppSession()
      else if (action === 'stop') await stopWhatsAppSession()
      else if (action === 'logout') await logoutWhatsAppSession()
      else if (action === 'renew-qr') await renewWhatsAppQR()
      toast.success(successMsg)
      await fetchStatus()
    } catch (error) {
      toast.error(`Failed: ${error?.message || error}`)
    } finally {
      setActionBusy(null)
    }
  }

  const handleDeleteLog = async (id) => {
    if (!window.confirm('Are you sure you want to delete this log?')) return
    try {
      await deleteWhatsAppLog(null, id)
      toast.success('Log deleted')
      setLogs((prev) => prev.filter((log) => log._id !== id))
    } catch (error) {
      toast.error(`Failed to delete: ${error?.message || error}`)
    }
  }

  const currentStatus = statusInfo?.status || 'disconnected'
  const config = statusConfig[currentStatus] || statusConfig.disconnected
  const isConnected = currentStatus === 'authenticated'
  const isRunning = ['authenticated', 'initializing', 'qr_ready'].includes(currentStatus)

  return (
    <div className='p-4 md:p-6 lg:p-8 pt-4 lg:pt-6 max-w-[1400px] mx-auto'>
      <div className='mb-6'>
        <h1 className='text-2xl font-black text-gray-800 mb-1'>📲 WhatsApp Automation</h1>
        <p className='text-sm text-gray-600'>Connect WhatsApp to send automated document expiry alerts to clients.</p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-5 gap-6'>
        <div className='bg-white rounded-xl shadow-lg border border-gray-200 p-6 lg:col-span-1 space-y-4'>
          <h2 className='text-base font-bold text-gray-800 flex items-center gap-2'>
            💬 Connection Status
          </h2>

          <div className={`flex items-center justify-between p-3 rounded-lg border ${config.card}`}>
            <span className='text-xs font-semibold text-gray-500 uppercase tracking-wide'>Status</span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${config.color}`}>
              {config.label}
            </span>
          </div>

          {isConnected && statusInfo?.phoneNumber && (
            <div className='p-3 rounded-lg bg-green-50 border border-green-200'>
              <p className='text-xs text-green-600 font-semibold'>Active Number</p>
              <p className='text-sm text-green-800 font-bold mt-0.5'>+{statusInfo.phoneNumber}</p>
              {statusInfo?.lastConnectedAt && (
                <p className='text-[11px] text-green-500 mt-1'>
                  Connected: {new Date(statusInfo.lastConnectedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}

          {currentStatus === 'qr_ready' && statusInfo?.qrCodeDataUrl && (
            <div className='flex flex-col items-center p-4 border-2 border-dashed border-orange-300 rounded-xl bg-orange-50'>
              <p className='text-xs font-semibold text-orange-700 mb-2'>Open WhatsApp → Linked Devices → Link a Device</p>
              <img
                src={statusInfo.qrCodeDataUrl}
                alt='WhatsApp QR Code'
                className='w-52 h-52 rounded-xl border-4 border-white shadow-lg'
              />
              <p className='text-[11px] text-orange-500 mt-2 mb-3'>QR refreshes automatically every ~30s</p>

              <button
                onClick={() => doAction('renew-qr', 'Refreshing QR code...')}
                disabled={actionBusy === 'renew-qr'}
                className='flex items-center gap-2 px-4 py-2 bg-white border border-orange-200 text-orange-700 rounded-lg text-xs font-bold hover:bg-orange-100 transition shadow-sm'
              >
                {actionBusy === 'renew-qr' ? (
                  <div className='w-3 h-3 border-2 border-orange-500 border-t-transparent rounded-full animate-spin' />
                ) : (
                  <span>🔄 Renew QR Code</span>
                )}
              </button>
            </div>
          )}

          {currentStatus === 'initializing' && (
            <div className='flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg'>
              <div className='w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0' />
              <div>
                <p className='text-sm text-blue-800 font-semibold'>Connecting to WhatsApp...</p>
                <p className='text-xs text-blue-500'>If you scanned QR, please wait a moment</p>
              </div>
            </div>
          )}

          {statusInfo?.lastError && !isConnected && (
            <div className='p-3 bg-red-50 text-red-700 text-xs rounded-lg border border-red-200'>
              <strong>Error:</strong> {statusInfo.lastError}
            </div>
          )}

          <div className='flex flex-col gap-2 pt-2 border-t border-gray-100'>
            {!isRunning && (
              <button
                onClick={() => doAction('start', 'Session started! Wait for QR or connection...')}
                disabled={actionBusy === 'start'}
                className='w-full py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-sm transition shadow-md flex items-center justify-center gap-2'
              >
                {actionBusy === 'start' ? (
                  <><div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' /> Starting...</>
                ) : (
                  <>▶ Start WhatsApp Session</>
                )}
              </button>
            )}

            {isRunning && (
              <button
                onClick={() => doAction('stop', 'Session stopped. Auth saved — tap Start to resume.')}
                disabled={actionBusy === 'stop'}
                className='w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-sm transition shadow-md flex items-center justify-center gap-2'
              >
                {actionBusy === 'stop' ? (
                  <><div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' /> Stopping...</>
                ) : (
                  <>⏹ Stop Sending Messages</>
                )}
              </button>
            )}

            {isRunning && (
              <button
                onClick={() => {
                  if (window.confirm('Are you sure? This will clear the WhatsApp session and you will need to scan QR again.')) {
                    doAction('logout', 'Logged out. Session cleared. Scan QR to reconnect.')
                  }
                }}
                disabled={actionBusy === 'logout'}
                className='w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-sm transition shadow-md flex items-center justify-center gap-2'
              >
                {actionBusy === 'logout' ? (
                  <><div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' /> Logging out...</>
                ) : (
                  <>🚪 Logout & Clear Session</>
                )}
              </button>
            )}
          </div>

          <div className='p-3 bg-gray-50 border border-gray-200 rounded-lg text-center'>
            <p className='text-xs text-gray-500'>Messages Sent Today</p>
            <p className='text-2xl font-black text-gray-800'>{todaySentCount}</p>
          </div>
        </div>

        <div className='bg-white rounded-xl shadow-lg border border-gray-200 p-6 lg:col-span-4'>
          <div className='flex items-center justify-between mb-4'>
            <h2 className='text-base font-bold text-gray-800 flex items-center gap-2'>
              📋 Recent Message Logs
            </h2>
            <button
              onClick={() => { fetchLogs(page); toast.info('Logs refreshed') }}
              className='px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold text-gray-700 border border-gray-300 transition'
            >
              🔄 Refresh
            </button>
          </div>

          {(() => {
            const counts = {
              all: logs.length,
              sent: logs.filter(l => l.status === 'sent').length,
              pending: logs.filter(l => l.status === 'pending').length,
              failed: logs.filter(l => l.status === 'failed').length,
            }
            const tabs = [
              { key: 'all',     label: 'All',     emoji: '📋', active: 'bg-gray-800 text-white border-gray-800',     inactive: 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',     badge: 'bg-gray-200 text-gray-800' },
              { key: 'sent',    label: 'Sent',    emoji: '✅', active: 'bg-green-600 text-white border-green-600',   inactive: 'bg-white text-green-700 border-green-300 hover:bg-green-50',   badge: 'bg-green-100 text-green-800' },
              { key: 'pending', label: 'Pending', emoji: '⏳', active: 'bg-yellow-500 text-white border-yellow-500', inactive: 'bg-white text-yellow-700 border-yellow-300 hover:bg-yellow-50', badge: 'bg-yellow-100 text-yellow-800' },
              { key: 'failed',  label: 'Failed',  emoji: '❌', active: 'bg-red-600 text-white border-red-600',       inactive: 'bg-white text-red-700 border-red-300 hover:bg-red-50',         badge: 'bg-red-100 text-red-800' },
            ]
            return (
              <div className='flex flex-wrap gap-2 mb-4'>
                {tabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                      statusFilter === tab.key ? tab.active : tab.inactive
                    }`}
                  >
                    <span>{tab.emoji}</span>
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      statusFilter === tab.key ? 'bg-white/20 text-white' : tab.badge
                    }`}>
                      {counts[tab.key]}
                    </span>
                  </button>
                ))}
              </div>
            )
          })()}

          <div className='overflow-x-auto'>
            <table className='w-full text-left border-collapse'>
              <thead>
                <tr className='bg-gray-50 border-y border-gray-200'>
                  <th className='py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider'>Date & Time</th>
                  <th className='py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider'>Party / Mobile</th>
                  <th className='py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider'>Document</th>
                  <th className='py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider'>Message Preview</th>
                  <th className='py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider'>Status</th>
                  <th className='py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider'>Sent At</th>
                  <th className='py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center'>Action</th>
                </tr>
              </thead>
              <tbody className='divide-y divide-gray-100'>
                {loading ? (
                  <tr><td colSpan='7' className='py-8 text-center text-sm text-gray-400'>Loading...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan='7' className='py-8 text-center text-sm text-gray-400'>No messages logged yet.</td></tr>
                ) : (
                  logs.filter(log => statusFilter === 'all' || log.status === statusFilter).length === 0 ? (
                    <tr><td colSpan='7' className='py-8 text-center text-sm text-gray-400'>No {statusFilter} messages found.</td></tr>
                  ) :
                  logs.filter(log => statusFilter === 'all' || log.status === statusFilter).map((log) => {
                    const d = new Date(log.createdAt);
                    const dateStr = d.toLocaleDateString('en-IN');
                    const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                    const sentD = log.sentAt ? new Date(log.sentAt) : null;
                    const sentDateStr = sentD ? sentD.toLocaleDateString('en-IN') : null;
                    const sentTimeStr = sentD ? sentD.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null;
                    return (
                    <tr key={log._id} className='hover:bg-gray-50 transition'>
                      <td className='py-3 px-4 whitespace-nowrap'>
                        <div className='text-sm text-gray-800 font-medium'>{dateStr}</div>
                        <div className='text-xs text-gray-500'>{timeStr}</div>
                      </td>
                      <td className='py-3 px-4'>
                        <div className='text-sm text-gray-800 font-bold'>{log.ownerName || 'Unknown Party'}</div>
                        <div className='text-xs text-gray-500'>{log.targetNumber}</div>
                      </td>
                      <td className='py-3 px-4'>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          log.documentType === 'Tax' ? 'bg-yellow-100 text-yellow-800' :
                          log.documentType === 'Fitness' ? 'bg-blue-100 text-blue-800' :
                          log.documentType === 'Puc' ? 'bg-purple-100 text-purple-800' :
                          log.documentType === 'Gps' ? 'bg-teal-100 text-teal-800' :
                          'bg-pink-100 text-pink-800'
                        }`}>
                          {log.documentType}
                        </span>
                      </td>
                      <td className='py-3 px-4 text-xs text-gray-500 max-w-[220px]'>
                        <div className='truncate' title={log.messageBody}>{log.messageBody}</div>
                      </td>
                      <td className='py-3 px-4'>
                        <span className={`px-2 py-1 rounded-full text-[11px] font-bold ${
                          log.status === 'sent' ? 'bg-green-100 text-green-700' :
                          log.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {log.status === 'sent' ? '✓ SENT' :
                           log.status === 'pending' ? '⏳ PENDING' : '✗ FAILED'}
                        </span>
                        {log.errorReason && (
                          <div className='text-[10px] text-red-500 mt-1 max-w-[120px] truncate' title={log.errorReason}>
                            {log.errorReason}
                          </div>
                        )}
                      </td>
                      <td className='py-3 px-4 whitespace-nowrap'>
                        {sentD ? (
                          <>
                            <div className='text-sm text-gray-800 font-medium'>{sentDateStr}</div>
                            <div className='text-xs text-gray-500'>{sentTimeStr}</div>
                          </>
                        ) : (
                          <span className='text-xs text-gray-400'>-</span>
                        )}
                      </td>
                      <td className='py-3 px-4 text-center border-l border-gray-100'>
                        <button
                          onClick={() => handleDeleteLog(log._id)}
                          className='text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 transition p-1.5 rounded-md'
                          title='Delete Log'
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className='flex items-center justify-between mt-4 px-4 py-3 bg-gray-50 border-t border-gray-200 rounded-b-xl'>
              <div className='text-sm text-gray-500'>
                Showing Page <span className='font-semibold text-gray-800'>{page}</span> of <span className='font-semibold text-gray-800'>{totalPages}</span>
              </div>
              <div className='flex items-center gap-2'>
                <button
                  onClick={() => {
                    const newPage = Math.max(1, page - 1);
                    setPage(newPage);
                    fetchLogs(newPage);
                  }}
                  disabled={page === 1}
                  className='px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition'
                >
                  Previous
                </button>
                <button
                  onClick={() => {
                    const newPage = Math.min(totalPages, page + 1);
                    setPage(newPage);
                    fetchLogs(newPage);
                  }}
                  disabled={page === totalPages}
                  className='px-3 py-1.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition'
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default WhatsApp
