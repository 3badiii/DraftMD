import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("production build serves DraftMD", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /DraftMD/i);
  assert.match(html, /Visual Markdown Editor/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("release source contains the required editor capabilities", async () => {
  const [page, packageJson, readme, browserLauncher, windowsLauncher, unixLauncher, nextConfig, dockerfile, compose, dockerignore] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
    readFile(new URL("README.md", projectRoot), "utf8"),
    readFile(new URL("scripts/open-browser.mjs", projectRoot), "utf8"),
    readFile(new URL("start-windows.bat", projectRoot), "utf8"),
    readFile(new URL("start-unix.sh", projectRoot), "utf8"),
    readFile(new URL("next.config.ts", projectRoot), "utf8"),
    readFile(new URL("Dockerfile", projectRoot), "utf8"),
    readFile(new URL("docker-compose.yml", projectRoot), "utf8"),
    readFile(new URL(".dockerignore", projectRoot), "utf8"),
  ]);

  assert.match(page, /useDeferredValue/);
  assert.match(page, /Raw Markdown/);
  assert.match(page, /Document outline/);
  assert.match(page, /Choose image from device/);
  assert.match(page, /https:\/\/github\.com\/3badiii/);
  assert.match(page, /multiple hidden onChange=\{openFileInput\}/);
  assert.match(page, /showOpenFilePicker/);
  assert.match(page, /showSaveFilePicker/);
  assert.match(page, /!window\.isSecureContext \|\| !pickerWindow\.showOpenFilePicker/);
  assert.match(page, /window\.isSecureContext && pickerWindow\.showSaveFilePicker/);
  assert.match(page, /createWritable/);
  assert.match(page, /Save As/);
  assert.match(page, /indexedDB\.open/);
  assert.match(page, /persistStoredSession/);
  assert.match(page, /const \[dark, setDark\] = useState\(true\)/);
  assert.match(page, /const reorderDocuments/);
  assert.match(page, /draggable/);
  assert.match(page, /onDragStart/);
  assert.match(page, /onDrop/);
  assert.doesNotMatch(page, /if \(mode === "write"\) syncFromWrite\(\)/);
  assert.doesNotMatch(page, /window\.prompt|\bprompt\(/);
  assert.match(packageJson, /"version": "1\.0\.0"/);
  assert.match(packageJson, /"name": "draftmd"/);
  assert.doesNotMatch(packageJson, /drizzle|tailwind/i);
  assert.match(readme, /npm run check/);
  assert.match(readme, /3badiii/);
  assert.match(readme, /https:\/\/github\.com\/3badiii/);
  assert.match(readme, /public\/screenshots\/draftmd-light\.png/);
  assert.match(readme, /public\/screenshots\/draftmd-dark\.png/);
  assert.match(browserLauncher, /xdg-open/);
  assert.match(browserLauncher, /process\.platform === "darwin"/);
  assert.match(browserLauncher, /process\.platform === "win32"/);
  assert.match(windowsLauncher, /open-browser\.mjs/);
  assert.match(windowsLauncher, /OpenJS\.NodeJS\.LTS/);
  assert.match(windowsLauncher, /cd \/d "%~dp0"/);
  assert.match(unixLauncher, /open-browser\.mjs/);
  assert.match(nextConfig, /output: "standalone"/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS build/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /"3000:3000"/);
  assert.match(dockerignore, /^node_modules$/m);
});
