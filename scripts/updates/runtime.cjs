// A native build and an OTA export must compute the same conservative compatibility ID.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
function runtimeVersion() {
    const files = [];
    function visit(relative) {
        const absolute = path.join(root, relative);
        if (fs.statSync(absolute).isDirectory()) {
            fs.readdirSync(absolute).sort().forEach(name => visit(`${relative}/${name}`));
        } else files.push(relative);
    }
    ['android/app/src/main', 'android/app/build.gradle', 'android/build.gradle', 'android/settings.gradle',
        'android/gradle.properties', 'yarn.lock', 'react-native.config.js', '.yarn/patches',
        '.env.dwc.example', 'scripts/patch-react-native-packages.js', 'scripts/updates/runtime.cjs'].forEach(visit);
    const hash = crypto.createHash('sha256');
    for (const file of files.sort()) hash.update(file + '\0').update(fs.readFileSync(path.join(root, file))).update('\0');
    return 'android-' + hash.digest('hex');
}
module.exports = { runtimeVersion };
if (require.main === module) process.stdout.write(runtimeVersion());
