const { safeJson, callOpenRouter, stripCodeFences } = require("./_openrouter");

module.exports = async (req, res) => {
  if (req.method !== "POST") return safeJson(res, 405, { error: "POST only" });

  try {
    const { goal, context = "", junior_results = null, mode = "" } = req.body || {};
    if (!goal) return safeJson(res, 400, { error: "Missing: goal" });

    const apiKey = process.env.OPENROUTER_KEY_WS;
    const model = process.env.MODEL_WS || "openai/gpt-4o";
    if (!apiKey) return safeJson(res, 500, { error: "Missing env: OPENROUTER_KEY_WS" });

    const isWeb = mode === "web_duo";

    const system = [
      "You are Wizz Senior (WS). You plan, delegate, and review.",
      "Be strict and structured. No fluff.",
      isWeb
        ? [
            "WEB BUILD MODE RULES:",
            "1) If junior_results is NOT provided: output ONLY valid JSON with shape: {\"tasks\":[\"...\"]} (1-3 tasks).",
            "2) If junior_results IS provided: output ONLY valid JSON with shape:",
            "{\"final_summary\":\"...\",\"files\":[{\"path\":\"index.html\",\"content\":\"...\"},{\"path\":\"styles.css\",\"content\":\"...\"},{\"path\":\"app.js\",\"content\":\"...\"}],\"files_built\":[\"index.html\",\"styles.css\",\"app.js\"]}",
            "3) Keep files minimal, modern, mobile-first. No external libraries.",
            "4) Landing page topic: Junkz Shooter game promo. Use placeholders for images/video.",
            "5) Ensure index.html links styles.css and app.js (if used)."
          ].join(" ")
        : [
            "GENERAL MODE RULES:",
            "If junior_results is NOT provided: output ONLY JSON tasks (1-3).",
            "If junior_results IS provided: output a concise final answer."
          ].join(" ")
    ].join(" ");

    const phase = junior_results ? "FINALIZE" : "PLAN";

    const user = [
      `PHASE: ${phase}`,
      `MODE: ${mode || "default"}`,
      `GOAL:\n${goal}`,
      context ? `CONTEXT:\n${context}` : "",
      junior_results ? `JUNIOR_RESULTS:\n${JSON.stringify(junior_results, null, 2)}` : ""
    ].filter(Boolean).join("\n\n");

    const content = await callOpenRouter({
      apiKey,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    // PLAN: must be JSON
    if (!junior_results) {
  let obj = null;
  try { obj = JSON.parse(stripCodeFences(content)); } catch {}
  return safeJson(res, 200, {
    agent: "WS",
    model,
    tasks: obj?.tasks || null,
    plan_raw: content
  });
}

    // FINALIZE: web mode must be JSON
    if (isWeb) {
      let obj = null;
try { obj = JSON.parse(stripCodeFences(content)); } catch (e) {
  return safeJson(res, 500, {
    error: "WS returned non-JSON in web build mode. This is a contract violation.",
    raw: content
  });
}

if (!Array.isArray(obj.files)) {
  return safeJson(res, 500, {
    error: "WS JSON missing required 'files' array.",
    raw: obj
  });
}
      return safeJson(res, 200, { agent: "WS", model, ...obj });
    }

    return safeJson(res, 200, { agent: "WS", model, final: content });
  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};