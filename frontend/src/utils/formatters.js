export function formatDate(value) {
  if (!value) return "--";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function formatDateTime(value) {
  if (!value) return { date: "--", time: "--" };
  const date = new Date(value);
  return {
    date: date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    time: date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

export function countRecipients(input) {
  return input
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean).length;
}
