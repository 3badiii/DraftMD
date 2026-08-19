import { spawn } from "node:child_process";

const appUrl = "http://localhost:3000";
const maximumAttempts = 60;
const retryDelay = 500;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer() {
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      const response = await fetch(appUrl);
      if (response.ok) return true;
    } catch {
      // The development server is still starting.
    }
    await delay(retryDelay);
  }
  return false;
}

function openDefaultBrowser() {
  let command;
  let args;

  if (process.platform === "win32") {
    command = "cmd.exe";
    args = ["/d", "/s", "/c", "start", "", appUrl];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [appUrl];
  } else {
    command = "xdg-open";
    args = [appUrl];
  }

  const browserProcess = spawn(command, args, {
    detached: true,
    stdio: "ignore",
  });
  browserProcess.unref();
}

if (process.env.DRAFTMD_SKIP_OPEN === "1") {
  process.exit(0);
}

if (await waitForServer()) {
  console.log(`Opening DraftMD in the default browser: ${appUrl}`);
  openDefaultBrowser();
} else {
  console.error(`DraftMD did not become available at ${appUrl}. Open the address manually.`);
  process.exitCode = 1;
}
