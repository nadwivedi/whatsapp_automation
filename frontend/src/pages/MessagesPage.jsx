import { useEffect, useMemo, useRef, useState } from "react";
import { REPLIES_WS_URL } from "../api/client";
import { formatDateTime } from "../utils/formatters";

function MessagesPage({
  accounts,
  conversationsLoading,
  conversations,
  conversationMessagesLoading,
  conversationMessages,
  activeConversationNumber,
  sendingReply,
  loadConversations,
  openConversation,
  sendReplyToActiveConversation,
}) {
  const [replyText, setReplyText] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });

  const callbacksRef = useRef({
    loadConversations,
    openConversation,
  });
  const activeConversationRef = useRef(activeConversationNumber);
  const replyFormRef = useRef(null);

  useEffect(() => {
    callbacksRef.current = {
      loadConversations,
      openConversation,
    };
  }, [loadConversations, openConversation]);

  useEffect(() => {
    activeConversationRef.current = activeConversationNumber;
  }, [activeConversationNumber]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const media = window.matchMedia("(max-width: 1023px)");
    const updateViewport = (event) => {
      setIsMobile(event.matches);
    };

    setIsMobile(media.matches);
    media.addEventListener("change", updateViewport);

    return () => {
      media.removeEventListener("change", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileChatOpen(false);
    }
  }, [isMobile]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.contactNumber === activeConversationNumber) || null,
    [conversations, activeConversationNumber],
  );

  useEffect(() => {
    let stopped = false;
    let socket = null;
    let reconnectTimer = null;
    let fallbackTimer = null;

    const refreshInbox = async () => {
      const list = await callbacksRef.current.loadConversations({
        preserveSelection: true,
        silent: true,
      });
      if (stopped) return;

      const target = activeConversationRef.current || list[0]?.contactNumber || "";
      if (!target) return;

      await callbacksRef.current.openConversation(target, {
        markRead: false,
        silent: true,
      });
    };

    const connectSocket = () => {
      if (stopped) return;

      socket = new window.WebSocket(REPLIES_WS_URL);

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data || "{}");
          if (payload?.type === "reply:message") {
            refreshInbox().catch(() => {});
          }
        } catch (_error) {
          // Ignore malformed events.
        }
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch (_error) {
          // Ignore close failures after socket errors.
        }
      };

      socket.onclose = () => {
        if (stopped) return;
        reconnectTimer = window.setTimeout(connectSocket, 2000);
      };
    };

    refreshInbox().catch(() => {});
    connectSocket();

    fallbackTimer = window.setInterval(() => {
      refreshInbox().catch(() => {});
    }, 30000);

    return () => {
      stopped = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      if (fallbackTimer) {
        window.clearInterval(fallbackTimer);
      }
      if (socket) {
        try {
          socket.close();
        } catch (_error) {
          // Ignore close errors while unmounting.
        }
      }
    };
  }, []);

  async function handleOpenConversation(contactNumber) {
    activeConversationRef.current = contactNumber;
    await openConversation(contactNumber, { markRead: true });
    if (isMobile) {
      setMobileChatOpen(true);
    }
  }

  async function handleSendReply(event) {
    event.preventDefault();
    const ok = await sendReplyToActiveConversation(replyText, selectedAccountId);
    if (ok) {
      setReplyText("");
    }
  }

  function handleReplyKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      if (!activeConversationNumber || sendingReply || !replyText.trim()) {
        return;
      }
      replyFormRef.current?.requestSubmit();
    }
  }

  async function handleRefreshInbox() {
    const list = await loadConversations({ preserveSelection: true });
    const target = activeConversationNumber || list[0]?.contactNumber || "";
    if (target) {
      await openConversation(target, { markRead: false });
    }
  }

  const showListPanel = !isMobile || !mobileChatOpen;
  const showChatPanel = !isMobile || mobileChatOpen;

  return (
    <section className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div>
          <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.2em] text-slate-500">Inbox</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">Replies</h1>
        </div>
        <button className="btn-cyan" onClick={handleRefreshInbox} disabled={conversationsLoading}>
          {conversationsLoading ? "Refreshing..." : "Refresh Inbox"}
        </button>
      </header>

      <div className="glass-panel rounded-2xl p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[320px,1fr]">
          {showListPanel && (
            <aside className="rounded-2xl border border-white/70 bg-white/70 p-2 sm:p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="font-heading text-sm sm:text-base font-semibold text-slate-900">Numbers</h2>
                <p className="text-xs text-slate-500">{conversations.length}</p>
              </div>

              <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                {conversations.length === 0 ? (
                  <p className="empty">No replies yet.</p>
                ) : (
                  conversations.map((item) => (
                    <button
                      key={item.contactNumber}
                      type="button"
                      onClick={() => handleOpenConversation(item.contactNumber)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        item.contactNumber === activeConversationNumber
                          ? "border-cyan-300 bg-cyan-50"
                          : "border-transparent bg-white/70 hover:border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{item.contactNumber}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                            {item.inboundMessageCount || 0}
                          </span>
                          {item.unreadCount > 0 && (
                            <span className="rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                              {item.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Session: {item.sessionMobileNumber || "--"}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">User messages: {item.inboundMessageCount || 0}</p>
                    </button>
                  ))
                )}
              </div>
            </aside>
          )}

          {showChatPanel && (
            <div className="rounded-2xl border border-white/70 bg-white/70 p-3 sm:p-4">
              {isMobile && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setMobileChatOpen(false)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Back To Numbers
                  </button>
                </div>
              )}

              <div className="mb-3 border-b border-slate-200 pb-2.5">
                <p className="text-xs uppercase tracking-wider text-slate-500">Chat</p>
                <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-900">
                  {activeConversation?.contactNumber || "Select a number"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Session: {activeConversation?.sessionMobileNumber || "--"}
                </p>
              </div>

              <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                {conversationMessagesLoading ? (
                  <p className="empty">Loading conversation...</p>
                ) : !activeConversationNumber ? (
                  <p className="empty">Select a number from left panel.</p>
                ) : conversationMessages.length === 0 ? (
                  <p className="empty">No messages for this number yet.</p>
                ) : (
                  conversationMessages.map((message) => {
                    const isInbound = message.direction === "inbound";
                    const { date, time } = formatDateTime(message.messageAt || message.sentAt || message.createdAt);
                    return (
                      <div key={`${message.source}-${message._id}`} className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
                        <div
                          className={`max-w-[86%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                            isInbound
                              ? "bg-slate-100 text-slate-900"
                              : message.status === "failed"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-cyan-500 text-white"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.text || "(No text)"}</p>
                          <p className={`mt-1 text-[10px] ${isInbound ? "text-slate-500" : "text-white/85"}`}>
                            {`From ${message.senderMobileNumber || "--"} -> ${message.recipientMobileNumber || "--"}`}
                          </p>
                          <div className={`mt-1.5 flex items-center gap-2 text-[10px] ${isInbound ? "text-slate-500" : "text-white/85"}`}>
                            <span>{date}</span>
                            <span>{time}</span>
                            <span className="uppercase">{message.source}</span>
                            {!isInbound && <span className="uppercase">{message.status}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <form ref={replyFormRef} onSubmit={handleSendReply} className="mt-3 grid gap-2 border-t border-slate-200 pt-3">
                <div className="grid gap-2 sm:grid-cols-[1fr,220px]">
                  <textarea
                    value={replyText}
                    onChange={(event) => setReplyText(event.target.value)}
                    onKeyDown={handleReplyKeyDown}
                    rows={3}
                    className="input resize-none"
                    placeholder={activeConversationNumber ? `Reply to ${activeConversationNumber}` : "Select conversation first"}
                    disabled={!activeConversationNumber || sendingReply}
                  />
                  <select
                    value={selectedAccountId}
                    onChange={(event) => setSelectedAccountId(event.target.value)}
                    className="input"
                    disabled={sendingReply}
                  >
                    <option value="">Auto-select session</option>
                    {accounts
                      .filter((account) => account.isActive !== false && account.status === "authenticated")
                      .map((account) => (
                        <option key={account._id} value={account._id}>
                          {account.phoneNumber || account.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="btn-cyan"
                    disabled={!activeConversationNumber || sendingReply || !replyText.trim()}
                  >
                    {sendingReply ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default MessagesPage;
