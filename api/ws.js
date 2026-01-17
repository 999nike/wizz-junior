const { safeJson, callOpenRouter } = require("./_openrouter");

module.exports = async (req, res) => {
  if (req.method !== "POST") return safeJson(res, 405, { error: "POST only" });

  try {
    const { goal, context = "", junior_results = null } = req.body || {};
    if (!goal) return safeJson(res, 400, { error: "Missing: goal" });

    const apiKey = process.env.OPENROUTER_KEY_WS;
    const model = process.env.MODEL_WS || "openai/gpt-4o";
    if (!apiKey) return safeJson(res, 500, { error: "Missing env: OPENROUTER_KEY_WS" });

    const system = [
      "You are Wizz Senior (WS). You plan, delegate, and review.",
      "If junior_results is NOT provided: output ONLY a JSON object with 1-3 tasks.",
      "If junior_results IS provided: output a final answer plus next actions (short).",
      "Keep everything safe: prefer small steps, avoid breaking changes."
    ].join(" ");

    const phase = junior_results ? "FINALIZE" : "PLAN";

    const user = [
      `PHASE: ${phase}`,
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

    // PLAN phase must be JSON tasks (we’ll do a best-effort parse)
    if (!junior_results) {
      let tasksObj = null;
      try { tasksObj = JSON.parse(content); } catch {}
      return safeJson(res, 200, {
        agent: "WS",
        model,
        plan_raw: content,
        tasks: tasksObj?.tasks || tasksObj || null
      });
    }

    return safeJson(res, 200, {
      agent: "WS",
      model,
      final: content
    });
  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};
