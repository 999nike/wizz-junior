const { safeJson, callOpenRouter, stripCodeFences } = require("./_openrouter");

module.exports = async (req, res) => {
  if (req.method !== "POST") return safeJson(res, 405, { error: "POST only" });

  try {
    const { task, context = "", mode = "" } = req.body || {};
    if (!task) return safeJson(res, 400, { error: "Missing: task" });

    const apiKey = process.env.OPENROUTER_KEY_WJ;
    const model = process.env.MODEL_WJ || "openai/gpt-4o-mini";
    if (!apiKey) return safeJson(res, 500, { error: "Missing env: OPENROUTER_KEY_WJ" });

    const isWeb = mode === "web_duo";

    const system = [
      "You are Wizz Junior (WJ). You execute tasks quickly and precisely.",
      "No fluff. No invented project details.",
      isWeb
        ? [
            "WEB BUILD MODE:",
            "Return ONLY valid JSON with shape {\"files\":[{\"path\":\"...\",\"content\":\"...\"}],\"files_built\":[\"...\"]}.",
            "Write clean, minimal, mobile-first landing page code for Junkz Shooter.",
            "Use placeholders for images/video (do not require real assets).",
            "No external libraries."
          ].join(" ")
        : "If context is missing, list assumptions and questions. Keep output usable."
    ].join(" ");

    const user = context
      ? `TASK:\n${task}\n\nCONTEXT:\n${context}`
      : `TASK:\n${task}`;

    const content = await callOpenRouter({
      apiKey,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    if (isWeb) {
  let obj = null;

  // First parse attempt
  try {
    obj = JSON.parse(stripCodeFences(content));
  } catch {}

  // One repair attempt if needed
  if (!obj || !Array.isArray(obj.files)) {
    const repairPrompt = [
      "Return ONLY valid JSON.",
      "No prose. No markdown.",
      "Required shape:",
      "{\"files\":[{\"path\":\"index.html\",\"content\":\"...\"}],\"files_built\":[\"index.html\"]}"
    ].join(" ");

    const repaired = await callOpenRouter({
      apiKey,
      model,
      messages: [
        { role: "system", content: repairPrompt },
        { role: "user", content }
      ]
    });

    try {
      obj = JSON.parse(stripCodeFences(repaired));
    } catch {
      return safeJson(res, 500, {
        error: "WJ JSON repair failed.",
        raw: repaired
      });
    }
  }

  return safeJson(res, 200, {
    agent: "WJ",
    model,
    files: obj.files,
    files_built: obj.files_built || obj.files.map(f => f.path)
  });
}

    return safeJson(res, 200, { agent: "WJ", model, result: content });
  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};