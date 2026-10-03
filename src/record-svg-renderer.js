import { L } from './vendor-globals.js';

export function getStrokePosition(layer) {
    const value = layer.feature?.properties?.customStrokePosition ?? layer.options?.strokePosition;
    if (['inside', 'center', 'outside'].includes(value)) return value;
    return layer.feature?.properties?.customStrokeInside === true || layer.options?.strokeInside === true ? 'inside' : 'center';
}

// Keep coordinates and Leaflet's logical line width unchanged. Only the SVG
// stroke is doubled and clipped to the polygon, including its interior rings.
const RecordSvgRenderer = L.SVG.extend({
    _updateStyle(layer) {
        L.SVG.prototype._updateStyle.call(this, layer);
        this._syncInsideStroke(layer);
        this._syncLineHitArea(layer);
    },

    _setPath(layer, path) {
        L.SVG.prototype._setPath.call(this, layer, path);
        this._syncInsideStroke(layer);
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

    _syncInsideStroke(layer) {
        if (!layer._path) return;
        const position = getStrokePosition(layer);
        const enabled = layer instanceof L.Polygon && layer.options.stroke && position !== 'center';
        layer._path.setAttribute('stroke-opacity', layer.options.opacity);
        if (enabled && position === 'outside') {
            layer._insideStrokeClip?.remove();
            delete layer._insideStrokeClip;
            layer._path.removeAttribute('clip-path');
            this._syncOutsideStroke(layer);
            return;
        }
        layer._outsideStrokePath?.remove();
        layer._outsideStrokeClip?.remove();
        delete layer._outsideStrokePath;
        delete layer._outsideStrokeClip;
        if (!enabled) {
            layer._insideStrokeClip?.remove();
            delete layer._insideStrokeClip;
            layer._path.removeAttribute('clip-path');
            return;
        }
        if (!layer._insideStrokeClip) {
            const clip = L.SVG.create('clipPath');
            clip.id = `record-inside-${L.stamp(this)}-${L.stamp(layer)}`;
            clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
            clip.appendChild(L.SVG.create('path'));
            this._container.appendChild(clip);
            layer._insideStrokeClip = clip;
        }
        const clip = layer._insideStrokeClip;
        clip.firstChild.setAttribute('d', layer._path.getAttribute('d') || 'M0 0');
        clip.firstChild.setAttribute('clip-rule', layer.options.fillRule || 'evenodd');
        layer._path.setAttribute('clip-path', `url(#${clip.id})`);
        layer._path.setAttribute('stroke-width', String(layer.options.weight * 2));
    },

    _syncOutsideStroke(layer) {
        const path = layer._path;
        if (!layer._outsideStrokeClip) {
            const clip = L.SVG.create('clipPath');
            clip.id = `record-outside-${L.stamp(this)}-${L.stamp(layer)}`;
            clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
            clip.appendChild(L.SVG.create('path'));
            this._container.appendChild(clip);
            layer._outsideStrokeClip = clip;
        }
        // Complement of the polygon, including holes. Only the stroke is clipped;
        // the original path keeps its fill and hit area.
        const bounds = layer._pxBounds;
        if (!bounds) return;
        const pad = Math.max(10, layer.options.weight * 4);
        const x0 = bounds.min.x - pad, y0 = bounds.min.y - pad;
        const x1 = bounds.max.x + pad, y1 = bounds.max.y + pad;
        const clipPath = layer._outsideStrokeClip.firstChild;
        clipPath.setAttribute('d', `M${x0} ${y0}H${x1}V${y1}H${x0}Z ${path.getAttribute('d') || ''}`);
        clipPath.setAttribute('clip-rule', 'evenodd');
        layer._outsideStrokePath?.remove();
        const stroke = path.cloneNode(false);
        stroke.removeAttribute('class');
        stroke.setAttribute('pointer-events', 'none');
        stroke.setAttribute('fill', 'none');
        stroke.setAttribute('stroke-width', String(layer.options.weight * 2));
        stroke.setAttribute('clip-path', `url(#${layer._outsideStrokeClip.id})`);
        path.after(stroke);
        layer._outsideStrokePath = stroke;
        path.setAttribute('stroke-opacity', '0');
    },

    _bringToFront(layer) {
        L.SVG.prototype._bringToFront.call(this, layer);
        if (layer._recordHitPath) layer._path.before(layer._recordHitPath);
        if (layer._outsideStrokePath) layer._path.after(layer._outsideStrokePath);
    },

    _bringToBack(layer) {
        L.SVG.prototype._bringToBack.call(this, layer);
        if (layer._recordHitPath) layer._path.before(layer._recordHitPath);
        if (layer._outsideStrokePath) layer._path.after(layer._outsideStrokePath);
    },

    _removePath(layer) {
        if (layer._recordHitPath) layer.removeInteractiveTarget(layer._recordHitPath);
        layer._recordHitPath?.remove();
        delete layer._recordHitPath;
        layer._outsideStrokePath?.remove();
        layer._outsideStrokeClip?.remove();
        delete layer._outsideStrokePath;
        delete layer._outsideStrokeClip;
        layer._insideStrokeClip?.remove();
        delete layer._insideStrokeClip;
        L.SVG.prototype._removePath.call(this, layer);
    }
});

export function createRecordSvgRenderer(options) {
    return new RecordSvgRenderer(options);
}
