const { runtimeVersion } = require('./scripts/updates/runtime.cjs');
module.exports = {
    name: 'FullSend Driver', slug: 'fullsend-driver', version: '0.1.2',
    runtimeVersion: runtimeVersion(), platforms: ['android'],
    android: { package: 'com.fullsendcargo.navigator', versionCode: 4 },
    updates: {
        url: 'https://fleetbase-dwc-production.up.railway.app/v1/navigator/updates/manifest',
        checkAutomatically: 'NEVER', fallbackToCacheTimeout: 0,
        codeSigningCertificate: './certs/updates.pem',
        codeSigningMetadata: { keyid: 'fullsend-2026', alg: 'rsa-v1_5-sha256' },
        requestHeaders: { 'expo-channel-name': 'driver-beta' },
    },
};
