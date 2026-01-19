const { safeJson, ghFetch } = require("../_github");

module.exports = async (req, res) => {
  if (req.method !== "GET") return safeJson(res, 405, { error: "GET only" });

  try {
    const token  = process.env.GITHUB_TOKEN;
    const owner  = process.env.GITHUB_OWNER;
    const repo   = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token) return safeJson(res, 500, { error: "Missing env: GITHUB_TOKEN" });
    if (!owner) return safeJson(res, 500, { error: "Missing env: GITHUB_OWNER" });
    if (!repo)  return safeJson(res, 500, { error: "Missing env: GITHUB_REPO" });

    // Git Trees API: list whole repo tree (paths)
    const data = await ghFetch(
      `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      { token }
    );

    const tree = Array.isArray(data?.tree) ? data.tree : [];
    const files = tree
      .filter(n => n && n.type === "blob" && typeof n.path === "string")
      .map(n => ({ path: n.path, size: n.size ?? null, sha: n.sha ?? null }));

    return safeJson(res, 200, { ok: true, target: `${owner}/${repo}@${branch}`, files });
  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};