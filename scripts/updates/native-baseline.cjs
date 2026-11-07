const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// These files can change autolinking/Expo native settings without changing yarn.lock.
// Compare them to the exact source recorded when the target APK was built.
function assertNativeBaseline(root, sourceSha) {
    if (!/^[a-f0-9]{40}$/.test(sourceSha || '')) throw new Error('Target APK receipt must contain its exact sourceSha.');
    for (const file of ['package.json', 'app.config.js']) {
        const original = execFileSync('git', ['show', `${sourceSha}:${file}`], { cwd: root });
        if (!original.equals(fs.readFileSync(path.join(root, file)))) {
            throw new Error(`${file} differs from the target APK: build a new APK before publishing OTA.`);
        }
    }
}
module.exports = { assertNativeBaseline };
