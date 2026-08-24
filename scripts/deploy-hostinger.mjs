#!/usr/bin/env node
/**
 * Deploy KelvinOz AI to kelvinoz.com via Hostinger API.
 * Usage: HOSTINGER_API_KEY=xxx node scripts/deploy-hostinger.mjs
 */

import { execSync } from "child_process";
import { existsSync, statSync, writeFileSync, rmSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STAGING = path.join(ROOT, ".deploy-staging");
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
  if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
  return data;
}

function uploadViaCurl(filePath, uploadInfo) {
  const { url, auth_key, rest_auth_key } = uploadInfo;
  const fileSize = statSync(filePath).size;
  const fileName = path.basename(filePath);
  const uploadUrl = `${url}/${fileName}?override=true`;

  execSync(
    `curl -s -X POST "${uploadUrl}" ` +
      `-H "X-Auth: ${auth_key}" ` +
      `-H "X-Auth-Rest: ${rest_auth_key}" ` +
      `-H "Tus-Resumable: 1.0.0" ` +
      `-H "Upload-Length: ${fileSize}" ` +
      `-H "Upload-Offset: 0"`,
    { stdio: "inherit" }
  );

  execSync(
    `curl -s -X PATCH "${uploadUrl}" ` +
      `-H "X-Auth: ${auth_key}" ` +
      `-H "X-Auth-Rest: ${rest_auth_key}" ` +
      `-H "Tus-Resumable: 1.0.0" ` +
      `-H "Content-Type: application/offset+octet-stream" ` +
      `-H "Upload-Offset: 0" ` +
      `--data-binary "@${filePath}"`,
    { stdio: "inherit" }
  );

  console.log(`Uploaded ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);
}

function prepareStaging() {
  if (existsSync(STAGING)) rmSync(STAGING, { recursive: true, force: true });
  execSync(`mkdir -p "${STAGING}"`, { stdio: "inherit" });

  execSync(`cp "${path.join(ROOT, "server.js")}" "${STAGING}/server.js"`, { stdio: "inherit" });
  execSync(`cp -r "${path.join(ROOT, ".next/standalone")}" "${path.join(STAGING, ".next")}"`, {
    stdio: "inherit",
  });

  writeFileSync(
    path.join(STAGING, "package.json"),
    JSON.stringify(
      {
        name: "kelvinoz-ai",
        version: "1.0.0",
        private: true,
        scripts: {
          prebuilt: "echo Deployed standalone build",
          start: "node server.js",
        },
      },
      null,
      2
    )
  );
}

async function main() {
  console.log("Building standalone Next.js app…");
  execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

  console.log("Preparing clean deploy package…");
  prepareStaging();

  const zipPath = path.join(ROOT, ARCHIVE);
  if (existsSync(zipPath)) rmSync(zipPath);

  console.log("Creating archive…");
  execSync(`cd "${STAGING}" && zip -r "${zipPath}" . -x "*.git*"`, { stdio: "inherit" });

  console.log("Getting upload URL…");
  const uploadInfo = await api("/api/hosting/v1/files/upload-urls", {
    method: "POST",
    body: JSON.stringify({
      username: USERNAME,
      domain: DOMAIN,
      files: [{ name: ARCHIVE, path: "/" }],
    }),
  });

  console.log("Uploading (replaces old files)…");
  uploadViaCurl(zipPath, uploadInfo);

  console.log("Deploying archive to kelvinoz-live…");
  await api(`/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/deploy`, {
    method: "POST",
    body: JSON.stringify({ archive_path: ARCHIVE }),
  });

  console.log("Waiting for extraction…");
  await new Promise((r) => setTimeout(r, 20000));

  console.log("Triggering Node.js build…");
  const build = await api(
    `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds`,
    {
      method: "POST",
      body: JSON.stringify({
        node_version: 20,
        app_type: "express",
        root_directory: "kelvinoz-live",
        build_script: "prebuilt",
        entry_file: "server.js",
        source_type: "archive",
        source_options: { archive_path: ARCHIVE },
      }),
    }
  );

  console.log("Build:", build.uuid, build.state);

  console.log("Clearing cache…");
  await api(
    `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/cache/clear`,
    { method: "DELETE" }
  ).catch(() => {});

  console.log("Restarting server…");
  await api(
    `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/server/restart`,
    { method: "POST", body: JSON.stringify({}) }
  );

  rmSync(STAGING, { recursive: true, force: true });
  console.log("Done! Visit https://kelvinoz.com — access code required.");
}

main().catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
