import { useState } from "react";
import BusinessesPage from "./BusinessesPage";

function Contact({
  contactCategories = [],
  contacts = [],
  createContact,
  bulkInsertContacts,
  deleteContact,
  createContactCategory,
  deleteContactCategory,
  busy = "",
  ...rest
}) {
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "" });

  async function onCreateCategory(event) {
    event.preventDefault();
    const ok = await createContactCategory({
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim(),
    });
    if (ok) {
      setCategoryForm({ name: "", description: "" });
      setShowCreateCategory(false);
    }
  }

  return (
    <section className="space-y-4 sm:space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-heading text-xs uppercase tracking-[0.22em] text-slate-500">Directory</p>
            <h1 className="font-heading text-2xl font-bold text-slate-900 sm:text-3xl">Contacts</h1>
            <p className="mt-1 text-xs text-slate-600 sm:text-sm">
              Manage contacts and categories in one place.
            </p>
          </div>
          <button
            type="button"
            className="btn-cyan"
            onClick={() => setShowCreateCategory(true)}
          >
            Add Category
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {contactCategories.map((category) => (
            <div
              key={category._id}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              <span className="max-w-[11rem] truncate font-medium">{category.name}</span>
              <button
                type="button"
                className="text-rose-600 hover:text-rose-700"
                onClick={() => deleteContactCategory(category)}
                disabled={busy === `delete-contact-category-${category._id}`}
                title="Delete category"
              >
                {busy === `delete-contact-category-${category._id}` ? "..." : "x"}
              </button>
            </div>
          ))}
          {!contactCategories.length && (
            <p className="text-xs text-slate-500">No categories yet. Add one to start organizing contacts.</p>
          )}
        </div>
      </div>

      <BusinessesPage
        {...rest}
        businessCategories={contactCategories}
        businesses={contacts}
        createBusiness={createContact}
        bulkInsertBusinesses={bulkInsertContacts}
        deleteBusiness={deleteContact}
      />

      {showCreateCategory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowCreateCategory(false)}
        >
          <div
            className="glass-panel w-full max-w-lg rounded-2xl p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold text-slate-900">Create Contact Category</h2>
              <button type="button" className="btn-red" onClick={() => setShowCreateCategory(false)}>
                Close
              </button>
            </div>
            <form className="mt-4 grid gap-3" onSubmit={onCreateCategory}>
              <input
                className="input"
                placeholder="Category name"
                value={categoryForm.name}
                onChange={(event) => setCategoryForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
              <textarea
                className="input min-h-24"
                placeholder="Description (optional)"
                value={categoryForm.description}
                onChange={(event) =>
                  setCategoryForm((prev) => ({ ...prev, description: event.target.value }))
                }
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

export default Contact;
