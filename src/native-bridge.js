/* ==========================================================================
   [모듈] 네이티브 앱 연동 (native-bridge.js)
   [역할]
   - Capacitor 기반 Android/iOS 앱에서 공유, 파일 저장, Base64 저장 같은 네이티브 기능을 호출합니다.
   - 웹 브라우저 환경에서는 가능한 범위의 fallback을 제공합니다.
   [참고]
   - 모바일 앱에서 공유/저장 기능이 다르게 동작할 때 확인합니다.
   ========================================================================== */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const NativeFileSaver = registerPlugin('NativeFileSaver');

export function isNativeApp() {
    return Capacitor.isNativePlatform();
}

export async function shareTextUrl({ title = '', text = '', url = '', dialogTitle = '' }) {
    if (isNativeApp()) {
        await Share.share({
            title,
            text,
            url,
            dialogTitle: dialogTitle || title || undefined
        });
        return true;
    }

    if (navigator.share) {
        await navigator.share({ title, text, url });
        return true;
    }

    return false;
}

export function dataUrlToBase64(dataUrl) {
    const marker = ';base64,';
    const markerIndex = dataUrl.indexOf(marker);
    if (markerIndex === -1) return dataUrl;
    return dataUrl.slice(markerIndex + marker.length);
}

export async function saveBase64FileNative({ dataUrl, fileName, mimeType }) {
    const tempPath = `exports/${Date.now()}_${fileName}`;

    const tempResult = await Filesystem.writeFile({
        path: tempPath,
        data: dataUrlToBase64(dataUrl),
        directory: Directory.Cache,
        recursive: true
    });

    try {
        return await NativeFileSaver.saveFromUri({
            sourceUri: tempResult.uri,
            fileName,
            mimeType
        });
    } catch (err) {
        if (err?.message !== 'Save canceled') {
            // Fall through to app-private save/share for devices without the local plugin.
        } else {
            throw err;
        }
    }

    const result = await Filesystem.writeFile({
        path: fileName,
        data: dataUrlToBase64(dataUrl),
        directory: Directory.Documents,
        recursive: true
    });

    try {
        await Share.share({
            title: fileName,
            text: `${fileName} 저장/공유`,
            url: result.uri,
            dialogTitle: fileName
        });
    } catch (err) {
        // 공유 시트 취소는 파일 저장 성공과 별개이므로 조용히 무시합니다.
    }

    return result;
}

export async function saveBlobNative({ blob, fileName, mimeType }) {
    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });

    return saveBase64FileNative({ dataUrl, fileName, mimeType });
}
