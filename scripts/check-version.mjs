import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const rootDir = resolve(new URL('..', import.meta.url).pathname);

function fail(message) {
    console.error(message);
    process.exitCode = 1;
}

function readText(path) {
    return readFileSync(resolve(rootDir, path), 'utf8');
}

function readJson(path) {
    return JSON.parse(readText(path));
}

function getVersionCode(version) {
    const [major, minor, patch] = version.split('.').map(Number);
    return major * 10000 + minor * 100 + patch;
}

function matchRequired(path, pattern, label) {
    const match = readText(path).match(pattern);
    if (!match) {
        fail(`${label} not found in ${path}`);
        return '';
    }
    return match[1];
}

const packageVersion = readJson('package.json').version;
const expectedVersionCode = String(getVersionCode(packageVersion));

const checks = [
    ['package-lock.json root', readJson('package-lock.json').version],
    ['package-lock.json package', readJson('package-lock.json').packages?.['']?.version],
    ['public/version.json', readJson('public/version.json').version],
    ['src/config.js APP_VERSION', matchRequired('src/config.js', /APP_VERSION = "(\d+\.\d+\.\d+)"/, 'APP_VERSION')],
    ['public/service-worker.js cache', matchRequired('public/service-worker.js', /F-field-v(\d+\.\d+\.\d+)/, 'service worker cache')],
    ['src/assets/pwa/service-worker.js cache', matchRequired('src/assets/pwa/service-worker.js', /F-field-v(\d+\.\d+\.\d+)/, 'archived service worker cache')],
    ['android versionName', matchRequired('android/app/build.gradle', /versionName "(\d+\.\d+\.\d+)"/, 'Android versionName')]
];

for (const [label, value] of checks) {
    if (value !== packageVersion) {
        fail(`${label} is ${value || '(missing)'}, expected ${packageVersion}`);
    }
}

const androidVersionCode = matchRequired('android/app/build.gradle', /versionCode (\d+)/, 'Android versionCode');
if (androidVersionCode !== expectedVersionCode) {
    fail(`Android versionCode is ${androidVersionCode || '(missing)'}, expected ${expectedVersionCode}`);
}

if (!process.exitCode) {
    console.log(`Version check passed: ${packageVersion} (Android versionCode ${expectedVersionCode}).`);
}
