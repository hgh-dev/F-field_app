import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { zip as writeShpZip } from '@crmackey/shp-write';
import { parseShpZipToWgs84 } from '../src/shp-zip-parser.js';

async function createShpZipWithMacOsMetadata() {
    const rawZip = await writeShpZip({
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: { NAME: 'test' },
            geometry: { type: 'Point', coordinates: [127, 37] }
        }]
    }, {
        name: 'sample',
        types: { point: 'sample' }
    });
    const zip = await JSZip.loadAsync(await rawZip.arrayBuffer());
    zip.file('__MACOSX/._sample.shp', new Uint8Array([0, 5, 22, 7]));
    zip.file('__MACOSX/._sample.shx', new Uint8Array([0, 5, 22, 7]));
    zip.file('__MACOSX/._sample.dbf', new Uint8Array([0, 5, 22, 7]));
    zip.file('__MACOSX/._sample.prj', new Uint8Array([0, 5, 22, 7]));
    zip.file('__MACOSX/.DS_Store', new Uint8Array([0, 0, 0, 1]));
    return zip.generateAsync({ type: 'arraybuffer' });
}

test('macOS 보조 파일을 SHP 레이어로 처리하지 않는다', async () => {
    const archive = await createShpZipWithMacOsMetadata();
    const parsed = await parseShpZipToWgs84(archive, 'auto');

    assert.equal(parsed.features.length, 1);
    assert.equal(parsed.features[0].geometry.type, 'Point');
    assert.deepEqual(parsed.features[0].geometry.coordinates, [127, 37]);
    assert.equal(parsed.features[0].properties.NAME, 'test');
});
