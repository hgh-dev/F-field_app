/* ==========================================================================
   [모듈] 지도 파일 드래그앤드롭 가져오기 (features/drag-import.js)
   [역할]
   - 사용자가 지도 화면에 파일을 끌어다 놓으면 가져오기 흐름으로 연결합니다.
   - 드래그 오버레이 표시와 브라우저 기본 파일 열기 동작 차단을 처리합니다.
   [참고]
   - 지도 위 파일 업로드 UI나 드롭 영역 동작을 바꿀 때 확인합니다.
   ========================================================================== */
/**
 * 드래그 이벤트가 파일 드래그인지 판별합니다.
 * 동작 원리: DataTransfer.types에 Files 타입이 포함되어 있는지 검사합니다.
 */
function isFileDragEvent(event) {
    const types = event?.dataTransfer?.types;
    if (!types) return false;
    return Array.from(types).includes('Files');
}

/**
 * 지도 화면 드래그앤드롭 파일 불러오기를 설정합니다.
 * 동작 원리:
 * - 파일 드래그 중에는 브라우저 기본 동작(파일 열기/페이지 이동)을 막습니다.
 * - 화면 전체 반투명 오버레이 + 중앙 드롭 박스로 상태를 안내합니다.
 * - drop 위치가 지도 영역 안일 때만 handleFileSelect() 경로로 전달합니다.
 */
export function setupMapFileDropImport({ map, handleFileSelect }) {
    const mapContainer = map.getContainer();
    if (!mapContainer) return;

    // 중복 초기화 방지
    if (document.getElementById('map-drop-import-overlay')) return;

    const dropOverlay = document.createElement('div');
    dropOverlay.id = 'map-drop-import-overlay';
    dropOverlay.style.position = 'fixed';
    dropOverlay.style.inset = '0';
    dropOverlay.style.background = 'rgba(0, 0, 0, 0.35)';
    dropOverlay.style.zIndex = '12000';
    dropOverlay.style.pointerEvents = 'none';
    dropOverlay.style.display = 'none';
    dropOverlay.style.alignItems = 'center';
    dropOverlay.style.justifyContent = 'center';
    dropOverlay.style.padding = '20px';

    const dropPanel = document.createElement('div');
    dropPanel.style.width = 'min(320px, calc(100vw - 40px))';
    dropPanel.style.minHeight = '100px';
    dropPanel.style.border = '3px dashed #FFFFFF';
    dropPanel.style.borderRadius = '14px';
    dropPanel.style.background = 'rgba(0, 0, 0, 0.28)';
    dropPanel.style.color = '#FFFFFF';
    dropPanel.style.display = 'flex';
    dropPanel.style.alignItems = 'center';
    dropPanel.style.justifyContent = 'center';
    dropPanel.style.textAlign = 'center';
    dropPanel.style.fontSize = '16px';
    dropPanel.style.fontWeight = '700';
    dropPanel.style.letterSpacing = '0.2px';
    dropPanel.style.textShadow = '0 1px 2px rgba(0,0,0,0.35)';
    dropPanel.style.padding = '18px 20px';
    dropPanel.style.boxSizing = 'border-box';
    dropPanel.textContent = '파일을 놓아 불러오기';

    dropOverlay.appendChild(dropPanel);
    document.body.appendChild(dropOverlay);

    let isFileDragging = false;
    let hideTimer = null;

    const setDropHighlight = (isActive) => {
        dropOverlay.style.display = isActive ? 'flex' : 'none';
    };

    const isPointInMap = (x, y) => {
        const rect = mapContainer.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    };

    const clearHideTimer = () => {
        if (!hideTimer) return;
        clearTimeout(hideTimer);
        hideTimer = null;
    };

    const scheduleHide = () => {
        clearHideTimer();
        hideTimer = setTimeout(() => {
            clearDragState();
        }, 80);
    };

    const updateDropPanelState = (inMap) => {
        dropPanel.textContent = inMap ? '파일을 놓아 불러오기' : '지도로 이동해 놓으세요';
        dropPanel.style.opacity = inMap ? '1' : '0.85';
    };

    const clearDragState = () => {
        clearHideTimer();
        isFileDragging = false;
        setDropHighlight(false);
        updateDropPanelState(true);
    };

    // 지도 밖으로 drop해도 파일이 브라우저에서 직접 열리지 않도록 기본 동작을 막습니다.
    document.addEventListener('dragenter', (event) => {
        if (!isFileDragEvent(event)) return;
        isFileDragging = true;
        event.preventDefault();
        clearHideTimer();
        setDropHighlight(true);
    });

    document.addEventListener('dragover', (event) => {
        if (!isFileDragEvent(event)) return;
        isFileDragging = true;
        event.preventDefault();
        clearHideTimer();
        setDropHighlight(true);

        const inMap = isPointInMap(event.clientX, event.clientY);
        updateDropPanelState(inMap);
        if (event.dataTransfer) event.dataTransfer.dropEffect = inMap ? 'copy' : 'none';
    });

    document.addEventListener('drop', (event) => {
        if (!isFileDragEvent(event)) return;
        event.preventDefault();

        const droppedFiles = event.dataTransfer?.files;
        const inMap = isPointInMap(event.clientX, event.clientY);
        clearDragState();

        if (!inMap || !droppedFiles || droppedFiles.length === 0) return;

        // 기존 파일 불러오기 로직(handleFileSelect)을 그대로 재사용합니다.
        const virtualInput = {
            files: droppedFiles,
            value: ''
        };
        handleFileSelect(virtualInput);
    });

    // drop 없이 바깥으로 빠지는 취소 케이스를 보정합니다.
    document.addEventListener('dragleave', (event) => {
        if (!isFileDragging || !isFileDragEvent(event)) return;
        if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
            clearDragState();
            return;
        }
        scheduleHide();
    });
    document.addEventListener('dragend', clearDragState);
    window.addEventListener('blur', clearDragState);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') clearDragState();
    });
}
