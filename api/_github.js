function safeJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj, null, 2));
}

const GH = "https://api.github.com";

// GitHub "contents" endpoint expects slashes as path separators.
// Encode each segment, NOT the whole string (or "/" becomes "%2F" and breaks nested paths).
function ghContentsPath(path) {
  return String(path || "")
    .split("/")
    .map(seg => encodeURIComponent(seg))
    .join("/");
}

async function ghFetch(path, { token, method="GET", body=null }) {
  const r = await fetch(`${GH}${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : null
  });
  const txt = await r.text();
  let data=null; try{ data=JSON.parse(txt); }catch{ data={ raw: txt }; }
  if(!r.ok){
    const msg = data?.message || data?.error || txt;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

function b64(str){
  return Buffer.from(str, "utf8").toString("base64");
}

// Create or update file on a branch
async function upsertFile({ token, owner, repo, branch, path, content, message }) {
  // 1) Get existing file SHA (if exists)
  let sha = null;
  try {
    const existing = await ghFetch(
  `/repos/${owner}/${repo}/contents/${ghContentsPath(path)}?ref=${encodeURIComponent(branch)}`,
  { token }
);
    sha = existing?.sha || null;
  } catch (e) {
    // If not found, ignore — we will create it
    if (!String(e.message || e).toLowerCase().includes("not found")) throw e;
  }

  // 2) Put content
  const body = {
    message: message || `Update ${path}`,
    content: b64(content),
    branch
  };
  if (sha) body.sha = sha;

  return ghFetch(`/repos/${owner}/${repo}/contents/${ghContentsPath(path)}`, {
    token,
    method: "PUT",
    body
  });
}

module.exports = { safeJson, ghFetch, upsertFile };