/*
 * shpjs 6은 기본 ZIP 파서와 저수준 파싱 함수를 각각 export합니다.
 * 기존 호출부가 사용하던 함수 형태를 유지하는 작은 호환 어댑터입니다.
 */
let shpParserPromise = null;

export function loadShpParser() {
    if (!shpParserPromise) {
        shpParserPromise = import('shpjs').then(module => Object.assign(module.default, {
            parseShp: module.parseShp,
            parseDbf: module.parseDbf,
            combine: module.combine
        }));
    }

    return shpParserPromise;
}
