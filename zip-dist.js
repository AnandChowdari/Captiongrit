const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
    console.error("No dist directory found. Run build.js first.");
    process.exit(1);
}

const tiers = fs.readdirSync(distDir, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('Captiongrit-'))
    .map(dirent => dirent.name);

async function zipTiers() {
    console.log("=========================================");
    console.log("   Captiongrit — Cross-Platform Zipper");
    console.log("=========================================\n");

    for (const tier of tiers) {
        console.log(`[+] Packing ${tier}...`);
        await new Promise((resolve, reject) => {
            const tierPath = path.join(distDir, tier);
            const outPath = path.join(distDir, `${tier}.zip`);
            const output = fs.createWriteStream(outPath);
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('close', () => {
                console.log(`    [OK] Created ${tier}.zip (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)\n`);
                resolve();
            });
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
                        // CRUCIAL: Force Unix execution permissions (0755) for all shell scripts
                        const isScript = entry.name.endsWith('.sh') || entry.name.endsWith('.command');
                        archive.file(fullPath, { name: nameInZip, mode: isScript ? 0o755 : 0o644 });
                    }
                }
            }
            
            // Put contents inside a root folder (e.g. Captiongrit-Beta/) in the ZIP
            addDir(tierPath, tier); 
            archive.finalize();
        });
    }
}

zipTiers().then(() => console.log("All ZIP files generated! Ready for distribution."));
