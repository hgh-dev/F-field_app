import { L } from './vendor-globals.js';

// Keep coordinates and Leaflet's logical line width unchanged. Only the SVG
// stroke is doubled and clipped to the polygon, including its interior rings.
const RecordSvgRenderer = L.SVG.extend({
    _updateStyle(layer) {
        L.SVG.prototype._updateStyle.call(this, layer);
        this._syncInsideStroke(layer);
    },

    _setPath(layer, path) {
        L.SVG.prototype._setPath.call(this, layer, path);
        this._syncInsideStroke(layer);
    },

    _syncInsideStroke(layer) {
        if (!layer._path) return;
        const enabled = layer instanceof L.Polygon && layer.options.stroke &&
            (layer.feature?.properties?.customStrokeInside === true || layer.options.strokeInside === true);
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

    _removePath(layer) {
        layer._insideStrokeClip?.remove();
        delete layer._insideStrokeClip;
        L.SVG.prototype._removePath.call(this, layer);
    }
});

export function createRecordSvgRenderer(options) {
    return new RecordSvgRenderer(options);
}
