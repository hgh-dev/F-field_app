/* ==========================================================================
   [모듈] MBTiles Leaflet 레이어 (user-maps/mbtiles-layer.js)
   [역할]
   - SQLite 기반 MBTiles 데이터를 Leaflet GridLayer로 읽어 지도 타일처럼 표시합니다.
   - z/x/y 타일 좌표를 MBTiles row 구조에 맞게 변환하고 이미지 Blob을 생성합니다.
   [참고]
   - MBTiles 사용자지도가 보이지 않거나 타일이 뒤집혀 보일 때 확인합니다.
   ========================================================================== */
export class MbtilesLayer extends L.GridLayer {
    constructor(db, options = {}) {
        super(options);
        this.db = db;
        this.tms = options.tms !== false;
        this.mimeType = options.mimeType || 'image/png';
    }

    createTile(coords, done) {
        const tile = document.createElement('img');
        tile.alt = '';
        tile.role = 'presentation';

        const z = coords.z;
        const x = coords.x;
        const y = this.tms ? Math.pow(2, z) - 1 - coords.y : coords.y;

        try {
            const stmt = this.db.prepare('SELECT tile_data FROM tiles WHERE zoom_level = ? AND tile_column = ? AND tile_row = ? LIMIT 1');
            stmt.bind([z, x, y]);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                const blob = new Blob([row.tile_data], { type: this.mimeType });
                tile.onload = () => {
                    URL.revokeObjectURL(tile.src);
                    done(null, tile);
                };
                tile.onerror = () => {
                    URL.revokeObjectURL(tile.src);
                    done(null, tile);
                };
                tile.src = URL.createObjectURL(blob);
            } else {
                done(null, tile);
            }
            stmt.free();
        } catch (error) {
            done(error, tile);
        }

        return tile;
    }
}

export function getMbtilesMimeType(db) {
    try {
        const result = db.exec("SELECT value FROM metadata WHERE name = 'format' LIMIT 1");
        const format = String(result?.[0]?.values?.[0]?.[0] || '').toLowerCase();
        if (format.includes('jpg') || format.includes('jpeg')) return 'image/jpeg';
        if (format.includes('webp')) return 'image/webp';
        if (format.includes('png')) return 'image/png';
    } catch {
        // metadata가 없는 MBTiles도 있어 기본 PNG로 처리합니다.
    }
    return 'image/png';
}
