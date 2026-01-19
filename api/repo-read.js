const { safeJson, ghFetch } = require("../_github");

function decodeContent(b64) {
  // GitHub returns base64 with newlines sometimes
  const clean = String(b64 || "").replace(/\n/g, "");
  return Buffer.from(clean, "base64").toString("utf8");
}

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

    const path = String(req.query?.path || "").trim();
    if (!path) return safeJson(res, 400, { error: "Missing query: ?path=" });
    if (path.includes("..")) return safeJson(res, 400, { error: "Invalid path." });

    const data = await ghFetch(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
      { token }
    );

    // If it's not a file, refuse
    if (data?.type !== "file") {
      return safeJson(res, 400, { error: "Path is not a file." });
    }

    const content = decodeContent(data.content);
    return safeJson(res, 200, {
      ok: true,
      target: `${owner}/${repo}@${branch}`,
      path,
      sha: data.sha || null,
      size: data.size || null,
      content
    });
  } catch (e) {
    return safeJson(res, 500, { error: String(e?.message || e) });
  }
};