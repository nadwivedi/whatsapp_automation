import { useState, useEffect, useMemo } from "react";
import { formatDate } from "../utils/formatters";

function GroupsPage({ 
  accounts, 
  listAccountGroups, 
  refreshAll, 
  refreshing, 
  createCampaign,
  templates,
  getGroupParticipants,
  contactCategories,
  createContactCategory,
  bulkInsertContacts,
  accountAction
}) {
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [activatingSessions, setActivatingSessions] = useState(false);
  const [allGroups, setAllGroups] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [viewingGroup, setViewingGroup] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const [sendForm, setSendForm] = useState({
    messageBody: "",
    mediaFile: null,
    mediaData: null,
    mediaType: null,
    mediaMimeType: null,
    mediaFileName: null,
    mediaPreview: null
  });
  const [busy, setBusy] = useState(false);

  const activeSessions = useMemo(() => 
    accounts.filter(a => a.status === "authenticated" || a.status === "initializing"), 
    [accounts]
  );

  async function fetchAllGroups() {
    if (!activeSessions.length) return;
    
    setActivatingSessions(true);
    setLoadingGroups(true);
    
    try {
      // 1. Ensure all authenticated sessions are started (not sleeping)
      // Skip initializing sessions as they are already in the process of starting
      await Promise.all(
        activeSessions.map(async (acc) => {
          if (acc.status === "authenticated") {
            try {
              await accountAction(acc._id, "start", true);
            } catch (err) {
              console.warn(`Could not activate session for ${acc.name}:`, err.message);
            }
          }
        })
      );
      
      setActivatingSessions(false);

      // 2. Fetch groups
      const results = await Promise.all(
        activeSessions.map(async (acc) => {
          try {
            const res = await listAccountGroups(acc._id);
            return (res.groups || []).map(g => ({ ...g, accountId: acc._id, accountName: acc.name }));
          } catch (err) {
            console.error(`Failed to fetch groups for ${acc.name}:`, err);
            return [];
          }
        })
      );
      const flattened = results.flat();
      // Deduplicate by ID and Account (in case same group ID appears for different accounts)
      const unique = [];
      const seen = new Set();
      flattened.forEach(g => {
        const key = `${g.id}-${g.accountId}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(g);
        }
      });
      setAllGroups(unique.sort((a, b) => a.name.localeCompare(b.name)));
    } finally {
      setLoadingGroups(false);
      setActivatingSessions(false);
    }
  }

  useEffect(() => {
    fetchAllGroups();
  }, [activeSessions.length]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allGroups;
    return allGroups.filter(g => 
      g.name.toLowerCase().includes(q) || 
      g.accountName.toLowerCase().includes(q)
    );
  }, [allGroups, searchQuery]);

  function toggleGroup(groupId, accountId) {
    const key = `${groupId}|${accountId}`;
    setSelectedGroupIds(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }

  function selectAll() {
    setSelectedGroupIds(filteredGroups.map(g => `${g.id}|${g.accountId}`));
  }

  function deselectAll() {
    setSelectedGroupIds([]);
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result;
      const type = file.type.startsWith("image/") ? "image" : file.type.startsWith("video/") ? "video" : "document";
      setSendForm(prev => ({
        ...prev,
        mediaFile: file,
        mediaData: base64Data,
        mediaType: type,
        mediaMimeType: file.type,
        mediaFileName: file.name,
        mediaPreview: type === "image" || type === "video" ? URL.createObjectURL(file) : null
      }));
    };
    reader.readAsDataURL(file);
  };

  const removeMedia = () => {
    setSendForm(prev => ({
      ...prev,
      mediaFile: null,
      mediaData: null,
      mediaType: null,
      mediaMimeType: null,
      mediaFileName: null,
      mediaPreview: null
    }));
  };

  async function handleSend(e) {
    e.preventDefault();
    if (!selectedGroupIds.length) return;
    if (!sendForm.messageBody && !sendForm.mediaData) return;

    setBusy(true);
    try {
      // Group selections by accountId
      const byAccount = {};
      selectedGroupIds.forEach(key => {
        const [groupId, accountId] = key.split("|");
        if (!byAccount[accountId]) byAccount[accountId] = [];
        byAccount[accountId].push(groupId);
      });

      // Create a campaign for each account
      const results = await Promise.all(
        Object.entries(byAccount).map(async ([accountId, groupIds]) => {
          const payload = {
            title: `Group Msg - ${new Date().toLocaleString()} (${accounts.find(a => a._id === accountId)?.name || 'Session'})`,
            accountIds: [accountId],
            messageBody: sendForm.messageBody,
            recipientsText: groupIds.join("\n"),
            maxMessages: groupIds.length,
            perRecipientMessageLimit: 1,
            mediaData: sendForm.mediaData,
            mediaType: sendForm.mediaType,
            mediaMimeType: sendForm.mediaMimeType,
            mediaFileName: sendForm.mediaFileName
          };
          return createCampaign({ preventDefault: () => {} }, payload);
        })
      );

      const allOk = results.every(r => r === true);
      if (allOk) {
        setSelectedGroupIds([]);
        setSendForm({
          messageBody: "",
          mediaFile: null,
          mediaData: null,
          mediaType: null,
          mediaMimeType: null,
          mediaFileName: null,
          mediaPreview: null
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleExtractMembers(group) {
    setViewingGroup(group);
    setLoadingParticipants(true);
    setParticipants([]);
    try {
      const res = await getGroupParticipants(group.accountId, group.id);
      setParticipants(res.participants || []);
    } catch (err) {
      console.error("Failed to fetch participants:", err);
    } finally {
      setLoadingParticipants(false);
    }
  }

  async function handleSaveToContacts() {
    if (!viewingGroup || !participants.length) return;
    setBusy(true);
    try {
      // 1. Find or create category
      let categoryId;
      const existing = contactCategories.find(c => c.name.toLowerCase() === viewingGroup.name.toLowerCase());
      
      if (existing) {
        categoryId = existing._id;
      } else {
        const newCat = await createContactCategory({ name: viewingGroup.name });
        categoryId = newCat.category._id;
      }

      // 2. Prepare contacts
      const contactsToSave = participants.map(p => ({
        name: p.name || p.pushName || p.mobile,
        mobile: p.mobile,
        contactCategoryId: categoryId,
        state: "",
        district: ""
      }));

      // 3. Bulk insert
      await bulkInsertContacts(contactsToSave);
      
      // Update UI
      setViewingGroup(null);
      setParticipants([]);
    } catch (err) {
      console.error("Failed to save contacts:", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.25em] text-slate-500">Messaging</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-800">WhatsApp Groups</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-dark" onClick={() => { fetchAllGroups(); refreshAll(); }} disabled={refreshing || loadingGroups}>
            {refreshing || loadingGroups ? "Refreshing..." : "Refresh Groups"}
          </button>
        </div>
      </header>

      {!activeSessions.length && (
        <div className="glass-panel-dark rounded-2xl p-8 text-center">
          <p className="text-slate-500">No authenticated sessions found. Please connect an account first.</p>
        </div>
      )}

      {activeSessions.length > 0 && (
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1fr_350px]">
          <div className="space-y-4">
            <div className="glass-panel-dark rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[240px]">
                  <input
                    type="text"
                    className="input-dark pl-10"
                    placeholder="Search groups..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  <svg className="absolute left-3 top-2.5 h-5 w-5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                  </svg>
                </div>
                <div className="flex gap-2">
                  <button className="btn-dark text-xs py-2 px-3" onClick={selectAll}>Select All</button>
                  <button className="btn-dark text-xs py-2 px-3" onClick={deselectAll}>Deselect All</button>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="max-h-[600px] overflow-y-auto">
                  {activatingSessions ? (
                    <div className="p-12 text-center">
                      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent" />
                      <p className="mt-4 text-slate-600 font-semibold">Activating WhatsApp Sessions...</p>
                      <p className="text-xs text-slate-400 mt-1">Bringing your accounts online to fetch groups.</p>
                    </div>
                  ) : loadingGroups ? (
                    <div className="p-8 text-center">
                      <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                      <p className="mt-2 text-sm text-slate-500">Fetching groups from all sessions...</p>
                    </div>
                  ) : filteredGroups.length === 0 ? (
                    <div className="p-8 text-center text-slate-500">No groups found matching your search.</div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-4 py-3 w-10"></th>
                          <th className="px-4 py-3">Group Name</th>
                          <th className="px-4 py-3">Session</th>
                          <th className="px-4 py-3 text-right">Members</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredGroups.map(group => {
                          const isSelected = selectedGroupIds.includes(`${group.id}|${group.accountId}`);
                          return (
                            <tr 
                              key={`${group.id}-${group.accountId}`} 
                              className={`group cursor-pointer transition hover:bg-slate-50 ${isSelected ? 'bg-cyan-50/50' : ''}`}
                              onClick={() => toggleGroup(group.id, group.accountId)}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
                                  checked={isSelected}
                                  onChange={() => {}} // Handled by tr onClick
                                />
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-sm font-medium text-slate-900 truncate max-w-[200px] sm:max-w-xs">{group.name}</p>
                                <p className="text-[10px] text-slate-400 font-mono uppercase">{group.id}</p>
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                                  {group.accountName}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs text-slate-500 font-medium mr-2">
                                    {group.participantCount}
                                  </span>
                                  <button
                                    title="Extract Members"
                                    className="p-1.5 text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 rounded-lg transition"
                                    onClick={(e) => { e.stopPropagation(); handleExtractMembers(group); }}
                                  >
                                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                      <circle cx="9" cy="7" r="4" />
                                      <polyline points="23 7 19 11 17 9" />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
              <div className="mt-3 text-xs text-slate-500 flex justify-between">
                <span>Showing {filteredGroups.length} groups</span>
                <span className="font-semibold text-cyan-700">{selectedGroupIds.length} groups selected</span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="glass-panel-dark rounded-2xl p-4 sm:p-6 lg:sticky lg:top-6">
              <h2 className="font-heading text-lg font-semibold text-slate-800 mb-4">Direct Message</h2>
              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Message Text</label>
                  <textarea
                    className="input-dark min-h-[160px] text-sm"
                    placeholder="Type your message here..."
                    value={sendForm.messageBody}
                    onChange={(e) => setSendForm(p => ({ ...p, messageBody: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Media Attachment (Optional)</label>
                  {!sendForm.mediaPreview && (
                    <div className="relative group">
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        id="media-upload"
                        onChange={handleFileChange}
                      />
                      <label 
                        htmlFor="media-upload"
                        className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-6 cursor-pointer hover:border-cyan-400 hover:bg-cyan-50 transition group"
                      >
                        <svg className="h-8 w-8 text-slate-400 group-hover:text-cyan-500 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                        </svg>
                        <p className="mt-2 text-xs font-medium text-slate-500 group-hover:text-cyan-600 transition">Select Image or Video</p>
                      </label>
                    </div>
                  )}

                  {sendForm.mediaPreview && (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200">
                      {sendForm.mediaType === "image" ? (
                        <img src={sendForm.mediaPreview} alt="Preview" className="w-full h-auto max-h-[200px] object-cover" />
                      ) : (
                        <video src={sendForm.mediaPreview} className="w-full h-auto max-h-[200px] object-cover" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition flex items-center justify-center gap-2">
                        <button 
                          type="button" 
                          onClick={removeMedia}
                          className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
                        >
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                  {sendForm.mediaFile && !sendForm.mediaPreview && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                      <span className="text-xs text-slate-600 truncate">{sendForm.mediaFileName}</span>
                      <button type="button" onClick={removeMedia} className="text-red-500 hover:text-red-600">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  )}
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="btn-cyan w-full py-3 font-bold uppercase tracking-widest disabled:opacity-50"
                    disabled={busy || !selectedGroupIds.length || (!sendForm.messageBody && !sendForm.mediaData)}
                  >
                    {busy ? "Sending..." : `Send to ${selectedGroupIds.length} Groups`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Extraction Overlay / Panel */}
      {viewingGroup && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={() => setViewingGroup(null)}>
          <div 
            className="w-full max-w-lg bg-white shadow-2xl h-full flex flex-col animate-in slide-in-from-right duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-heading text-xl font-bold text-slate-900">{viewingGroup.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">Extracting members from {viewingGroup.accountName} session</p>
                </div>
                <button 
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-xl shadow-sm transition"
                  onClick={() => setViewingGroup(null)}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex-1 rounded-xl bg-cyan-50 px-4 py-2 text-xs font-semibold text-cyan-700">
                  {loadingParticipants ? "Scanning..." : `${participants.length} Members Found`}
                </div>
                <button 
                  className="btn-cyan py-2 text-xs" 
                  disabled={loadingParticipants || !participants.length || busy}
                  onClick={handleSaveToContacts}
                >
                  {busy ? "Saving..." : "Save to Contacts"}
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingParticipants ? (
                <div className="py-20 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-3 border-cyan-500 border-t-transparent" />
                  <p className="mt-3 text-sm text-slate-500 font-medium">Fetching group details...</p>
                </div>
              ) : (
                participants.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{p.name || p.pushName || 'Unknown'}</p>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">{p.mobile}</p>
                    </div>
                    {p.isAdmin && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Admin
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 text-center uppercase tracking-widest">
              End of list
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GroupsPage;
