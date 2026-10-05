// 위치 조회 결과를 기록 주소와 간단 지번 이름으로 정리합니다.
export function getRecordAddress(value) {
    const address = typeof value === 'string' ? value.trim() : '';
    return address === '주소 정보 없음' ? '' : address;
}

export function getShortRecordAddress(value) {
    const address = getRecordAddress(value);
    if (!address) return '';
    const parts = address.split(/\s+/);
    let start = Math.max(0, parts.length - 2);
    for (let i = parts.length - 1; i >= 0; i--) {
        if (/(동|리|가)$/.test(parts[i])) {
            start = i;
            break;
        }
    }
    return parts.slice(start).join(' ').replace(/산\s+(?=\d)/g, '산');
}
