const { safeJson } = require("./_openrouter");

async function postJson(url, payload) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  const txt = await r.text();
  let data=null; try{ data=JSON.parse(txt); }catch{ data={ raw: txt }; }
  if (!r.ok) throw new Error(data?.error || txt);
  return data;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return safeJson(res, 405, { error: "POST only" });

  try {
    const { goal, context = "", mode = "", publish = false } = req.body || {};
    if (!goal) return safeJson(res, 400, { error: "Missing: goal" });

    const base = `https://${req.headers.host}`;

    // Only run the web builder pipeline when requested
    if (mode !== "web_duo") {
      // fallback to old behavior: plan → tasks → execute → finalize
      const wsPlan = await postJson(`${base}/api/ws`, { goal, context });
      let tasks = Array.isArray(wsPlan.tasks) ? wsPlan.tasks : [];
      if (!tasks.length) tasks = [goal];
      tasks = tasks.slice(0, 3).map(t => (typeof t === "string" ? t : JSON.stringify(t)));

      const junior_results = [];
      for (const t of tasks) {
        const jr = await postJson(`${base}/api/wj`, { task: t, context });
        junior_results.push({ task: t, result: jr.result });
      }
      const wsFinal = await postJson(`${base}/api/ws`, { goal, context, junior_results });

      return safeJson(res, 200, {
        final_answer: wsFinal.final,
        delegation_log: { ws_plan: wsPlan, tasks, junior_results }
      });
    }

    // WEB BUILDER PIPELINE:
    // 1) WS plan (tasks)
    const wsPlan = await postJson(`${base}/api/ws`, { goal, context, mode: "web_duo" });

    let tasks = Array.isArray(wsPlan.tasks) ? wsPlan.tasks : [];
    if (!tasks.length) {
      // fallback: one task that tells WJ to produce the full landing page
      tasks = [`Generate a complete Junkz Shooter landing page (index.html, styles.css, app.js).`];
    }
    tasks = tasks.slice(0, 3);

    // 2) WJ executes tasks, returns files
    const junior_results = [];
    const mergedFiles = new Map(); // path -> content

    for (const t of tasks) {
      const jr = await postJson(`${base}/api/wj`, { task: t, context, mode: "web_duo" });
      junior_results.push({ task: t, files: jr.files || null, result_raw: jr.result_raw || "" });

      if (Array.isArray(jr.files)) {
        for (const f of jr.files) {
          if (f?.path && typeof f.content === "string") mergedFiles.set(f.path, f.content);
        }
      }
    }

    // 3) WS final review, must return final_summary + files
    const wsFinal = await postJson(`${base}/api/ws`, {
      goal, context, mode: "web_duo",
      junior_results: {
        tasks,
        files: Array.from(mergedFiles.entries()).map(([path, content]) => ({ path, content }))
      }
    });

    // Prefer WS-reviewed files; fallback to mergedFiles if WS didn’t output files
    let files = Array.isArray(wsFinal.files) ? wsFinal.files : Array.from(mergedFiles.entries()).map(([path, content]) => ({ path, content }));
    files = files.filter(f => f?.path && typeof f.content === "string");

    const files_built = files.map(f => f.path);

    // Optional publish step
    let publish_status = "";
    if (publish) {
      const pub = await postJson(`${base}/api/publish`, { files });
      publish_status = pub?.ok
        ? `Committed ${pub.wrote.length} file(s) to ${pub.target}`
        : `Publish response: ${JSON.stringify(pub, null, 2)}`;
    }

    return safeJson(res, 200, {
      ws_plan_summary: "Planned web build tasks (hidden in Dev Log).",
      files_built,
      final_summary: wsFinal.final_summary || "Landing page built. Review and publish when ready.",
      publish_status: publish ? (publish_status || "Publish attempted.") : "",
      // Keep internals for Dev Log only:
      _dev: { ws_plan: wsPlan, tasks, junior_results, ws_final: wsFinal }
    });

  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};