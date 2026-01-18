const { safeJson, upsertFile } = require("./_github");

module.exports = async (req, res) => {
  if (req.method !== "POST") return safeJson(res, 405, { error: "POST only" });

  try {
    const token  = process.env.GITHUB_TOKEN;
    const owner  = process.env.GITHUB_OWNER;
    const repo   = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token) return safeJson(res, 500, { error: "Missing env: GITHUB_TOKEN" });
    if (!owner) return safeJson(res, 500, { error: "Missing env: GITHUB_OWNER" });
    if (!repo)  return safeJson(res, 500, { error: "Missing env: GITHUB_REPO" });

    const { files } = req.body || {};
    if (!Array.isArray(files) || !files.length) {
      return safeJson(res, 400, { error: "Missing: files[] {path, content}" });
    }

    // Safety limits
    if (files.length > 25) return safeJson(res, 400, { error: "Too many files (max 25)." });

    for (const f of files) {
      if (!f?.path || typeof f.content !== "string") {
        return safeJson(res, 400, { error: "Each file must have { path, content }" });
      }
      if (f.path.includes("..")) return safeJson(res, 400, { error: "Invalid path." });
    }

    // Write all files
    for (const f of files) {
      await upsertFile({
        token, owner, repo, branch,
        path: f.path,
        content: f.content,
        message: `Wizz publish: ${f.path}`
      });
    }

    return safeJson(res, 200, {
      ok: true,
      wrote: files.map(f => f.path),
      target: `${owner}/${repo}@${branch}`
    });
  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};