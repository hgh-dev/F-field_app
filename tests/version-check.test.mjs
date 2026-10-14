import test from 'node:test';
import assert from 'node:assert/strict';
import { checkVersionAvailability } from '../src/app/version-check.js';

test('Android는 웹에 더 높은 버전이 있어도 Play 업데이트가 없으면 활성화하지 않는다', async () => {
    let webRequests = 0;
    const result = await checkVersionAvailability({
        isAndroid: true, currentVersion: '1.3.3',
        checkPlayUpdate: async () => ({ updateAvailable: false }),
        fetchWebVersion: async () => { webRequests++; return { version: '9.0.0', androidVersionCode: 90000 }; }
    });
    assert.deepEqual(result, { hasUpdate: false, latestVersion: '1.3.3' });
    assert.equal(webRequests, 0);
});

test('Android는 Play에서 업데이트 가능 응답을 받았을 때만 활성화한다', async () => {
    const result = await checkVersionAvailability({
        isAndroid: true, currentVersion: '1.3.3',
        checkPlayUpdate: async () => ({ updateAvailable: true }),
        fetchWebVersion: () => assert.fail('Android must not query web releases')
    });
    assert.equal(result.hasUpdate, true);
    assert.match(result.latestVersion, /Play 스토어/);
});

test('Play 조회 실패와 미지원 응답을 웹 버전으로 대체하지 않는다', async () => {
    const options = {
        isAndroid: true, currentVersion: '1.3.3',
        fetchWebVersion: () => assert.fail('Android must not fall back to web releases')
    };
    await assert.rejects(checkVersionAvailability({
        ...options, checkPlayUpdate: async () => { throw new Error('Play unavailable'); }
    }), /Play unavailable/);
    for (const info of [undefined, {}, { updateAvailable: 'true' }]) {
        const result = await checkVersionAvailability({ ...options, checkPlayUpdate: async () => info });
        assert.equal(result.hasUpdate, false);
    }
});

test('웹은 기존처럼 웹 배포 버전으로 업데이트 여부를 비교한다', async () => {
    for (const [version, expected] of [['1.3.4', true], ['1.3.3', false], ['1.3.2', false], ['1.10.0', true]]) {
        const result = await checkVersionAvailability({
            isAndroid: false, currentVersion: '1.3.3',
            checkPlayUpdate: () => assert.fail('Web must not query Play'),
            fetchWebVersion: async () => ({ version })
        });
        assert.deepEqual(result, { hasUpdate: expected, latestVersion: version });
    }
});
