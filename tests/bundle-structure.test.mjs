import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const viteConfigUrl = new URL('../vite.config.js', import.meta.url);
const entryModuleUrl = new URL('../src/script.js', import.meta.url);

test('초기 앱 번들은 지도·인증·저장소·네이티브 라이브러리를 별도 청크로 분리한다', async () => {
    const source = await readFile(viteConfigUrl, 'utf8');

    for (const chunkName of ['vendor-map', 'vendor-auth', 'vendor-storage', 'vendor-native']) {
        assert.match(source, new RegExp(`['"]${chunkName}['"]`));
    }
    assert.match(source, /manualChunks/);
});

test('Supabase 인증 화면은 정적 import가 아니라 앱 화면 준비 후 불러온다', async () => {
    const source = await readFile(entryModuleUrl, 'utf8');

    assert.doesNotMatch(source, /^import .*from ['"]\.\/auth\.js['"]/m);
    assert.match(source, /import\('\.\/auth\.js'\)/);
    assert.match(source, /import\('\.\/features\/auth-admin-ui\.js'\)/);
});
