/* ==========================================================================
   [모듈] 사용자지도 외부 라이브러리 로더 (user-maps/dependencies.js)
   [역할]
   - sql.js, PMTiles, shpjs, JSZip 같은 무거운 라이브러리를 필요할 때만 불러옵니다.
   - 같은 라이브러리를 여러 번 불러오지 않도록 Promise를 캐싱합니다.
   [참고]
   - MBTiles, PMTiles, SHP 파싱 라이브러리 로딩 문제가 생기면 확인합니다.
   ========================================================================== */
let sqlJsPromise = null;
let pmtilesPromise = null;
let shpParserPromise = null;
let jsZipPromise = null;

export function getSqlJs() {
    if (!sqlJsPromise) {
        sqlJsPromise = Promise.all([
            import('sql.js'),
            import('sql.js/dist/sql-wasm.wasm?url')
        ]).then(([sqlModule, wasmModule]) => {
            const initSqlJs = sqlModule.default;
            const sqlWasmUrl = wasmModule.default;
            return initSqlJs({ locateFile: () => sqlWasmUrl });
        });
    }
    return sqlJsPromise;
}

export function getPmtilesModule() {
    if (!pmtilesPromise) {
        pmtilesPromise = import('pmtiles');
    }
    return pmtilesPromise;
}

export function getShpParser() {
    if (!shpParserPromise) {
        shpParserPromise = import('shpjs/dist/shp.min.js').then(module => module.default);
    }
    return shpParserPromise;
}

export function getJSZipConstructor() {
    if (!jsZipPromise) {
        jsZipPromise = import('jszip').then(module => module.default || module);
    }
    return jsZipPromise;
}
