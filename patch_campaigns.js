const fs = require('fs');
const path = 'frontend/src/pages/CampaignsPage.jsx';
let src = fs.readFileSync(path, 'utf8');
let changed = 0;

// Helper: normalize any newline combo to \n for matching, then restore
function patch(from, to) {
  const normFrom = from.replace(/\r\n/g, '\n');
  const normSrc = src.replace(/\r\n/g, '\n');
  if (!normSrc.includes(normFrom)) return false;
  // Find and replace in the normalized source, then write back with original-style endings
  src = normSrc.replace(normFrom, to);
  return true;
}

// 1. Add states after editForm useState block
const ok1 = patch(
  `  const [editForm, setEditForm] = useState({\n    title: "",\n    messageBody: "",\n    perRecipientMessageLimit: "1",\n    dateFrom: "",\n    dateTo: "",\n  });`,
  `  const [editForm, setEditForm] = useState({\n    title: "",\n    messageBody: "",\n    perRecipientMessageLimit: "1",\n    dateFrom: "",\n    dateTo: "",\n  });\n  const [createAccountIds, setCreateAccountIds] = useState([]);\n  const [editAccountIds, setEditAccountIds] = useState([]);`
);
console.log(ok1 ? '✅ 1.' : '⚠️  1.', 'States'); if (ok1) changed++;

// 2. Patch first "+" button to auto-select sessions on open
const ok2 = patch(
  `onClick={() => setShowCreatePopup(true)}\n            aria-label="Add campaign"`,
  `onClick={() => { setShowCreatePopup(true); setCreateAccountIds(eligibleAccounts.map(a => a._id)); }}\n            aria-label="Add campaign"`
);
console.log(ok2 ? '✅ 2.' : '⚠️  2.', 'First + button'); if (ok2) changed++;

// 3. Replace static "Sending Accounts" text with checkboxes in create form
const ok3 = patch(
  `                <p className="rounded-lg bg-emerald-950/40 px-3 py-2 text-xs text-emerald-300">\n                  Sending Accounts: Automatically uses all active authenticated sessions ({eligibleAccounts.length})\n                </p>\n                <p className="text-xs text-slate-500">\n                  {eligibleAccounts.length\n                    ? eligibleAccounts.map((account) => account.name).join(", ")\n                    : "No active authenticated session found."}\n                </p>`,
  `                <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-2">\n                  <div className="flex items-center justify-between">\n                    <p className="text-sm font-semibold text-slate-800">Sending Sessions <span className="text-xs font-normal text-slate-500">({createAccountIds.length}/{eligibleAccounts.length} selected)</span></p>\n                    <div className="flex gap-2">\n                      <button type="button" className="text-xs text-cyan-700 hover:text-cyan-600 font-medium" onClick={() => setCreateAccountIds(eligibleAccounts.map(a => a._id))}>All</button>\n                      <button type="button" className="text-xs text-slate-500 hover:text-slate-700 font-medium" onClick={() => setCreateAccountIds([])}>None</button>\n                    </div>\n                  </div>\n                  {!eligibleAccounts.length && <p className="text-xs text-amber-600">No active authenticated session found.</p>}\n                  <div className="space-y-1.5 max-h-40 overflow-y-auto">\n                    {eligibleAccounts.map((acc) => (\n                      <label key={acc._id} className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-100">\n                        <input\n                          type="checkbox"\n                          checked={createAccountIds.includes(acc._id)}\n                          onChange={() => setCreateAccountIds(prev =>\n                            prev.includes(acc._id) ? prev.filter(id => id !== acc._id) : [...prev, acc._id]\n                          )}\n                        />\n                        <div className="min-w-0">\n                          <p className="text-xs font-semibold text-slate-800 truncate">{acc.name}</p>\n                          <p className="text-[11px] text-slate-500">{acc.phoneNumber || acc.status}</p>\n                        </div>\n                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>\n                      </label>\n                    ))}\n                  </div>\n                </div>`
);
console.log(ok3 ? '✅ 3.' : '⚠️  3.', 'Create checkboxes'); if (ok3) changed++;

// 4. Patch openEditPopup to seed editAccountIds
const ok4 = patch(
  `  function openEditPopup(campaign) {\n    setEditingCampaign(campaign);\n    setEditForm({\n      title: campaign.title || "",\n      messageBody: campaign.messageBody || "",\n      perRecipientMessageLimit: String(campaign.perRecipientMessageLimit || 1),\n      dateFrom: campaign.dateFrom || "",\n      dateTo: campaign.dateTo || "",\n    });\n    setShowEditPopup(true);\n  }`,
  `  function openEditPopup(campaign) {\n    setEditingCampaign(campaign);\n    setEditForm({\n      title: campaign.title || "",\n      messageBody: campaign.messageBody || "",\n      perRecipientMessageLimit: String(campaign.perRecipientMessageLimit || 1),\n      dateFrom: campaign.dateFrom || "",\n      dateTo: campaign.dateTo || "",\n    });\n    const existingIds = (campaign.accounts || []).map(a => String(a._id || a));\n    setEditAccountIds(existingIds.length ? existingIds : eligibleAccounts.map(a => a._id));\n    setShowEditPopup(true);\n  }`
);
console.log(ok4 ? '✅ 4.' : '⚠️  4.', 'openEditPopup'); if (ok4) changed++;

// 5. Wire editAccountIds into submitEditCampaign
const ok5 = patch(
  `    const ok = await updateCampaign(editingCampaign._id, {\n      title: editForm.title.trim(),\n      messageBody: editForm.messageBody,\n      perRecipientMessageLimit: Number(editForm.perRecipientMessageLimit || 1),\n      dateFrom: editForm.dateFrom || undefined,\n      dateTo: editForm.dateTo || undefined,\n    });`,
  `    const ok = await updateCampaign(editingCampaign._id, {\n      title: editForm.title.trim(),\n      messageBody: editForm.messageBody,\n      perRecipientMessageLimit: Number(editForm.perRecipientMessageLimit || 1),\n      dateFrom: editForm.dateFrom || undefined,\n      dateTo: editForm.dateTo || undefined,\n      accountIds: editAccountIds,\n    });`
);
console.log(ok5 ? '✅ 5.' : '⚠️  5.', 'submitEditCampaign'); if (ok5) changed++;

// 6. Add session checklist to Edit popup (before Messages per person input)
const ok6 = patch(
  `              <div className="grid gap-3 md:grid-cols-2">\n                <input\n                  className="input-dark"\n                  type="number"\n                  min="1"\n                  max="20"\n                  placeholder="Messages per person"\n                  value={editForm.perRecipientMessageLimit}\n                  onChange={(e) =>\n                    setEditForm((p) => ({ ...p, perRecipientMessageLimit: e.target.value }))\n                  }\n                  required\n                />\n              </div>`,
  `              <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3 space-y-2">\n                <div className="flex items-center justify-between">\n                  <p className="text-sm font-semibold text-slate-800">Sending Sessions <span className="text-xs font-normal text-slate-500">({editAccountIds.length}/{eligibleAccounts.length} selected)</span></p>\n                  <div className="flex gap-2">\n                    <button type="button" className="text-xs text-cyan-700 hover:text-cyan-600 font-medium" onClick={() => setEditAccountIds(eligibleAccounts.map(a => a._id))}>All</button>\n                    <button type="button" className="text-xs text-slate-500 hover:text-slate-700 font-medium" onClick={() => setEditAccountIds([])}>None</button>\n                  </div>\n                </div>\n                {!eligibleAccounts.length && <p className="text-xs text-amber-600">No active authenticated sessions.</p>}\n                <div className="space-y-1.5 max-h-40 overflow-y-auto">\n                  {eligibleAccounts.map((acc) => (\n                    <label key={acc._id} className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-100">\n                      <input\n                        type="checkbox"\n                        checked={editAccountIds.includes(acc._id)}\n                        onChange={() => setEditAccountIds(prev =>\n                          prev.includes(acc._id) ? prev.filter(id => id !== acc._id) : [...prev, acc._id]\n                        )}\n                      />\n                      <div className="min-w-0">\n                        <p className="text-xs font-semibold text-slate-800 truncate">{acc.name}</p>\n                        <p className="text-[11px] text-slate-500">{acc.phoneNumber || acc.status}</p>\n                      </div>\n                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>\n                    </label>\n                  ))}\n                </div>\n              </div>\n              <div className="grid gap-3 md:grid-cols-2">\n                <input\n                  className="input-dark"\n                  type="number"\n                  min="1"\n                  max="20"\n                  placeholder="Messages per person"\n                  value={editForm.perRecipientMessageLimit}\n                  onChange={(e) =>\n                    setEditForm((p) => ({ ...p, perRecipientMessageLimit: e.target.value }))\n                  }\n                  required\n                />\n              </div>`
);
console.log(ok6 ? '✅ 6.' : '⚠️  6.', 'Edit session checkboxes'); if (ok6) changed++;

fs.writeFileSync(path, src, 'utf8');
console.log(`\nDone. ${changed}/6 patches applied.`);
