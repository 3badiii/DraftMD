import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = new URL("../", import.meta.url);

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function render() {
  const port = await findAvailablePort();
  const child = spawn(process.execPath, ["dist/standalone/server.js"], {
    cwd: fileURLToPath(projectRoot),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverError = "";
  child.stderr.on("data", (chunk) => { serverError += chunk.toString(); });
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { headers: { accept: "text/html" } });
        return { response, html: await response.text() };
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw new Error(`Standalone server did not start. ${serverError}`);
  } finally {
    child.kill();
  }
}

test("production build serves DraftMD", async () => {
  const { response, html } = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  assert.match(html, /DraftMD/i);
  assert.match(html, /Visual Markdown Editor/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("release source contains the required editor capabilities", async () => {
  const [page, styles, layout, favicon, packageJson, readme, browserLauncher, windowsLauncher, unixLauncher, nextConfig, viteConfig, dockerfile, compose, dockerignore] = await Promise.all([
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(new URL("app/layout.tsx", projectRoot), "utf8"),
    readFile(new URL("public/favicon.svg", projectRoot), "utf8"),
    readFile(new URL("package.json", projectRoot), "utf8"),
    readFile(new URL("README.md", projectRoot), "utf8"),
    readFile(new URL("scripts/open-browser.mjs", projectRoot), "utf8"),
    readFile(new URL("start-windows.bat", projectRoot), "utf8"),
    readFile(new URL("start-unix.sh", projectRoot), "utf8"),
    readFile(new URL("next.config.ts", projectRoot), "utf8"),
    readFile(new URL("vite.config.ts", projectRoot), "utf8"),
    readFile(new URL("Dockerfile", projectRoot), "utf8"),
    readFile(new URL("docker-compose.yml", projectRoot), "utf8"),
    readFile(new URL(".dockerignore", projectRoot), "utf8"),
  ]);

  assert.match(page, /useDeferredValue/);
  assert.match(page, /Raw Markdown/);
  assert.match(page, /Document outline/);
  assert.match(page, /Choose image from device/);
  assert.match(page, /const editingImageRef = useRef<HTMLImageElement \| null>/);
  assert.match(page, /onClick=\{handleEditorClick\}/);
  assert.match(page, /onKeyDown=\{handleEditorKeyDown\}/);
  assert.match(page, /Update image/);
  assert.match(page, /editingImage\.setAttribute\("width", width\)/);
  assert.match(page, /editingImage\.setAttribute\("height", height\)/);
  assert.match(page, /Insert table/);
  assert.match(page, /The first row is used as the table header/);
  assert.match(page, /const \[tableDialog, setTableDialog\]/);
  assert.match(page, /Array\.from\(\{ length: columns \}/);
  assert.match(page, /const \[activeFormats, setActiveFormats\]/);
  assert.match(page, /document\.addEventListener\("selectionchange", updateFormattingState\)/);
  assert.match(page, /aria-pressed=\{activeFormats\.bold\}/);
  assert.match(page, /onKeyUp=\{updateFormattingState\}/);
  assert.match(page, /onMouseUp=\{updateFormattingState\}/);
  assert.match(page, /onMouseDown=\{preserveToolbarSelection\}/);
  assert.match(page, /selection\.addRange\(savedRangeRef\.current\)/);
  assert.match(page, /const selectionIsInEditor = Boolean/);
  assert.match(page, /if \(!selectionIsInEditor && savedRangeRef\.current && selection\)/);
  assert.match(page, /bold: commandState\("bold"\)/);
  assert.doesNotMatch(page, /bold: commandState\("bold"\) \|\|/);
  assert.match(page, /const toggleInlineCode = \(\) =>/);
  assert.match(page, /while \(code\.firstChild\) parent\.insertBefore\(code\.firstChild, code\)/);
  assert.match(page, /onClick=\{toggleInlineCode\}/);
  assert.match(page, /function findInlineCodeForRange/);
  assert.match(page, /range\.intersectsNode\(code\)/);
  assert.match(page, /range\.insertNode\(codeElement\)/);
  assert.match(page, /codeRange\.selectNodeContents\(codeElement\)/);
  assert.match(page, /https:\/\/github\.com\/3badiii/);
  assert.match(page, /multiple hidden onChange=\{openFileInput\}/);
  assert.match(page, /showOpenFilePicker/);
  assert.match(page, /showSaveFilePicker/);
  assert.match(page, /!window\.isSecureContext \|\| !pickerWindow\.showOpenFilePicker/);
  assert.match(page, /window\.isSecureContext && pickerWindow\.showSaveFilePicker/);
  assert.match(page, /window\.addEventListener\("keydown", handleSaveShortcut, true\)/);
  assert.match(page, /\(event\.ctrlKey \|\| event\.metaKey\)/);
  assert.match(page, /event\.code === "KeyS" \|\| event\.key\.toLowerCase\(\) === "s"/);
  assert.match(page, /if \(!event\.repeat\) void saveFile\(\)/);
  assert.match(page, /const exportPdf = async \(\) =>/);
  assert.match(page, /import\("html2pdf\.js"\)/);
  assert.match(page, /format: "a4"/);
  assert.match(page, /Exporting\.\.\./);
  assert.doesNotMatch(page, /window\.print\(\)/);
  assert.match(page, /document\.createElement\("article"\)/);
  assert.match(page, /pdfDocument\.className = "markdown-body pdf-render-document"/);
  assert.match(page, /function splitLongCodeBlocksForPdf\(root: HTMLElement, maxVisualLines = 24\)/);
  assert.match(page, /splitLongCodeBlocksForPdf\(pdfDocument\)/);
  assert.match(page, /chunkPre\.classList\.add\("pdf-code-chunk"\)/);
  assert.match(page, /chunkPre\.classList\.add\("pdf-code-continuation"\)/);
  assert.match(page, /headingGroup\.className = "pdf-heading-group"/);
  assert.match(page, /const bytes = globalThis\.crypto\.getRandomValues/);
  assert.doesNotMatch(page, /crypto\.randomUUID/);
  assert.match(page, /createWritable/);
  assert.match(page, /Save As/);
  assert.match(page, /indexedDB\.open/);
  assert.match(page, /persistStoredSession/);
  assert.match(page, /const \[dark, setDark\] = useState\(true\)/);
  assert.match(page, /const reorderDocuments/);
  assert.match(page, /draggable/);
  assert.match(page, /onDragStart/);
  assert.match(page, /onDrop/);
  assert.match(styles, /\.file-tabs-bar \{ position: sticky; top: var\(--tabs-sticky-top\);/);
  assert.match(styles, /--tabs-sticky-height: 40px/);
  assert.match(styles, /--toolbar-sticky-height: 46px/);
  assert.match(styles, /\.formatbar \{ position: sticky; top: var\(--toolbar-sticky-top\);/);
  assert.match(styles, /\.outline-panel \{ position: sticky; top: var\(--controls-sticky-bottom\);/);
  assert.match(styles, /\.app \{ --tabs-sticky-top: 60px;[^}]*grid-template-rows: 56px 1fr 34px;/);
  assert.match(styles, /\.brand-mark \{[^}]*width: 32px; height: 32px;/);
  assert.match(styles, /\.text-button, \.primary-button \{ height: 32px;/);
  assert.match(styles, /\.pdf-render-document pre \{[^}]*background: #f6f8fa !important;/);
  assert.match(styles, /\.pdf-render-document \.pdf-code-chunk \{ break-inside: avoid; \}/);
  assert.match(styles, /\.pdf-heading-group \{ break-inside: avoid; \}/);
  assert.doesNotMatch(styles, /\.pdf-render-document \{[^}]*display: none;/);
  assert.match(layout, /icons:\s*\{/);
  assert.match(layout, /\/favicon\.svg/);
  assert.match(favicon, />MD<\/text>/);
  assert.doesNotMatch(page, /if \(mode === "write"\) syncFromWrite\(\)/);
  assert.doesNotMatch(page, /window\.prompt|\bprompt\(/);
  assert.match(packageJson, /"version": "1\.0\.0"/);
  assert.match(packageJson, /"name": "draftmd"/);
  assert.match(packageJson, /"html2pdf\.js": "\^0\.14\.0"/);
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
  assert.match(viteConfig, /plugins: \[vinext\(\)\]/);
  assert.match(viteConfig, /turndown: "turndown\/lib\/turndown\.browser\.es\.js"/);
  assert.match(dockerfile, /FROM node:22-bookworm-slim AS build/);
  assert.match(dockerfile, /npm ci --omit=dev/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /CMD \["node", "server\.js"\]/);
  assert.match(compose, /restart: unless-stopped/);
  assert.match(compose, /"3000:3000"/);
  assert.match(dockerignore, /^node_modules$/m);
});
