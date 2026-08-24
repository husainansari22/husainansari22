#!/usr/bin/env node
/**
 * Deploy KelvinOz AI to kelvinoz.com via Hostinger API.
 * Usage: HOSTINGER_API_KEY=xxx node scripts/deploy-hostinger.mjs
 */

import { execSync } from "child_process";
import { existsSync, readFileSync, rmSync, statSync } from "fs";
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
    throw new Error(data.message || data.error || data.errors?.[0]?.message || `HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  return data;
}

function createArchive() {
  const zipPath = path.join(ROOT, ARCHIVE);
  if (existsSync(zipPath)) rmSync(zipPath);

  console.log("Packaging KelvinOz AI…");
  execSync(
    `cd "${DEPLOY_DIR}" && zip -r "${zipPath}" . -x "node_modules/*" -x "package-lock.json"`,
    { stdio: "inherit" }
  );

  const sizeKb = statSync(zipPath).size / 1024;
  console.log(`Archive: ${ARCHIVE} (${sizeKb.toFixed(0)} KB)`);
  return zipPath;
}

async function deployFromArchive(zipPath) {
  console.log("Uploading archive and starting Node.js build (single-step)…");

  const archiveBytes = readFileSync(zipPath);
  const form = new FormData();
  form.append("archive", new Blob([archiveBytes]), ARCHIVE);
  form.append("node_version", "18");
  form.append("app_type", "express");
  form.append("entry_file", "server.js");
  form.append("build_script", "build");
  form.append("root_directory", "/");

  const res = await fetch(
    `${BASE}/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/builds/from-archive`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}` },
      body: form,
    }
  );

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { message: text };
  }

  if (!res.ok) {
    throw new Error(data.message || data.error || `Build start failed: ${text.slice(0, 500)}`);
  }

  return data.uuid || data.data?.uuid || data;
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
      const logText = logs?.data?.map((l) => l.line || l).join("\n") || logs?.logs || JSON.stringify(logs);
      throw new Error(`Build failed.\n${logText || "No logs returned."}`);
    }
  }

  throw new Error("Build timed out after 5 minutes");
}

async function main() {
  if (!existsSync(DEPLOY_DIR)) {
    throw new Error("deploy/ folder missing — run from repo root");
  }

  const zipPath = createArchive();
  const buildUuid = await deployFromArchive(zipPath);
  await waitForBuild(buildUuid);

  await api(
    `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/cache/clear`,
    { method: "DELETE" }
  ).catch(() => {});

  await api(
    `/api/hosting/v1/accounts/${USERNAME}/websites/${DOMAIN}/nodejs/server/restart`,
    { method: "POST", body: JSON.stringify({}) }
  ).catch(() => {});

  console.log("Live at https://kelvinoz.com — access code: @535846.oZ");
}

main().catch((err) => {
  console.error("Deploy failed:", err.message);
  process.exit(1);
});
