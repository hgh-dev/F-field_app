import L from 'leaflet';
import './style.css';
import {
  createAffineMatrix,
  createManualMatrix,
  createSimilarityMatrix,
  getTransformMode,
  readExifGps
} from './georef-core.js';
import { LeafletDroneImageLayer } from './leaflet-drone-image-layer.js';

window.L = L;

const DEFAULT_CENTER = [36.5, 127.8];
const MAX_PREVIEW_SIZE = 2200;

const els = {
  photoInput: document.getElementById('photo-input'),
  imageMeta: document.getElementById('image-meta'),
  opacity: document.getElementById('opacity-input'),
  visible: document.getElementById('visible-input'),
  scale: document.getElementById('scale-input'),
  rotation: document.getElementById('rotation-input'),
  pickImage: document.getElementById('pick-image-btn'),
  pickMap: document.getElementById('pick-map-btn'),
  modeHelp: document.getElementById('mode-help'),
  pointList: document.getElementById('point-list'),
  clearPoints: document.getElementById('clear-points-btn'),
  fit: document.getElementById('fit-btn'),
  copyJson: document.getElementById('copy-json-btn'),
  summary: document.getElementById('transform-summary'),
  status: document.getElementById('status-text')
};

const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  maxZoom: 22
}).setView(DEFAULT_CENTER, 7);

L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 22,
  maxNativeZoom: 19,
  attribution: 'OpenStreetMap'
}).addTo(map);

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 22,
  maxNativeZoom: 19,
  attribution: 'Esri World Imagery'
}).addTo(map);

const droneLayer = new LeafletDroneImageLayer().addTo(map);
const mapPointLayer = L.layerGroup().addTo(map);

const state = {
  image: null,
  mode: null,
  pendingImagePoint: null,
  points: [],
  baseZoom: map.getZoom(),
  baseScale: Number(els.scale.value),
  rotation: 0,
  matrix: [1, 0, 0, 1, 0, 0]
};

els.photoInput.addEventListener('change', async event => {
  const file = event.target.files?.[0];
  if (!file) return;
  await loadPhoto(file);
});

els.opacity.addEventListener('input', () => {
  droneLayer.setOpacity(Number(els.opacity.value));
  syncSummary();
});

els.visible.addEventListener('change', () => {
  droneLayer.setVisible(els.visible.checked);
  syncSummary();
});

els.scale.addEventListener('input', () => {
  state.baseScale = Number(els.scale.value);
  updateTransform();
});

els.rotation.addEventListener('input', () => {
  state.rotation = Number(els.rotation.value);
  updateTransform();
});

els.pickImage.addEventListener('click', () => setMode(state.mode === 'image' ? null : 'image'));
els.pickMap.addEventListener('click', () => setMode(state.mode === 'map' ? null : 'map'));

els.clearPoints.addEventListener('click', () => {
  if (!state.image) return;
  const center = getImageCenterPoint();
  const latlng = map.getCenter();
  state.points = [{ image: center, latlng }];
  state.pendingImagePoint = null;
  setMode(null);
  updateTransform();
  renderPoints();
  setStatus('기준점을 초기화했습니다. 사진 중앙점이 현재 지도 중심에 연결됩니다.');
});

els.fit.addEventListener('click', () => fitToDroneImage());

els.copyJson.addEventListener('click', async () => {
  const payload = getExportPayload();
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  setStatus('현재 보정 JSON을 클립보드에 복사했습니다.');
});

map.on('click', event => {
  if (state.mode !== 'map' || !state.pendingImagePoint) return;
  addControlPoint(state.pendingImagePoint, event.latlng);
  state.pendingImagePoint = null;
  setMode('image');
});

map.on('zoom move resize', () => updateTransform({ skipRender: true }));
map.on('zoomend moveend', () => {
  updateTransform();
  renderMapPointMarkers();
});

droneLayer.getElement()?.addEventListener('click', handleImageLayerClick);

function handleImageLayerClick(event) {
  if (state.mode !== 'image' || !state.image) return;
  L.DomEvent.stop(event);
  const rect = map.getContainer().getBoundingClientRect();
  const containerPoint = L.point(event.clientX - rect.left, event.clientY - rect.top);
  const imagePoint = droneLayer.containerPointToImagePoint(containerPoint);
  if (!imagePoint) {
    setStatus('사진 영역 안쪽을 눌러 기준점을 선택하세요.');
    return;
  }
  state.pendingImagePoint = imagePoint;
  setMode('map');
  setStatus('같은 위치를 지도 위에서 누르세요.');
}

async function loadPhoto(file) {
  setStatus('사진을 읽는 중입니다.');
  const buffer = await file.arrayBuffer();
  const gps = readExifGps(buffer);
  const originalUrl = URL.createObjectURL(file);
  const preview = await createPreviewImage(originalUrl);
  URL.revokeObjectURL(originalUrl);

  state.image = {
    name: file.name,
    url: preview.dataUrl,
    width: preview.width,
    height: preview.height,
    gps
  };

  const centerLatLng = gps ? L.latLng(gps.lat, gps.lng) : map.getCenter();
  if (gps) map.setView(centerLatLng, Math.max(map.getZoom(), 18));

  state.baseZoom = map.getZoom();
  state.baseScale = Math.min(0.65, Math.max(0.08, 420 / preview.width));
  state.rotation = 0;
  els.scale.value = String(state.baseScale);
  els.rotation.value = '0';
  state.points = [{ image: getImageCenterPoint(), latlng: centerLatLng }];
  state.pendingImagePoint = null;

  droneLayer.setImage(preview.dataUrl, { width: preview.width, height: preview.height });
  updateTransform();
  renderPoints();
  setMode('image');
  els.imageMeta.textContent = gps
    ? `${file.name} · EXIF GPS ${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} · 미리보기 ${preview.width}x${preview.height}`
    : `${file.name} · EXIF GPS 없음 · 현재 지도 중심에 배치 · 미리보기 ${preview.width}x${preview.height}`;
  setStatus('사진 기준점을 찍은 뒤 같은 위치를 지도에서 찍으세요.');
}

function createPreviewImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const ratio = Math.min(1, MAX_PREVIEW_SIZE / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.round(image.naturalWidth * ratio);
      const height = Math.round(image.naturalHeight * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.88), width, height });
    };
    image.onerror = reject;
    image.src = url;
  });
}

function getImageCenterPoint() {
  return {
    x: (state.image?.width || 1) / 2,
    y: (state.image?.height || 1) / 2
  };
}

function addControlPoint(image, latlng) {
  state.points.push({
    image: {
      x: clamp(image.x, 0, state.image.width),
      y: clamp(image.y, 0, state.image.height)
    },
    latlng: L.latLng(latlng.lat, latlng.lng)
  });
  updateTransform();
  renderPoints();
  setStatus(`${state.points.length}개 기준점으로 ${getTransformMode(state.points.length)} 변환을 적용했습니다.`);
}

function updateTransform(options = {}) {
  if (!state.image || state.points.length === 0) return;

  const pairs = state.points.map(point => ({
    image: point.image,
    layer: map.latLngToLayerPoint(point.latlng)
  }));

  let matrix = null;
  if (pairs.length >= 3) matrix = createAffineMatrix(pairs);
  if (!matrix && pairs.length >= 2) matrix = createSimilarityMatrix(pairs);
  if (!matrix) {
    const zoomScale = 2 ** (map.getZoom() - state.baseZoom);
    matrix = createManualMatrix({
      imagePoint: pairs[0].image,
      layerPoint: pairs[0].layer,
      scale: state.baseScale * zoomScale,
      rotationDeg: state.rotation
    });
  }

  state.matrix = matrix;
  droneLayer.setMatrix(matrix);
  droneLayer.setPoints(state.points);
  if (!options.skipRender) {
    renderMapPointMarkers();
    renderPoints();
    syncSummary();
  }
}

function setMode(mode) {
  state.mode = mode;
  els.pickImage.classList.toggle('active', mode === 'image');
  els.pickMap.classList.toggle('active', mode === 'map');
  droneLayer.setInteractive(mode === 'image');

  if (mode === 'image') {
    els.modeHelp.textContent = '사진에서 기준점을 누르세요.';
    setStatus('사진 위에서 기준점을 누르세요.');
  } else if (mode === 'map') {
    els.modeHelp.textContent = '지도에서 같은 위치를 누르세요.';
    setStatus('같은 위치를 지도 위에서 누르세요.');
  } else {
    els.modeHelp.textContent = '사진 지점을 먼저 찍고, 같은 위치를 지도에서 찍으세요.';
  }
}

function renderPoints() {
  els.pointList.innerHTML = '';
  if (!state.points.length) {
    els.pointList.innerHTML = '<div class="meta">기준점이 없습니다.</div>';
    return;
  }

  state.points.forEach((point, index) => {
    const item = document.createElement('div');
    item.className = 'point-item';
    item.innerHTML = `
      <div class="point-num">${index + 1}</div>
      <div class="point-text">
        사진 ${point.image.x.toFixed(1)}, ${point.image.y.toFixed(1)}<br>
        지도 ${point.latlng.lat.toFixed(6)}, ${point.latlng.lng.toFixed(6)}
      </div>
      <button class="delete-point" type="button" aria-label="기준점 삭제" data-index="${index}">×</button>
    `;
    item.querySelector('.delete-point').addEventListener('click', () => {
      if (state.points.length <= 1) {
        setStatus('최소 1개 기준점은 남겨야 합니다.');
        return;
      }
      state.points.splice(index, 1);
      updateTransform();
      renderPoints();
    });
    els.pointList.appendChild(item);
  });
  syncSummary();
}

function renderMapPointMarkers() {
  mapPointLayer.clearLayers();
  state.points.forEach((point, index) => {
    const icon = L.divIcon({
      className: '',
      html: `<div class="map-control-point">${index + 1}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    L.marker(point.latlng, { icon, interactive: false }).addTo(mapPointLayer);
  });
}

function syncSummary() {
  if (!state.image) {
    els.summary.textContent = '변환 대기 중';
    return;
  }

  const mode = getTransformMode(state.points.length);
  const [a, b, c, d, e, f] = state.matrix;
  els.summary.textContent = [
    `mode: ${mode}`,
    `points: ${state.points.length}`,
    `matrix: [${[a, b, c, d, e, f].map(v => v.toFixed(4)).join(', ')}]`,
    `opacity: ${Number(els.opacity.value).toFixed(2)}`,
    `visible: ${els.visible.checked}`
  ].join('\n');
}

function getExportPayload() {
  return {
    type: 'drone-georef-prototype',
    image: state.image ? {
      name: state.image.name,
      width: state.image.width,
      height: state.image.height,
      gps: state.image.gps
    } : null,
    opacity: Number(els.opacity.value),
    visible: els.visible.checked,
    baseZoom: state.baseZoom,
    baseScale: state.baseScale,
    rotation: state.rotation,
    mode: getTransformMode(state.points.length),
    matrix: state.matrix,
    points: state.points.map(point => ({
      image: point.image,
      latlng: { lat: point.latlng.lat, lng: point.latlng.lng }
    }))
  };
}

function fitToDroneImage() {
  if (!state.image || !state.points.length) return;
  const latLngs = state.points.map(point => point.latlng);
  if (latLngs.length === 1) {
    map.setView(latLngs[0], Math.max(map.getZoom(), 18));
    return;
  }
  map.fitBounds(L.latLngBounds(latLngs), { padding: [80, 80], maxZoom: 20 });
}

function setStatus(text) {
  els.status.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

setStatus('이미지를 선택하면 EXIF GPS 또는 현재 지도 중심에 배치됩니다.');
