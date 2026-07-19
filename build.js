/**
 * Captiongrit — Build Script
 * 
 * Produces 3 distribution-ready folders:
 *   dist/Captiongrit-Basic/
 *   dist/Captiongrit-Pro/
 *   dist/Captiongrit-Extreme/
 * 
 * Each folder has PLAN_TIER injected and JS obfuscated.
 * 
 * Usage:
 *   node build.js              (obfuscated, production)
 *   node build.js --no-obf     (skip obfuscation, for testing)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ── Config ──
const TIERS = ["universal"];
const DIST_DIR = path.join(__dirname, "dist");
const SOURCE_DIR = __dirname;
const SKIP_OBF = process.argv.includes("--no-obf");

// Files to include in distribution
const FILES_TO_COPY = [
    "index.html",
    "main.js",
    "style.css",
    "host.jsx",
    "logo.png",
];

const DIRS_TO_COPY = [
    "CSXS",
    "lib",
    "bin"
];

// Files/dirs to NEVER include
const EXCLUDE = [
    ".git",
    ".debug",
    "server",
    "node_modules",
    "dist",
    "build.js",
    "package.json",
    "package-lock.json",
    ".gitignore",
];

// ── Helpers ──
function copyFileSync(src, dest) {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest) {
    if (!fs.existsSync(src)) return;
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function cleanDir(dir) {
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
}

// ── Main Build ──
console.log("╔══════════════════════════════════════════╗");
console.log("║   Captiongrit — Distribution Builder     ║");
console.log("╚══════════════════════════════════════════╝");
console.log("");

// Check for obfuscator if needed
if (!SKIP_OBF) {
    try {
        require.resolve("javascript-obfuscator");
        console.log("[OK] javascript-obfuscator found.");
    } catch (e) {
        console.log("[INFO] Installing javascript-obfuscator...");
        execSync("npm install --save-dev javascript-obfuscator", { cwd: __dirname, stdio: "inherit" });
    }
}

// Clean dist
cleanDir(DIST_DIR);
console.log("[OK] Cleaned dist/ directory.\n");

for (const tier of TIERS) {
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    const tierDir = path.join(DIST_DIR, `Captiongrit-${tierLabel}`);
    const payloadDir = path.join(tierDir, "com.captiongrit.panel");

    console.log(`── Building ${tierLabel} ──`);

    // Create payload directory
    fs.mkdirSync(payloadDir, { recursive: true });

    // Copy individual files to payload
    for (const file of FILES_TO_COPY) {
        const srcPath = path.join(SOURCE_DIR, file);
        if (fs.existsSync(srcPath)) {
            copyFileSync(srcPath, path.join(payloadDir, file));
        } else {
            console.log(`   [SKIP] ${file} (not found)`);
        }
    }

    // Copy directories to payload
    for (const dir of DIRS_TO_COPY) {
        const srcPath = path.join(SOURCE_DIR, dir);
        if (fs.existsSync(srcPath)) {
            copyDirSync(srcPath, path.join(payloadDir, dir));
        }
    }

    // Copy installers to root tierDir
    const installers = ["install.command", "install.bat", "uninstall.command", "uninstall.bat", "README.txt"];
    let missingInstallers = 0;
    for (const inst of installers) {
        const srcPath = path.join(SOURCE_DIR, inst);
        if (fs.existsSync(srcPath)) {
            copyFileSync(srcPath, path.join(tierDir, inst));
        } else if (inst !== "README.txt") {
            console.error(`   [ERROR] Missing required installer file: ${inst}`);
            missingInstallers++;
        }
    }

    // ── Build-time Validation ──
    const requiredFiles = [
        path.join(payloadDir, "CSXS", "manifest.xml"),
        path.join(payloadDir, "bin", "mac", "ffmpeg"),
        path.join(payloadDir, "bin", "win", "ffmpeg.exe"),
    ];
    let missingPayload = 0;
    for (const req of requiredFiles) {
        if (!fs.existsSync(req)) {
            console.error(`   [ERROR] Missing required payload file: ${req}`);
            missingPayload++;
        }
    }

    if (missingInstallers > 0 || missingPayload > 0) {
        console.error("   [ERROR] Build validation failed! Aborting build to prevent shipping broken release.");
        process.exit(1);
    }
    console.log("   [OK] Build validation passed.");

    // ── Fix line endings for macOS scripts (CRLF → LF) ──
    const macFiles = ["install.command", "uninstall.command"];
    for (const mf of macFiles) {
        const mfPath = path.join(tierDir, mf);
        if (fs.existsSync(mfPath)) {
            let content = fs.readFileSync(mfPath, "utf8");
            content = content.replace(/\r\n/g, "\n");
            fs.writeFileSync(mfPath, content, "utf8");
            console.log(`   [OK] ${mf} → LF line endings`);
        }
    }

    // ── Remove PLAN_TIER injection since we're dynamic now ──
    const mainJsPath = path.join(payloadDir, "main.js");
    let mainJs = fs.readFileSync(mainJsPath, "utf8");

    // ── Obfuscate JS files ──
    if (!SKIP_OBF) {
        const JavaScriptObfuscator = require("javascript-obfuscator");

        const obfuscateOptions = {
            compact: true,
            controlFlowFlattening: true,
            controlFlowFlatteningThreshold: 0.4,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.2,
            identifierNamesGenerator: "hexadecimal",
            renameGlobals: false,
            selfDefending: false,
            stringArray: true,
            stringArrayEncoding: ["base64"],
            stringArrayThreshold: 0.5,
            transformObjectKeys: true,
            unicodeEscapeSequence: false,
            // Keep console.log for debugging
            disableConsoleOutput: false,
        };

        // Obfuscate main.js
        try {
            const obfuscated = JavaScriptObfuscator.obfuscate(mainJs, obfuscateOptions);
            fs.writeFileSync(mainJsPath, obfuscated.getObfuscatedCode(), "utf8");
            console.log("   [OK] main.js obfuscated");
        } catch (err) {
            console.log("   [WARN] main.js obfuscation failed: " + err.message);
            console.log("   [INFO] Using unobfuscated main.js");
        }

        // Obfuscate host.jsx
        const hostJsxPath = path.join(payloadDir, "host.jsx");
        if (fs.existsSync(hostJsxPath)) {
            console.log("   [OK] host.jsx copied as raw source (obfuscation intentionally skipped)");
        }
    } else {
        console.log("   [SKIP] Obfuscation (--no-obf flag)");
    }

    // ── Remove .debug if it slipped in ──
    const debugPath = path.join(payloadDir, ".debug");
    if (fs.existsSync(debugPath)) {
        fs.unlinkSync(debugPath);
        console.log("   [OK] Removed .debug file");
    }

    // Get folder size
    let totalSize = 0;
    function calcSize(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) calcSize(fullPath);
            else totalSize += fs.statSync(fullPath).size;
        }
    }
    calcSize(tierDir);
    console.log(`   [OK] ${tierLabel} build complete (${(totalSize / 1024).toFixed(0)} KB)`);
    console.log("");
}

console.log("╔══════════════════════════════════════════╗");
console.log("║   ✓ Universal build complete!            ║");
console.log("╠══════════════════════════════════════════╣");
console.log("║   dist/Captiongrit-Universal/            ║");
console.log("╚══════════════════════════════════════════╝");
console.log("");
console.log("Next: ZIP the folder and distribute!");
