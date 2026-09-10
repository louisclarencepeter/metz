import assert from "node:assert/strict";
import { describe, test } from "node:test";
import handler, { config } from "../netlify/functions/contact.js";

const validInquiry = {
  name: "Synthetic Visitor",
  email: "visitor@example.test",
  phone: "+255 000 000 000",
  service: "Synthetic service",
  message: "Synthetic inquiry; never sent.",
  "bot-field": "",
};

function sandbox(t, overrides = {}) {
  const calls = [];
  const envReads = [];
  const logs = [];
  const env = {
    RESEND_API_KEY: "synthetic-secret-not-a-real-key",
    CONTACT_FROM: "Synthetic Sender <sender@example.test>",
    CONTACT_TO: "owner@example.test",
    ...overrides,
  };
  const netlifyDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Netlify");
  Object.defineProperty(globalThis, "Netlify", {
    configurable: true,
    value: {
      env: {
        get(name) {
          envReads.push(name);
          return env[name];
        },
      },
    },
  });
  t.after(() => {
    if (netlifyDescriptor) Object.defineProperty(globalThis, "Netlify", netlifyDescriptor);
    else delete globalThis.Netlify;
  });
  let transport = async () => new Response('{"id":"synthetic-message"}', { status: 200 });
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);
    return transport(...args);
  });
  t.mock.method(console, "error", (...args) => logs.push(args));
  return {
    calls,
    envReads,
    logs,
    setTransport(fn) { transport = fn; },
  };
}

function request(payload, raw = false) {
  return new Request("https://synthetic.invalid/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? payload : JSON.stringify(payload),
  });
}

async function jsonResponse(response, status) {
  assert.ok(response instanceof Response);
  assert.equal(response.status, status);
  assert.match(response.headers.get("Content-Type"), /^application\/json\b/);
  return response.json();
}

function assertNoSend(state) {
  assert.equal(state.calls.length, 0, "invalid or trapped inquiries must not send email");
}

async function providerFailure(response, state, sensitiveText) {
  const body = await jsonResponse(response, 502);
  assert.deepEqual(body, { error: "Failed to send email" });
  assert.equal(state.calls.length, 1, "an ambiguous provider failure must never retry");
  const exposed = JSON.stringify({ body, logs: state.logs });
  assert.ok(!exposed.includes(sensitiveText), "provider details must not escape into responses or logs");
  assert.ok(!exposed.includes("synthetic-secret-not-a-real-key"));
}

describe("contact handler", { concurrency: false }, () => {
  test("keeps the POST-only Netlify route", () => {
    assert.deepEqual(config, { path: "/api/contact", method: ["POST"] });
  });

  test("malformed JSON returns a controlled response without sending", async (t) => {
    const state = sandbox(t);
    await jsonResponse(await handler(request("{", true)), 400);
    assertNoSend(state);
  });

  test("JSON payload must be an object", async (t) => {
    for (const [label, payload] of [
      ["null", null], ["array", []], ["string", "inquiry"],
      ["number", 42], ["boolean", false],
    ]) {
      await t.test(label, async (t) => {
        const state = sandbox(t);
        const body = await jsonResponse(await handler(request(payload)), 400);
        assert.equal(typeof body.error, "string");
        assertNoSend(state);
      });
    }
  });

  test("each known field rejects non-string, non-null values", async (t) => {
    for (const field of Object.keys(validInquiry)) {
      await t.test(field, async (t) => {
        const state = sandbox(t);
        for (const value of [123, false, [], {}]) {
          await jsonResponse(await handler(request({ ...validInquiry, [field]: value })), 400);
        }
        assertNoSend(state);
      });
    }
  });

  test("a filled string honeypot is accepted before other fields or configuration are inspected", async (t) => {
    const state = sandbox(t, { RESEND_API_KEY: undefined });
    const payload = { name: {}, email: false, message: [], "bot-field": "  crawler  " };
    assert.deepEqual(await jsonResponse(await handler(request(payload)), 200), { ok: true });
    assertNoSend(state);
    assert.deepEqual(state.envReads, []);
  });

  test("missing and null optional values remain accepted and whitespace is trimmed", async (t) => {
    const state = sandbox(t);
    for (const optional of [{}, { phone: null, service: null, "bot-field": null }]) {
      const payload = { name: "  Synthetic Visitor  ", email: "  visitor@example.test  ", message: "  hello  ", ...optional };
      assert.deepEqual(await jsonResponse(await handler(request(payload)), 200), { ok: true });
      const sent = JSON.parse(state.calls.at(-1)[1].body);
      assert.equal(sent.reply_to, "visitor@example.test");
      assert.equal(sent.subject, "New website inquiry — Synthetic Visitor");
      assert.equal(sent.text, "Name: Synthetic Visitor\nEmail: visitor@example.test\n\nMessage:\nhello");
      assert.ok(!sent.html.includes("<strong>Phone:</strong>"));
      assert.ok(!sent.html.includes("<strong>Service:</strong>"));
    }
    assert.equal(state.calls.length, 2);
  });

  test("missing, null and blank required fields are rejected", async (t) => {
    for (const field of ["name", "email", "message"]) {
      await t.test(field, async (t) => {
        const state = sandbox(t);
        for (const value of [undefined, null, " \n "]) {
          await jsonResponse(await handler(request({ ...validInquiry, [field]: value })), 400);
        }
        assertNoSend(state);
      });
    }
  });

  test("invalid email and fields longer than 5000 trimmed characters are rejected", async (t) => {
    const state = sandbox(t);
    await jsonResponse(await handler(request({ ...validInquiry, email: "not-an-email" })), 400);
    for (const field of ["name", "email", "phone", "service", "message"]) {
      const value = field === "email" ? `${"x".repeat(4988)}@example.test` : "x".repeat(5001);
      assert.equal(value.length, 5001);
      await jsonResponse(await handler(request({ ...validInquiry, [field]: value })), 400);
    }
    assertNoSend(state);
    assert.deepEqual(await jsonResponse(await handler(request({ ...validInquiry, message: `  ${"x".repeat(5000)}  ` })), 200), { ok: true });
    assert.equal(state.calls.length, 1);
  });

  test("successful inquiries keep server-owned addressing, escaping and ignore unknown fields", async (t) => {
    const state = sandbox(t);
    const unsafe = `<img src=x onerror='bad'> & "quoted"`;
    const payload = { ...validInquiry, name: unsafe, phone: unsafe, service: unsafe, message: unsafe,
      to: "attacker@example.test", from: "attacker@example.test", reply_to: "attacker@example.test", attachments: ["ignored"] };
    assert.deepEqual(await jsonResponse(await handler(request(payload)), 200), { ok: true });
    assert.equal(state.calls.length, 1);
    const [url, options] = state.calls[0];
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(options.method, "POST");
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer synthetic-secret-not-a-real-key");
    const sent = JSON.parse(options.body);
    assert.equal(sent.from, "Synthetic Sender <sender@example.test>");
    assert.equal(sent.to, "owner@example.test");
    assert.equal(sent.reply_to, validInquiry.email);
    assert.equal(sent.subject, `New website inquiry — ${unsafe}`);
    assert.ok(sent.text.includes(unsafe));
    assert.ok(!sent.html.includes(unsafe));
    assert.equal(sent.html.split("&lt;img src=x onerror=&#39;bad&#39;&gt; &amp; &quot;quoted&quot;").length - 1, 4);
    assert.deepEqual(Object.keys(sent).sort(), ["from", "html", "reply_to", "subject", "text", "to"]);
    assert.ok(!JSON.stringify(sent).includes("attacker@example.test"));
  });

  test("default sender and recipient remain available", async (t) => {
    const state = sandbox(t, { CONTACT_FROM: undefined, CONTACT_TO: undefined });
    await jsonResponse(await handler(request(validInquiry)), 200);
    const sent = JSON.parse(state.calls[0][1].body);
    assert.equal(sent.from, "METZ Website <noreply@metzengineering.co.tz>");
    assert.equal(sent.to, "info@metzengineering.co.tz");
  });

  test("missing API configuration returns 500 without sending", async (t) => {
    const state = sandbox(t, { RESEND_API_KEY: undefined });
    await jsonResponse(await handler(request(validInquiry)), 500);
    assertNoSend(state);
  });

  test("provider HTTP errors are generic and do not log its private body", async (t) => {
    const state = sandbox(t);
    const sensitive = "PRIVATE_PROVIDER_BODY visitor@example.test synthetic-secret-not-a-real-key";
    state.setTransport(async () => new Response(sensitive, { status: 422 }));
    await providerFailure(await handler(request(validInquiry)), state, "PRIVATE_PROVIDER_BODY");
  });

  test("an unreadable provider error body cannot cause an unhandled failure", async (t) => {
    const state = sandbox(t);
    state.setTransport(async () => {
      const response = new Response("", { status: 503 });
      response.text = async () => { throw new Error("PRIVATE_BODY_READ_FAILURE"); };
      return response;
    });
    await providerFailure(await handler(request(validInquiry)), state, "PRIVATE_BODY_READ_FAILURE");
  });

  test("unused provider bodies are canceled on success and HTTP failure", async (t) => {
    const state = sandbox(t);
    let canceled = 0;
    for (const status of [200, 422]) {
      state.setTransport(async () => new Response(new ReadableStream({
        cancel() { canceled++; },
      }), { status }));
      const body = await jsonResponse(await handler(request(validInquiry)), status === 200 ? 200 : 502);
      assert.deepEqual(body, status === 200 ? { ok: true } : { error: "Failed to send email" });
    }
    assert.equal(canceled, 2);
    assert.equal(state.calls.length, 2);
  });

  test("body cancellation failure preserves acceptance or rejection without retry or private logs", async (t) => {
    const state = sandbox(t);
    let canceled = 0;
    for (const status of [200, 422]) {
      state.setTransport(async () => new Response(new ReadableStream({
        cancel() { canceled++; throw new Error("PRIVATE_CLEANUP_DETAIL"); },
      }), { status }));
      const body = await jsonResponse(await handler(request(validInquiry)), status === 200 ? 200 : 502);
      assert.deepEqual(body, status === 200 ? { ok: true } : { error: "Failed to send email" });
    }
    assert.equal(canceled, 2);
    assert.equal(state.calls.length, 2);
    assert.ok(!JSON.stringify(state.logs).includes("PRIVATE_CLEANUP_DETAIL"));
  });

  test("a rejected provider fetch returns generic 502 without retry or private exception logging", async (t) => {
    const state = sandbox(t);
    state.setTransport(async () => { throw new TypeError("PRIVATE_TRANSPORT_DETAIL synthetic-secret-not-a-real-key"); });
    await providerFailure(await handler(request(validInquiry)), state, "PRIVATE_TRANSPORT_DETAIL");
  });

  test("the ten-second provider budget aborts a waiting request and returns generic 502", async (t) => {
    const state = sandbox(t);
    const requestedBudgets = [];
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
    t.mock.method(AbortSignal, "timeout", (milliseconds) => {
      requestedBudgets.push(milliseconds);
      return nativeTimeout(5);
    });
    // Native timeout signals are unref'ed; keep this deterministic abort alive.
    const keepAlive = setTimeout(() => {}, 1000);
    t.after(() => clearTimeout(keepAlive));
    let observedSignal;
    state.setTransport(async (_url, options) => {
      observedSignal = options.signal;
      assert.ok(observedSignal instanceof AbortSignal, "provider fetch must receive its deadline signal");
      return new Promise((_resolve, reject) => {
        if (observedSignal.aborted) reject(observedSignal.reason);
        else observedSignal.addEventListener("abort", () => reject(observedSignal.reason), { once: true });
      });
    });
    await providerFailure(await handler(request(validInquiry)), state, "PRIVATE_TIMEOUT_DETAIL");
    assert.deepEqual(requestedBudgets, [10000]);
    assert.equal(observedSignal.aborted, true);
    assert.equal(observedSignal.reason.name, "TimeoutError");
  });
});
