// Run after: yarn expo export --platform android --output-dir <export-dir>
// This prepares reviewable artifacts only; it never publishes or handles driver sessions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runtimeVersion } = require('./runtime.cjs');
const [exportDir, outputDir, tag, expectedRuntime, privateKeyPath] = process.argv.slice(2);
if (!exportDir || !outputDir || !privateKeyPath || !/^[A-Za-z0-9._-]+$/.test(tag || '')) throw new Error('Usage: node scripts/updates/prepare-ota.cjs EXPORT_DIR OUTPUT_DIR RELEASE_TAG APK_RUNTIME PRIVATE_KEY_PATH');
if (runtimeVersion() !== expectedRuntime) throw new Error('Native runtime changed: build a new APK before publishing this OTA.');
const exported = JSON.parse(fs.readFileSync(path.join(exportDir, 'export-runtime.json')));
if (exported.runtimeVersion !== expectedRuntime) throw new Error('Export does not belong to the target native runtime.');
if (fs.existsSync(outputDir)) throw new Error('Output directory must be new (immutable release assets).');
const key = fs.readFileSync(privateKeyPath);
const certificate = fs.readFileSync(path.resolve(__dirname, '../../certs/updates.pem'));
fs.mkdirSync(outputDir, { recursive: true });
const metadata = JSON.parse(fs.readFileSync(path.join(exportDir, 'metadata.json'))).fileMetadata.android;
const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', ttf: 'font/ttf', otf: 'font/otf', webp: 'image/webp', json: 'application/json' };
const files = [];
function asset(relative, ext, launch) {
    const absolute = path.resolve(exportDir, relative);
    if (!absolute.startsWith(path.resolve(exportDir) + path.sep)) throw new Error('Asset escaped export directory.');
    const bytes = fs.readFileSync(absolute);
    const digest = crypto.createHash('sha256').update(bytes).digest();
    const md5 = crypto.createHash('md5').update(bytes).digest('hex');
    const name = `${launch ? 'interface' : 'asset'}-${digest.toString('hex')}.${ext}`;
    fs.copyFileSync(absolute, path.join(outputDir, name));
    files.push({ name, size: bytes.length, sha256: digest.toString('hex') });
    return { key: md5, hash: digest.toString('base64url'), fileExtension: '.' + ext,
        contentType: launch ? 'application/javascript' : (mime[ext] || 'application/octet-stream'),
        url: `https://github.com/appcraft-ltd/navigator-dwc/releases/download/${tag}/${name}` };
}
const manifest = {
    id: crypto.randomUUID(), createdAt: new Date().toISOString(), runtimeVersion: expectedRuntime,
    launchAsset: asset(metadata.bundle, 'hbc', true),
    assets: metadata.assets.map(file => asset(file.path, file.ext, false)), metadata: {},
    extra: { expoClient: { name: 'FullSend Driver', slug: 'fullsend-driver', version: '0.1.2' } },
};
const body = JSON.stringify(manifest);
const signature = crypto.sign('RSA-SHA256', Buffer.from(body), key).toString('base64');
if (!crypto.verify('RSA-SHA256', Buffer.from(body), certificate, Buffer.from(signature, 'base64'))) throw new Error('Signing key does not match the certificate embedded in the APK.');
const receipt = { id: manifest.id, runtimeVersion: expectedRuntime, sourceSha: exported.sourceSha, createdAt: manifest.createdAt, tag, files };
fs.writeFileSync(path.join(outputDir, 'ota-entry.json'), JSON.stringify({ manifest: body, signature }, null, 2) + '\n');
fs.writeFileSync(path.join(outputDir, 'ota-receipt.safe.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ id: receipt.id, runtimeVersion: expectedRuntime, assets: files.length, bytes: files.reduce((sum, file) => sum + file.size, 0) }));
