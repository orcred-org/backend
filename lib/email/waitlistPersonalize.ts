export interface WaitlistPersonalizeFields {
  full_name: string;
  domain: string;
  degree: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "there";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function personalizeWaitlistText(
  template: string,
  entry: WaitlistPersonalizeFields,
): string {
  const tokens: Record<string, string> = {
    "{{first_name}}": firstName(entry.full_name),
    "{{name}}": entry.full_name.trim(),
    "{{domain}}": entry.domain.trim(),
    "{{degree}}": entry.degree.trim(),
  };

  let out = template;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(key).join(value);
  }
  return out;
}

export function messageToHtml(message: string): string {
  return escapeHtml(message).replace(/\n/g, "<br/>");
}
