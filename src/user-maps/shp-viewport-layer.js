/* ==========================================================================
   [모듈] SHP/GeoJSON 화면 범위 렌더링 (user-maps/shp-viewport-layer.js)
   [역할]
   - 큰 SHP/GeoJSON 사용자지도에서 현재 화면 주변의 feature만 Leaflet 레이어로 그립니다.
   - 카테고리 표시 상태와 사용자지도 스타일을 적용해 성능 부담을 줄입니다.
   [참고]
   - 큰 SHP 파일 표시 성능이나 일부 도형 표시 누락 문제가 생기면 확인합니다.
   ========================================================================== */
import { map } from '../map.js';
import { createColoredMarkerIcon } from '../utils.js';
import { DEFAULT_VECTOR_STYLE } from './constants.js';
import { getUserMapLayerZIndex } from './layer-pane.js';
import { bboxIntersects, bboxToLeafletBounds, collectLatLngSegments, getBufferedMapBbox, getStoredFeatureBbox } from './spatial-utils.js';
import { getFeatureUserMapStyle, getUserMapGeometryType, isFeatureCategoryVisible } from './style-state.js';

function getBaseSmoothFactorForZoom(zoom) {
    if (zoom >= 15) return 1;
    if (zoom === 14) return 2;
    if (zoom === 13) return 4;
    if (zoom <= 11) return 10;
    return 7;
}

function getShpSmoothFactor(item) {
    const level = item?.simplifyLevel || 'off';
    if (level === 'off') return 1;

    const multipliers = {
        low: 0.5,
        medium: 1,
        high: 2
    };
    const multiplier = multipliers[level] || multipliers.low;
    return Math.max(1, getBaseSmoothFactorForZoom(map.getZoom()) * multiplier);
}

function addSolidDotUserMapDots(group, pathLayer, featureStyle, paneName, renderer) {
    if (!group || !pathLayer || typeof pathLayer.getLatLngs !== 'function') return;
    if (featureStyle?.customLineStyle !== 'solid-dot') return;

    const weight = Math.min(5, Math.max(1, parseFloat(featureStyle.customWeight || featureStyle.weight || DEFAULT_VECTOR_STYLE.weight)));
    const color = featureStyle.color || featureStyle.customStrokeColor || featureStyle.customColor || DEFAULT_VECTOR_STYLE.color;
    const dotWeight = Math.max(3, weight * 3);
    const dotLength = Math.max(0.01, dotWeight * 0.08);
    const gapLength = Math.max(48, dotWeight * 8);
    const segments = collectLatLngSegments(pathLayer.getLatLngs());
    const isPolygonLayer = pathLayer instanceof L.Polygon;

    segments.forEach(segment => {
        if (!segment || segment.length < 2) return;
        const dotLineLatLngs = [...segment];
        if (isPolygonLayer && segment.length > 2) {
            const first = segment[0];
            const last = segment[segment.length - 1];
            if (first.lat !== last.lat || first.lng !== last.lng) dotLineLatLngs.push(first);
        }

        const dotLine = L.polyline(dotLineLatLngs, {
            pane: paneName,
            renderer,
            color,
            opacity: 1,
            weight: dotWeight,
            dashArray: `${dotLength}, ${gapLength}`,
            lineCap: 'round',
            lineJoin: 'round',
            fill: false,
            interactive: false,
            bubblingMouseEvents: false
        }).addTo(group);
        if (typeof dotLine.bringToFront === 'function') dotLine.bringToFront();
    });
}

function getShpRenderGeojson(item, geojson) {
    const viewportBbox = getBufferedMapBbox();
    const features = (geojson?.features || []).filter(feature =>
        isFeatureCategoryVisible(item, feature) && bboxIntersects(getStoredFeatureBbox(feature), viewportBbox)
    );

    return {
        type: 'FeatureCollection',
        features
    };
}

function buildShpFeatureLayer(item, geojson, paneName, renderer) {
    const smoothFactor = getShpSmoothFactor(item);
    const baseLayer = L.geoJSON(geojson, {
        pane: paneName,
        renderer,
        style: feature => ({
            ...getFeatureUserMapStyle(item, feature),
            smoothFactor
        }),
        pointToLayer: (feature, latlng) => {
            const featureStyle = getFeatureUserMapStyle(item, feature);
            if (getUserMapGeometryType(item) === 'marker') {
                const markerStyle = featureStyle.customEmoji || 'circle';
                return L.marker(latlng, {
                    pane: paneName,
                    icon: createColoredMarkerIcon(
                        featureStyle.customColor || featureStyle.color || DEFAULT_VECTOR_STYLE.color,
                        markerStyle,
                        featureStyle.customMarkerSize || 3
                    )
                });
            }
            return L.circleMarker(latlng, {
                radius: 5,
                pane: paneName,
                renderer,
                ...featureStyle
            });
        }
    });

    const group = L.featureGroup();
    baseLayer.eachLayer(childLayer => {
        group.addLayer(childLayer);
        if (!(childLayer instanceof L.Marker) && !(childLayer instanceof L.CircleMarker)) {
            addSolidDotUserMapDots(group, childLayer, getFeatureUserMapStyle(item, childLayer.feature), paneName, renderer);
        }
    });
    return group;
}

export function syncShpViewportLayer(layer, item) {
    if (!layer?.__fFieldShp || !layer.__allGeojson) return;

    const viewportBbox = getBufferedMapBbox();
    const renderKey = `${map.getZoom()}|${viewportBbox.map(value => value.toFixed(5)).join('|')}|${item.simplifyLevel || 'off'}|${(item.categoryVisibleValues || []).join('|')}|${JSON.stringify(item.style || {})}|${JSON.stringify(item.categoryStyles || {})}`;
    if (layer.__lastRenderKey === renderKey) return;

    const visibleGeojson = getShpRenderGeojson(item, layer.__allGeojson);
    layer.clearLayers();
    buildShpFeatureLayer(item, visibleGeojson, layer.__paneName, layer.__renderer).eachLayer(childLayer => {
        layer.addLayer(childLayer);
    });
    layer.__lastRenderKey = renderKey;
}

export function createShpViewportLayer(item, geojson, paneName, getItemIndex) {
    const renderer = L.canvas({ pane: paneName, padding: 0.5, tolerance: 15 });
    const layer = L.featureGroup();
    layer.options = {
        pane: paneName,
        renderer,
        zIndex: getUserMapLayerZIndex(Math.max(0, getItemIndex(item.id)))
    };
    layer.__fFieldShp = true;
    layer.__renderer = renderer;
    layer.__paneName = paneName;
    layer.__allGeojson = geojson;
    layer.__fullBounds = bboxToLeafletBounds(geojson.__bbox || null);
    layer.bringToFront = function bringToFrontShpLayer() {
        this.eachLayer(childLayer => {
            if (typeof childLayer.bringToFront === 'function') childLayer.bringToFront();
        });
        return this;
    };
    layer.setZIndex = function setZIndexShpLayer(zIndex) {
        this.options.zIndex = zIndex;
        if (this.__renderer?._container?.style) {
            this.__renderer._container.style.zIndex = String(zIndex);
        }
        this.eachLayer(childLayer => {
            if (typeof childLayer.setZIndex === 'function') childLayer.setZIndex(zIndex);
            if (childLayer.options) childLayer.options.zIndex = zIndex;
        });
        return this;
    };
    layer.getBounds = function getBoundsShpLayer() {
        if (this.__fullBounds?.isValid?.()) return this.__fullBounds;
        return L.featureGroup.prototype.getBounds.call(this);
    };
    syncShpViewportLayer(layer, item);
    return layer;
}
