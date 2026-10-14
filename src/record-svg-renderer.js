import { L } from './vendor-globals.js';

export function getStrokePosition(layer) {
    const value = layer.feature?.properties?.customStrokePosition ?? layer.options?.strokePosition;
    if (['inside', 'center', 'outside'].includes(value)) return value;
    return layer.feature?.properties?.customStrokeInside === true || layer.options?.strokeInside === true ? 'inside' : 'center';
}

function collectProjectedRings(latlngs, map, rings = []) {
    if (!Array.isArray(latlngs) || latlngs.length === 0) return rings;
    if (latlngs[0] instanceof L.LatLng) {
        const points = latlngs.map(latlng => map.latLngToLayerPoint(latlng));
        if (points.length > 2) rings.push(points);
        return rings;
    }
    latlngs.forEach(child => collectProjectedRings(child, map, rings));
    return rings;
}

function stripClosingPoint(points) {
    if (points.length < 2) return points;
    const first = points[0];
    const last = points[points.length - 1];
    return first.x === last.x && first.y === last.y ? points.slice(0, -1) : points;
}

function signedArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i += 1) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
}

function pointInRing(point, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const a = ring[i];
        const b = ring[j];
        const crosses = (a.y > point.y) !== (b.y > point.y);
        if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

function getRingInteriorPoint(ring, area) {
    const interiorNormalSign = area >= 0 ? 1 : -1;
    for (let i = 0; i < ring.length; i += 1) {
        const current = ring[i];
        const next = ring[(i + 1) % ring.length];
        const dx = next.x - current.x;
        const dy = next.y - current.y;
        const length = Math.hypot(dx, dy);
        if (length < 0.001) continue;
        return L.point(
            (current.x + next.x) / 2 + (-dy / length) * interiorNormalSign * 0.01,
            (current.y + next.y) / 2 + (dx / length) * interiorNormalSign * 0.01
        );
    }
    return ring[0];
}

function getMaterialNormalSign(ring, allRings) {
    const area = signedArea(ring);
    const interiorPoint = getRingInteriorPoint(ring, area);
    const nestingDepth = allRings.reduce((depth, candidate) => {
        if (candidate === ring || !pointInRing(interiorPoint, candidate)) return depth;
        return depth + 1;
    }, 0);
    const geometricInteriorSign = area >= 0 ? 1 : -1;
    return nestingDepth % 2 === 0 ? geometricInteriorSign : -geometricInteriorSign;
}

function getSegmentLeftNormal(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.001) return null;
    return L.point(-dy / length, dx / length);
}

function offsetRing(ring, distance, normalSign) {
    const points = stripClosingPoint(ring);
    if (points.length < 3 || Math.abs(distance) < 0.001) return points;

    const offsetPoints = [];
    const maxMiter = Math.abs(distance) * 4;
    for (let i = 0; i < points.length; i += 1) {
        const previous = points[(i - 1 + points.length) % points.length];
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const previousNormal = getSegmentLeftNormal(previous, current);
        const nextNormal = getSegmentLeftNormal(current, next);
        if (!previousNormal || !nextNormal) {
            offsetPoints.push(current);
            continue;
        }

        previousNormal.x *= normalSign;
        previousNormal.y *= normalSign;
        nextNormal.x *= normalSign;
        nextNormal.y *= normalSign;
        const sumX = previousNormal.x + nextNormal.x;
        const sumY = previousNormal.y + nextNormal.y;
        const sumLength = Math.hypot(sumX, sumY);
        if (sumLength < 0.001) {
            offsetPoints.push(L.point(
                current.x + nextNormal.x * distance,
                current.y + nextNormal.y * distance
            ));
            continue;
        }

        const miterX = sumX / sumLength;
        const miterY = sumY / sumLength;
        const denominator = miterX * nextNormal.x + miterY * nextNormal.y;
        let miterLength = Math.abs(denominator) < 0.001 ? distance : distance / denominator;
        miterLength = Math.max(-maxMiter, Math.min(maxMiter, miterLength));
        offsetPoints.push(L.point(
            current.x + miterX * miterLength,
            current.y + miterY * miterLength
        ));
    }
    return offsetPoints;
}

function createPositionedStrokePath(layer, renderer, position) {
    const rings = collectProjectedRings(layer.getLatLngs(), renderer._map)
        .map(stripClosingPoint)
        .filter(ring => ring.length > 2);
    if (!rings.length) return '';

    const direction = position === 'inside' ? 1 : -1;
    const distance = Number(layer.options.weight || 0) / 2;
    const positionedRings = rings.map(ring => offsetRing(
        ring,
        distance * direction,
        getMaterialNormalSign(ring, rings)
    ));
    return L.SVG.pointsToPath(positionedRings, true);
}

const RecordSvgRenderer = L.SVG.extend({
    _updateStyle(layer) {
        L.SVG.prototype._updateStyle.call(this, layer);
        this._syncPositionedStroke(layer);
        this._syncLineHitArea(layer);
    },

    _setPath(layer, path) {
        L.SVG.prototype._setPath.call(this, layer, path);
        this._syncPositionedStroke(layer);
        this._syncLineHitArea(layer);
    },

    _syncLineHitArea(layer) {
        const enabled = layer instanceof L.Polyline && !(layer instanceof L.Polygon) &&
            layer.options.interactive && layer.options.stroke && !layer.feature?.properties?.isHidden;
        if (!enabled || !layer._path?.parentNode) {
            if (layer._recordHitPath) layer.removeInteractiveTarget(layer._recordHitPath);
            layer._recordHitPath?.remove();
            delete layer._recordHitPath;
            return;
        }
        if (!layer._recordHitPath) {
            const hit = L.SVG.create('path');
            hit.setAttribute('class', 'leaflet-interactive record-line-hit-area');
            hit.setAttribute('fill', 'none');
            hit.setAttribute('stroke', 'transparent');
            hit.setAttribute('pointer-events', 'stroke');
            hit.setAttribute('stroke-linecap', 'round');
            hit.setAttribute('stroke-linejoin', 'round');
            layer._path.before(hit);
            layer.addInteractiveTarget(hit);
            layer._recordHitPath = hit;
        }
        layer._recordHitPath.setAttribute('d', layer._path.getAttribute('d') || 'M0 0');
        layer._recordHitPath.setAttribute('stroke-width', String(Math.max(30, layer.options.weight)));
    },

    _removeLegacyStrokeArtifacts(layer) {
        layer._outsideStrokePath?.remove();
        layer._outsideStrokeClip?.remove();
        layer._insideStrokeClip?.remove();
        delete layer._outsideStrokePath;
        delete layer._outsideStrokeClip;
        delete layer._insideStrokeClip;
        layer._path?.removeAttribute('clip-path');
    },

    _syncPositionedStroke(layer) {
        if (!layer._path) return;
        this._removeLegacyStrokeArtifacts(layer);
        layer._positionedStrokePath?.remove();
        delete layer._positionedStrokePath;

        const position = getStrokePosition(layer);
        const enabled = layer instanceof L.Polygon && layer.options.stroke && position !== 'center';
        if (!enabled) {
            layer._path.setAttribute('stroke-opacity', layer.options.opacity);
            return;
        }

        const positionedPathData = createPositionedStrokePath(layer, this, position);
        if (!positionedPathData) {
            layer._path.setAttribute('stroke-opacity', layer.options.opacity);
            return;
        }

        const stroke = layer._path.cloneNode(false);
        stroke.setAttribute('class', 'record-positioned-stroke');
        stroke.setAttribute('data-stroke-position', position);
        stroke.setAttribute('d', positionedPathData);
        stroke.setAttribute('fill', 'none');
        stroke.setAttribute('pointer-events', 'none');
        stroke.style.pointerEvents = 'none';
        stroke.setAttribute('stroke-width', String(layer.options.weight));
        // The boundary path is transparent after the first sync. Never inherit
        // that temporary opacity when rebuilding the stroke on zoom or redraw.
        stroke.setAttribute('stroke-opacity', String(layer.options.opacity));
        stroke.removeAttribute('clip-path');
        layer._path.after(stroke);
        layer._positionedStrokePath = stroke;
        layer._path.setAttribute('stroke-opacity', '0');
    },

    _bringToFront(layer) {
        L.SVG.prototype._bringToFront.call(this, layer);
        if (layer._recordHitPath) layer._path.before(layer._recordHitPath);
        if (layer._positionedStrokePath) layer._path.after(layer._positionedStrokePath);
    },

    _bringToBack(layer) {
        L.SVG.prototype._bringToBack.call(this, layer);
        if (layer._recordHitPath) layer._path.before(layer._recordHitPath);
        if (layer._positionedStrokePath) layer._path.after(layer._positionedStrokePath);
    },

    _removePath(layer) {
        if (layer._recordHitPath) layer.removeInteractiveTarget(layer._recordHitPath);
        layer._recordHitPath?.remove();
        delete layer._recordHitPath;
        layer._positionedStrokePath?.remove();
        delete layer._positionedStrokePath;
        this._removeLegacyStrokeArtifacts(layer);
        L.SVG.prototype._removePath.call(this, layer);
    }
});

export function createRecordSvgRenderer(options) {
    return new RecordSvgRenderer(options);
}
