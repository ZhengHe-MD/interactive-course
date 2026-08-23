// Ad-hoc signs the packaged app.
//
// Apple Silicon refuses to launch a binary with no signature at all. A real
// Developer ID certificate is only needed to hand someone a prebuilt download;
// an ad-hoc signature is enough for an app you build on the machine you run it
// on, and it costs nothing.

import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  await run("codesign", ["--force", "--deep", "--sign", "-", appPath]);
  console.log(`  • ad-hoc signed ${appPath}`);
}
