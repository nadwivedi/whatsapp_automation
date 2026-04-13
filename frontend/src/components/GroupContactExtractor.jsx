import { useEffect, useMemo, useState } from "react";

function normalizeMobile(value) {
  return String(value || "").replace(/[^\d+]/g, "");
}

function downloadCsv(filename, rows) {
  if (!rows.length) {
    return;
  }

  const headers = ["Name", "Mobile", "WhatsApp Name", "Push Name", "Verified Name", "Admin"];
  const escapeCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [
    headers.join(","),
    ...rows.map((row) =>
      [
        row.name,
        row.mobile,
        row.shortName || "",
        row.pushName || "",
        row.verifiedName || "",
        row.isAdmin ? "Yes" : "No",
      ]
        .map(escapeCell)
        .join(","),
    ),
  ];

  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function GroupContactExtractor({
  accounts,
  contactCategories,
  listAccountGroups,
  findGroupsByNumber,
  getGroupParticipants,
  bulkInsertContacts,
}) {
  const activeAccounts = useMemo(
    () =>
      accounts.filter((account) => account.isActive !== false && account.status === "authenticated"),
    [accounts],
  );
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [searchMobile, setSearchMobile] = useState("");
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [importCategoryId, setImportCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [loadingMode, setLoadingMode] = useState("");

  useEffect(() => {
    if (!activeAccounts.length) {
      setSelectedAccountId("");
      return;
    }

    setSelectedAccountId((current) =>
      activeAccounts.some((account) => account._id === current) ? current : activeAccounts[0]._id,
    );
  }, [activeAccounts]);

  useEffect(() => {
    setImportCategoryId((current) =>
      contactCategories.some((category) => category._id === current)
        ? current
        : contactCategories[0]?._id || "",
    );
  }, [contactCategories]);

  useEffect(() => {
    setGroups([]);
    setSelectedGroupId("");
    setSelectedGroup(null);
    setParticipants([]);
    setStatus("");
  }, [selectedAccountId]);

  async function handleLoadAllGroups() {
    if (!selectedAccountId) {
      setStatus("Choose an authenticated WhatsApp session first.");
      return;
    }

    setLoadingMode("groups");
    setStatus("");
    try {
      const payload = await listAccountGroups(selectedAccountId);
      const nextGroups = payload.groups || [];
      setGroups(nextGroups);
      setSelectedGroupId("");
      setSelectedGroup(null);
      setParticipants([]);
      setStatus(
        nextGroups.length
          ? `Loaded ${nextGroups.length} groups from this WhatsApp session.`
          : "No WhatsApp groups found in this session.",
      );
    } finally {
      setLoadingMode("");
    }
  }

  async function handleFindGroups() {
    if (!selectedAccountId) {
      setStatus("Choose an authenticated WhatsApp session first.");
      return;
    }

    const mobileNumber = normalizeMobile(searchMobile);
    if (!mobileNumber) {
      setStatus("Enter a mobile number to find its WhatsApp groups.");
      return;
    }

    setLoadingMode("search");
    setStatus("");
    try {
      const payload = await findGroupsByNumber(selectedAccountId, mobileNumber);
      const nextGroups = payload.groups || [];
      setGroups(nextGroups);
      setSelectedGroupId("");
      setSelectedGroup(null);
      setParticipants([]);
      setStatus(
        nextGroups.length
          ? `Found ${nextGroups.length} group(s) for ${mobileNumber}.`
          : `No groups found for ${mobileNumber} in this session.`,
      );
    } finally {
      setLoadingMode("");
    }
  }

  async function handleLoadParticipants(groupId) {
    if (!selectedAccountId || !groupId) {
      return;
    }

    setSelectedGroupId(groupId);
    setLoadingMode("participants");
    setStatus("");
    try {
      const payload = await getGroupParticipants(selectedAccountId, groupId);
      setSelectedGroup(payload.group || null);
      setParticipants(payload.participants || []);
      setStatus(
        payload.participants?.length
          ? `Loaded ${payload.participants.length} member(s) from ${payload.group?.name || "group"}.`
          : "This group has no members available to extract.",
      );
    } finally {
      setLoadingMode("");
    }
  }

  async function handleImportParticipants() {
    if (!participants.length) {
      setStatus("Load a group before importing contacts.");
      return;
    }
    if (!importCategoryId) {
      setStatus("Choose a contact category for imported members.");
      return;
    }

    setLoadingMode("import");
    setStatus("");
    try {
      const items = participants
        .filter((participant) => participant.mobile)
        .map((participant) => ({
          name: participant.name || participant.mobile,
          mobile: participant.mobile,
        }));

      const response = await bulkInsertContacts({
        items,
        defaultCategory: importCategoryId,
      });

      setStatus(
        `Imported ${response?.insertedCount || items.length} contact(s) from ${selectedGroup?.name || "the selected group"}.`,
      );
    } finally {
      setLoadingMode("");
    }
  }

  function handleExportParticipants() {
    if (!participants.length) {
      setStatus("Load a group before exporting.");
      return;
    }

    const safeName = String(selectedGroup?.name || "group-members")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);

    downloadCsv(`${safeName || "group-members"}.csv`, participants);
    setStatus(`Exported ${participants.length} contact(s) to CSV.`);
  }

  return (
    <section
      style={{
        marginBottom: 20,
        background: "linear-gradient(135deg, #f8fffb 0%, #eff6ff 100%)",
        border: "1px solid #dbe4f0",
        borderRadius: 18,
        padding: 18,
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)",
      }}
    >
      <style>{`
        .gce-controls {
          display: grid;
          gap: 14px;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          margin-top: 16px;
        }

        .gce-panels {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
          margin-top: 18px;
        }

        @media (max-width: 920px) {
          .gce-panels {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#0f766e" }}>
            WhatsApp Group Extractor
          </div>
          <h2 style={{ margin: "6px 0 4px", fontSize: 24, color: "#0f172a" }}>
            Find groups by mobile number and extract members in one click
          </h2>
          <p style={{ margin: 0, color: "#475569", fontSize: 14 }}>
            Select a logged-in WhatsApp session, find the groups a number belongs to, then import or export the full member list with saved names.
          </p>
        </div>
      </div>

      <div className="gce-controls">
        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
            WhatsApp session
          </label>
          <select
            className="cp-input"
            value={selectedAccountId}
            onChange={(event) => setSelectedAccountId(event.target.value)}
            disabled={!activeAccounts.length}
          >
            <option value="">{activeAccounts.length ? "Select session" : "No authenticated session"}</option>
            {activeAccounts.map((account) => (
              <option key={account._id} value={account._id}>
                {account.name} {account.phoneNumber ? `(${account.phoneNumber})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
            Mobile number
          </label>
          <input
            className="cp-input"
            placeholder="e.g. +919876543210"
            value={searchMobile}
            onChange={(event) => setSearchMobile(event.target.value)}
          />
        </div>

        <div>
          <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
            Import category
          </label>
          <select
            className="cp-input"
            value={importCategoryId}
            onChange={(event) => setImportCategoryId(event.target.value)}
          >
            <option value="">{contactCategories.length ? "Select category" : "No category available"}</option>
            {contactCategories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <button type="button" className="btn-dark" onClick={handleLoadAllGroups} disabled={loadingMode !== "" || !selectedAccountId}>
          {loadingMode === "groups" ? "Loading groups..." : "Load All Groups"}
        </button>
        <button type="button" className="btn-cyan" onClick={handleFindGroups} disabled={loadingMode !== "" || !selectedAccountId}>
          {loadingMode === "search" ? "Finding..." : "Find Groups by Number"}
        </button>
        <button type="button" className="btn-green" onClick={handleImportParticipants} disabled={loadingMode !== "" || !participants.length}>
          {loadingMode === "import" ? "Importing..." : "Import Members to Contacts"}
        </button>
        <button type="button" className="btn-amber" onClick={handleExportParticipants} disabled={loadingMode !== "" || !participants.length}>
          Export Members CSV
        </button>
      </div>

      {status && (
        <div
          style={{
            marginTop: 14,
            borderRadius: 12,
            padding: "10px 12px",
            background: "#ffffff",
            border: "1px solid #dbe4f0",
            color: "#334155",
            fontSize: 13,
          }}
        >
          {status}
        </div>
      )}

      <div className="gce-panels">
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
            Groups {groups.length ? `(${groups.length})` : ""}
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto", padding: 10 }}>
            {!groups.length && (
              <div style={{ padding: 10, color: "#64748b", fontSize: 13 }}>
                Search by mobile number or load all groups from the selected session.
              </div>
            )}
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => handleLoadParticipants(group.id)}
                disabled={loadingMode === "participants"}
                style={{
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 12,
                  border: group.id === selectedGroupId ? "1px solid #0891b2" : "1px solid #e2e8f0",
                  background: group.id === selectedGroupId ? "#ecfeff" : "#fff",
                  padding: 12,
                  marginBottom: 8,
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{group.name}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                  {group.participantCount || 0} members
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                {selectedGroup?.name || "Group members"}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#64748b" }}>
                {participants.length ? `${participants.length} extracted members` : "Choose a group to view its members"}
              </div>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className="cp-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Push Name</th>
                  <th>Verified Name</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {!participants.length && (
                  <tr>
                    <td colSpan="5" style={{ textAlign: "center", color: "#94a3b8", padding: "24px 12px" }}>
                      No members loaded yet.
                    </td>
                  </tr>
                )}
                {participants.map((participant) => (
                  <tr key={participant.id || participant.mobile}>
                    <td>{participant.name || "Unknown"}</td>
                    <td>{participant.mobile || "-"}</td>
                    <td>{participant.pushName || participant.shortName || "-"}</td>
                    <td>{participant.verifiedName || "-"}</td>
                    <td>{participant.isSuperAdmin ? "Owner" : participant.isAdmin ? "Admin" : "Member"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export default GroupContactExtractor;
