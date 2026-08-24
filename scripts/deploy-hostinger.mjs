#!/usr/bin/env node
/**
 * Deploy KelvinOz AI to kelvinoz.com via Hostinger API.
 * Usage: HOSTINGER_API_KEY=xxx node scripts/deploy-hostinger.mjs
 */

import { execSync } from "child_process";
import { existsSync, rmSync, statSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEPLOY_DIR = path.join(ROOT, "deploy");
const ARCHIVE = "kelvinoz-app.zip";

const API_KEY = process.env.HOSTINGER_API_KEY;
const USERNAME = process.env.HOSTINGER_USERNAME || "u343769360";
const DOMAIN = process.env.HOSTINGER_DOMAIN || "kelvinoz.com";
const BASE = "https://developers.hostinger.com";

if (!API_KEY) {
  console.error("HOSTINGER_API_KEY is required");
  process.exit(1);
}

async function api(endpoint, options = {}) {
  const res = await fetch(`${BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
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
    throw new Error(
      data.message || data.error || data.errors?.[0]?.message || `HTTP ${res.status}: ${text.slice(0, 500)}`
    );
  }
  return data;
}

function uploadViaCurl(filePath, uploadInfo) {
  const { url, auth_key, rest_auth_key } = uploadInfo;
  const fileSize = statSync(filePath).size;
  const fileName = path.basename(filePath);
  const uploadUrl = `${url}/${fileName}?override=true`;

  const postCode = execSync(
    `curl -s -o /dev/null -w "%{http_code}" -X POST "${uploadUrl}" ` +
      `-H "X-Auth: ${auth_key}" -H "X-Auth-Rest: ${rest_auth_key}" ` +
      `-H "Tus-Resumable: 1.0.0" -H "Upload-Length: ${fileSize}" -H "Upload-Offset: 0"`
  ).toString().trim();

  const patchCode = execSync(
    `curl -s -o /dev/null -w "%{http_code}" -X PATCH "${uploadUrl}" ` +
      `-H "X-Auth: ${auth_key}" -H "X-Auth-Rest: ${rest_auth_key}" ` +
      `-H "Tus-Resumable: 1.0.0" -H "Content-Type: application/offset+octet-stream" ` +
      `-H "Upload-Offset: 0" --data-binary "@${filePath}"`
  ).toString().trim();

  if (postCode !== "201" && postCode !== "200") throw new Error(`TUS POST failed: ${postCode}`);
  if (patchCode !== "204" && patchCode !== "200") throw new Error(`TUS PATCH failed: ${patchCode}`);

  console.log(`Uploaded ${fileName} (${(fileSize / 1024).toFixed(0)} KB)`);
}

function createArchive() {
  const zipPath = path.join(ROOT, ARCHIVE);
  if (existsSync(zipPath)) rmSync(zipPath);

  const runtimeConfigPath = path.join(DEPLOY_DIR, "runtime-config.json");
  const runtimeConfig = {};
  if (process.env.OPENAI_API_KEY) runtimeConfig.openaiApiKey = process.env.OPENAI_API_KEY;
  if (process.env.ACCESS_CODE) runtimeConfig.accessCode = process.env.ACCESS_CODE;
  writeFileSync(runtimeConfigPath, JSON.stringify(runtimeConfig, null, 2));

  console.log("Packaging KelvinOz AI…");
  try {
    execSync(
      `cd "${DEPLOY_DIR}" && zip -r "${zipPath}" . -x "node_modules/*" -x "package-lock.json"`,
      { stdio: "inherit" }
    );
  } finally {
    rmSync(runtimeConfigPath, { force: true });
  }
  return zipPath;
}

async function waitForBuild(buildUuid) {
  console.log("Build ID:", buildUuid);

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10000));

    const builds = await api(
      `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds?per_page=5`
    );
    const build = builds.data?.find((b) => b.uuid === buildUuid) || builds.data?.[0];
    const state = build?.state || "unknown";
    console.log(`  Status: ${state}`);

    if (state === "completed") return build;
    if (state === "failed") {
      const logs = await api(
        `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds/${buildUuid}/logs`
      ).catch(() => null);
      const logText = logs?.logs || logs?.data?.map((l) => l.line || l).join("\n");
      throw new Error(`Build failed.\n${logText || "No logs returned."}`);
    }
  }

  throw new Error("Build timed out after 5 minutes");
}

async function main() {
  if (!existsSync(DEPLOY_DIR)) throw new Error("deploy/ folder missing");

  const zipPath = createArchive();

  console.log("Getting upload URL…");
  const uploadInfo = await api("/api/hosting/v1/files/upload-urls", {
    method: "POST",
    body: JSON.stringify({
      username: USERNAME,
      domain: DOMAIN,
      files: [{ name: ARCHIVE, path: "/" }],
    }),
  });

  console.log("Uploading archive…");
  uploadViaCurl(zipPath, uploadInfo);

  console.log("Starting Node.js build…");
  const build = await api(
    `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds`,
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

  await waitForBuild(build.uuid);

  await api(`/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/cache/clear`, {
    method: "DELETE",
  }).catch(() => {});

  await api(`/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/server/restart`, {
    method: "POST",
    body: JSON.stringify({}),
  }).catch(() => {});

  console.log("Live at https://kelvinoz.com — access code: @535846.oZ");
}

main().catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
