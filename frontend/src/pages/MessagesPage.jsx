import { formatDateTime } from "../utils/formatters";

function MessagesPage({ allMessagesLoading, allMessages, loadAllMessages }) {
  return (
    <section className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div>
          <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.2em] text-slate-500">View All</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">Messages</h1>
        </div>
        <button className="btn-cyan" onClick={loadAllMessages} disabled={allMessagesLoading}>
          {allMessagesLoading ? "Loading..." : "Load All Messages"}
        </button>
      </header>

      <div className="glass-panel rounded-2xl p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-900">All Sent Messages</h2>
          <p className="text-xs sm:text-sm text-slate-600">Total: {allMessages.length} messages</p>
        </div>

        {allMessagesLoading ? (
          <p className="empty">Loading messages...</p>
        ) : allMessages.length === 0 ? (
          <p className="empty">No messages yet. Click "Load All Messages" to view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">From To</th>
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Message</th>
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Campaign</th>
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                  <th className="pb-3 pr-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Time</th>
                  <th className="pb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allMessages.map((message) => {
                  const { date, time } = formatDateTime(message.sentAt || message.createdAt);
                  const senderMobile =
                    message.senderMobileNumber ||
                    message.account?.phoneNumber ||
                    "Unknown";
                  const recipientMobile = message.recipientMobileNumber || message.recipient || "--";
                  return (
                    <tr key={message._id} className="hover:bg-slate-50/50">
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900">{senderMobile}</p>
                        <p className="text-xs text-slate-500">to {recipientMobile}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="max-w-xs truncate text-sm text-slate-600">{message.text}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-sm text-slate-600">{message.campaignTitle || "-"}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-sm text-slate-600">{date}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="text-sm text-slate-600">{time}</p>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                            message.status === "sent"
                              ? "bg-emerald-100 text-emerald-700"
                              : message.status === "failed"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {message.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default MessagesPage;
