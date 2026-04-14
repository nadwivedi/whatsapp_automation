import { useState } from "react";
import { formatDate } from "../utils/formatters";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function TemplatesPage({
  refreshing,
  refreshAll,
  templateForm,
  setTemplateForm,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  busy,
  templates,
  dashboardLoading,
  setNotice,
}) {
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editForm, setEditForm] = useState({
    name: "",
    body: "",
    mediaData: "",
    mediaFileName: "",
    mediaMimeType: "",
    mediaType: "",
    clearMedia: false,
  });

  async function handleMediaChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setNotice({ type: "error", text: "Only image/video files are allowed." });
      event.target.value = "";
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice({ type: "error", text: "Max upload size is 8MB." });
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setTemplateForm((prev) => ({
        ...prev,
        mediaData: dataUrl,
        mediaFileName: file.name,
        mediaMimeType: file.type,
        mediaType: file.type.startsWith("video/") ? "video" : "image",
      }));
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      event.target.value = "";
    }
  }

  async function handleEditMediaChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      setNotice({ type: "error", text: "Only image/video files are allowed." });
      event.target.value = "";
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice({ type: "error", text: "Max upload size is 8MB." });
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setEditForm((prev) => ({
        ...prev,
        mediaData: dataUrl,
        mediaFileName: file.name,
        mediaMimeType: file.type,
        mediaType: file.type.startsWith("video/") ? "video" : "image",
        clearMedia: false,
      }));
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      event.target.value = "";
    }
  }

  function openEditTemplate(template) {
    setEditingTemplate(template);
    setEditForm({
      name: template.name || "",
      body: template.body || "",
      mediaData: template.mediaData || "",
      mediaFileName: template.mediaFileName || "",
      mediaMimeType: template.mediaMimeType || "",
      mediaType: template.mediaType || "",
      clearMedia: false,
    });
  }

  async function submitEditTemplate(event) {
    event.preventDefault();
    if (!editingTemplate?._id) return;

    const ok = await updateTemplate(editingTemplate._id, {
      name: editForm.name.trim(),
      body: editForm.body.trim(),
      mediaData: editForm.clearMedia ? undefined : editForm.mediaData || undefined,
      mediaFileName: editForm.clearMedia ? undefined : editForm.mediaFileName || undefined,
      clearMedia: editForm.clearMedia,
    });

    if (ok) {
      setEditingTemplate(null);
    }
  }

  const filteredTemplates = templates.filter((template) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      String(template?.name || "").toLowerCase().includes(query) ||
      String(template?.body || "").toLowerCase().includes(query)
    );
  });

  return (
    <section className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start sm:items-center justify-between gap-2">
        <div>
          <p className="font-heading text-xs sm:text-sm uppercase tracking-[0.2em] text-slate-500">Manage</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">Templates</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input w-56"
            placeholder="Search templates"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button type="button" className="btn-cyan" onClick={() => setShowCreatePopup(true)}>
            Add Template
          </button>
          <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {filteredTemplates.map((template) => (
          <div key={template._id} className="glass-panel rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="font-heading text-base font-semibold text-slate-900">{template.name}</p>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                  {formatDate(template.updatedAt)}
                </span>
                <button
                  type="button"
                  className="btn-dark"
                  onClick={() => openEditTemplate(template)}
                  disabled={busy === `update-template-${template._id}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-red"
                  onClick={() => deleteTemplate(template)}
                  disabled={busy === `delete-template-${template._id}`}
                >
                  {busy === `delete-template-${template._id}` ? "..." : "Delete"}
                </button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{template.body || "No text caption"}</p>
            {template.mediaData && (
              <div className="mt-3">
                {template.mediaType === "video" ? (
                  <video src={template.mediaData} controls className="max-h-44 rounded-lg" />
                ) : (
                  <img src={template.mediaData} alt={template.name} className="max-h-44 rounded-lg" />
                )}
              </div>
            )}
          </div>
        ))}
        {filteredTemplates.length === 0 && !dashboardLoading && (
          <p className="empty col-span-2">
            {searchQuery.trim() ? "No templates match your search." : "No templates yet."}
          </p>
        )}
      </div>

      {showCreatePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowCreatePopup(false)}
        >
          <div
            className="glass-panel w-full max-w-2xl rounded-2xl p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">Create New Template</h2>
                <p className="text-xs text-slate-500 sm:text-sm">Add text, variables, and optional media.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
                onClick={() => setShowCreatePopup(false)}
                aria-label="Close create template popup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form
              className="space-y-3"
              onSubmit={async (e) => {
                const ok = await createTemplate(e);
                if (ok) {
                  setShowCreatePopup(false);
                }
              }}
            >
              <input
                className="input"
                placeholder="Template name"
                value={templateForm.name}
                onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
              <textarea
                className="input min-h-32 border-black"
                placeholder="Template body"
                value={templateForm.body}
                onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))}
              />
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs text-cyan-900">
                <p className="font-semibold mb-2">Insert Variables (Click to add)</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded bg-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-900 hover:bg-cyan-300 transition-colors" onClick={() => setTemplateForm(p => ({...p, body: p.body + "{{name}}"}))}>{"{{name}}"}</button>
                  <button type="button" className="rounded bg-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-900 hover:bg-cyan-300 transition-colors" onClick={() => setTemplateForm(p => ({...p, body: p.body + "{{first_name}}"}))}>{"{{first_name}}"}</button>
                  <button type="button" className="rounded bg-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-900 hover:bg-cyan-300 transition-colors" onClick={() => setTemplateForm(p => ({...p, body: p.body + "{{business_name}}"}))}>{"{{business_name}}"}</button>
                  <button type="button" className="rounded bg-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-900 hover:bg-cyan-300 transition-colors" onClick={() => setTemplateForm(p => ({...p, body: p.body + "{Hi|Hello|Hey}"}))}>Greeting: {"{Hi|Hello|Hey}"}</button>
                </div>
              </div>
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 16V4" />
                  <path d="M7 9l5-5 5 5" />
                  <path d="M20 16.5v1.5A2 2 0 0 1 18 20H6a2 2 0 0 1-2-2v-1.5" />
                </svg>
                Upload Image/Video
                <input
                  className="hidden"
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleMediaChange}
                />
              </label>
              {templateForm.mediaData && (
                <div className="rounded-xl border border-white/70 bg-white/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      Attached: <span className="font-semibold">{templateForm.mediaFileName}</span>
                    </p>
                    <button
                      type="button"
                      className="btn-red"
                      onClick={() =>
                        setTemplateForm((p) => ({
                          ...p,
                          mediaData: "",
                          mediaFileName: "",
                          mediaMimeType: "",
                          mediaType: "",
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  {templateForm.mediaType === "image" ? (
                    <img src={templateForm.mediaData} alt="Template media" className="max-h-40 rounded-lg" />
                  ) : (
                    <video src={templateForm.mediaData} controls className="max-h-40 rounded-lg" />
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-dark" onClick={() => setShowCreatePopup(false)}>
                  Cancel
                </button>
                <button className="btn-cyan" disabled={busy === "create-template"}>
                  {busy === "create-template" ? "Saving..." : "Save Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setEditingTemplate(null)}
        >
          <div
            className="glass-panel w-full max-w-2xl rounded-2xl p-4 sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold text-slate-900 sm:text-xl">Edit Template</h2>
                <p className="text-xs text-slate-500 sm:text-sm">Update text, variables, or media.</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
                onClick={() => setEditingTemplate(null)}
                aria-label="Close edit template popup"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form className="space-y-3" onSubmit={submitEditTemplate}>
              <input
                className="input"
                placeholder="Template name"
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
              <textarea
                className="input min-h-32 border-black"
                placeholder="Template body"
                value={editForm.body}
                onChange={(e) => setEditForm((prev) => ({ ...prev, body: e.target.value }))}
              />
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs text-cyan-900">
                <p className="font-semibold mb-2">Insert Variables (Click to add)</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded bg-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-900 hover:bg-cyan-300 transition-colors" onClick={() => setEditForm(p => ({...p, body: p.body + "{{name}}"}))}>{"{{name}}"}</button>
                  <button type="button" className="rounded bg-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-900 hover:bg-cyan-300 transition-colors" onClick={() => setEditForm(p => ({...p, body: p.body + "{{first_name}}"}))}>{"{{first_name}}"}</button>
                  <button type="button" className="rounded bg-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-900 hover:bg-cyan-300 transition-colors" onClick={() => setEditForm(p => ({...p, body: p.body + "{{business_name}}"}))}>{"{{business_name}}"}</button>
                  <button type="button" className="rounded bg-cyan-200 px-2 py-1 text-[11px] font-medium text-cyan-900 hover:bg-cyan-300 transition-colors" onClick={() => setEditForm(p => ({...p, body: p.body + "{Hi|Hello|Hey}"}))}>Greeting: {"{Hi|Hello|Hey}"}</button>
                </div>
              </div>
              <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-slate-900 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 16V4" />
                  <path d="M7 9l5-5 5 5" />
                  <path d="M20 16.5v1.5A2 2 0 0 1 18 20H6a2 2 0 0 1-2-2v-1.5" />
                </svg>
                Replace Image/Video
                <input
                  className="hidden"
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleEditMediaChange}
                />
              </label>
              {(editForm.mediaData && !editForm.clearMedia) && (
                <div className="rounded-xl border border-white/70 bg-white/70 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-600">
                      Attached: <span className="font-semibold">{editForm.mediaFileName || "Existing media"}</span>
                    </p>
                    <button
                      type="button"
                      className="btn-red"
                      onClick={() =>
                        setEditForm((prev) => ({
                          ...prev,
                          mediaData: "",
                          mediaFileName: "",
                          mediaMimeType: "",
                          mediaType: "",
                          clearMedia: true,
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  {editForm.mediaType === "video" ? (
                    <video src={editForm.mediaData} controls className="max-h-40 rounded-lg" />
                  ) : (
                    <img src={editForm.mediaData} alt="Template media" className="max-h-40 rounded-lg" />
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-dark" onClick={() => setEditingTemplate(null)}>
                  Cancel
                </button>
                <button className="btn-cyan" disabled={busy === `update-template-${editingTemplate._id}`}>
                  {busy === `update-template-${editingTemplate._id}` ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default TemplatesPage;
