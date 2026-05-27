import L from 'leaflet';
import { applyMatrix, invertMatrix } from './georef-core.js';

export class LeafletDroneImageLayer extends L.Layer {
  constructor(options = {}) {
    super(options);
    this.options = {
      opacity: 0.72,
      visible: true,
      interactive: false,
      ...options
    };
    this.imageUrl = null;
    this.imageSize = { width: 1, height: 1 };
    this.matrix = [1, 0, 0, 1, 0, 0];
    this.points = [];
  }

  onAdd(map) {
    this._map = map;
    this._el = L.DomUtil.create('div', 'drone-image-layer');
    this._img = L.DomUtil.create('img', 'drone-image', this._el);
    this._pointLayer = L.DomUtil.create('div', 'drone-image-points', this._el);
    this._el.style.opacity = String(this.options.opacity);
    this._el.style.display = this.options.visible ? 'block' : 'none';
    this._el.style.pointerEvents = this.options.interactive ? 'auto' : 'none';
    map.getPanes().overlayPane.appendChild(this._el);
    map.on('zoom move zoomend moveend resize', this._update, this);
    this._update();
  }

  onRemove(map) {
    map.off('zoom move zoomend moveend resize', this._update, this);
    this._el?.remove();
    this._map = null;
  }

  setImage(imageUrl, imageSize) {
    this.imageUrl = imageUrl;
    this.imageSize = imageSize;
    if (this._img) {
      this._img.src = imageUrl;
      this._img.style.width = `${imageSize.width}px`;
      this._img.style.height = `${imageSize.height}px`;
    }
    this._update();
  }

  setOpacity(opacity) {
    this.options.opacity = opacity;
    if (this._el) this._el.style.opacity = String(opacity);
  }

  setVisible(visible) {
    this.options.visible = visible;
    if (this._el) this._el.style.display = visible ? 'block' : 'none';
  }

  setInteractive(interactive) {
    this.options.interactive = interactive;
    if (this._el) this._el.style.pointerEvents = interactive ? 'auto' : 'none';
  }

  setMatrix(matrix) {
    this.matrix = matrix;
    this._update();
  }

  setPoints(points) {
    this.points = Array.isArray(points) ? points : [];
    this._renderPointMarkers();
  }

  containerPointToImagePoint(containerPoint) {
    if (!this._map) return null;
    const layerPoint = this._map.containerPointToLayerPoint(containerPoint);
    const inverse = invertMatrix(this.matrix);
    if (!inverse) return null;
    const imagePoint = applyMatrix(inverse, layerPoint);
    if (
      imagePoint.x < 0 ||
      imagePoint.y < 0 ||
      imagePoint.x > this.imageSize.width ||
      imagePoint.y > this.imageSize.height
    ) {
      return null;
    }
    return imagePoint;
  }

  getElement() {
    return this._el;
  }

  _update() {
    if (!this._el || !this.imageUrl) return;
    const [a, b, c, d, e, f] = this.matrix;
    this._el.style.transform = `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
    this._img.style.width = `${this.imageSize.width}px`;
    this._img.style.height = `${this.imageSize.height}px`;
    this._renderPointMarkers();
  }

  _renderPointMarkers() {
    if (!this._pointLayer) return;
    this._pointLayer.innerHTML = '';
    this.points.forEach((point, index) => {
      if (!point?.image) return;
      const marker = L.DomUtil.create('div', 'image-control-point', this._pointLayer);
      marker.textContent = String(index + 1);
      marker.style.left = `${point.image.x}px`;
      marker.style.top = `${point.image.y}px`;
    });
  }
}
