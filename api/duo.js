const { safeJson } = require("./_openrouter");

const DEFAULT_CALL_TIMEOUT_MS = 18000; // per upstream call
const MAX_GOAL_CHARS = 6000;
const MAX_CONTEXT_CHARS = 12000;

// POST helper with timeout + better error surfacing
async function postJson(url, payload, timeoutMs = DEFAULT_CALL_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let r;
  let txt = "";
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    txt = await r.text();
  } catch (e) {
    clearTimeout(timer);
    const msg = e?.name === "AbortError"
      ? `Upstream timeout after ${timeoutMs}ms: ${url}`
      : `Upstream fetch failed: ${url} :: ${String(e?.message || e)}`;
    throw new Error(msg);
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

  if (!r.ok) throw new Error(data?.error || txt || `HTTP ${r.status}`);
  return data;
}

function clampText(s, max) {
  if (typeof s !== "string") return "";
  return s.length > max ? s.slice(0, max) : s;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return safeJson(res, 405, { error: "POST only" });

  try {
    const body = req.body || {};
    const mode = body.mode || "";
    const publish = !!body.publish;

    let goal = clampText(body.goal || "", MAX_GOAL_CHARS);
    let context = clampText(body.context || "", MAX_CONTEXT_CHARS);

    if (!goal) return safeJson(res, 400, { error: "Missing: goal" });

    const base = `https://${req.headers.host}`;

    // ---------------------------
    // FAST WEB MODE (1-call build)
    // ---------------------------
    // Use this for big specs to avoid timeouts.
    if (mode === "web_duo_fast") {
      const task = [
        "Build a complete, production-ready static site.",
        "Return files: index.html, styles.css, app.js.",
        "No external libraries.",
        "",
        "SPEC:",
        goal,
        "",
        "CONTEXT:",
        context
      ].join("\n");

      const jr = await postJson(`${base}/api/wj`, { task, context, mode: "web_duo" });
      const files = Array.isArray(jr.files) ? jr.files : [];
      const cleaned = files
        .filter(f => f?.path && typeof f.content === "string")
        .map(f => ({ path: f.path, content: f.content }));

      if (!cleaned.length) {
        return safeJson(res, 200, {
          ws_plan_summary: "Fast mode used.",
          files_built: [],
          final_summary: "No files returned. Check Dev Log.",
          publish_status: "",
          _dev: { mode: "web_duo_fast", wj_raw: jr }
        });
      }

      let publish_status = "";
      if (publish) {
        const pub = await postJson(`${base}/api/publish`, { files: cleaned });
        publish_status = pub?.ok
          ? `Committed ${pub.wrote.length} file(s) to ${pub.target}`
          : `Publish response: ${JSON.stringify(pub, null, 2)}`;
      }

      return safeJson(res, 200, {
        ws_plan_summary: "Fast mode used (single-pass build).",
        files_built: cleaned.map(f => f.path),
        final_summary: jr.result || jr.final_summary || "Site built (fast mode).",
        publish_status: publish ? (publish_status || "Publish attempted.") : "",
        _dev: { mode: "web_duo_fast", wj_raw: jr }
      });
    }

    // --------------------------------
    // ORIGINAL / NON-WEB MODE (fallback)
    // --------------------------------
    if (mode !== "web_duo") {
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

    // -------------------
    // WEB BUILDER PIPELINE
    // -------------------
    // Hard cap tasks to keep it fast; override via body.max_tasks (1..3)
    const maxTasksRaw = Number(body.max_tasks ?? 2);
    const maxTasks = Number.isFinite(maxTasksRaw) ? Math.min(3, Math.max(1, maxTasksRaw)) : 2;

    const wsPlan = await postJson(`${base}/api/ws`, { goal, context, mode: "web_duo" });

    let tasks = Array.isArray(wsPlan.tasks) ? wsPlan.tasks : [];
    if (!tasks.length) {
      tasks = ["Generate a complete landing page (index.html, styles.css, app.js)."];
    }
    tasks = tasks.slice(0, maxTasks);

    const junior_results = [];
    const mergedFiles = new Map();

    // Sequential on purpose (avoid rate limits). Cap keeps it quick.
    for (const t of tasks) {
      const jr = await postJson(`${base}/api/wj`, { task: t, context, mode: "web_duo" });
      junior_results.push({ task: t, files: jr.files || null, result_raw: jr.result_raw || "" });

      if (Array.isArray(jr.files)) {
        for (const f of jr.files) {
          if (f?.path && typeof f.content === "string") mergedFiles.set(f.path, f.content);
        }
      }
    }

    // WS final review (can still timeout on big specs, but now upstream calls are capped)
    const wsFinal = await postJson(`${base}/api/ws`, {
      goal,
      context,
      mode: "web_duo",
      junior_results: {
        tasks,
        files: Array.from(mergedFiles.entries()).map(([path, content]) => ({ path, content }))
      }
    });

    let files = Array.isArray(wsFinal.files)
      ? wsFinal.files
      : Array.from(mergedFiles.entries()).map(([path, content]) => ({ path, content }));

    files = files.filter(f => f?.path && typeof f.content === "string");
    const files_built = files.map(f => f.path);

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
      _dev: { ws_plan: wsPlan, tasks, junior_results, ws_final: wsFinal }
    });

  } catch (e) {
    // Important: return the real reason (timeout vs rate limit vs bad creds)
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};