const fs = require('fs');
const path = require('path');
const ffbinaries = require('ffbinaries');

const binDir = path.join(__dirname, '..', 'bin');
const macDir = path.join(binDir, 'mac');
const winDir = path.join(binDir, 'win');

// Ensure directories exist
[binDir, macDir, winDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

console.log('Downloading FFmpeg for macOS...');
ffbinaries.downloadBinaries(['ffmpeg'], { platform: 'osx-64', destination: macDir }, function () {
    console.log('macOS FFmpeg downloaded successfully.');
    
    console.log('Downloading FFmpeg for Windows...');
    ffbinaries.downloadBinaries(['ffmpeg'], { platform: 'windows-64', destination: winDir }, function () {
        console.log('Windows FFmpeg downloaded successfully.');
        console.log('All FFmpeg binaries are ready!');
    });
});
