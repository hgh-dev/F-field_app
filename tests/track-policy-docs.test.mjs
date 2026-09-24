import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = {
    manifest: new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
    privacyDraft: new URL('../PRIVACY_POLICY_DRAFT.md', import.meta.url),
    privacyPage: new URL('../public/privacy-policy.html', import.meta.url),
    playConsole: new URL('../PLAY_CONSOLE_POLICY_ANSWERS.md', import.meta.url),
    permissionsGuide: new URL('../RELEASE_PERMISSIONS_GUIDE.md', import.meta.url),
    dataSafety: new URL('../RELEASE_DATA_SAFETY_DRAFT.md', import.meta.url),
    storeListing: new URL('../PLAY_STORE_LISTING_DRAFT.md', import.meta.url),
    coordinateGuide: new URL('../public/coordinate-system.html', import.meta.url)
};

test('위치 정책 문서는 Android 포그라운드 트랙 동작과 일치한다', async () => {
    const entries = await Promise.all(Object.entries(files).map(async ([name, url]) => [name, await readFile(url, 'utf8')]));
    const docs = Object.fromEntries(entries);
    const releaseDocs = [
        docs.privacyDraft,
        docs.privacyPage,
        docs.playConsole,
        docs.permissionsGuide,
        docs.dataSafety,
        docs.storeListing
    ].join('\n');

    assert.match(docs.manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);
    assert.match(docs.manifest, /android\.permission\.POST_NOTIFICATIONS/);
    assert.doesNotMatch(docs.manifest, /android\.permission\.ACCESS_BACKGROUND_LOCATION/);

    assert.match(docs.privacyDraft, /위치 포그라운드 서비스/);
    assert.match(docs.privacyPage, /위치 포그라운드 서비스/);
    assert.match(docs.playConsole, /서비스 유형: location/);
    assert.match(docs.playConsole, /심사 동영상 권장 순서/);
    assert.match(docs.coordinateGuide, /화면을 끄거나 다른 앱을 사용해도/);
    assert.match(releaseDocs, /ACCESS_BACKGROUND_LOCATION/);
    assert.match(releaseDocs, /지속 알림/);
    assert.match(releaseDocs, /미완료 트랙|완료되지 않은 GPS 트랙/);

    assert.doesNotMatch(releaseDocs, /앱을 열고 관련 기능을 사용하는 동안에만/);
    assert.doesNotMatch(releaseDocs, /앱이 백그라운드로 가거나 화면이 꺼지면 트랙 기록이 중단될 수 있다/);
});
