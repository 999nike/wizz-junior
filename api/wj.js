const { safeJson, callOpenRouter } = require("./_openrouter");

module.exports = async (req, res) => {
  if (req.method !== "POST") return safeJson(res, 405, { error: "POST only" });

  try {
    const { task, context = "" } = req.body || {};
    if (!task) return safeJson(res, 400, { error: "Missing: task" });

    const apiKey = process.env.OPENROUTER_KEY_WJ;
    const model = process.env.MODEL_WJ || "openai/gpt-4o-mini";
    if (!apiKey) return safeJson(res, 500, { error: "Missing env: OPENROUTER_KEY_WJ" });

    const system = [
      "You are Wizz Junior (WJ). You execute tasks quickly and precisely.",
      "No long planning. No fluff. No inventing project details.",
      "If context is missing, list assumptions and questions.",
      "When producing code, keep it minimal and usable."
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

    return safeJson(res, 200, {
      agent: "WJ",
      model,
      result: content
    });
  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};
