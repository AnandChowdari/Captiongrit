/**
 * Captiongrit — Build Script with Version Control
 * 
 * Usage:
 *   node build.js
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const readline = require("readline");

// ── Config ──
const TIERS = ["universal"];
const DIST_DIR = path.join(__dirname, "dist");
const RELEASES_DIR = path.join(__dirname, "releases");
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

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise(resolve => rl.question(query, resolve));

function getCurrentVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, "package.json"), "utf8"));
        return pkg.version;
    } catch (e) {
        return "Unknown";
    }
}

async function main() {
    console.log("========================================");
    console.log(" Captiongrit Build System");
    console.log("========================================\n");

    const currentVersion = getCurrentVersion();
    console.log(`Current Version: ${currentVersion}\n`);

    console.log("Select build type:\n");
    console.log("[1] Test Build");
    console.log("    Rebuilds dist/ without changing the version");
    console.log("    Does not create a release ZIP\n");
    console.log("[2] New Release");
    console.log("    Updates the version");
    console.log("    Builds the plugin");
    console.log("    Creates a permanent release ZIP\n");

    let choice = await question("Enter choice: ");
    choice = choice.trim();

    if (choice === "1") {
        await doBuild("Test Build", currentVersion, false);
    } else if (choice === "2") {
        await handleNewRelease(currentVersion);
    } else {
        console.log("Invalid choice. Exiting.");
        process.exit(1);
    }
    
    rl.close();
}

async function handleNewRelease(currentVersion) {
    let newVersion = "";
    while (true) {
        newVersion = await question("\nEnter new version (e.g., 1.0.2): ");
        newVersion = newVersion.trim();
        
        if (/^\d+\.\d+\.\d+$/.test(newVersion)) {
            if (newVersion === currentVersion) {
                const proceed = await question(`Version ${newVersion} is the same as the current version. Proceed? [y/N]: `);
                if (proceed.trim().toLowerCase() !== 'y') {
                    console.log("Release cancelled.");
                    process.exit(0);
                }
            }
            break;
        } else {
            console.log("Invalid version. Please enter a valid version such as 1.0.2.");
        }
    }

    // Check if zip already exists
    const zipPath = path.join(RELEASES_DIR, `Captiongrit-Universal-v${newVersion}.zip`);
    if (fs.existsSync(zipPath)) {
        const overwrite = await question(`\nRelease v${newVersion} already exists.\nOverwrite existing release? [y/N]: `);
        if (overwrite.trim().toLowerCase() !== 'y') {
            console.log("Release cancelled.");
            process.exit(0);
        }
    }

    // Safely update files
    console.log("\nAttempting to synchronize versions...");
    const filesToUpdate = [
        { name: "package.json", path: path.join(SOURCE_DIR, "package.json") },
        { name: "manifest.xml", path: path.join(SOURCE_DIR, "CSXS", "manifest.xml") },
        { name: "index.html", path: path.join(SOURCE_DIR, "index.html") },
        { name: "main.js", path: path.join(SOURCE_DIR, "main.js") }
    ];

    // Read original states
    const originalStates = {};
    for (const file of filesToUpdate) {
        if (!fs.existsSync(file.path)) {
            console.error(`\n\u2717 Could not locate ${file.name}`);
            console.error("Build cancelled.");
            process.exit(1);
        }
        originalStates[file.name] = fs.readFileSync(file.path, "utf8");
    }

    let allSuccess = true;
    const newStates = {};

    try {
        // package.json
        const pkgStr = originalStates["package.json"];
        const pkgJson = JSON.parse(pkgStr);
        pkgJson.version = newVersion;
        newStates["package.json"] = JSON.stringify(pkgJson, null, 2);

        // manifest.xml
        let manifest = originalStates["manifest.xml"];
        let man1 = manifest.replace(/ExtensionBundleVersion="[^"]+"/, `ExtensionBundleVersion="${newVersion}"`);
        let man2 = man1.replace(/<Extension Id="com\.captiongrit\.panel" Version="[^"]+" \/>/, `<Extension Id="com.captiongrit.panel" Version="${newVersion}" />`);
        if (manifest === man2 && !manifest.includes(`ExtensionBundleVersion="${newVersion}"`)) throw new Error("Could not locate version in manifest.xml");
        newStates["manifest.xml"] = man2;

        // index.html
        let indexHtml = originalStates["index.html"];
        let index2 = indexHtml.replace(/<span class="version">v[^<]+<\/span>/, `<span class="version">v${newVersion}</span>`);
        if (indexHtml === index2 && !indexHtml.includes(`<span class="version">v${newVersion}</span>`)) throw new Error("Could not locate version in index.html");
        newStates["index.html"] = index2;

        // main.js
        let mainJs = originalStates["main.js"];
        let main2 = mainJs.replace(/var CURRENT_VERSION = "[^"]+";/, `var CURRENT_VERSION = "${newVersion}";`);
        if (mainJs === main2 && !mainJs.includes(`var CURRENT_VERSION = "${newVersion}";`)) throw new Error("Could not locate CURRENT_VERSION in main.js");
        newStates["main.js"] = main2;

    } catch (e) {
        console.error(`\n\u2717 ${e.message}`);
        console.error("Build cancelled.");
        process.exit(1);
    }

    // Write new versions
    for (const file of filesToUpdate) {
        fs.writeFileSync(file.path, newStates[file.name], "utf8");
    }

    console.log("\n\u2713 Version updated");
    console.log(`  package.json       \u2192 ${newVersion}`);
    console.log(`  manifest.xml       \u2192 ${newVersion}`);
    console.log(`  index.html         \u2192 v${newVersion}`);
    console.log(`  main.js            \u2192 ${newVersion}\n`);

    try {
        await doBuild("New Release", newVersion, true);
    } catch (e) {
        console.error(`\n\u2717 Release build failed: ${e.message}`);
        console.log("Restoring original version files...");
        for (const file of filesToUpdate) {
            fs.writeFileSync(file.path, originalStates[file.name], "utf8");
        }
        process.exit(1);
    }
}

async function doBuild(buildType, version, isRelease) {
    if (!SKIP_OBF) {
        try {
            require.resolve("javascript-obfuscator");
        } catch (e) {
            console.log("[INFO] Installing javascript-obfuscator...");
            execSync("npm install --save-dev javascript-obfuscator", { cwd: __dirname, stdio: "inherit" });
        }
    }

    cleanDir(DIST_DIR);

    let buildFailed = false;

    for (const tier of TIERS) {
        const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
        const tierDir = path.join(DIST_DIR, `Captiongrit-${tierLabel}`);
        const payloadDir = path.join(tierDir, "com.captiongrit.panel");

        fs.mkdirSync(payloadDir, { recursive: true });

        for (const file of FILES_TO_COPY) {
            const srcPath = path.join(SOURCE_DIR, file);
            if (fs.existsSync(srcPath)) {
                copyFileSync(srcPath, path.join(payloadDir, file));
            }
        }

        for (const dir of DIRS_TO_COPY) {
            const srcPath = path.join(SOURCE_DIR, dir);
            if (fs.existsSync(srcPath)) {
                copyDirSync(srcPath, path.join(payloadDir, dir));
            }
        }

        const installers = ["install.command", "install.bat", "uninstall.command", "uninstall.bat", "README.txt"];
        let missingInstallers = 0;
        for (const inst of installers) {
            const srcPath = path.join(SOURCE_DIR, inst);
            if (fs.existsSync(srcPath)) {
                copyFileSync(srcPath, path.join(tierDir, inst));
            } else if (inst !== "README.txt") {
                missingInstallers++;
            }
        }

        const requiredFiles = [
            path.join(payloadDir, "CSXS", "manifest.xml"),
            path.join(payloadDir, "bin", "mac", "ffmpeg"),
            path.join(payloadDir, "bin", "win", "ffmpeg.exe"),
        ];
        let missingPayload = 0;
        for (const req of requiredFiles) {
            if (!fs.existsSync(req)) {
                missingPayload++;
            }
        }

        if (missingInstallers > 0 || missingPayload > 0) {
            throw new Error("Missing required payload/installer files.");
        }

        const macFiles = ["install.command", "uninstall.command"];
        for (const mf of macFiles) {
            const mfPath = path.join(tierDir, mf);
            if (fs.existsSync(mfPath)) {
                let content = fs.readFileSync(mfPath, "utf8");
                content = content.replace(/\r\n/g, "\n");
                fs.writeFileSync(mfPath, content, "utf8");
            }
        }

        const mainJsPath = path.join(payloadDir, "main.js");
        let mainJs = fs.readFileSync(mainJsPath, "utf8");

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
                disableConsoleOutput: false,
            };

            try {
                const obfuscated = JavaScriptObfuscator.obfuscate(mainJs, obfuscateOptions);
                fs.writeFileSync(mainJsPath, obfuscated.getObfuscatedCode(), "utf8");
            } catch (err) {
                throw new Error("main.js obfuscation failed: " + err.message);
            }


        }

        const debugPath = path.join(payloadDir, ".debug");
        if (fs.existsSync(debugPath)) {
            fs.unlinkSync(debugPath);
        }
    }

    console.log("\u2713 Build completed");
    if (!SKIP_OBF) console.log("\u2713 Obfuscation completed");

    if (isRelease) {
        if (!fs.existsSync(RELEASES_DIR)) {
            fs.mkdirSync(RELEASES_DIR, { recursive: true });
        }

        const archiver = require("archiver");
        for (const tier of TIERS) {
            const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
            const tierDir = path.join(DIST_DIR, `Captiongrit-${tierLabel}`);
            const zipPath = path.join(RELEASES_DIR, `Captiongrit-${tierLabel}-v${version}.zip`);

            await new Promise((resolve, reject) => {
                const output = fs.createWriteStream(zipPath);
                const archive = archiver('zip', { zlib: { level: 9 } });

                output.on('close', () => resolve());
                archive.on('error', (err) => reject(err));
                archive.pipe(output);

                function addDir(dir, prefix) {
                    const entries = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);
                        const nameInZip = prefix ? `${prefix}/${entry.name}` : entry.name;
                        
                        if (entry.isDirectory()) {
                            addDir(fullPath, nameInZip);
                        } else {
                            const isScript = entry.name.endsWith('.sh') || entry.name.endsWith('.command');
                            archive.file(fullPath, { name: nameInZip, mode: isScript ? 0o755 : 0o644 });
                        }
                    }
                }
                
                addDir(tierDir, `Captiongrit-${tierLabel}`); 
                archive.finalize();
            });
            console.log("\u2713 Release ZIP created\n");
            console.log("Release:");
            console.log(`releases/Captiongrit-${tierLabel}-v${version}.zip\n`);
        }
        
        console.log(`Captiongrit v${version} release completed successfully.`);

    } else {
        console.log(`\n\u2713 Test build completed`);
        console.log(`\u2713 Version unchanged: ${version}`);
        console.log(`\u2713 No release ZIP created`);
    }
}

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

main();
