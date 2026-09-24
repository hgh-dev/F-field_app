import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifestUrl = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);
const activityUrl = new URL('../android/app/src/main/java/app/ffield/mobile/MainActivity.java', import.meta.url);
const serviceUrl = new URL('../android/app/src/main/java/app/ffield/mobile/TrackLocationService.java', import.meta.url);
const pluginUrl = new URL('../android/app/src/main/java/app/ffield/mobile/NativeTrackPlugin.java', import.meta.url);
const storeUrl = new URL('../android/app/src/main/java/app/ffield/mobile/TrackSessionStore.java', import.meta.url);

test('안드로이드 트랙 서비스는 위치 포그라운드 서비스로만 선언된다', async () => {
    const [manifest, activity, service, plugin, store] = await Promise.all([
        readFile(manifestUrl, 'utf8'),
        readFile(activityUrl, 'utf8'),
        readFile(serviceUrl, 'utf8'),
        readFile(pluginUrl, 'utf8'),
        readFile(storeUrl, 'utf8')
    ]);

    assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE_LOCATION/);
    assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
    assert.match(manifest, /android:foregroundServiceType="location"/);
    assert.doesNotMatch(manifest, /android\.permission\.ACCESS_BACKGROUND_LOCATION/);
    assert.match(activity, /registerPlugin\(NativeTrackPlugin\.class\)/);
    assert.match(service, /ServiceCompat\.startForeground/);
    assert.match(service, /addAction\(0, "기록 중지", stopPendingIntent\)/);
    assert.match(service, /return START_NOT_STICKY/);
    assert.match(plugin, /requestPermissionForAlias\("notifications"/);
    assert.match(plugin, /public void getPendingSession/);
    assert.match(plugin, /public void clearPendingSession/);
    assert.match(store, /active-track\.jsonl/);
    assert.match(store, /output\.getFD\(\)\.sync\(\)/);
    assert.match(store, /catch \(JSONException ignored\)/);
});
