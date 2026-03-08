import { useState } from "react";
import { formatDate } from "../utils/formatters";

function ContactCategoriesPage({
  refreshing,
  refreshAll,
  busy,
  contactCategories,
  createContactCategory,
  deleteContactCategory,
  dashboardLoading,
}) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  async function onSubmit(e) {
    e.preventDefault();
    const ok = await createContactCategory({
      name: form.name.trim(),
      description: form.description.trim(),
    });
    if (ok) {
      setForm({ name: "", description: "" });
      setShowCreatePopup(false);
    }
  }

  return (
    <section className="space-y-6">
      <header className="glass-panel-dark flex items-center justify-between rounded-2xl px-5 py-4">
        <div>
          <p className="font-heading text-xs uppercase tracking-[0.22em] text-slate-500">Directory</p>
          <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">
            Contact Categories
          </h1>
          <p className="mt-1 text-xs text-slate-600 sm:text-sm">
            Create and manage reusable categories for contact records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-cyan"
            onClick={() => setShowCreatePopup(true)}
          >
            Add Category
          </button>
          <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {contactCategories.map((category) => (
          <article key={category._id} className="glass-panel rounded-2xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-base font-semibold text-slate-900">{category.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Updated {formatDate(category.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                className="btn-red"
                onClick={() => deleteContactCategory(category)}
                disabled={busy === `delete-contact-category-${category._id}`}
              >
                {busy === `delete-contact-category-${category._id}` ? "Deleting..." : "Delete"}
              </button>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {category.description || "No description provided."}
            </p>
          </article>
        ))}

        {!contactCategories.length && !dashboardLoading && (
          <p className="empty col-span-2">No contact categories yet.</p>
        )}
      </div>

      {showCreatePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowCreatePopup(false)}
        >
          <div
            className="glass-panel w-full max-w-lg rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-heading text-xs uppercase tracking-[0.2em] text-slate-500">Create</p>
                <h2 className="font-heading text-xl font-semibold text-slate-900">Add Category</h2>
              </div>
              <button
                type="button"
                className="btn-red"
                onClick={() => setShowCreatePopup(false)}
              >
                Close
              </button>
            </div>

            <form className="mt-4 grid gap-3" onSubmit={onSubmit}>
              <input
                className="input"
                placeholder="Category name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
              <textarea
                className="input min-h-24"
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              />
              <button className="btn-cyan w-fit" disabled={busy === "create-contact-category"}>
                {busy === "create-contact-category" ? "Saving..." : "Save Category"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default ContactCategoriesPage;
