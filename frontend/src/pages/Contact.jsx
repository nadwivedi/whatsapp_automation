import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function uniqueValues(values) {
  const keyed = new Map();
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (!keyed.has(key)) keyed.set(key, value);
  }
  return [...keyed.values()].sort((a, b) => a.localeCompare(b));
}

function removeCodeFence(raw) {
  const text = String(raw || "").trim().replace(/^\uFEFF/, "");
  if (!text.startsWith("```")) return text;
  return text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function normalizeParsedItems(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.items)) return parsed.items;
    return [parsed];
  }
  return null;
}

function parseBulkItems(rawJson) {
  const cleaned = removeCodeFence(rawJson);
  if (!cleaned) throw new Error("Please provide JSON data.");
  try {
    const parsed = JSON.parse(cleaned);
    const items = normalizeParsedItems(parsed);
    if (!items) throw new Error("JSON must be an array or object.");
    return items;
  } catch (firstError) {
    if (cleaned.startsWith("\"")) {
      try { const items = normalizeParsedItems(JSON.parse(cleaned.endsWith("]") ? `[{${cleaned}` : `{${cleaned}}`)); if (items) return items; } catch { }
    }
    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      try { const flat = []; lines.map((l) => JSON.parse(l)).forEach((e) => { Array.isArray(e) ? flat.push(...e) : flat.push(e); }); return flat; } catch { }
    }
    const stitched = cleaned.replace(/}\s*{/g, "},{");
    if (stitched !== cleaned) {
      try { const flat = []; JSON.parse(`[${stitched}]`).forEach((e) => { Array.isArray(e) ? flat.push(...e) : flat.push(e); }); return flat; } catch { }
    }
    try { const flat = []; JSON.parse(`[${cleaned}]`).forEach((e) => { Array.isArray(e) ? flat.push(...e) : flat.push(e); }); return flat; } catch {
      throw new Error(`Invalid JSON format. ${firstError.message}`);
    }
  }
}

const HEADER_MAP = {
  contactName: "contactName", "Contact name": "contactName", "Contact_name": "contactName", name: "contactName",
  mobile: "mobile", phone: "mobile", phonenumber: "mobile", "phone number": "mobile", "mobile number": "mobile", "mobile no": "mobile", "phone no": "mobile",
  email: "email", "email address": "email",
  state: "state", district: "district", city: "district",
  pincode: "pincode", "pin code": "pincode", zip: "pincode", "postal code": "pincode", "zip code": "pincode",
  address: "address", "full address": "address", fulladdress: "address",
  contactCategory: "contactCategory", "Contact category": "contactCategory", category: "contactCategory", categoryname: "contactCategory", "category name": "contactCategory",
};

function parseExcelToItems(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel file has no sheets.");
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  if (!rows.length) throw new Error("Excel file has no data rows.");
  if (rows.length > 5000) throw new Error("Excel file exceeds 5000 row limit.");
  return rows.map((row) => {
    const item = {};
    for (const [key, value] of Object.entries(row)) {
      const k = String(key).trim().toLowerCase();
      item[HEADER_MAP[k] || k] = value != null ? String(value).trim() : "";
    }
    return item;
  });
}

function parseTsvToItems(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error("Need at least a header row and one data row.");
  const headers = lines[0].split("\t").map((h) => { const n = h.trim().toLowerCase(); return HEADER_MAP[n] || n; });
  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split("\t");
    const item = {};
    headers.forEach((header, j) => { item[header] = (cells[j] || "").trim(); });
    if (Object.values(item).some((v) => v)) items.push(item);
  }
  if (!items.length) throw new Error("No data rows found after headers.");
  if (items.length > 5000) throw new Error("Pasted data exceeds 5000 row limit.");
  return items;
}

const SAMPLE_DATA = [
  { contactName: "ABC Traders", mobile: "+919876543210", email: "abc@email.com", state: "Maharashtra", district: "Mumbai", pincode: "400001", address: "123 Main Street" },
  { contactName: "XYZ Services", mobile: "+919876543211", email: "", state: "Delhi", district: "New Delhi", pincode: "110001", address: "456 Market Road" },
  { contactName: "PQR Industries", mobile: "+919876543212", email: "pqr@mail.com", state: "Gujarat", district: "Surat", pincode: "395001", address: "" },
];

const COLUMNS = [
  { key: "contactName", label: "Contact Name", required: true },
  { key: "mobile", label: "Mobile", required: true },
  { key: "email", label: "Email", required: false },
  { key: "state", label: "State", required: false },
  { key: "district", label: "District", required: false },
  { key: "pincode", label: "Pincode", required: false },
  { key: "address", label: "Address", required: false },
];

// Map camelCase keys to readable labels for preview tables
const DISPLAY_LABELS = {
  contactName: "Contact Name", mobile: "Mobile", email: "Email",
  state: "State", district: "District", pincode: "Pincode",
  address: "Address", contactCategory: "Category",
};
const toLabel = (key) => DISPLAY_LABELS[key] || key;

function Contact({
  refreshing, refreshAll, busy, contactCategories, contacts,
  createContact, bulkInsertContacts, deleteContact, dashboardLoading,
}) {
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showBulkPopup, setShowBulkPopup] = useState(false);
  const [form, setForm] = useState({
    contactName: "", mobile: "", email: "", state: "",
    district: "", pincode: "", address: "", contactCategory: "",
  });
  const [bulkDefaultCategory, setBulkDefaultCategory] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkJsonText, setBulkJsonText] = useState("");
  const [bulkTab, setBulkTab] = useState("excel");
  const [excelPreview, setExcelPreview] = useState(null);
  const [excelPasteText, setExcelPasteText] = useState("");
  const [showFormatInfo, setShowFormatInfo] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");

  const stateOptions = useMemo(() => uniqueValues(contacts.map((b) => b.state)), [contacts]);
  const districtOptions = useMemo(() => {
    const source = filterState ? contacts.filter((b) => String(b.state || "").trim().toLowerCase() === filterState.toLowerCase()) : contacts;
    return uniqueValues(source.map((b) => b.district));
  }, [contacts, filterState]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((item) => {
      const matchSearch = !q || String(item.contactName || "").toLowerCase().includes(q) || String(item.contactCategory?.name || "").toLowerCase().includes(q);
      const matchCat = !filterCategory || item.contactCategory?._id === filterCategory;
      const matchState = !filterState || String(item.state || "").trim().toLowerCase() === filterState.toLowerCase();
      const matchDist = !filterDistrict || String(item.district || "").trim().toLowerCase() === filterDistrict.toLowerCase();
      return matchSearch && matchCat && matchState && matchDist;
    });
  }, [contacts, filterCategory, filterDistrict, filterState, searchQuery]);

  async function onSubmit(e) {
    e.preventDefault();
    const ok = await createContact({
      contactName: form.contactName.trim(), mobile: form.mobile.trim(),
      email: form.email.trim(), state: form.state.trim(),
      district: form.district.trim(), pincode: form.pincode.trim(),
      address: form.address.trim(), contactCategory: form.contactCategory,
    });
    if (ok) {
      setForm({ contactName: "", mobile: "", email: "", state: "", district: "", pincode: "", address: "", contactCategory: "" });
      setShowAddPopup(false);
    }
  }

  async function submitBulkFromItems(items) {
    const payload = { items, ...(bulkDefaultCategory ? { defaultCategory: bulkDefaultCategory } : {}) };
    const response = await bulkInsertContacts(payload);
    if (response?.insertedCount != null) {
      setBulkStatus(`✅ Successfully inserted ${response.insertedCount} contacts!`);
      setBulkJsonText(""); setExcelPreview(null); setExcelPasteText("");
      setTimeout(() => setShowBulkPopup(false), 1500);
    }
  }

  async function onExcelUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBulkStatus("");
    try {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("File too large. Max 10MB.");
      const items = parseExcelToItems(await file.arrayBuffer());
      setExcelPreview({ items, fileName: file.name, rowCount: items.length });
      setBulkStatus(`📊 Parsed ${items.length} rows from "${file.name}". Review and click Insert.`);
    } catch (error) { setBulkStatus(`❌ ${error.message}`); setExcelPreview(null); }
    finally { event.target.value = ""; }
  }

  async function onExcelInsert() {
    if (!excelPreview?.items?.length) return;
    try { await submitBulkFromItems(excelPreview.items); } catch (error) { setBulkStatus(`❌ ${error.message}`); }
  }

  async function onJsonUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBulkStatus("");
    try {
      if (file.size > MAX_UPLOAD_BYTES) throw new Error("File too large. Max 10MB.");
      await submitBulkFromItems(parseBulkItems(await file.text()));
    } catch (error) { setBulkStatus(`❌ ${error.message}`); }
    finally { event.target.value = ""; }
  }

  async function onJsonPasteSubmit() {
    try {
      const raw = bulkJsonText.trim();
      if (!raw) throw new Error("Please paste JSON data first.");
      await submitBulkFromItems(parseBulkItems(raw));
    } catch (error) { setBulkStatus(`❌ ${error.message}`); }
  }

  function downloadSampleExcel() {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_DATA);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "contacts");
    XLSX.writeFile(wb, "Contacts_sample.xlsx");
  }

  // Parse pasted TSV for live table
  const pastedRows = useMemo(() => {
    if (!excelPasteText.trim()) return { headers: [], rows: [], count: 0 };
    const lines = excelPasteText.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 1) return { headers: [], rows: [], count: 0 };
    const headers = lines[0].split("\t").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => line.split("\t").map((c) => c.trim()));
    return { headers, rows, count: rows.filter((r) => r.some(Boolean)).length };
  }, [excelPasteText]);

  const F = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  return (
    <section className="space-y-4 sm:space-y-6">
      <header className="glass-panel-dark flex flex-wrap items-start sm:items-center justify-between gap-2 rounded-2xl px-4 py-4 sm:px-5">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.22em] text-slate-500">Directory</p>
          <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">contacts</h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">Store Contact records and assign each one to a category.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-cyan" onClick={() => setShowAddPopup(true)}>Add Contact</button>
          <button type="button" className="btn-dark" onClick={() => { setShowBulkPopup(true); setBulkStatus(""); setExcelPreview(null); setExcelPasteText(""); if (!bulkDefaultCategory && contactCategories.length) setBulkDefaultCategory(contactCategories[0]._id); }}>Bulk Insert</button>
          <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>{refreshing ? "Refreshing..." : "Refresh"}</button>
        </div>
      </header>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold text-slate-900">Search and Filters</h2>
          <p className="text-xs text-slate-600">Showing {filteredContacts.length} of {contacts.length}</p>
        </div>
        <div className="mt-3 grid gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input className="input input-search-strong xl:col-span-2" placeholder="Search by Contact name or category" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">All categories</option>
            {contactCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
          <select className="input" value={filterState} onChange={(e) => { setFilterState(e.target.value); setFilterDistrict(""); }}>
            <option value="">All states</option>
            {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <div className="flex gap-2">
            <select className="input" value={filterDistrict} onChange={(e) => setFilterDistrict(e.target.value)}>
              <option value="">All districts</option>
              {districtOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <button type="button" className="btn-dark whitespace-nowrap" onClick={() => { setSearchQuery(""); setFilterCategory(""); setFilterState(""); setFilterDistrict(""); }}>Clear</button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel overflow-hidden rounded-2xl p-0">
        <div className="overflow-x-auto">
          <table className="min-w-[1040px] w-full border-collapse text-xs sm:text-sm">
            <thead className="bg-slate-100/80 text-left text-slate-700">
              <tr>
                <th className="px-3 py-2 font-semibold">Contact Name</th>
                <th className="px-3 py-2 font-semibold">Mobile</th>
                <th className="px-3 py-2 font-semibold">State</th>
                <th className="px-3 py-2 font-semibold">District</th>
                <th className="px-3 py-2 font-semibold">Pincode</th>
                <th className="px-3 py-2 font-semibold">Address</th>
                <th className="px-3 py-2 font-semibold">Email</th>
                <th className="px-3 py-2 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.map((item) => (
                <tr key={item._id} className="border-t border-slate-200/80 align-top text-slate-700">
                  <td className="px-3 py-2 font-medium text-slate-900">{item.contactName || "--"}</td>
                  <td className="px-3 py-2">{item.mobile || "--"}</td>
                  <td className="px-3 py-2">{item.state || "--"}</td>
                  <td className="px-3 py-2">{item.district || "--"}</td>
                  <td className="px-3 py-2">{item.pincode || "--"}</td>
                  <td className="max-w-[20rem] px-3 py-2 break-words">{item.address || "--"}</td>
                  <td className="px-3 py-2">{item.email || "--"}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="btn-red" onClick={() => deleteContact(item)} disabled={busy === `delete-contact-${item._id}`}>
                      {busy === `delete-contact-${item._id}` ? "..." : "Delete"}
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredContacts.length && !dashboardLoading && contacts.length > 0 && (
                <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>No contacts match the current search/filters.</td></tr>
              )}
              {!contacts.length && !dashboardLoading && (
                <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>No contacts saved yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════ ADD Contact POPUP ═══════ */}
      {showAddPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowAddPopup(false)}>
          <div className="glass-panel w-full max-w-2xl rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-cyan-50 to-emerald-50 px-5 py-4 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-lg">🏢</div>
                <div>
                  <h2 className="font-heading text-lg font-bold text-slate-900">Add Contact</h2>
                  <p className="text-[11px] text-slate-500">Fill in the details to add a new Contact record</p>
                </div>
              </div>
              <button type="button" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700" onClick={() => setShowAddPopup(false)}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {!contactCategories.length ? (
              <div className="px-5 py-4">
                <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">⚠️ Add at least one Contact category first.</p>
              </div>
            ) : null}

            <form className="p-5" onSubmit={onSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Contact Name */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Contact Name <span className="text-rose-500">*</span>
                  </label>
                  <input className="input" placeholder="e.g. ABC Traders" value={form.contactName} onChange={F("contactName")} required />
                </div>
                {/* Mobile */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Mobile <span className="text-rose-500">*</span>
                  </label>
                  <input className="input" placeholder="e.g. +919876543210" value={form.mobile} onChange={F("mobile")} required />
                </div>
                {/* Email */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</label>
                  <input className="input" placeholder="e.g. contact@Contact.com" value={form.email} onChange={F("email")} />
                </div>
                {/* Category */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <select className="input" value={form.contactCategory} onChange={F("contactCategory")} required>
                    <option value="">Select category</option>
                    {contactCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>
                {/* State */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">State</label>
                  <input className="input" placeholder="e.g. Maharashtra" value={form.state} onChange={F("state")} />
                </div>
                {/* District */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">District</label>
                  <input className="input" placeholder="e.g. Mumbai" value={form.district} onChange={F("district")} />
                </div>
                {/* Pincode */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Pincode</label>
                  <input className="input" placeholder="e.g. 400001" value={form.pincode} onChange={F("pincode")} />
                </div>
                {/* Address */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Address</label>
                  <input className="input" placeholder="e.g. 123 Main Street" value={form.address} onChange={F("address")} />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" className="btn-dark" onClick={() => setShowAddPopup(false)}>Cancel</button>
                <button className="btn-cyan" disabled={busy === "create-contact" || !contactCategories.length}>
                  {busy === "create-contact" ? "Saving..." : "Save Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════ BULK INSERT POPUP ═══════ */}
      {showBulkPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowBulkPopup(false)}>
          <div className="glass-panel w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-violet-50 to-rose-50 px-5 py-4 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-lg">📦</div>
                <div>
                  <h2 className="font-heading text-lg font-bold text-slate-900">Bulk Insert contacts</h2>
                  <p className="text-[11px] text-slate-500">Import multiple contacts from Excel, CSV, or JSON</p>
                </div>
              </div>
              <button type="button" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700" onClick={() => setShowBulkPopup(false)}>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-5 space-y-5">

              {/* ── STEP 1: Category ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">1</span>
                  <h3 className="text-sm font-bold text-slate-800">Select Category</h3>
                  <button
                    type="button"
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold transition ${showFormatInfo
                      ? "border-cyan-400 bg-cyan-50 text-cyan-600"
                      : "border-slate-300 bg-white text-slate-500 hover:bg-cyan-50 hover:border-cyan-400 hover:text-cyan-600"
                      }`}
                    onMouseEnter={() => setShowFormatInfo(true)}
                  >
                    i
                  </button>
                </div>
                <select className="input max-w-md" value={bulkDefaultCategory} onChange={(e) => setBulkDefaultCategory(e.target.value)}>
                  <option value="">Choose a category for all records</option>
                  {contactCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
              </div>

              {/* ── STEP 2: Upload ── */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[11px] font-bold text-white">2</span>
                  <h3 className="text-sm font-bold text-slate-800">Upload Your Data</h3>
                </div>

                {/* Tab Switcher */}
                <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 max-w-xs mb-4">
                  <button type="button" className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${bulkTab === "excel" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setBulkTab("excel")}>
                    📊 Excel / CSV
                  </button>
                  <button type="button" className={`flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-all ${bulkTab === "json" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`} onClick={() => setBulkTab("json")}>
                    {"{ }"} JSON
                  </button>
                </div>

                {/* ── Excel Tab ── */}
                {bulkTab === "excel" && (
                  <div className="space-y-4">
                    {/* File upload + download sample */}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        Upload Excel / CSV
                        <input className="hidden" type="file" accept=".xlsx,.xls,.csv,.ods" onChange={onExcelUpload} disabled={busy === "bulk-contact-json"} />
                      </label>
                      <button type="button" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50" onClick={downloadSampleExcel}>
                        ⬇️ Download Sample Excel
                      </button>
                    </div>

                    {/* Preview from file */}
                    {excelPreview && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold text-emerald-800">
                            📄 {excelPreview.fileName} <span className="font-normal text-emerald-600">({excelPreview.rowCount} rows)</span>
                          </p>
                          <button type="button" className="text-xs text-emerald-600 hover:text-emerald-800 underline" onClick={() => setExcelPreview(null)}>Clear</button>
                        </div>
                        <div className="max-h-48 overflow-auto rounded-lg border border-emerald-200 bg-white">
                          <table className="w-full border-collapse text-[10px] sm:text-xs">
                            <thead className="sticky top-0 bg-emerald-50 text-left">
                              <tr>
                                <th className="px-2 py-1.5 font-semibold text-emerald-700">#</th>
                                {Object.keys(excelPreview.items[0] || {}).slice(0, 7).map((k) => (
                                  <th key={k} className="px-2 py-1.5 font-semibold text-emerald-700 whitespace-nowrap">{toLabel(k)}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {excelPreview.items.slice(0, 5).map((row, i) => (
                                <tr key={i} className="border-t border-emerald-100">
                                  <td className="px-2 py-1 text-emerald-400">{i + 1}</td>
                                  {Object.values(row).slice(0, 7).map((v, j) => (
                                    <td key={j} className="px-2 py-1 max-w-[120px] truncate text-slate-700">{String(v)}</td>
                                  ))}
                                </tr>
                              ))}
                              {excelPreview.rowCount > 5 && (
                                <tr><td className="px-2 py-1 text-center text-slate-400" colSpan={99}>... and {excelPreview.rowCount - 5} more rows</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <button type="button" className="btn-cyan mt-3" onClick={onExcelInsert} disabled={busy === "bulk-contact-json"}>
                          {busy === "bulk-contact-json" ? "Inserting..." : `✓ Insert ${excelPreview.rowCount} contacts`}
                        </button>
                      </div>
                    )}

                    {/* ── Paste from Excel ── */}
                    <div>
                      <p className="text-[11px] text-slate-600 mb-2">Or paste from Excel below (include header row):</p>

                      {!excelPasteText.trim() ? (
                        /* Visual table placeholder — click to start pasting */
                        <div
                          className="relative cursor-text rounded-lg border border-slate-300 bg-white overflow-hidden transition hover:border-cyan-400"
                          onClick={() => {
                            const el = document.getElementById("excel-paste-input");
                            if (el) el.focus();
                          }}
                        >
                          <table className="w-full border-collapse text-[11px]">
                            <thead className="bg-slate-100 text-left">
                              <tr>
                                {COLUMNS.map((col) => (
                                  <th key={col.key} className="px-2.5 py-2 font-semibold text-slate-500 whitespace-nowrap border-r border-slate-200 last:border-r-0">
                                    {col.label}
                                    {col.required && <span className="ml-0.5 text-rose-400">*</span>}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {SAMPLE_DATA.map((row, ri) => (
                                <tr key={ri} className="border-t border-slate-100">
                                  {COLUMNS.map((col) => (
                                    <td key={col.key} className="px-2.5 py-1.5 text-slate-300 italic border-r border-slate-100 last:border-r-0 truncate max-w-[130px]">
                                      {row[col.key] || "—"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-center">
                            <p className="text-[11px] text-slate-400">📋 Click here and press <kbd className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Ctrl+V</kbd> to paste from Excel</p>
                          </div>
                          {/* Hidden textarea to capture paste */}
                          <textarea
                            id="excel-paste-input"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-text"
                            value={excelPasteText}
                            onChange={(e) => setExcelPasteText(e.target.value)}
                          />
                        </div>
                      ) : (
                        /* Actual pasted content */
                        <div>
                          <textarea
                            className="input min-h-36 font-mono text-[11px]"
                            value={excelPasteText}
                            onChange={(e) => setExcelPasteText(e.target.value)}
                            autoFocus
                          />
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button" className="btn-cyan"
                              disabled={busy === "bulk-contact-json"}
                              onClick={() => {
                                try {
                                  const items = parseTsvToItems(excelPasteText);
                                  setExcelPreview({ items, fileName: "Pasted data", rowCount: items.length });
                                  setBulkStatus(`📊 Parsed ${items.length} rows. Review above and click Insert.`);
                                } catch (err) { setBulkStatus(`❌ ${err.message}`); }
                              }}
                            >
                              Bulk Insert from Paste
                            </button>
                            <button type="button" className="btn-dark" onClick={() => setExcelPasteText("")}>Clear</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── JSON Tab ── */}
                {bulkTab === "json" && (
                  <div className="space-y-3">
                    <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-slate-800 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100">
                      📂 Upload JSON File
                      <input className="hidden" type="file" accept="application/json,.json" onChange={onJsonUpload} disabled={busy === "bulk-contact-json"} />
                    </label>
                    <p className="text-[11px] text-slate-600">Or paste JSON below:</p>
                    <textarea
                      className="input min-h-36 font-mono text-[11px]"
                      placeholder={'[\n  { "contactName": "ABC Traders", "mobile": "+919876543210" },\n  { "contactName": "XYZ Services", "mobile": "+919876543211" }\n]'}
                      value={bulkJsonText}
                      onChange={(e) => setBulkJsonText(e.target.value)}
                    />
                    <button type="button" className="btn-cyan w-fit" onClick={onJsonPasteSubmit} disabled={busy === "bulk-contact-json"}>
                      {busy === "bulk-contact-json" ? "Inserting..." : "Bulk Insert from JSON"}
                    </button>
                  </div>
                )}
              </div>

              {/* Status Message */}
              {bulkStatus && (
                <div className={`rounded-xl px-4 py-3 text-sm font-medium ${bulkStatus.startsWith("✅") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                  bulkStatus.startsWith("❌") ? "bg-rose-50 text-rose-700 border border-rose-200" :
                    "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}>
                  {bulkStatus}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ FORMAT INFO OVERLAY (separate from bulk popup) ═══════ */}
      {showFormatInfo && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center pointer-events-none"
          onMouseEnter={() => setShowFormatInfo(true)}
        >
          <div
            className="pointer-events-auto w-[440px] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onMouseEnter={() => setShowFormatInfo(true)}
            onMouseLeave={() => setShowFormatInfo(false)}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-800">📋 Expected Data Format</p>
              <button type="button" className="text-xs text-slate-400 hover:text-slate-600" onClick={() => setShowFormatInfo(false)}>✕</button>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-2 py-2 font-semibold text-slate-600">Column</th>
                  <th className="px-2 py-2 font-semibold text-slate-600 text-center">Status</th>
                  <th className="px-2 py-2 font-semibold text-slate-600">Example</th>
                </tr>
              </thead>
              <tbody>
                {COLUMNS.map((col) => (
                  <tr key={col.key} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-700">{col.label}</td>
                    <td className="px-2 py-2 text-center">
                      {col.required
                        ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600">Required</span>
                        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">Optional</span>
                      }
                    </td>
                    <td className="px-2 py-2 text-slate-500">{SAMPLE_DATA[0][col.key] || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-slate-500">
              💡 Category is selected from the dropdown — no need in your file. Column headers are flexible (e.g. "Phone Number", "phone", "mobile no" all work).
            </p>
            <p className="mt-1 text-[10px] text-slate-400">Works for both Excel and JSON formats.</p>
          </div>
        </div>
      )}
    </section>
  );
}

export default Contact;

