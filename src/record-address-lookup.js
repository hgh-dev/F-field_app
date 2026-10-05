import { VWORLD_API_KEY } from './config.js';
import { getRecordAddress } from './record-address.js';

let requestSequence = 0;

/** 좌표의 전체 지번 주소를 조회하고, 지번이 없을 때만 도로명 주소를 사용합니다. */
export function lookupRecordAddress(lat, lng, timeoutMs = 15000) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve('');
    return new Promise(resolve => {
        const callbackName = `vworld_record_address_${Date.now()}_${requestSequence++}`;
        const script = document.createElement('script');
        let settled = false;
        const cleanup = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            delete window[callbackName];
            script.remove();
            resolve(getRecordAddress(value));
        };
        window[callbackName] = data => {
            const results = data?.response?.status === 'OK' ? data.response.result || [] : [];
            const parcel = results.find(item => item.type === 'parcel')?.text;
            const road = results.find(item => item.type === 'road')?.text;
            cleanup(parcel || road || '');
        };
        script.onerror = () => cleanup('');
        const timeout = setTimeout(() => cleanup(''), timeoutMs);
        script.src = `https://api.vworld.kr/req/address?service=address&request=getAddress&version=2.0&crs=epsg:4326&point=${lng},${lat}&format=jsonp&type=BOTH&zipcode=false&simple=false&key=${VWORLD_API_KEY}&callback=${callbackName}`;
        document.body.appendChild(script);
    });
}
