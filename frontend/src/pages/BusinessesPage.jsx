import { useMemo, useState } from "react";
import { formatDate } from "../utils/formatters";

const MAX_JSON_UPLOAD_BYTES = 10 * 1024 * 1024;

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

function BusinessesPage({
  refreshing,
  refreshAll,
  busy,
  businessCategories,
  businesses,
  createBusiness,
  bulkInsertBusinesses,
  deleteBusiness,
  dashboardLoading,
}) {
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [showBulkPopup, setShowBulkPopup] = useState(false);
  const [form, setForm] = useState({
    businessName: "",
    mobile: "",
    email: "",
    state: "",
    district: "",
    pincode: "",
    address: "",
    businessCategory: "",
  });
  const [bulkDefaultCategory, setBulkDefaultCategory] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkJsonText, setBulkJsonText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");

  const stateOptions = useMemo(
    () => uniqueValues(businesses.map((item) => item.state)),
    [businesses],
  );

  const districtOptions = useMemo(() => {
    const source = filterState
      ? businesses.filter(
          (item) => String(item.state || "").trim().toLowerCase() === filterState.toLowerCase(),
        )
      : businesses;
    return uniqueValues(source.map((item) => item.district));
  }, [businesses, filterState]);

  const filteredBusinesses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return businesses.filter((item) => {
      const businessName = String(item.businessName || "");
      const categoryName = String(item.businessCategory?.name || "");
      const state = String(item.state || "");
      const district = String(item.district || "");

      const matchesSearch =
        !query ||
        businessName.toLowerCase().includes(query) ||
        categoryName.toLowerCase().includes(query);
      const matchesCategory = !filterCategory || item.businessCategory?._id === filterCategory;
      const matchesState = !filterState || state.trim().toLowerCase() === filterState.toLowerCase();
      const matchesDistrict =
        !filterDistrict || district.trim().toLowerCase() === filterDistrict.toLowerCase();

      return matchesSearch && matchesCategory && matchesState && matchesDistrict;
    });
  }, [businesses, filterCategory, filterDistrict, filterState, searchQuery]);

  async function onSubmit(e) {
    e.preventDefault();
    const ok = await createBusiness({
      businessName: form.businessName.trim(),
      mobile: form.mobile.trim(),
      email: form.email.trim(),
      state: form.state.trim(),
      district: form.district.trim(),
      pincode: form.pincode.trim(),
      address: form.address.trim(),
      businessCategory: form.businessCategory,
    });
    if (ok) {
      setForm({
        businessName: "",
        mobile: "",
        email: "",
        state: "",
        district: "",
        pincode: "",
        address: "",
        businessCategory: "",
      });
      setShowAddPopup(false);
    }
  }

  async function onBulkJsonUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      if (file.size > MAX_JSON_UPLOAD_BYTES) {
        throw new Error("JSON file too large. Max size is 10MB.");
      }

      const text = await file.text();
      await submitBulkFromText(text);
    } catch (error) {
      setBulkStatus(error.message);
    } finally {
      event.target.value = "";
    }
  }

  async function submitBulkFromText(rawJson) {
    const parsed = JSON.parse(rawJson);
    const items = Array.isArray(parsed) ? parsed : parsed?.items;
    if (!Array.isArray(items)) {
      throw new Error("JSON must be an array or an object containing an 'items' array.");
    }

    const payload = {
      items,
      ...(bulkDefaultCategory ? { defaultCategory: bulkDefaultCategory } : {}),
    };
    const response = await bulkInsertBusinesses(payload);
    if (response?.insertedCount != null) {
      setBulkStatus(`Inserted ${response.insertedCount} businesses.`);
      setBulkJsonText("");
      setShowBulkPopup(false);
    }
  }

  async function onBulkJsonPasteSubmit() {
    try {
      const raw = bulkJsonText.trim();
      if (!raw) {
        throw new Error("Please paste JSON data first.");
      }
      await submitBulkFromText(raw);
    } catch (error) {
      setBulkStatus(error.message);
    }
  }

  function clearFilters() {
    setSearchQuery("");
    setFilterCategory("");
    setFilterState("");
    setFilterDistrict("");
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <header className="glass-panel-dark flex flex-wrap items-start sm:items-center justify-between gap-2 rounded-2xl px-4 py-4 sm:px-5">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.22em] text-slate-500">Directory</p>
          <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">Businesses</h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Store business records and assign each one to a category.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-cyan" onClick={() => setShowAddPopup(true)}>
            Add Business
          </button>
          <button type="button" className="btn-dark" onClick={() => setShowBulkPopup(true)}>
            Bulk Insert
          </button>
          <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <div className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold text-slate-900">Search and Filters</h2>
          <p className="text-xs text-slate-600">
            Showing {filteredBusinesses.length} of {businesses.length}
          </p>
        </div>
        <div className="mt-3 grid gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            className="input xl:col-span-2"
            placeholder="Search by business name or category"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className="input"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">All categories</option>
            {businessCategories.map((category) => (
              <option key={category._id} value={category._id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            className="input"
            value={filterState}
            onChange={(e) => {
              setFilterState(e.target.value);
              setFilterDistrict("");
            }}
          >
            <option value="">All states</option>
            {stateOptions.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select
              className="input"
              value={filterDistrict}
              onChange={(e) => setFilterDistrict(e.target.value)}
            >
              <option value="">All districts</option>
              {districtOptions.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
            <button type="button" className="btn-dark whitespace-nowrap" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredBusinesses.map((item) => (
          <article key={item._id} className="glass-panel rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-base font-semibold text-slate-900">{item.businessName}</h3>
                <p className="mt-1 text-xs text-slate-600">{item.mobile}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.businessCategory?.name || "Uncategorized"} - {formatDate(item.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                className="btn-red"
                onClick={() => deleteBusiness(item)}
                disabled={busy === `delete-business-${item._id}`}
              >
                {busy === `delete-business-${item._id}` ? "Deleting..." : "Delete"}
              </button>
            </div>
            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>Email: {item.email || "--"}</p>
              <p>
                Location: {[item.district, item.state].filter(Boolean).join(", ") || "--"}
              </p>
              <p>Pincode: {item.pincode || "--"}</p>
              <p>Address: {item.address || "--"}</p>
            </div>
          </article>
        ))}

        {!filteredBusinesses.length && !dashboardLoading && businesses.length > 0 && (
          <p className="empty col-span-2">No businesses match the current search/filters.</p>
        )}
        {!businesses.length && !dashboardLoading && (
          <p className="empty col-span-2">No businesses saved yet.</p>
        )}
      </div>

      {showAddPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowAddPopup(false)}
        >
          <div
            className="glass-panel w-full max-w-3xl rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-xs uppercase tracking-[0.22em] text-slate-500">Create</p>
                <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-900">Add Business</h2>
              </div>
              <button type="button" className="btn-red" onClick={() => setShowAddPopup(false)}>
                Close
              </button>
            </div>

            {!businessCategories.length ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 sm:text-sm">
                Add at least one business category first.
              </p>
            ) : null}

            <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
              <input
                className="input"
                placeholder="Business name"
                value={form.businessName}
                onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
                required
              />
              <input
                className="input"
                placeholder="Mobile"
                value={form.mobile}
                onChange={(e) => setForm((prev) => ({ ...prev, mobile: e.target.value }))}
                required
              />
              <input
                className="input"
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
              <select
                className="input"
                value={form.businessCategory}
                onChange={(e) => setForm((prev) => ({ ...prev, businessCategory: e.target.value }))}
                required
              >
                <option value="">Select category</option>
                {businessCategories.map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                className="input"
                placeholder="State"
                value={form.state}
                onChange={(e) => setForm((prev) => ({ ...prev, state: e.target.value }))}
              />
              <input
                className="input"
                placeholder="District"
                value={form.district}
                onChange={(e) => setForm((prev) => ({ ...prev, district: e.target.value }))}
              />
              <input
                className="input"
                placeholder="Pincode"
                value={form.pincode}
                onChange={(e) => setForm((prev) => ({ ...prev, pincode: e.target.value }))}
              />
              <textarea
                className="input min-h-24 sm:col-span-2"
                placeholder="Address"
                value={form.address}
                onChange={(e) => setForm((prev) => ({ ...prev, address: e.target.value }))}
              />
              <button
                className="btn-cyan w-fit sm:col-span-2"
                disabled={busy === "create-business" || !businessCategories.length}
              >
                {busy === "create-business" ? "Saving..." : "Save Business"}
              </button>
            </form>
          </div>
        </div>
      )}

      {showBulkPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowBulkPopup(false)}
        >
          <div
            className="glass-panel w-full max-w-2xl rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-xs uppercase tracking-[0.22em] text-slate-500">Import</p>
                <h2 className="font-heading text-lg sm:text-xl font-semibold text-slate-900">Bulk Insert (JSON)</h2>
              </div>
              <button type="button" className="btn-red" onClick={() => setShowBulkPopup(false)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-600 sm:text-sm">
              Upload array of records with fields: businessName, mobile, email, state, district,
              pincode, address, businessCategory/categoryName.
            </p>
            <div className="mt-4 grid gap-3">
              <select
                className="input"
                value={bulkDefaultCategory}
                onChange={(e) => setBulkDefaultCategory(e.target.value)}
              >
                <option value="">Default category (optional)</option>
                {businessCategories.map((category) => (
                  <option key={category._id} value={category._id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                Upload JSON File
                <input
                  className="hidden"
                  type="file"
                  accept="application/json,.json"
                  onChange={onBulkJsonUpload}
                  disabled={busy === "bulk-business-json"}
                />
              </label>
              <p className="text-[11px] text-slate-600">Or paste JSON below:</p>
              <textarea
                className="input min-h-40 font-mono text-[11px]"
                placeholder='Paste JSON array here, for example: [{\"businessName\":\"ABC Traders\",\"mobile\":\"+919876543210\"}]'
                value={bulkJsonText}
                onChange={(e) => setBulkJsonText(e.target.value)}
              />
              <button
                type="button"
                className="btn-cyan w-fit"
                onClick={onBulkJsonPasteSubmit}
                disabled={busy === "bulk-business-json"}
              >
                {busy === "bulk-business-json" ? "Inserting..." : "Bulk Insert from Text"}
              </button>
              {bulkStatus && (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 sm:text-sm">
                  {bulkStatus}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default BusinessesPage;
