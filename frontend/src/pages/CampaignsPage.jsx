import { useState } from "react";
import { useMemo } from "react";
import { formatDate } from "../utils/formatters";
import { campaignTone } from "../utils/tones";

function CampaignsPage({
  refreshing,
  refreshAll,
  campaignForm,
  setCampaignForm,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  busy,
  accounts,
  templates,
  contactCategories,
  contacts,
  recipientsTotal,
  campaigns,
  dashboardLoading,
  campaignAction,
  loadMessages,
  selectedCampaign,
  messagesLoading,
  messages,
}) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [showEditPopup, setShowEditPopup] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState(null);
  const [contactCategoryFilter, setContactCategoryFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [districtFilter, setDistrictFilter] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [messageSentFilter, setMessageSentFilter] = useState("");
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [recipientMode, setRecipientMode] = useState("contacts");
  const [editForm, setEditForm] = useState({
    title: "",
    messageBody: "",
    perRecipientMessageLimit: "1",
    maxMessages: "",
    dateFrom: "",
    dateTo: "",
  });
  const [createAccountIds, setCreateAccountIds] = useState([]);
  const [editAccountIds, setEditAccountIds] = useState([]);
  const selectedTemplate = templates.find((item) => item._id === campaignForm.templateId) || null;
  const eligibleAccounts = accounts.filter(
    (account) => account.isActive !== false && account.status === "authenticated",
  );
  const stateOptions = useMemo(() => {
    const values = new Map();
    contacts.forEach((contact) => {
      const state = String(contact?.state || "").trim();
      if (!state) return;
      const key = state.toLowerCase();
      if (!values.has(key)) values.set(key, state);
    });
    return [...values.values()].sort((a, b) => a.localeCompare(b));
  }, [contacts]);
  const districtOptions = useMemo(() => {
    const values = new Map();
    const source = stateFilter
      ? contacts.filter(
        (contact) =>
          String(contact?.state || "").trim().toLowerCase() === stateFilter.toLowerCase(),
      )
      : contacts;

    source.forEach((contact) => {
      const district = String(contact?.district || "").trim();
      if (!district) return;
      const key = district.toLowerCase();
      if (!values.has(key)) values.set(key, district);
    });

    return [...values.values()].sort((a, b) => a.localeCompare(b));
  }, [contacts, stateFilter]);
  const filteredContacts = useMemo(() => {
    const query = contactSearch.trim().toLowerCase();
    return contacts.filter((contact) => {
      const matchCategory =
        !contactCategoryFilter || contact?.contactCategory?._id === contactCategoryFilter;
      const matchState =
        !stateFilter ||
        String(contact?.state || "").trim().toLowerCase() === stateFilter.toLowerCase();
      const matchDistrict =
        !districtFilter ||
        String(contact?.district || "").trim().toLowerCase() === districtFilter.toLowerCase();
      const matchQuery =
        !query ||
        String(contact?.name || "").toLowerCase().includes(query) ||
        String(contact?.mobile || "").toLowerCase().includes(query) ||
        String(contact?.contactCategory?.name || "").toLowerCase().includes(query);

      const sentCount = contact?.messagesSent || 0;
      const matchSent = !messageSentFilter ||
        (messageSentFilter === "sent" ? sentCount > 0 : sentCount === 0);

      return matchCategory && matchState && matchDistrict && matchQuery && matchSent;
    });
  }, [contacts, contactCategoryFilter, stateFilter, districtFilter, contactSearch, messageSentFilter]);
  const selectedContacts = useMemo(
    () => filteredContacts.filter((contact) => selectedContactIds.includes(contact._id)),
    [filteredContacts, selectedContactIds],
  );

  function parseRecipients(rawText) {
    return String(rawText || "")
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function appendRecipients(mobiles) {
    const existing = parseRecipients(campaignForm.recipientsText);
    const seen = new Set(existing.map((item) => item.toLowerCase()));
    const next = [...existing];

    mobiles.forEach((mobile) => {
      const value = String(mobile || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      next.push(value);
    });

    setCampaignForm((prev) => ({
      ...prev,
      recipientsText: next.join("\n"),
    }));
  }

  function toggleContactSelection(contactId) {
    setSelectedContactIds((prev) =>
      prev.includes(contactId) ? prev.filter((id) => id !== contactId) : [...prev, contactId],
    );
  }

  function selectFilteredContacts() {
    setSelectedContactIds(filteredContacts.map((contact) => contact._id));
  }

  function clearSelectedContacts() {
    setSelectedContactIds([]);
  }

  function openEditPopup(campaign) {
    setEditingCampaign(campaign);
    setEditForm({
      title: campaign.title || "",
      messageBody: campaign.messageBody || "",
      perRecipientMessageLimit: String(campaign.perRecipientMessageLimit || 1),
      maxMessages: String(campaign.maxMessages || ""),
      dateFrom: campaign.dateFrom || "",
      dateTo: campaign.dateTo || "",
    });
    const existingIds = (campaign.accounts || []).map(a => String(a._id || a));
    setEditAccountIds(existingIds.length ? existingIds : eligibleAccounts.map(a => a._id));
    setShowEditPopup(true);
  }

  async function submitEditCampaign(e) {
    e.preventDefault();
    if (!editingCampaign?._id) return;

    const ok = await updateCampaign(editingCampaign._id, {
      title: editForm.title.trim(),
      messageBody: editForm.messageBody,
      perRecipientMessageLimit: Number(editForm.perRecipientMessageLimit || 1),
      maxMessages: Number(editForm.maxMessages || 0),
      dateFrom: editForm.dateFrom || undefined,
      dateTo: editForm.dateTo || undefined,
      accountIds: editAccountIds,
    });

    if (ok) {
      setShowEditPopup(false);
      setEditingCampaign(null);
    }
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.25em] text-slate-500">Manage</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-800">Campaigns</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-xl bg-cyan-600 text-xl sm:text-2xl font-semibold text-white transition hover:bg-cyan-500"
            onClick={() => { setShowCreatePopup(true); setCreateAccountIds(eligibleAccounts.map(a => a._id)); }}
            aria-label="Add campaign"
            title="Add campaign"
          >
            +
          </button>
          <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <div className="glass-panel-dark rounded-2xl p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-800">Add Campaign</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Click + to open campaign form popup.</p>
          </div>
          <button type="button" className="btn-cyan" onClick={() => { setShowCreatePopup(true); setCreateAccountIds(eligibleAccounts.map(a => a._id)); }}>
            + Add Campaign
          </button>
        </div>
      </div>

      {showCreatePopup && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-4 py-6 sm:py-10" onClick={() => setShowCreatePopup(false)}>
          <div className="mx-auto w-full max-w-6xl">
          <div className="glass-panel-dark w-full rounded-2xl p-4 sm:p-6 max-h-[calc(100vh-3rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-800">Add Campaign</h2>
                <p className="text-xs sm:text-sm text-slate-500">Fill details and queue your campaign.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
                onClick={() => setShowCreatePopup(false)}
                aria-label="Close add campaign popup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.25fr)]" onSubmit={async (e) => { 
              setCampaignForm(p => ({ ...p, accountIds: createAccountIds })); 
              const ok = await createCampaign(e);
              if (ok) setShowCreatePopup(false);
            }}>
              <div className="space-y-3 lg:sticky lg:top-0">
                <input
                  className="input-dark"
                  placeholder="Campaign title"
                  value={campaignForm.title}
                  onChange={(e) => setCampaignForm((p) => ({ ...p, title: e.target.value }))}
                  required
                />
                <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">Sending Sessions <span className="text-xs font-normal text-slate-500">({createAccountIds.length}/{eligibleAccounts.length} selected)</span></p>
                    <div className="flex gap-2">
                      <button type="button" className="text-xs text-cyan-700 hover:text-cyan-600 font-medium" onClick={() => setCreateAccountIds(eligibleAccounts.map(a => a._id))}>All</button>
                      <button type="button" className="text-xs text-slate-500 hover:text-slate-700 font-medium" onClick={() => setCreateAccountIds([])}>None</button>
                    </div>
                  </div>
                  {!eligibleAccounts.length && <p className="text-xs text-amber-600">No active authenticated session found.</p>}
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {eligibleAccounts.map((acc) => (
                      <label key={acc._id} className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={createAccountIds.includes(acc._id)}
                          onChange={() => setCreateAccountIds(prev =>
                            prev.includes(acc._id) ? prev.filter(id => id !== acc._id) : [...prev, acc._id]
                          )}
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate">{acc.name}</p>
                          <p className="text-[11px] text-slate-500">{acc.phoneNumber || acc.status}</p>
                        </div>
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>
                      </label>
                    ))}
                  </div>
                </div>
                <select
                  className="input-dark"
                  required
                  value={campaignForm.templateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const selected = templates.find((item) => item._id === id);
                    setCampaignForm((p) => ({
                      ...p,
                      templateId: id,
                      messageBody: selected ? selected.body : "",
                    }));
                  }}
                >
                  <option value="">Select message template</option>
                  {templates.map((template) => (
                    <option key={template._id} value={template._id}>
                      {template.name}
                      {template.mediaType ? " [media]" : ""}
                    </option>
                  ))}
                </select>
                {!templates.length && (
                  <p className="rounded-lg bg-amber-950/50 px-3 py-2 text-xs text-amber-300">
                    No templates found. Create a template first.
                  </p>
                )}
                {selectedTemplate?.mediaType && (
                  <p className="rounded-lg bg-cyan-950/50 px-3 py-2 text-xs text-cyan-300">
                    This template includes a {selectedTemplate.mediaType}.
                  </p>
                )}
                {selectedTemplate?.body && (
                  <div className="rounded-lg bg-slate-900/80 px-3 py-2 text-xs text-slate-300">
                    Template message preview: {selectedTemplate.body}
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    className="input-dark"
                    type="number"
                    min="1"
                    max="5000"
                    placeholder="Total messages to send"
                    value={campaignForm.maxMessages}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, maxMessages: e.target.value }))}
                    required
                  />
                  <input
                    className="input-dark"
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Messages per person"
                    value={campaignForm.perRecipientMessageLimit}
                    onChange={(e) =>
                      setCampaignForm((p) => ({ ...p, perRecipientMessageLimit: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Campaign From</p>
                    <input
                      className="input-dark"
                      type="date"
                      value={campaignForm.dateFrom}
                      onChange={(e) => setCampaignForm((p) => ({ ...p, dateFrom: e.target.value }))}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">Campaign To</p>
                    <input
                      className="input-dark"
                      type="date"
                      value={campaignForm.dateTo}
                      onChange={(e) => setCampaignForm((p) => ({ ...p, dateTo: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">Recipient Source</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Choose `Contacts` or `Recipient Box`.
                    </p>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        recipientMode === "contacts"
                          ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => setRecipientMode("contacts")}
                    >
                      Contacts
                    </button>
                    <button
                      type="button"
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                        recipientMode === "manual"
                          ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                      onClick={() => setRecipientMode("manual")}
                    >
                      Recipient Box
                    </button>
                  </div>
                </div>

                <div className={`${recipientMode === "contacts" ? "block" : "hidden"} rounded-xl border border-slate-200 bg-slate-50/90 p-3`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Choose Contacts</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-white"
                        onClick={selectFilteredContacts}
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-white"
                        onClick={clearSelectedContacts}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => appendRecipients(selectedContacts.map((contact) => contact.mobile))}
                        disabled={!selectedContacts.length}
                      >
                        Add Selected
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    <select
                      className="input-dark text-xs h-9 px-2.5"
                      value={contactCategoryFilter}
                      onChange={(e) => setContactCategoryFilter(e.target.value)}
                    >
                      <option value="">All categories</option>
                      {contactCategories.map((category) => (
                        <option key={category._id} value={category._id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input-dark text-xs h-9 px-2.5"
                      value={stateFilter}
                      onChange={(e) => {
                        setStateFilter(e.target.value);
                        setDistrictFilter("");
                      }}
                    >
                      <option value="">All states</option>
                      {stateOptions.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input-dark text-xs h-9 px-2.5"
                      value={districtFilter}
                      onChange={(e) => setDistrictFilter(e.target.value)}
                    >
                      <option value="">All districts</option>
                      {districtOptions.map((district) => (
                        <option key={district} value={district}>
                          {district}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input-dark text-xs h-9 px-2.5"
                      placeholder="Search name or mobile"
                      value={contactSearch}
                      onChange={(e) => setContactSearch(e.target.value)}
                    />
                    <select
                      className="input-dark text-xs h-9 px-2.5"
                      value={messageSentFilter}
                      onChange={(e) => setMessageSentFilter(e.target.value)}
                    >
                      <option value="">All msg status</option>
                      <option value="sent">✅ Msg Sent</option>
                      <option value="not_sent">❌ Not Sent</option>
                    </select>
                  </div>

                  <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
                      <span>Filtered contacts: {filteredContacts.length}</span>
                      <button
                        type="button"
                        className="font-medium text-cyan-700 transition hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => appendRecipients(filteredContacts.map((contact) => contact.mobile))}
                        disabled={!filteredContacts.length}
                      >
                        Add All Filtered
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {filteredContacts.length ? (
                        filteredContacts.map((contact) => (
                          <label
                            key={contact._id}
                            className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={selectedContactIds.includes(contact._id)}
                              onChange={() => toggleContactSelection(contact._id)}
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-800">{contact.name}</p>
                              <p className="text-xs text-slate-500">
                                {contact.mobile}
                                {contact.contactCategory?.name ? ` • ${contact.contactCategory.name}` : ""}
                                {contact.state ? ` • ${contact.state}` : ""}
                                {contact.district ? ` • ${contact.district}` : ""}
                               </p>
                               {(contact.messagesSent || 0) > 0 && (
                                 <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                   📤 {contact.messagesSent} msg{contact.messagesSent === 1 ? '' : 's'} sent
                                 </span>
                               )}
                            </div>
                          </label>
                        ))
                      ) : (
                        <p className="px-3 py-4 text-sm text-slate-500">No contacts match these filters.</p>
                      )}
                    </div>
                  </div>
                </div>

                {recipientMode === "manual" && (
                  <textarea
                    className="input-dark min-h-[130px]"
                    placeholder="Enter recipients manually, one per line or comma-separated"
                    value={campaignForm.recipientsText}
                    onChange={(e) => setCampaignForm((p) => ({ ...p, recipientsText: e.target.value }))}
                    required
                  />
                )}
                <div className="rounded-xl bg-slate-800/90 p-3 text-xs sm:text-sm text-slate-300">
                  Recipients: <span className="font-heading text-lg text-cyan-400">{recipientsTotal}</span>
                </div>
                <button
                  className="w-full rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white transition hover:from-slate-700 hover:to-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy === "create-campaign"}
                >
                  {busy === "create-campaign" ? "Queueing..." : "Queue Campaign"}
                </button>
              </div>
            </form>
          </div>
          </div>
        </div>
      )}

      {showEditPopup && editingCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowEditPopup(false)}
        >
            <div
            className="glass-panel-dark w-full max-w-3xl rounded-2xl p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-800">Edit Campaign</h2>
                <p className="text-xs sm:text-sm text-slate-500">
                  You can edit queued or paused campaigns.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
                onClick={() => setShowEditPopup(false)}
                aria-label="Close edit campaign popup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form className="grid gap-4" onSubmit={submitEditCampaign}>
              <input
                className="input-dark"
                placeholder="Campaign title"
                value={editForm.title}
                onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))}
                required
              />
              <textarea
                className="input-dark min-h-28"
                placeholder="Message body"
                value={editForm.messageBody}
                onChange={(e) => setEditForm((p) => ({ ...p, messageBody: e.target.value }))}
              />
              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Sending Sessions <span className="text-xs font-normal text-slate-500">({editAccountIds.length}/{eligibleAccounts.length} selected)</span></p>
                  <div className="flex gap-2">
                    <button type="button" className="text-xs text-cyan-700 hover:text-cyan-600 font-medium" onClick={() => setEditAccountIds(eligibleAccounts.map(a => a._id))}>All</button>
                    <button type="button" className="text-xs text-slate-500 hover:text-slate-700 font-medium" onClick={() => setEditAccountIds([])}>None</button>
                  </div>
                </div>
                {!eligibleAccounts.length && <p className="text-xs text-amber-600">No active authenticated sessions.</p>}
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {eligibleAccounts.map((acc) => (
                    <label key={acc._id} className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-100">
                      <input
                        type="checkbox"
                        checked={editAccountIds.includes(acc._id)}
                        onChange={() => setEditAccountIds(prev =>
                          prev.includes(acc._id) ? prev.filter(id => id !== acc._id) : [...prev, acc._id]
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{acc.name}</p>
                        <p className="text-[11px] text-slate-500">{acc.phoneNumber || acc.status}</p>
                      </div>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Total messages to send</p>
                  <input
                    className="input-dark"
                    type="number"
                    min="1"
                    max="5000"
                    placeholder="Total messages to send"
                    value={editForm.maxMessages}
                    onChange={(e) => setEditForm((p) => ({ ...p, maxMessages: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-500">Messages per person</p>
                  <input
                    className="input-dark"
                    type="number"
                    min="1"
                    max="20"
                    placeholder="Messages per person"
                    value={editForm.perRecipientMessageLimit}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, perRecipientMessageLimit: e.target.value }))
                    }
                    required
                  />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-2">
                <p className="text-sm font-semibold text-slate-800">
                  Queued Contacts <span className="text-xs font-normal text-slate-500">({editingCampaign.recipientPool?.length || 0} total)</span>
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                  {(editingCampaign.recipientPool || []).length > 0 ? (
                    editingCampaign.recipientPool.map((number, idx) => {
                      const matchedContact = contacts.find(c => c.mobile === number);
                      return (
                        <div key={idx} className="flex items-center gap-2 text-xs text-slate-600 bg-white px-2 py-1 rounded border border-slate-100">
                          <span className="w-4 text-[10px] text-slate-400 font-mono">{idx + 1}.</span>
                          <span className="font-medium text-slate-700">{matchedContact ? matchedContact.name : number}</span>
                          {matchedContact && <span className="text-[10px] text-slate-400 ml-auto">{number}</span>}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-slate-400 italic">No recipients in pool.</p>
                  )}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    className="input-dark"
                    type="date"
                    value={editForm.dateFrom}
                    onChange={(e) => setEditForm((p) => ({ ...p, dateFrom: e.target.value }))}
                  />
                  <input
                    className="input-dark"
                    type="date"
                    value={editForm.dateTo}
                    onChange={(e) => setEditForm((p) => ({ ...p, dateTo: e.target.value }))}
                  />
                </div>
              </div>
              <button
                className="w-full rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white transition hover:from-slate-700 hover:to-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy === `update-${editingCampaign._id}`}
              >
                {busy === `update-${editingCampaign._id}` ? "Saving..." : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="glass-panel-dark rounded-2xl p-4 sm:p-6">
          <h2 className="font-heading text-lg font-semibold text-slate-800">All Campaigns</h2>
          <div className="mt-5 space-y-3">
            {campaigns.length === 0 && !dashboardLoading && <p className="empty-dark">No campaigns yet.</p>}
            {campaigns.map((campaign) => {
              const processed = campaign.sentCount + campaign.failedCount;
              const progress = campaign.totalRecipients
                ? Math.min(100, Math.round((processed / campaign.totalRecipients) * 100))
                : 0;

              return (
                <div key={campaign._id} className="card-dark rounded-xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-heading text-base font-semibold text-slate-800">{campaign.title}</p>
                      <p className="text-xs text-slate-500">
                        {(campaign.accounts?.length
                          ? campaign.accounts.map((acc) => acc.name).join(", ")
                          : campaign.account?.name || "Unknown")}{" "}
                        • {formatDate(campaign.createdAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${
                        campaignTone[campaign.status] || "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {campaign.status}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-300">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-full bg-cyan-100 px-2.5 py-1">Total: {campaign.totalRecipients}</span>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1">Sent: {campaign.sentCount}</span>
                    <span className="rounded-full bg-rose-100 px-2.5 py-1">Failed: {campaign.failedCount}</span>
                    {campaign.maxMessages && (
                      <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sky-700">
                        Target: {campaign.maxMessages}
                      </span>
                    )}
                    <span className="rounded-full bg-fuchsia-100 px-2.5 py-1 text-fuchsia-700">
                      Per person: {campaign.perRecipientMessageLimit || 1}
                    </span>
                    {(campaign.dateFrom || campaign.dateTo) && (
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-slate-700">
                        Window: {campaign.dateFrom || "--"} to {campaign.dateTo || "--"}
                      </span>
                    )}
                    {campaign.mediaType && (
                      <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-700">
                        Media: {campaign.mediaType}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(campaign.status === "queued" || campaign.status === "running") && (
                      <button
                        type="button"
                        className="btn-amber"
                        onClick={() => campaignAction(campaign._id, "pause")}
                        disabled={busy === `pause-${campaign._id}`}
                      >
                        {busy === `pause-${campaign._id}` ? "Pausing..." : "Pause"}
                      </button>
                    )}
                    {campaign.status === "paused" && (
                      <button
                        type="button"
                        className="btn-green"
                        onClick={() => campaignAction(campaign._id, "resume")}
                        disabled={busy === `resume-${campaign._id}`}
                      >
                        {busy === `resume-${campaign._id}` ? "Resuming..." : "Resume"}
                      </button>
                    )}
                    {(campaign.status === "queued" ||
                      campaign.status === "paused" ||
                      campaign.status === "running") && (
                      <button
                        type="button"
                        className="btn-dark"
                        onClick={() => openEditPopup(campaign)}
                      >
                        Edit Campaign
                      </button>
                    )}
                    <button type="button" className="btn-dark" onClick={() => loadMessages(campaign)}>
                      View Messages
                    </button>
                    <button
                      type="button"
                      className="btn-red"
                      onClick={() => deleteCampaign(campaign)}
                      disabled={busy === `delete-campaign-${campaign._id}`}
                    >
                      {busy === `delete-campaign-${campaign._id}` ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel-dark rounded-2xl p-4 sm:p-6">
          <h2 className="font-heading text-lg font-semibold text-slate-800">Delivery Detail</h2>
          {selectedCampaign ? (
            <p className="mt-1.5 text-xs text-slate-500">Campaign: {selectedCampaign.title}</p>
          ) : (
            <p className="mt-1.5 text-xs sm:text-sm text-slate-500">Select a campaign to inspect messages.</p>
          )}
          {selectedCampaign?.mediaData && (
            <div className="mt-3">
              {selectedCampaign.mediaType === "video" ? (
                <video src={selectedCampaign.mediaData} controls className="max-h-44 rounded-lg" />
              ) : (
                <img src={selectedCampaign.mediaData} alt={selectedCampaign.title} className="max-h-44 rounded-lg" />
              )}
            </div>
          )}
          {messagesLoading ? (
            <p className="mt-4 rounded-xl bg-slate-800/90 p-4 text-xs sm:text-sm text-slate-300">Loading messages...</p>
          ) : (
            <div className="mt-4 max-h-[460px] space-y-2 overflow-auto pr-1">
              {messages.length === 0 ? (
                <p className="empty-dark">No messages loaded.</p>
              ) : (
                messages.map((message) => (
                  <div key={message._id} className="card-dark rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-800">
                          {message.senderMobileNumber || message.account?.phoneNumber || "Unknown"}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          to {message.recipientMobileNumber || message.recipient || "--"}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase ${
                          message.status === "sent"
                            ? "bg-emerald-100 text-emerald-700"
                            : message.status === "failed"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {message.status}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600">{message.text || "(Media only)"}</p>
                    <p className="mt-1 text-[11px] text-slate-500">Tries: {message.tryCount} • Sent: {formatDate(message.sentAt)}</p>
                    {message.error && (
                      <p className="mt-2 rounded bg-rose-950/50 px-2 py-1 text-[11px] text-rose-300">{message.error}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default CampaignsPage;
