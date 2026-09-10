const DEFAULT_FROM_ADDRESS = "METZ Website <noreply@metzengineering.co.tz>";
const DEFAULT_TO_ADDRESS = "info@metzengineering.co.tz";
const MAX_FIELD_LENGTH = 5000;
const PROVIDER_TIMEOUT_MS = 10_000;

const getEnv = (name) => {
  if (globalThis.Netlify?.env) return globalThis.Netlify.env.get(name);
  return process.env[name];
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default async (req) => {
  let payload;
  try {
    payload = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON" });
  }

  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { error: "Invalid submission" });
  }

  const honeypot = payload["bot-field"] ?? "";
  if (typeof honeypot !== "string") {
    return json(400, { error: "Invalid field value" });
  }
  // Silently accept honeypot hits before inspecting the remaining fields.
  if (honeypot.trim()) return json(200, { ok: true });

  if (
    ["name", "email", "phone", "service", "message"].some(
      (field) => payload[field] != null && typeof payload[field] !== "string",
    )
  ) {
    return json(400, { error: "Invalid field value" });
  }

  const name = (payload.name ?? "").trim();
  const email = (payload.email ?? "").trim();
  const phone = (payload.phone ?? "").trim();
  const service = (payload.service ?? "").trim();
  const message = (payload.message ?? "").trim();
  if (!name || !email || !message) {
    return json(400, { error: "Missing required fields" });
  }
  if (!isEmail(email)) {
    return json(400, { error: "Invalid email" });
  }
  if (
    [name, email, phone, service, message].some(
      (v) => v.length > MAX_FIELD_LENGTH,
    )
  ) {
    return json(400, { error: "Field too long" });
  }

  const apiKey = getEnv("RESEND_API_KEY");
  if (!apiKey) {
    console.error("RESEND_API_KEY is not set");
    return json(500, { error: "Email service not configured" });
  }

  const fromAddress = getEnv("CONTACT_FROM") || DEFAULT_FROM_ADDRESS;
  const toAddress = getEnv("CONTACT_TO") || DEFAULT_TO_ADDRESS;
  const subject = `New website inquiry — ${name}`;
  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    service ? `Service: ${service}` : null,
    "",
    "Message:",
    message,
  ].filter((line) => line !== null);
  const text = lines.join("\n");

  const html = `
    <h2>New website inquiry</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    ${phone ? `<p><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
    ${service ? `<p><strong>Service:</strong> ${escapeHtml(service)}</p>` : ""}
    <p><strong>Message:</strong></p>
    <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
  `.trim();

  let response;
  try {
    // A timeout may happen after acceptance; do not retry this POST automatically.
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: toAddress,
        reply_to: email,
        subject,
        text,
        html,
      }),
    });
  } catch {
    console.error("Resend request failed");
    return json(502, { error: "Failed to send email" });
  }

  // Release unused provider bodies without changing the known HTTP outcome.
  try {
    await response.body?.cancel();
  } catch {
    // Cleanup failure must not turn an accepted request into a retryable error.
  }

  if (!response.ok) {
    console.error("Resend error", response.status);
    return json(502, { error: "Failed to send email" });
  }

  return json(200, { ok: true });
};

export const config = {
  path: "/api/contact",
  method: ["POST"],
};
