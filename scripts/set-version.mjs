import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(new URL('..', import.meta.url).pathname);
const nextVersion = process.argv[2];

function fail(message) {
    console.error(message);
    process.exit(1);
}

function assertVersion(version) {
    if (!/^\d+\.\d+\.\d+$/.test(version || '')) {
        fail('Usage: npm run version:set <major.minor.patch>');
    }
}

function getVersionCode(version) {
    const [major, minor, patch] = version.split('.').map(Number);
    return major * 10000 + minor * 100 + patch;
}

function readText(path) {
    return readFileSync(resolve(rootDir, path), 'utf8');
}

function writeText(path, content) {
    writeFileSync(resolve(rootDir, path), content);
}

function updateJson(path, updater) {
    const filePath = resolve(rootDir, path);
    const data = JSON.parse(readFileSync(filePath, 'utf8'));
    updater(data);
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function replaceRequired(path, pattern, replacement) {
    const current = readText(path);
    if (!pattern.test(current)) fail(`Version pattern not found in ${path}`);
    const next = current.replace(pattern, replacement);
    writeText(path, next);
}

assertVersion(nextVersion);
const nextVersionCode = getVersionCode(nextVersion);

updateJson('package.json', (data) => {
    data.version = nextVersion;
});

updateJson('package-lock.json', (data) => {
    data.version = nextVersion;
    if (data.packages?.['']) data.packages[''].version = nextVersion;
});

updateJson('public/version.json', (data) => {
    data.version = nextVersion;
});

replaceRequired(
    'src/config.js',
    /export const APP_VERSION\s*=\s*["']\d+\.\d+\.\d+["'];/,
    `export const APP_VERSION = "${nextVersion}";`
);

replaceRequired(
    'public/service-worker.js',
    /const STATIC_CACHE_NAME = 'F-field-v\d+\.\d+\.\d+';/,
    `const STATIC_CACHE_NAME = 'F-field-v${nextVersion}';`
);

replaceRequired(
    'src/assets/pwa/service-worker.js',
    /const STATIC_CACHE_NAME = 'F-field-v\d+\.\d+\.\d+';/,
    `const STATIC_CACHE_NAME = 'F-field-v${nextVersion}';`
);

replaceRequired(
    'android/app/build.gradle',
    /versionCode \d+/,
    `versionCode ${nextVersionCode}`
);

replaceRequired(
    'android/app/build.gradle',
    /versionName "\d+\.\d+\.\d+"/,
    `versionName "${nextVersion}"`
);

console.log(`F-Field version set to ${nextVersion} (Android versionCode ${nextVersionCode}).`);
