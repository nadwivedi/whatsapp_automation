import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const SAMPLE_DATA = [
  { name: "ABC Traders", mobile: "+919876543210", email: "abc@email.com", state: "Maharashtra", district: "Mumbai", address: "123 Main Street" },
  { name: "XYZ Services", mobile: "+919876543211", email: "", state: "Delhi", district: "New Delhi", address: "456 Market Road" },
  { name: "PQR Industries", mobile: "+919876543212", email: "pqr@mail.com", state: "Gujarat", district: "Surat", address: "" },
];

const COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "mobile", label: "Mobile", required: true },
  { key: "email", label: "Email", required: false },
  { key: "state", label: "State", required: false },
  { key: "district", label: "District", required: false },
  { key: "address", label: "Address", required: false },
];

const HEADER_MAP = {
  contactname: "name", "contact name": "name", "contact_name": "name", name: "name",
  mobile: "mobile", phone: "mobile", phonenumber: "mobile", "phone number": "mobile",
  "mobile number": "mobile", "mobile no": "mobile", "phone no": "mobile",
  email: "email", "email address": "email",
  state: "state", district: "district", city: "district",
  address: "address", "full address": "address", fulladdress: "address",
  contactcategory: "contactCategory", "contact category": "contactCategory",
  category: "contactCategory", categoryname: "contactCategory", "category name": "contactCategory",
};

const DISPLAY_LABELS = {
  name: "Name", mobile: "Mobile", email: "Email",
  state: "State", district: "District", address: "Address", contactCategory: "Category",
};

const CAT_COLORS = {
  0: { bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  1: { bg: "#dcfce7", text: "#15803d", dot: "#22c55e" },
  2: { bg: "#fef9c3", text: "#854d0e", dot: "#eab308" },
  3: { bg: "#fce7f3", text: "#9d174d", dot: "#ec4899" },
  4: { bg: "#ede9fe", text: "#6d28d9", dot: "#8b5cf6" },
  5: { bg: "#ffedd5", text: "#9a3412", dot: "#f97316" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
    const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      try {
        const flat = [];
        lines.map((l) => JSON.parse(l)).forEach((e) => { Array.isArray(e) ? flat.push(...e) : flat.push(e); });
        return flat;
      } catch {}
    }
    const stitched = cleaned.replace(/}\s*{/g, "},{");
    if (stitched !== cleaned) {
      try {
        const flat = [];
        JSON.parse(`[${stitched}]`).forEach((e) => { Array.isArray(e) ? flat.push(...e) : flat.push(e); });
        return flat;
      } catch {}
    }
    try {
      const flat = [];
      JSON.parse(`[${cleaned}]`).forEach((e) => { Array.isArray(e) ? flat.push(...e) : flat.push(e); });
      return flat;
    } catch {
      throw new Error(`Invalid JSON format. ${firstError.message}`);
    }
  }
}

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

function getCatColor(categories, id) {
  const idx = categories.findIndex(c => c._id === id);
  return CAT_COLORS[idx % Object.keys(CAT_COLORS).length] || CAT_COLORS[0];
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = {
  close: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  search: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>,
  plus: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5v14" /></svg>,
  phone: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.5a2 2 0 0 1 1.99-2.18H6.5a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.06 6.06l1.77-1.77a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>,
  mail: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>,
  pin: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>,
  trash: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>,
  edit: () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>,
  upload: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  download: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>,
};

// ─── Main Component ───────────────────────────────────────────────────────────
function Contact({
  refreshing, refreshAll, busy, contactCategories, contacts,
  createContact, bulkInsertContacts, deleteContact,
  createContactCategory, updateContactCategory, deleteContactCategory,
  dashboardLoading,
}) {
  // ── UI State ──
  const [activeView, setActiveView] = useState("table");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");

  // ── Add Contact ──
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [form, setForm] = useState({ name: "", mobile: "", email: "", state: "", district: "", address: "", contactCategory: "" });

  // ── Categories ──
  const [showCategoryPopup, setShowCategoryPopup] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "" });

  // ── Bulk Insert ──
  const [showBulkPopup, setShowBulkPopup] = useState(false);
  const [bulkTab, setBulkTab] = useState("excel");
  const [bulkDefaultCategory, setBulkDefaultCategory] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkJsonText, setBulkJsonText] = useState("");
  const [excelPreview, setExcelPreview] = useState(null);
  const [excelPasteText, setExcelPasteText] = useState("");
  const [showFormatInfo, setShowFormatInfo] = useState(false);

  // ── Derived ──
  const categoryUsage = useMemo(() => {
    const usage = new Map();
    for (const item of contacts) {
      const key = item?.contactCategory?._id;
      if (!key) continue;
      usage.set(key, (usage.get(key) || 0) + 1);
    }
    return usage;
  }, [contacts]);

  const stateOptions = useMemo(() => uniqueValues(contacts.map((b) => b.state)), [contacts]);
  const districtOptions = useMemo(() => {
    const source = filterState
      ? contacts.filter((b) => String(b.state || "").trim().toLowerCase() === filterState.toLowerCase())
      : contacts;
    return uniqueValues(source.map((b) => b.district));
  }, [contacts, filterState]);

  const filteredContacts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return contacts.filter((item) => {
      const name = String(item.name || item.contactName || "").toLowerCase();
      const matchSearch = !q || name.includes(q) || String(item.mobile || "").includes(q) || String(item.email || "").toLowerCase().includes(q) || String(item.contactCategory?.name || "").toLowerCase().includes(q);
      const matchCat = !filterCategory || item.contactCategory?._id === filterCategory;
      const matchState = !filterState || String(item.state || "").trim().toLowerCase() === filterState.toLowerCase();
      const matchDist = !filterDistrict || String(item.district || "").trim().toLowerCase() === filterDistrict.toLowerCase();
      return matchSearch && matchCat && matchState && matchDist;
    });
  }, [contacts, filterCategory, filterDistrict, filterState, searchQuery]);

  // ── Handlers ──
  async function onSubmit(e) {
    e.preventDefault();
    const ok = await createContact({
      name: form.name.trim(), mobile: form.mobile.trim(),
      email: form.email.trim(), state: form.state.trim(),
      district: form.district.trim(), address: form.address.trim(),
      contactCategory: form.contactCategory,
    });
    if (ok) {
      setForm({ name: "", mobile: "", email: "", state: "", district: "", address: "", contactCategory: "" });
      setShowAddPopup(false);
    }
  }

  function openCreateCategory() {
    setEditingCategory(null);
    setCategoryForm({ name: "", description: "" });
    setShowCategoryPopup(true);
  }

  function openEditCategory(category) {
    setEditingCategory(category);
    setCategoryForm({ name: category?.name || "", description: category?.description || "" });
    setShowCategoryPopup(true);
  }

  async function onSubmitCategory(e) {
    e.preventDefault();
    const payload = { name: categoryForm.name.trim(), description: categoryForm.description.trim() };
    const ok = editingCategory
      ? await updateContactCategory(editingCategory._id, payload)
      : await createContactCategory(payload);
    if (ok) {
      setShowCategoryPopup(false);
      setEditingCategory(null);
      setCategoryForm({ name: "", description: "" });
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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');

        .cp-wrap { font-family: 'Sora', sans-serif; color: #0f1117; }
        .cp-layout { display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: start; }
        @media (max-width: 900px) { .cp-layout { grid-template-columns: 1fr; } }

        /* Panel */
        .cp-panel { background: #fff; border-radius: 18px; border: 1px solid #e8eaf0; box-shadow: 0 1px 3px rgba(0,0,0,.05), 0 4px 16px rgba(0,0,0,.05); overflow: hidden; }

        /* Sidebar */
        .cp-sb-header { padding: 16px 18px 14px; border-bottom: 1px solid #e8eaf0; display: flex; align-items: center; justify-content: space-between; }
        .cp-sb-title { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #7c8099; }
        .cp-cat-list { padding: 10px; display: flex; flex-direction: column; gap: 6px; }
        .cp-cat-card { padding: 11px 13px; border-radius: 10px; border: 1.5px solid transparent; transition: border-color .15s, background .15s; }
        .cp-cat-card:hover { border-color: #e8eaf0; background: #f6f7fb; }
        .cp-cat-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
        .cp-cat-name { font-size: 13px; font-weight: 600; color: #0f1117; display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; }
        .cp-cat-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cp-cat-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .cp-cat-desc { font-size: 11px; color: #7c8099; margin-top: 4px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cp-cat-count { font-size: 11px; font-family: 'DM Mono', monospace; font-weight: 500; margin-top: 5px; }
        .cp-cat-actions { display: flex; gap: 3px; opacity: 0; transition: opacity .15s; flex-shrink: 0; }
        .cp-cat-card:hover .cp-cat-actions { opacity: 1; }
        .cp-empty { padding: 40px 20px; text-align: center; color: #7c8099; font-size: 13px; }

        /* Main */
        .cp-main-header { padding: 16px 20px 14px; border-bottom: 1px solid #e8eaf0; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
        .cp-main-title { font-size: 14px; font-weight: 700; color: #0f1117; }
        .cp-count { background: #eff4ff; color: #2563eb; font-size: 11px; font-weight: 700; font-family: 'DM Mono', monospace; padding: 2px 8px; border-radius: 20px; }
        .cp-toolbar { padding: 10px 20px; border-bottom: 1px solid #e8eaf0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #f6f7fb; }
        .cp-search-wrap { position: relative; flex: 1; min-width: 160px; max-width: 260px; }
        .cp-search-icon { position: absolute; left: 9px; top: 50%; transform: translateY(-50%); color: #7c8099; pointer-events: none; }
        .cp-search { width: 100%; padding: 7px 10px 7px 30px; border: 1.5px solid #e8eaf0; border-radius: 8px; font-family: 'Sora', sans-serif; font-size: 12px; color: #0f1117; background: #fff; outline: none; transition: border-color .15s; }
        .cp-search:focus { border-color: #2563eb; }
        .cp-select { padding: 7px 10px; border: 1.5px solid #e8eaf0; border-radius: 8px; font-family: 'Sora', sans-serif; font-size: 12px; color: #3d4155; background: #fff; outline: none; cursor: pointer; transition: border-color .15s; }
        .cp-select:focus { border-color: #2563eb; }
        .cp-view-toggle { display: flex; border: 1.5px solid #e8eaf0; border-radius: 8px; overflow: hidden; background: #fff; margin-left: auto; }
        .cp-view-btn { padding: 5px 10px; font-size: 13px; cursor: pointer; background: transparent; border: none; color: #7c8099; transition: all .12s; }
        .cp-view-btn.active { background: #2563eb; color: #fff; }

        /* Table */
        .cp-table-wrap { overflow-x: auto; }
        .cp-table { width: 100%; border-collapse: collapse; min-width: 760px; }
        .cp-table thead th { padding: 9px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #7c8099; background: #f6f7fb; text-align: left; border-bottom: 1.5px solid #e8eaf0; white-space: nowrap; }
        .cp-table tbody tr { border-bottom: 1px solid #e8eaf0; transition: background .1s; }
        .cp-table tbody tr:last-child { border-bottom: none; }
        .cp-table tbody tr:hover { background: #f9fafc; }
        .cp-table td { padding: 11px 16px; font-size: 12px; color: #3d4155; vertical-align: middle; }
        .cp-td-name { font-weight: 600; color: #0f1117; font-size: 13px; }
        .cp-td-mono { font-family: 'DM Mono', monospace; font-size: 12px; }
        .cp-td-muted { color: #b0b4c4; font-size: 12px; }
        .cp-td-loc { display: flex; align-items: center; gap: 4px; color: #7c8099; font-size: 12px; }
        .cp-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; white-space: nowrap; }
        .cp-pill-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
        .cp-del-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; font-family: 'Sora', sans-serif; color: #e11d48; background: transparent; border: 1.5px solid #fecdd3; cursor: pointer; opacity: 0; transition: opacity .12s, background .12s; }
        .cp-table tbody tr:hover .cp-del-btn { opacity: 1; }
        .cp-del-btn:hover { background: #fff1f3; }
        .cp-del-btn:disabled { opacity: .5; cursor: default; }

        /* Cards */
        .cp-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px; padding: 18px; }
        .cp-card { border: 1.5px solid #e8eaf0; border-radius: 14px; padding: 15px; transition: box-shadow .15s, border-color .15s; }
        .cp-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.08); border-color: #d0d5e8; }
        .cp-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
        .cp-avatar { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
        .cp-card-name { font-size: 13px; font-weight: 600; color: #0f1117; line-height: 1.4; }
        .cp-card-details { margin-top: 10px; padding-top: 10px; border-top: 1px solid #e8eaf0; display: flex; flex-direction: column; gap: 5px; }
        .cp-card-row { display: flex; align-items: flex-start; gap: 6px; font-size: 12px; color: #7c8099; }
        .cp-card-row span { color: #3d4155; }

        /* Buttons */
        .cp-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 15px; border-radius: 9px; font-family: 'Sora', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; border: none; transition: all .15s; white-space: nowrap; }
        .cp-btn-sm { padding: 5px 10px; font-size: 11px; border-radius: 7px; gap: 4px; }
        .cp-btn-primary { background: #2563eb; color: #fff; }
        .cp-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
        .cp-btn-primary:disabled { opacity: .6; cursor: default; }
        .cp-btn-ghost { background: transparent; color: #3d4155; border: 1.5px solid #e8eaf0; }
        .cp-btn-ghost:hover { background: #f6f7fb; }
        .cp-btn-dark { background: #1e2130; color: #fff; }
        .cp-btn-dark:hover { background: #2d3147; }
        .cp-btn-icon { background: transparent; border: none; color: #7c8099; cursor: pointer; padding: 4px 5px; border-radius: 6px; display: inline-flex; align-items: center; transition: color .12s, background .12s; }
        .cp-btn-icon:hover { color: #0f1117; background: #e8eaf0; }
        .cp-btn-icon.danger:hover { color: #e11d48; background: #fff1f3; }

        /* Modal */
        .cp-overlay { position: fixed; inset: 0; background: rgba(10,12,20,.55); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; backdrop-filter: blur(4px); animation: cpFade .15s ease; }
        @keyframes cpFade { from { opacity: 0; } to { opacity: 1; } }
        .cp-modal { background: #fff; border-radius: 20px; width: 100%; max-width: 560px; max-height: 92vh; overflow-y: auto; box-shadow: 0 20px 60px rgba(0,0,0,.2); animation: cpUp .2s ease; }
        .cp-modal-xl { max-width: 860px; }
        @keyframes cpUp { from { transform: translateY(16px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .cp-modal-header { padding: 20px 24px 16px; border-bottom: 1px solid #e8eaf0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; position: sticky; top: 0; background: #fff; z-index: 1; border-radius: 20px 20px 0 0; }
        .cp-modal-title { font-size: 17px; font-weight: 700; color: #0f1117; letter-spacing: -.3px; }
        .cp-modal-sub { font-size: 12px; color: #7c8099; margin-top: 3px; }
        .cp-modal-body { padding: 20px 24px; }
        .cp-modal-footer { padding: 14px 24px; border-top: 1px solid #e8eaf0; display: flex; justify-content: flex-end; gap: 8px; }

        /* Form */
        .cp-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 480px) { .cp-form-grid { grid-template-columns: 1fr; } }
        .cp-form-full { grid-column: 1 / -1; }
        .cp-field { display: flex; flex-direction: column; gap: 5px; }
        .cp-field label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #7c8099; }
        .cp-field label .req { color: #e11d48; margin-left: 2px; }
        .cp-input { padding: 9px 12px; border: 1.5px solid #e8eaf0; border-radius: 9px; font-family: 'Sora', sans-serif; font-size: 13px; color: #0f1117; background: #fff; outline: none; transition: border-color .15s, box-shadow .15s; width: 100%; }
        .cp-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,.1); }
        .cp-textarea { resize: vertical; min-height: 72px; }

        /* Bulk */
        .cp-step-label { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .cp-step-num { display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: #1e2130; color: #fff; font-size: 11px; font-weight: 700; flex-shrink: 0; }
        .cp-step-title { font-size: 13px; font-weight: 700; color: #0f1117; }
        .cp-tabs { display: flex; border: 1.5px solid #e8eaf0; border-radius: 9px; overflow: hidden; background: #f6f7fb; padding: 3px; gap: 3px; max-width: 260px; margin-bottom: 14px; }
        .cp-tab { flex: 1; padding: 6px 10px; border: none; border-radius: 7px; font-family: 'Sora', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; background: transparent; color: #7c8099; }
        .cp-tab.active { background: #fff; color: #0f1117; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
        .cp-status { border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 500; margin-top: 4px; }
        .cp-status.success { background: #f0fdf4; color: #15803d; border: 1px solid #bbf7d0; }
        .cp-status.error { background: #fff1f3; color: #be123c; border: 1px solid #fecdd3; }
        .cp-status.info { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
        .cp-upload-btn { display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border-radius: 9px; font-family: 'Sora', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; border: 1.5px dashed #94a3b8; background: #f8fafc; color: #3d4155; transition: all .15s; }
        .cp-upload-btn:hover { border-color: #2563eb; background: #eff4ff; color: #2563eb; }
        .cp-preview-table-wrap { max-height: 180px; overflow-y: auto; border-radius: 8px; border: 1px solid #e8eaf0; }
        .cp-preview-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .cp-preview-table thead th { padding: 7px 10px; background: #f6f7fb; font-weight: 700; color: #7c8099; text-align: left; border-bottom: 1px solid #e8eaf0; white-space: nowrap; position: sticky; top: 0; }
        .cp-preview-table tbody td { padding: 6px 10px; border-bottom: 1px solid #f0f1f5; color: #3d4155; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cp-info-tooltip { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 300; pointer-events: none; }
        .cp-info-box { background: #fff; border: 1px solid #e8eaf0; border-radius: 14px; padding: 18px; width: 420px; box-shadow: 0 16px 48px rgba(0,0,0,.15); pointer-events: auto; }
        .cp-warn { background: #fffbeb; border: 1px solid #fde68a; border-radius: 9px; padding: 10px 14px; font-size: 12px; color: #92400e; }
        .cp-paste-placeholder { border: 1.5px dashed #cbd5e1; border-radius: 10px; overflow: hidden; cursor: text; transition: border-color .15s; }
        .cp-paste-placeholder:hover { border-color: #2563eb; }
        .cp-paste-ph-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .cp-paste-ph-table th { padding: 8px 10px; background: #f6f7fb; font-weight: 700; color: #94a3b8; text-align: left; border-right: 1px solid #e8eaf0; }
        .cp-paste-ph-table td { padding: 7px 10px; color: #cbd5e1; font-style: italic; border-top: 1px solid #f0f1f5; border-right: 1px solid #f0f1f5; }
        .cp-paste-ph-footer { border-top: 1px solid #e8eaf0; background: #f8fafc; padding: 8px 12px; text-align: center; font-size: 11px; color: #94a3b8; }
        .cp-paste-ph-footer kbd { background: #e8eaf0; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
      `}</style>

      <div className="cp-wrap">
        <div className="cp-layout">

          {/* ════ SIDEBAR: Categories ════ */}
          <aside>
            <div className="cp-panel">
              <div className="cp-sb-header">
                <span className="cp-sb-title">Categories</span>
                <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={openCreateCategory}>
                  <Icon.plus /> New
                </button>
              </div>
              <div className="cp-cat-list">
                {!contactCategories.length && !dashboardLoading && (
                  <div className="cp-empty">No categories yet.</div>
                )}
                {contactCategories.map((cat, idx) => {
                  const col = CAT_COLORS[idx % 6];
                  return (
                    <div key={cat._id} className="cp-cat-card">
                      <div className="cp-cat-top">
                        <div className="cp-cat-name">
                          <span className="cp-cat-dot" style={{ background: col.dot }} />
                          <span>{cat.name}</span>
                        </div>
                        <div className="cp-cat-actions">
                          <button
                            className="cp-btn-icon" title="Edit"
                            onClick={() => openEditCategory(cat)}
                            disabled={busy === `update-contact-category-${cat._id}`}
                          ><Icon.edit /></button>
                          <button
                            className="cp-btn-icon danger" title="Delete"
                            onClick={() => deleteContactCategory(cat)}
                            disabled={busy === `delete-contact-category-${cat._id}`}
                          ><Icon.trash /></button>
                        </div>
                      </div>
                      <div className="cp-cat-desc">{cat.description || "No description."}</div>
                      <div className="cp-cat-count" style={{ color: col.text }}>
                        {categoryUsage.get(cat._id) || 0} contacts
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* ════ MAIN: Contacts ════ */}
          <main>
            <div className="cp-panel">
              {/* Header */}
              <div className="cp-main-header">
                <span className="cp-main-title">All Contacts</span>
                <span className="cp-count">{filteredContacts.length}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                  <button
                    className="cp-btn cp-btn-dark cp-btn-sm"
                    onClick={() => {
                      setShowBulkPopup(true); setBulkStatus(""); setExcelPreview(null); setExcelPasteText("");
                      if (!bulkDefaultCategory && contactCategories.length) setBulkDefaultCategory(contactCategories[0]._id);
                    }}
                  >📦 Bulk Insert</button>
                  <button className="cp-btn cp-btn-primary cp-btn-sm" onClick={() => setShowAddPopup(true)}>
                    <Icon.plus /> Add Contact
                  </button>
                </div>
              </div>

              {/* Toolbar */}
              <div className="cp-toolbar">
                <div className="cp-search-wrap">
                  <span className="cp-search-icon"><Icon.search /></span>
                  <input className="cp-search" placeholder="Search name, phone, email…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
                </div>
                <select className="cp-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="">All categories</option>
                  {contactCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                </select>
                <select className="cp-select" value={filterState} onChange={(e) => { setFilterState(e.target.value); setFilterDistrict(""); }}>
                  <option value="">All states</option>
                  {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select className="cp-select" value={filterDistrict} onChange={(e) => setFilterDistrict(e.target.value)}>
                  <option value="">All districts</option>
                  {districtOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {(searchQuery || filterCategory || filterState || filterDistrict) && (
                  <button
                    style={{ background: "none", border: "none", fontSize: 12, color: "#7c8099", cursor: "pointer", fontFamily: "'Sora', sans-serif" }}
                    onClick={() => { setSearchQuery(""); setFilterCategory(""); setFilterState(""); setFilterDistrict(""); }}
                  >✕ Clear</button>
                )}
                <div className="cp-view-toggle">
                  <button className={`cp-view-btn ${activeView === "table" ? "active" : ""}`} onClick={() => setActiveView("table")}>☰</button>
                  <button className={`cp-view-btn ${activeView === "cards" ? "active" : ""}`} onClick={() => setActiveView("cards")}>⊞</button>
                </div>
              </div>

              {/* Content */}
              {filteredContacts.length === 0 && !dashboardLoading ? (
                <div style={{ padding: "56px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                  <div style={{ color: "#7c8099", fontSize: 13 }}>
                    {contacts.length === 0 ? "No contacts yet. Add your first contact!" : "No contacts match the current filters."}
                  </div>
                </div>
              ) : activeView === "table" ? (
                <div className="cp-table-wrap">
                  <table className="cp-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Mobile</th>
                        <th>Category</th>
                        <th>State</th>
                        <th>District</th>
                        <th>Address</th>
                        <th>Email</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredContacts.map((item, idx) => {
                        const catIdx = contactCategories.findIndex(c => c._id === item.contactCategory?._id);
                        const col = CAT_COLORS[catIdx % 6] || CAT_COLORS[0];
                        return (
                          <tr key={item._id}>
                            <td><span className="cp-td-name">{item.name || item.contactName || "—"}</span></td>
                            <td><span className="cp-td-mono">{item.mobile || <span className="cp-td-muted">—</span>}</span></td>
                            <td>
                              {item.contactCategory
                                ? <span className="cp-pill" style={{ background: col.bg, color: col.text }}><span className="cp-pill-dot" style={{ background: col.dot }} />{item.contactCategory.name}</span>
                                : <span className="cp-td-muted">—</span>}
                            </td>
                            <td>{item.state || <span className="cp-td-muted">—</span>}</td>
                            <td>{item.district || <span className="cp-td-muted">—</span>}</td>
                            <td style={{ maxWidth: 180 }}>
                              <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 12, color: "#7c8099" }}>
                                {item.address || <span className="cp-td-muted">—</span>}
                              </span>
                            </td>
                            <td style={{ fontSize: 12 }}>{item.email || <span className="cp-td-muted">—</span>}</td>
                            <td>
                              <button
                                className="cp-del-btn"
                                onClick={() => deleteContact(item)}
                                disabled={busy === `delete-contact-${item._id}`}
                              >
                                <Icon.trash />
                                {busy === `delete-contact-${item._id}` ? "..." : "Delete"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="cp-cards">
                  {filteredContacts.map((item) => {
                    const catIdx = contactCategories.findIndex(c => c._id === item.contactCategory?._id);
                    const col = CAT_COLORS[catIdx % 6] || CAT_COLORS[0];
                    const initials = (item.name || item.contactName || "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
                    return (
                      <div key={item._id} className="cp-card">
                        <div className="cp-card-top">
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                            <div className="cp-avatar" style={{ background: col.bg, color: col.text }}>{initials}</div>
                            <div style={{ minWidth: 0 }}>
                              <div className="cp-card-name">{item.name || item.contactName}</div>
                              {item.contactCategory && (
                                <span className="cp-pill" style={{ background: col.bg, color: col.text, marginTop: 4, display: "inline-flex" }}>
                                  <span className="cp-pill-dot" style={{ background: col.dot }} />{item.contactCategory.name}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            className="cp-btn-icon danger"
                            onClick={() => deleteContact(item)}
                            disabled={busy === `delete-contact-${item._id}`}
                            title="Delete"
                          ><Icon.trash /></button>
                        </div>
                        <div className="cp-card-details">
                          <div className="cp-card-row"><Icon.phone /><span className="cp-td-mono" style={{ color: "#3d4155" }}>{item.mobile}</span></div>
                          {item.email && <div className="cp-card-row"><Icon.mail /><span style={{ fontSize: 12 }}>{item.email}</span></div>}
                          {(item.district || item.state) && (
                            <div className="cp-card-row"><Icon.pin /><span>{[item.district, item.state].filter(Boolean).join(", ")}</span></div>
                          )}
                          {item.address && <div className="cp-card-row" style={{ alignItems: "flex-start" }}><Icon.pin /><span style={{ lineHeight: 1.4 }}>{item.address}</span></div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* ════ CATEGORY MODAL ════ */}
        {showCategoryPopup && (
          <div className="cp-overlay" onClick={() => setShowCategoryPopup(false)}>
            <div className="cp-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
              <div className="cp-modal-header">
                <div>
                  <div className="cp-modal-title">{editingCategory ? "Edit Category" : "New Category"}</div>
                  <div className="cp-modal-sub">Organise your contacts with named categories.</div>
                </div>
                <button className="cp-btn-icon" onClick={() => setShowCategoryPopup(false)}><Icon.close /></button>
              </div>
              <form onSubmit={onSubmitCategory}>
                <div className="cp-modal-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div className="cp-field">
                      <label>Category Name <span className="req">*</span></label>
                      <input
                        className="cp-input" placeholder="e.g. Distributors"
                        value={categoryForm.name}
                        onChange={(e) => setCategoryForm((p) => ({ ...p, name: e.target.value }))}
                        required
                      />
                    </div>
                    <div className="cp-field">
                      <label>Description</label>
                      <textarea
                        className="cp-input cp-textarea" placeholder="Short description (optional)"
                        value={categoryForm.description}
                        onChange={(e) => setCategoryForm((p) => ({ ...p, description: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
                <div className="cp-modal-footer">
                  <button type="button" className="cp-btn cp-btn-ghost" onClick={() => setShowCategoryPopup(false)}>Cancel</button>
                  <button
                    type="submit" className="cp-btn cp-btn-primary"
                    disabled={busy === "create-contact-category" || (editingCategory && busy === `update-contact-category-${editingCategory._id}`)}
                  >
                    {busy === "create-contact-category" || (editingCategory && busy === `update-contact-category-${editingCategory._id}`)
                      ? "Saving…" : editingCategory ? "Update Category" : "Create Category"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════ ADD CONTACT MODAL ════ */}
        {showAddPopup && (
          <div className="cp-overlay" onClick={() => setShowAddPopup(false)}>
            <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
              <div className="cp-modal-header">
                <div>
                  <div className="cp-modal-title">Add Contact</div>
                  <div className="cp-modal-sub">Fill in the details to create a new contact record.</div>
                </div>
                <button className="cp-btn-icon" onClick={() => setShowAddPopup(false)}><Icon.close /></button>
              </div>

              {!contactCategories.length && (
                <div className="cp-modal-body" style={{ paddingBottom: 0 }}>
                  <div className="cp-warn">⚠️ Add at least one contact category first before adding a contact.</div>
                </div>
              )}

              <form onSubmit={onSubmit}>
                <div className="cp-modal-body">
                  <div className="cp-form-grid">
                    <div className="cp-field">
                      <label>Name <span className="req">*</span></label>
                      <input className="cp-input" placeholder="e.g. ABC Traders" value={form.name} onChange={F("name")} required />
                    </div>
                    <div className="cp-field">
                      <label>Mobile <span className="req">*</span></label>
                      <input className="cp-input" placeholder="+91 98765 43210" value={form.mobile} onChange={F("mobile")} required />
                    </div>
                    <div className="cp-field">
                      <label>Email</label>
                      <input className="cp-input" type="email" placeholder="contact@example.com" value={form.email} onChange={F("email")} />
                    </div>
                    <div className="cp-field">
                      <label>Category <span className="req">*</span></label>
                      <select className="cp-input" value={form.contactCategory} onChange={F("contactCategory")} required>
                        <option value="">Select category</option>
                        {contactCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className="cp-field">
                      <label>State</label>
                      <input className="cp-input" placeholder="e.g. Maharashtra" value={form.state} onChange={F("state")} />
                    </div>
                    <div className="cp-field">
                      <label>District</label>
                      <input className="cp-input" placeholder="e.g. Mumbai" value={form.district} onChange={F("district")} />
                    </div>
                    <div className="cp-field cp-form-full">
                      <label>Address</label>
                      <input className="cp-input" placeholder="Full street address" value={form.address} onChange={F("address")} />
                    </div>
                  </div>
                </div>
                <div className="cp-modal-footer">
                  <button type="button" className="cp-btn cp-btn-ghost" onClick={() => setShowAddPopup(false)}>Cancel</button>
                  <button type="submit" className="cp-btn cp-btn-primary" disabled={busy === "create-contact" || !contactCategories.length}>
                    {busy === "create-contact" ? "Saving…" : "Save Contact"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════ BULK INSERT MODAL ════ */}
        {showBulkPopup && (
          <div className="cp-overlay" onClick={() => setShowBulkPopup(false)}>
            <div className="cp-modal cp-modal-xl" onClick={(e) => e.stopPropagation()}>
              <div className="cp-modal-header">
                <div>
                  <div className="cp-modal-title">Bulk Insert Contacts</div>
                  <div className="cp-modal-sub">Import multiple contacts from Excel, CSV, or JSON</div>
                </div>
                <button className="cp-btn-icon" onClick={() => setShowBulkPopup(false)}><Icon.close /></button>
              </div>

              <div className="cp-modal-body" style={{ display: "flex", flexDirection: "column", gap: 22 }}>

                {/* Step 1 — Category */}
                <div>
                  <div className="cp-step-label">
                    <span className="cp-step-num">1</span>
                    <span className="cp-step-title">Select Default Category</span>
                    <button
                      type="button"
                      style={{
                        width: 20, height: 20, borderRadius: "50%", border: "1.5px solid #cbd5e1",
                        background: showFormatInfo ? "#eff4ff" : "#fff", color: showFormatInfo ? "#2563eb" : "#94a3b8",
                        fontSize: 11, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center",
                      }}
                      onMouseEnter={() => setShowFormatInfo(true)}
                    >i</button>
                  </div>
                  <select className="cp-input" style={{ maxWidth: 320 }} value={bulkDefaultCategory} onChange={(e) => setBulkDefaultCategory(e.target.value)}>
                    <option value="">Choose a category for all records</option>
                    {contactCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Step 2 — Upload */}
                <div>
                  <div className="cp-step-label">
                    <span className="cp-step-num">2</span>
                    <span className="cp-step-title">Upload Your Data</span>
                  </div>

                  {/* Tabs */}
                  <div className="cp-tabs">
                    <button type="button" className={`cp-tab ${bulkTab === "excel" ? "active" : ""}`} onClick={() => setBulkTab("excel")}>📊 Excel / CSV</button>
                    <button type="button" className={`cp-tab ${bulkTab === "json" ? "active" : ""}`} onClick={() => setBulkTab("json")}>{"{}"} JSON</button>
                  </div>

                  {/* ── Excel Tab ── */}
                  {bulkTab === "excel" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                        <label className="cp-upload-btn">
                          <Icon.upload /> Upload Excel / CSV
                          <input type="file" accept=".xlsx,.xls,.csv,.ods" className="hidden" style={{ display: "none" }} onChange={onExcelUpload} disabled={busy === "bulk-contact-json"} />
                        </label>
                        <button type="button" className="cp-btn cp-btn-ghost cp-btn-sm" onClick={downloadSampleExcel}>
                          <Icon.download /> Sample Excel
                        </button>
                      </div>

                      {/* File preview */}
                      {excelPreview && (
                        <div style={{ borderRadius: 12, border: "1px solid #bbf7d0", background: "#f0fdf4", padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#15803d" }}>
                              📄 {excelPreview.fileName} <span style={{ fontWeight: 400, color: "#16a34a" }}>({excelPreview.rowCount} rows)</span>
                            </span>
                            <button type="button" style={{ fontSize: 12, color: "#15803d", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }} onClick={() => setExcelPreview(null)}>Clear</button>
                          </div>
                          <div className="cp-preview-table-wrap">
                            <table className="cp-preview-table">
                              <thead>
                                <tr>
                                  <th>#</th>
                                  {Object.keys(excelPreview.items[0] || {}).slice(0, 7).map((k) => (
                                    <th key={k}>{DISPLAY_LABELS[k] || k}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {excelPreview.items.slice(0, 5).map((row, i) => (
                                  <tr key={i}>
                                    <td style={{ color: "#94a3b8" }}>{i + 1}</td>
                                    {Object.values(row).slice(0, 7).map((v, j) => <td key={j}>{String(v)}</td>)}
                                  </tr>
                                ))}
                                {excelPreview.rowCount > 5 && (
                                  <tr><td colSpan={99} style={{ textAlign: "center", color: "#94a3b8", padding: "6px 0" }}>…and {excelPreview.rowCount - 5} more rows</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          <button type="button" className="cp-btn cp-btn-primary cp-btn-sm" style={{ marginTop: 10 }} onClick={onExcelInsert} disabled={busy === "bulk-contact-json"}>
                            {busy === "bulk-contact-json" ? "Inserting…" : `✓ Insert ${excelPreview.rowCount} contacts`}
                          </button>
                        </div>
                      )}

                      {/* Paste from Excel */}
                      <div>
                        <p style={{ fontSize: 12, color: "#7c8099", marginBottom: 8 }}>Or paste directly from Excel (include header row):</p>
                        {!excelPasteText.trim() ? (
                          <div
                            className="cp-paste-placeholder"
                            onClick={() => { const el = document.getElementById("cp-paste-input"); if (el) el.focus(); }}
                          >
                            <table className="cp-paste-ph-table">
                              <thead><tr>{COLUMNS.map(col => <th key={col.key}>{col.label}{col.required && <span style={{ color: "#e11d48", marginLeft: 2 }}>*</span>}</th>)}</tr></thead>
                              <tbody>
                                {SAMPLE_DATA.map((row, ri) => (
                                  <tr key={ri}>{COLUMNS.map(col => <td key={col.key}>{row[col.key] || "—"}</td>)}</tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="cp-paste-ph-footer">
                              📋 Click here and press <kbd>Ctrl+V</kbd> to paste from Excel
                            </div>
                            <textarea
                              id="cp-paste-input"
                              style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
                              value={excelPasteText}
                              onChange={(e) => setExcelPasteText(e.target.value)}
                            />
                          </div>
                        ) : (
                          <div>
                            <textarea
                              className="cp-input" style={{ minHeight: 120, fontFamily: "'DM Mono', monospace", fontSize: 12, resize: "vertical" }}
                              value={excelPasteText}
                              onChange={(e) => setExcelPasteText(e.target.value)}
                              autoFocus
                            />
                            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                              <button
                                type="button" className="cp-btn cp-btn-primary cp-btn-sm"
                                disabled={busy === "bulk-contact-json"}
                                onClick={() => {
                                  try {
                                    const items = parseTsvToItems(excelPasteText);
                                    setExcelPreview({ items, fileName: "Pasted data", rowCount: items.length });
                                    setBulkStatus(`📊 Parsed ${items.length} rows. Review above and click Insert.`);
                                  } catch (err) { setBulkStatus(`❌ ${err.message}`); }
                                }}
                              >Parse & Preview</button>
                              <button type="button" className="cp-btn cp-btn-ghost cp-btn-sm" onClick={() => setExcelPasteText("")}>Clear</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── JSON Tab ── */}
                  {bulkTab === "json" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <label className="cp-upload-btn" style={{ width: "fit-content" }}>
                        📂 Upload JSON File
                        <input type="file" accept="application/json,.json" style={{ display: "none" }} onChange={onJsonUpload} disabled={busy === "bulk-contact-json"} />
                      </label>
                      <p style={{ fontSize: 12, color: "#7c8099" }}>Or paste JSON below:</p>
                      <textarea
                        className="cp-input" style={{ minHeight: 140, fontFamily: "'DM Mono', monospace", fontSize: 12, resize: "vertical" }}
                        placeholder={'[\n  { "name": "ABC Traders", "mobile": "+919876543210" },\n  { "name": "XYZ Services", "mobile": "+919876543211" }\n]'}
                        value={bulkJsonText}
                        onChange={(e) => setBulkJsonText(e.target.value)}
                      />
                      <button type="button" className="cp-btn cp-btn-primary cp-btn-sm" style={{ width: "fit-content" }} onClick={onJsonPasteSubmit} disabled={busy === "bulk-contact-json"}>
                        {busy === "bulk-contact-json" ? "Inserting…" : "Bulk Insert from JSON"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Status */}
                {bulkStatus && (
                  <div className={`cp-status ${bulkStatus.startsWith("✅") ? "success" : bulkStatus.startsWith("❌") ? "error" : "info"}`}>
                    {bulkStatus}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════ FORMAT INFO TOOLTIP ════ */}
        {showFormatInfo && (
          <div className="cp-info-tooltip" onMouseEnter={() => setShowFormatInfo(true)}>
            <div className="cp-info-box" onMouseEnter={() => setShowFormatInfo(true)} onMouseLeave={() => setShowFormatInfo(false)}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0f1117" }}>📋 Expected Data Format</span>
                <button className="cp-btn-icon" onClick={() => setShowFormatInfo(false)}><Icon.close /></button>
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid #e8eaf0" }}>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "#7c8099", fontWeight: 700 }}>Column</th>
                    <th style={{ padding: "6px 8px", textAlign: "center", color: "#7c8099", fontWeight: 700 }}>Status</th>
                    <th style={{ padding: "6px 8px", textAlign: "left", color: "#7c8099", fontWeight: 700 }}>Example</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMNS.map((col) => (
                    <tr key={col.key} style={{ borderBottom: "1px solid #f0f1f5" }}>
                      <td style={{ padding: "7px 8px", fontWeight: 600, color: "#0f1117" }}>{col.label}</td>
                      <td style={{ padding: "7px 8px", textAlign: "center" }}>
                        {col.required
                          ? <span style={{ background: "#fff1f3", color: "#e11d48", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20 }}>Required</span>
                          : <span style={{ background: "#f6f7fb", color: "#94a3b8", fontSize: 10, padding: "2px 7px", borderRadius: 20 }}>Optional</span>}
                      </td>
                      <td style={{ padding: "7px 8px", color: "#7c8099", fontFamily: "'DM Mono', monospace", fontSize: 11 }}>{SAMPLE_DATA[0][col.key] || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ marginTop: 10, fontSize: 11, color: "#7c8099", lineHeight: 1.6 }}>
                💡 Category is selected from the dropdown — no need to include it in the file. Column headers are flexible (e.g. "Phone Number", "phone", "mobile no" all map correctly).
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default Contact;