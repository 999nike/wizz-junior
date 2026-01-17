const { safeJson } = require("./_openrouter");

async function postJson(url, payload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || JSON.stringify(data));
  return data;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return safeJson(res, 405, { error: "POST only" });

  try {
    const { goal, context = "" } = req.body || {};
    if (!goal) return safeJson(res, 400, { error: "Missing: goal" });

    const base = `https://${req.headers.host}`;

    // 1) WS plan
    const wsPlan = await postJson(`${base}/api/ws`, { goal, context });

    // Normalize tasks into array of strings
    let tasks = [];
    if (Array.isArray(wsPlan.tasks)) tasks = wsPlan.tasks;
    else if (wsPlan.tasks && typeof wsPlan.tasks === "object" && Array.isArray(wsPlan.tasks.tasks)) tasks = wsPlan.tasks.tasks;

    // If WS didn’t output clean tasks, fall back to single task = goal
    if (!tasks.length) tasks = [goal];

    // Hard limit: 3 tasks max
    tasks = tasks.slice(0, 3).map(t => (typeof t === "string" ? t : JSON.stringify(t)));

    // 2) WJ execute tasks
    const junior_results = [];
    for (let i = 0; i < tasks.length; i++) {
      const jr = await postJson(`${base}/api/wj`, { task: tasks[i], context });
      junior_results.push({ task: tasks[i], result: jr.result });
    }

    // 3) WS finalize
    const wsFinal = await postJson(`${base}/api/ws`, { goal, context, junior_results });

    return safeJson(res, 200, {
      final_answer: wsFinal.final,
      delegation_log: {
        ws_plan: wsPlan,
        tasks,
        junior_results
      }
    });
  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};
