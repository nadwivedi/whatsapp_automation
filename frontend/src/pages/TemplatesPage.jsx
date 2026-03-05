import { formatDate } from "../utils/formatters";

function TemplatesPage({
  refreshing,
  refreshAll,
  templateForm,
  setTemplateForm,
  createTemplate,
  busy,
  templates,
  dashboardLoading,
}) {
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
            className="input min-h-32"
            placeholder="Template body"
            value={templateForm.body}
            onChange={(e) => setTemplateForm((p) => ({ ...p, body: e.target.value }))}
            required
          />
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
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{template.body}</p>
          </div>
        ))}
        {templates.length === 0 && !dashboardLoading && <p className="empty col-span-2">No templates yet.</p>}
      </div>
    </section>
  );
}

export default TemplatesPage;
