import { useState } from "react";
import { formatDate } from "../utils/formatters";

const MAX_JSON_UPLOAD_BYTES = 10 * 1024 * 1024;

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
      const parsed = JSON.parse(text);
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
      }
    } catch (error) {
      setBulkStatus(error.message);
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="space-y-6">
      <header className="glass-panel-dark flex items-center justify-between rounded-2xl px-5 py-4">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.22em] text-slate-500">Directory</p>
          <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">Businesses</h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Store business records and assign each one to a category.
          </p>
        </div>
        <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="glass-panel rounded-2xl p-5 sm:p-6">
          <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">Add Business</h2>
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

        <div className="glass-panel rounded-2xl p-5 sm:p-6">
          <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">
            Bulk Insert (JSON)
          </h2>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
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
            {bulkStatus && (
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700 sm:text-sm">
                {bulkStatus}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {businesses.map((item) => (
          <article key={item._id} className="glass-panel rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-base font-semibold text-slate-900">{item.businessName}</h3>
                <p className="mt-1 text-xs text-slate-600">{item.mobile}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {item.businessCategory?.name || "Uncategorized"} • {formatDate(item.updatedAt)}
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

        {!businesses.length && !dashboardLoading && (
          <p className="empty col-span-2">No businesses saved yet.</p>
        )}
      </div>
    </section>
  );
}

export default BusinessesPage;
