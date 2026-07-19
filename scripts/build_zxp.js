const zxpSignCmd = require('zxp-sign-cmd');
const path = require('path');
const fs = require('fs');

const extDir = path.join(__dirname, '..', 'dist', 'Captiongrit-Pro');
const outZxp = path.join(__dirname, '..', 'Captiongrit-Pro.zxp');
const certPath = path.join(__dirname, '..', 'certificate.p12');
const certPassword = 'captiongrit';

const TIERS = ["Basic", "Pro", "Extreme", "Beta"];

async function build() {
    try {
        console.log('Generating self-signed certificate...');
        await zxpSignCmd.selfSignedCert({
            country: 'US',
            province: 'CA',
            org: 'Flogrit',
            name: 'Captiongrit',
            password: certPassword,
            output: certPath
        });

        for (const tier of TIERS) {
            const extDir = path.join(__dirname, '..', 'dist', `Captiongrit-${tier}`);
            const outZxp = path.join(__dirname, '..', `Captiongrit-${tier}.zxp`);

            if (!fs.existsSync(extDir)) {
                console.log(`[SKIP] ${extDir} does not exist. Run node build.js first.`);
                continue;
            }

            console.log(`Packaging ${tier} extension to ZXP...`);
            await zxpSignCmd.sign({
                input: extDir,
                output: outZxp,
                cert: certPath,
                password: certPassword,
                timestamp: 'http://timestamp.digicert.com'
            });
            console.log(`ZXP Package created successfully at: ${outZxp}`);
        }
        
        // Clean up cert
        if (fs.existsSync(certPath)) {
            fs.unlinkSync(certPath);
        }
    } catch (err) {
        console.error('Error during ZXP build:', err);
    }
}

build();
