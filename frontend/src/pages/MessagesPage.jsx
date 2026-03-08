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
  deleteConversation,
}) {
  const [replyText, setReplyText] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 1023px)").matches;
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showChatMenu, setShowChatMenu] = useState(false);

  const callbacksRef = useRef({
    loadConversations,
    openConversation,
  });
  const activeConversationRef = useRef(activeConversationNumber);
  const replyFormRef = useRef(null);
  const messagesEndRef = useRef(null);

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

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationMessages]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (showChatMenu && !event.target.closest('.chat-menu')) {
        setShowChatMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showChatMenu]);

  const activeConversation = useMemo(
    () => conversations.find((item) => item.contactNumber === activeConversationNumber) || null,
    [conversations, activeConversationNumber],
  );

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const query = searchQuery.toLowerCase();
    return conversations.filter(
      (item) =>
        item.contactNumber?.includes(query) ||
        item.sessionMobileNumber?.toLowerCase().includes(query)
    );
  }, [conversations, searchQuery]);

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
        }
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch (_error) {
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

  function getInitials(phone) {
    if (!phone) return "?";
    return phone.slice(-2).toUpperCase();
  }

  function formatLastMessage(item) {
    if (!item.lastInboundMessage) return "No messages yet";
    const text = item.lastInboundMessage.text || "(Media)";
    return text.length > 35 ? text.slice(0, 35) + "..." : text;
  }

  function formatContactName(item) {
    if (item.contactName) return item.contactName;
    return item.contactNumber;
  }

  const showListPanel = !isMobile || !mobileChatOpen;
  const showChatPanel = !isMobile || mobileChatOpen;

  return (
    <div className="h-[calc(100vh-2rem)] lg:h-[calc(100vh-3rem)] flex overflow-hidden">
      <div className="flex w-full rounded-2xl overflow-hidden bg-white shadow-2xl">
        {showListPanel && (
          <aside className="w-full md:w-80 min-w-0 md:min-w-[280px] bg-[#ffffff] border-r border-gray-100 flex flex-col max-w-full overflow-hidden">
            <div className="bg-[#f0f2f5] px-3 md:px-4 py-3 flex items-center justify-between">
              <h1 className="text-lg md:text-xl font-bold text-gray-800">Chats</h1>
              <button 
                onClick={handleRefreshInbox} 
                disabled={conversationsLoading}
                className="p-2 rounded-full hover:bg-gray-200 transition disabled:opacity-50"
                title="Refresh"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={conversationsLoading ? "animate-spin" : ""}>
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                  <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                  <path d="M16 21h5v-5"/>
                </svg>
              </button>
            </div>
            
            <div className="px-2 md:px-3 py-2 bg-white">
              <div className="bg-[#f0f2f5] rounded-full px-3 md:px-4 py-2 flex items-center gap-2 md:gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.3-4.3"/>
                </svg>
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent outline-none text-sm placeholder:text-gray-500 min-w-0"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>{searchQuery ? "No chats found" : "No conversations yet"}</p>
                </div>
              ) : (
                filteredConversations.map((item) => (
                  <button
                    key={item.contactNumber}
                    type="button"
                    onClick={() => handleOpenConversation(item.contactNumber)}
                    className={`w-full px-2 md:px-3 py-3 flex items-center gap-2 md:gap-3 hover:bg-[#f5f6f7] transition border-b border-gray-50 ${
                      item.contactNumber === activeConversationNumber ? "bg-[#f0f2f5]" : ""
                    }`}
                  >
                    <div className="relative shrink-0">
                      <div className="w-10 md:w-12 h-10 md:h-12 rounded-full bg-[#e8e8e8] flex items-center justify-center text-sm font-semibold text-gray-600">
                        {getInitials(item.contactNumber)}
                      </div>
                      <div className="absolute bottom-0 right-0 w-2.5 md:w-3 h-2.5 md:h-3 bg-[#25d366] rounded-full border-2 border-white"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900 text-sm truncate">{formatContactName(item)}</span>
                        <span className="text-xs text-gray-500 shrink-0 ml-1">
                          {item.lastMessageAt ? formatDateTime(item.lastMessageAt).time : ""}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-sm text-gray-500 truncate">{formatLastMessage(item)}</span>
                        {item.unreadCount > 0 && (
                          <span className="min-w-[18px] md:min-w-[20px] h-4 md:h-5 flex items-center justify-center rounded-full bg-[#25d366] text-white text-xs font-semibold shrink-0 ml-1">
                            {item.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}

        {showChatPanel && (
          <div className="flex-1 flex flex-col bg-[#e5ded8]">
            {isMobile && mobileChatOpen && (
              <div className="bg-[#f0f2f5] px-2 py-2 flex items-center gap-2">
                <button type="button" onClick={() => setMobileChatOpen(false)} className="p-2 rounded-full hover:bg-gray-200">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 18-6-6 6-6"/>
                  </svg>
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-[#e8e8e8] flex items-center justify-center text-xs font-semibold text-gray-600 shrink-0">
                    {getInitials(activeConversation?.contactNumber)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">{activeConversation?.contactNumber || "Chat"}</div>
                    <div className="text-xs text-gray-500">Session: {activeConversation?.sessionMobileNumber || "--"}</div>
                  </div>
                </div>
                <div className="relative chat-menu shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowChatMenu(!showChatMenu)}
                    className="p-2 rounded-full hover:bg-gray-200 transition"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="2"/>
                      <circle cx="12" cy="5" r="2"/>
                      <circle cx="12" cy="19" r="2"/>
                    </svg>
                  </button>
                  {showChatMenu && (
                    <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 chat-menu">
                      <button
                        type="button"
                        onClick={() => {
                          setShowChatMenu(false);
                          deleteConversation(activeConversationNumber);
                        }}
                        className="w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-gray-100 flex items-center gap-3"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                        Delete chat
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!isMobile && (
              <div className="bg-[#f0f2f5] px-4 py-2.5 flex items-center gap-3 border-b border-gray-200">
                <div className="w-10 h-10 rounded-full bg-[#e8e8e8] flex items-center justify-center text-sm font-semibold text-gray-600">
                  {getInitials(activeConversation?.contactNumber)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{activeConversation?.contactNumber || "Select a chat"}</div>
                  <div className="text-xs text-gray-500">
                    {activeConversation ? `Session: ${activeConversation.sessionMobileNumber || "--"}` : "WhatsApp"}
                  </div>
                </div>
                {activeConversationNumber && (
                  <div className="relative chat-menu">
                    <button
                      type="button"
                      onClick={() => setShowChatMenu(!showChatMenu)}
                      className="p-1.5 rounded-full hover:bg-gray-200 transition"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="12" r="1.5"/>
                        <circle cx="12" cy="6" r="1.5"/>
                        <circle cx="12" cy="18" r="1.5"/>
                      </svg>
                    </button>
                    {showChatMenu && (
                      <div className="absolute right-0 top-full mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 chat-menu">
                        <button
                          type="button"
                          onClick={() => {
                            setShowChatMenu(false);
                            deleteConversation(activeConversationNumber);
                          }}
                          className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-100 flex items-center gap-2"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                          </svg>
                          Delete chat
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 relative" style={{
              backgroundColor: '#e5ded8',
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 30m-25 0a25 25 0 1 0 50 0a25 25 0 1 0-50 0' fill='none' stroke='%23c8ccc4' stroke-width='1'/%3E%3C/svg%3E")`,
              backgroundSize: '30px 30px'
            }}>
              {!activeConversationNumber ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-8">
                  <div className="w-24 h-24 mb-4 rounded-full bg-[#e8e8e8] flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                    </svg>
                  </div>
                  <h2 className="text-xl font-semibold text-gray-700 mb-1">WhatsApp Message Hub</h2>
                  <p className="text-gray-500 text-sm">Select a conversation to start messaging</p>
                </div>
              ) : conversationMessagesLoading ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="w-10 h-10 border-4 border-[#25d366] border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="text-gray-500 text-sm">Loading messages...</p>
                </div>
              ) : conversationMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-gray-500 text-sm">No messages yet. Start the conversation!</p>
                </div>
              ) : (
                <div className="space-y-1 pb-2">
                  {conversationMessages.map((message) => {
                    const isInbound = message.direction === "inbound";
                    const { date, time } = formatDateTime(message.messageAt || message.sentAt || message.createdAt);
                    return (
                      <div key={`${message.source}-${message._id}`} className={`flex ${isInbound ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
                          isInbound
                            ? "bg-white text-gray-900 rounded-tl-none"
                            : message.status === "failed"
                              ? "bg-[#ffebee] text-red-800 rounded-tr-none"
                              : "bg-[#d9fdd3] text-gray-900 rounded-tr-none"
                        }`}>
                          <div className="whitespace-pre-wrap break-words text-sm">{message.text || "(No text)"}</div>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[10px] text-gray-500">{date}</span>
                            <span className="text-[10px] text-gray-500">{time}</span>
                            {!isInbound && (
                              <span className="text-[10px]">
                                {message.status === "sent" && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                  </svg>
                                )}
                                {message.status === "delivered" && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                    <polyline points="20 12 9 23 4 18"/>
                                  </svg>
                                )}
                                {message.status === "read" && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34b7f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"/>
                                    <polyline points="20 12 9 23 4 18"/>
                                  </svg>
                                )}
                                {message.status === "failed" && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f44336" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="15" y1="9" x2="9" y2="15"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                  </svg>
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <form ref={replyFormRef} onSubmit={handleSendReply} className="bg-[#f0f2f5] px-4 py-3 flex items-end gap-2">
              {!activeConversationNumber ? (
                <div className="flex-1 bg-[#e8e8e8] rounded-full px-4 py-3 text-gray-500 text-sm">
                  Select a conversation to reply
                </div>
              ) : (
                <>
                  <div className="shrink-0">
                    <select
                      value={selectedAccountId}
                      onChange={(event) => setSelectedAccountId(event.target.value)}
                      className="bg-white border border-gray-300 rounded-lg px-2 py-2 text-xs outline-none focus:border-[#25d366]"
                      disabled={sendingReply}
                    >
                      <option value="">Auto</option>
                      {accounts
                        .filter((account) => account.isActive !== false && account.status === "authenticated")
                        .map((account) => (
                          <option key={account._id} value={account._id}>
                            {account.phoneNumber || account.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex-1 flex items-end gap-2 bg-white rounded-full px-4 py-2 border border-gray-300 focus-within:border-[#25d366]">
                    <textarea
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      onKeyDown={handleReplyKeyDown}
                      rows={1}
                      className="flex-1 bg-transparent outline-none text-sm resize-none max-h-32"
                      placeholder="Type a message..."
                      disabled={!activeConversationNumber || sendingReply}
                    />
                    <button
                      type="submit"
                      className="p-1.5 rounded-full bg-[#25d366] text-white hover:bg-[#20bd5a] transition disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={!activeConversationNumber || sendingReply || !replyText.trim()}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                      </svg>
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default MessagesPage;
