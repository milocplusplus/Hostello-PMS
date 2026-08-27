/**
 * Rebuilds the Android app and drops the signed APK into public/app/hostello.apk.
 *
 * The app is a Trusted Web Activity: an Android shell around
 * hostello-pms.vercel.app, so shipping a change to the site ships it to the app
 * too. Rebuild only when the icon, name or version in twa-manifest.json change.
 *
 * Needs the JDK 17 and Android SDK paths from ~/.bubblewrap/config.json, and the
 * keystore password in HOSTELLO_KEYSTORE_PASSWORD. The keystore itself
 * (android/android.keystore) is deliberately not in git — losing it means the
 * next APK can no longer upgrade an installed one.
 *
 *   HOSTELLO_KEYSTORE_PASSWORD=... node android/build-apk.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BUILD_TOOLS = "36.1.0";
const projectDir = import.meta.dirname;
const repoDir = path.dirname(projectDir);

const password = process.env.HOSTELLO_KEYSTORE_PASSWORD;
if (!password) throw new Error("HOSTELLO_KEYSTORE_PASSWORD is not set");

const { jdkPath, androidSdkPath } = JSON.parse(
  fs.readFileSync(path.join(os.homedir(), ".bubblewrap", "config.json"), "utf8"),
);
const win = process.platform === "win32";
// zipalign is a native exe; apksigner is a wrapper script.
const bin = (name, winExt = ".bat") =>
  path.join(androidSdkPath, "build-tools", BUILD_TOOLS, win ? name + winExt : name);

// Windows keeps one PATH, but a shell can leave both "PATH" and "Path" in the
// environment — the child then gets whichever the OS picks. Build one key.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "path"),
);
env[win ? "Path" : "PATH"] = [
  path.join(jdkPath, "bin"),
  process.env.Path ?? process.env.PATH ?? "",
].join(win ? ";" : ":");
env.JAVA_HOME = jdkPath;
env.ANDROID_HOME = androidSdkPath;
env.HOSTELLO_KEYSTORE_PASSWORD = password;

// Node will not spawn a .bat directly, so Windows goes through the shell —
// which means quoting anything holding a space ourselves.
const quote = (value) => (win && /s/.test(value) ? `"${value}"` : value);

function run(command, args, options = {}) {
  const result = spawnSync(quote(command), args.map(quote), {
    cwd: projectDir,
    env,
    stdio: "inherit",
    shell: win,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})`);
}

const unsigned = path.join(projectDir, "app/build/outputs/apk/release/app-release-unsigned.apk");
const signed = path.join(repoDir, "public/app/hostello.apk");

// Gradle already aligns the APK; zipalign -c only confirms it before signing,
// because apksigner will not fix an unaligned one.
run(path.join(projectDir, win ? "gradlew.bat" : "gradlew"), ["assembleRelease", "--stacktrace"]);
run(bin("zipalign", ".exe"), ["-c", "-v", "4", unsigned], { stdio: "ignore" });

fs.mkdirSync(path.dirname(signed), { recursive: true });
run(bin("apksigner"), [
  "sign",
  "--ks", path.join(projectDir, "android.keystore"),
  "--ks-key-alias", "hostello",
  // v4 writes a separate .idsig file that only adb's incremental install uses;
  // a downloaded APK has no use for it.
  "--v4-signing-enabled", "false",
  "--ks-pass", "env:HOSTELLO_KEYSTORE_PASSWORD",
  "--key-pass", "env:HOSTELLO_KEYSTORE_PASSWORD",
  "--out", signed,
  unsigned,
]);
run(bin("apksigner"), ["verify", "--print-certs", signed]);

console.log(`\n${path.relative(repoDir, signed)} — ${(fs.statSync(signed).size / 1024).toFixed(0)} KB`);
