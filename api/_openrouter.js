const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

function safeJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj, null, 2));
}

async function callOpenRouter({ apiKey, model, messages }) {
  const r = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.4
    })
  });

  const txt = await r.text();
  let data;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

  if (!r.ok) {
    const err = data?.error?.message || data?.error || data || txt;
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }

  const content = data?.choices?.[0]?.message?.content ?? "";
  return content;
}

module.exports = { safeJson, callOpenRouter };
