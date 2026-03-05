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
  busy,
  templates,
  dashboardLoading,
  setNotice,
}) {
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

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="font-heading text-sm uppercase tracking-[0.2em] text-slate-500">Manage</p>
          <h1 className="font-heading text-3xl font-bold text-slate-900">Templates</h1>
        </div>
        <button className="btn-dark" onClick={refreshAll} disabled={refreshing}>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </header>

      <div className="glass-panel rounded-2xl p-6">
        <h2 className="font-heading text-xl font-semibold text-slate-900">Create New Template</h2>
        <form className="mt-4 space-y-3" onSubmit={createTemplate}>
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
          <button className="btn-cyan" disabled={busy === "create-template"}>
            {busy === "create-template" ? "Saving..." : "Save Template"}
          </button>
        </form>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {templates.map((template) => (
          <div key={template._id} className="glass-panel rounded-2xl p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="font-heading text-base font-semibold text-slate-900">{template.name}</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600">
                {formatDate(template.updatedAt)}
              </span>
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
        {templates.length === 0 && !dashboardLoading && <p className="empty col-span-2">No templates yet.</p>}
      </div>
    </section>
  );
}

export default TemplatesPage;
