const { execSync } = require("child_process");
const { existsSync, rmSync, statSync, writeFileSync } = require("fs");
const path = require("path");

const ARCHIVE = "kelvinoz-app.zip";
const BASE = "https://developers.hostinger.com";

async function api(apiKey, username, domain, endpoint, options = {}) {
  const res = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return data;
}

function normalizeDomain(domain) {
  return String(domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function uploadViaCurl(filePath, uploadInfo) {
  const { url, auth_key, rest_auth_key } = uploadInfo;
  const fileSize = statSync(filePath).size;
  const fileName = path.basename(filePath);
  const uploadUrl = `${url}/${fileName}?override=true`;

  execSync(
    `curl -s -o /dev/null -w "%{http_code}" -X POST "${uploadUrl}" ` +
      `-H "X-Auth: ${auth_key}" -H "X-Auth-Rest: ${rest_auth_key}" ` +
      `-H "Tus-Resumable: 1.0.0" -H "Upload-Length: ${fileSize}" -H "Upload-Offset: 0"`
  );
  execSync(
    `curl -s -o /dev/null -w "%{http_code}" -X PATCH "${uploadUrl}" ` +
      `-H "X-Auth: ${auth_key}" -H "X-Auth-Rest: ${rest_auth_key}" ` +
      `-H "Tus-Resumable: 1.0.0" -H "Content-Type: application/offset+octet-stream" ` +
      `-H "Upload-Offset: 0" --data-binary "@${filePath}"`
  );
}

function createArchive(deployDir, zipPath, runtimeConfig) {
  if (existsSync(zipPath)) rmSync(zipPath);
  const runtimePath = path.join(deployDir, "runtime-config.json");
  writeFileSync(runtimePath, JSON.stringify(runtimeConfig, null, 2));
  try {
    execSync(
      `cd "${deployDir}" && zip -r "${zipPath}" . -x "node_modules/*" -x "package-lock.json"`,
      { stdio: "pipe" }
    );
  } finally {
    rmSync(runtimePath, { force: true });
  }
  return zipPath;
}

async function waitForBuild(apiKey, username, domain, buildUuid, onLog) {
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const builds = await api(
      apiKey,
      username,
      domain,
      `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds?per_page=5`
    );
    const build = builds.data?.find((b) => b.uuid === buildUuid) || builds.data?.[0];
    const state = build?.state || "unknown";
    onLog?.(`Build status: ${state}`);
    if (state === "completed") return build;
    if (state === "failed") {
      const logs = await api(
        apiKey,
        username,
        domain,
        `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds/${buildUuid}/logs`
      ).catch(() => null);
      throw new Error(logs?.logs || "Build failed");
    }
  }
  throw new Error("Build timed out");
}

async function listHostingerSites(options = {}) {
  const apiKey = options.hostingerApiKey || process.env.HOSTINGER_API_KEY;
  const username = options.username || process.env.HOSTINGER_USERNAME || "u343769360";
  if (!apiKey) throw new Error("HOSTINGER_API_KEY not configured");

  // Try common list endpoints
  const candidates = [
    `/api/hosting/v1/accounts/${username}/websites`,
    `/api/hosting/v1/websites?username=${encodeURIComponent(username)}`,
  ];

  for (const endpoint of candidates) {
    try {
      const data = await api(apiKey, username, "", endpoint);
      const list = data.data || data.websites || data || [];
      if (Array.isArray(list)) {
        return list.map((w) => ({
          domain: w.domain || w.name || w.vhost || w,
          type: w.type || w.app_type || null,
        }));
      }
    } catch {}
  }
  return [];
}

async function deployToHostinger(options = {}) {
  const apiKey = options.hostingerApiKey || process.env.HOSTINGER_API_KEY;
  const username = options.username || process.env.HOSTINGER_USERNAME || "u343769360";
  const domain = normalizeDomain(options.domain || process.env.HOSTINGER_DOMAIN || "kelvinoz.com");
  const onLog = options.onLog || (() => {});

  if (!apiKey) throw new Error("HOSTINGER_API_KEY not configured on server");
  if (!domain) throw new Error("Domain is required");

  const deployDir = options.deployDir || path.join(__dirname, "..");
  const zipPath = path.join(deployDir, ARCHIVE);
  const runtimeConfig = {
    openaiApiKey: options.nomaskApiKey || options.openaiApiKey || process.env.NOMASK_API_KEY || process.env.OPENAI_API_KEY || "",
    nomaskApiKey: options.nomaskApiKey || options.openaiApiKey || process.env.NOMASK_API_KEY || process.env.OPENAI_API_KEY || "",
    nomaskBaseUrl: process.env.NOMASK_BASE_URL || "https://nomask.ai/api/v1",
    nomaskModel: process.env.NOMASK_MODEL || "kimi-k2.7-code",
    hostingerApiKey: apiKey,
  };

  onLog(`Packaging app for ${domain}…`);
  createArchive(deployDir, zipPath, runtimeConfig);

  onLog(`Uploading to Hostinger (${domain})…`);
  const uploadInfo = await api(apiKey, username, domain, "/api/hosting/v1/files/upload-urls", {
    method: "POST",
    body: JSON.stringify({ username, domain, files: [{ name: ARCHIVE, path: "/" }] }),
  });
  uploadViaCurl(zipPath, uploadInfo);

  onLog("Starting Node.js build…");
  const build = await api(
    apiKey,
    username,
    domain,
    `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/builds`,
    {
      method: "POST",
      body: JSON.stringify({
        node_version: 18,
        app_type: "express",
        root_directory: "/",
        build_script: "build",
        entry_file: "server.js",
        source_type: "archive",
        source_options: { archive_path: ARCHIVE },
      }),
    }
  );

  await waitForBuild(apiKey, username, domain, build.uuid, onLog);

  await api(apiKey, username, domain, `/api/hosting/v1/accounts/${username}/websites/${domain}/cache/clear`, {
    method: "DELETE",
  }).catch(() => {});
  await api(apiKey, username, domain, `/api/hosting/v1/accounts/${username}/websites/${domain}/nodejs/server/restart`, {
    method: "POST",
    body: JSON.stringify({}),
  }).catch(() => {});

  return { ok: true, url: `https://${domain}`, domain, buildId: build.uuid };
}

// Back-compat alias
async function deployToKelvinoz(options = {}) {
  return deployToHostinger({ ...options, domain: options.domain || "kelvinoz.com" });
}

module.exports = { deployToHostinger, deployToKelvinoz, listHostingerSites, normalizeDomain };
