import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coreModuleUrl = new URL('../src/ui-core.js', import.meta.url);
const memoModuleUrl = new URL('../src/ui-memo.js', import.meta.url);
const modalModuleUrl = new URL('../src/ui-app-modals.js', import.meta.url);
const sleepModuleUrl = new URL('../src/ui-sleep.js', import.meta.url);
const trackingModuleUrl = new URL('../src/features/tracking.js', import.meta.url);
const indexUrl = new URL('../index.html', import.meta.url);

test('UI 코어는 분리된 메모·모달·좌표 표시 기능을 다시 구현하지 않는다', async () => {
    const [core, memo, modal, sleep, tracking, index] = await Promise.all([
        readFile(coreModuleUrl, 'utf8'),
        readFile(memoModuleUrl, 'utf8'),
        readFile(modalModuleUrl, 'utf8'),
        readFile(sleepModuleUrl, 'utf8'),
        readFile(trackingModuleUrl, 'utf8'),
        readFile(indexUrl, 'utf8')
    ]);

    assert.doesNotMatch(core, /export function editLayerDescription/);
    assert.doesNotMatch(core, /export function openSettingsModal/);
    assert.doesNotMatch(core, /export function updateCoordDisplay/);
    assert.match(memo, /export function editLayerDescription/);
    assert.match(modal, /export function openSettingsModal/);
    assert.match(sleep, /export function updateCoordDisplay/);
    assert.match(tracking, /3\. 트랙 기록이 비정상적으로 종료될 경우 기록이 임시 저장되며, 다시 트랙 기록을 시작하면 이어서 기록할 수 있습니다\./);
    assert.doesNotMatch(index, /startSleepMode|sleep-mode-overlay|오른쪽으로 밀어서 절전 해제/);
    assert.ok(core.split('\n').length < 600, 'ui-core.js가 다시 비대해졌습니다.');
});
