export function degToRad(deg) {
  return (Number(deg) || 0) * Math.PI / 180;
}

export function invertMatrix(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const invA = d / det;
  const invB = -b / det;
  const invC = -c / det;
  const invD = a / det;
  const invE = (c * f - d * e) / det;
  const invF = (b * e - a * f) / det;
  return [invA, invB, invC, invD, invE, invF];
}

export function applyMatrix(m, point) {
  return {
    x: m[0] * point.x + m[2] * point.y + m[4],
    y: m[1] * point.x + m[3] * point.y + m[5]
  };
}

export function createManualMatrix({ imagePoint, layerPoint, scale, rotationDeg }) {
  const angle = degToRad(rotationDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const a = scale * cos;
  const b = scale * sin;
  const c = -scale * sin;
  const d = scale * cos;
  const e = layerPoint.x - a * imagePoint.x - c * imagePoint.y;
  const f = layerPoint.y - b * imagePoint.x - d * imagePoint.y;
  return [a, b, c, d, e, f];
}

export function createSimilarityMatrix(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 2) return null;
  const p1 = pairs[0].image;
  const p2 = pairs[1].image;
  const q1 = pairs[0].layer;
  const q2 = pairs[1].layer;
  const dxP = p2.x - p1.x;
  const dyP = p2.y - p1.y;
  const dxQ = q2.x - q1.x;
  const dyQ = q2.y - q1.y;
  const lenP = Math.hypot(dxP, dyP);
  const lenQ = Math.hypot(dxQ, dyQ);
  if (lenP < 1e-6 || lenQ < 1e-6) return null;

  const scale = lenQ / lenP;
  const angle = Math.atan2(dyQ, dxQ) - Math.atan2(dyP, dxP);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const a = scale * cos;
  const b = scale * sin;
  const c = -scale * sin;
  const d = scale * cos;
  const e = q1.x - a * p1.x - c * p1.y;
  const f = q1.y - b * p1.x - d * p1.y;
  return [a, b, c, d, e, f];
}

export function createAffineMatrix(pairs) {
  if (!Array.isArray(pairs) || pairs.length < 3) return null;
  const rows = [];
  const values = [];

  pairs.slice(0, 3).forEach(pair => {
    const { x, y } = pair.image;
    rows.push([x, y, 1, 0, 0, 0]);
    values.push(pair.layer.x);
    rows.push([0, 0, 0, x, y, 1]);
    values.push(pair.layer.y);
  });

  const solved = solveLinearSystem(rows, values);
  if (!solved) return null;
  const [a, c, e, b, d, f] = solved;
  return [a, b, c, d, e, f];
}

export function getTransformMode(pointCount) {
  if (pointCount >= 3) return 'Affine';
  if (pointCount === 2) return 'Similarity';
  if (pointCount === 1) return 'Manual';
  return 'None';
}

function solveLinearSystem(matrix, values) {
  const n = values.length;
  const a = matrix.map((row, i) => [...row, values[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-10) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const divisor = a[col][col];
    for (let k = col; k <= n; k += 1) a[col][k] /= divisor;

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = a[row][col];
      for (let k = col; k <= n; k += 1) {
        a[row][k] -= factor * a[col][k];
      }
    }
  }

  return a.map(row => row[n]);
}

export function readExifGps(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset, false);
    offset += 2;
    const length = view.getUint16(offset, false);
    offset += 2;
    if (marker === 0xffe1) {
      const exifHeader = readAscii(view, offset, 6);
      if (exifHeader === 'Exif\0\0') {
        return parseTiffGps(view, offset + 6);
      }
    }
    offset += Math.max(0, length - 2);
  }

  return null;
}

function parseTiffGps(view, tiffOffset) {
  const little = view.getUint16(tiffOffset, false) === 0x4949;
  const get16 = offset => view.getUint16(offset, little);
  const get32 = offset => view.getUint32(offset, little);
  if (get16(tiffOffset + 2) !== 42) return null;

  const ifd0 = tiffOffset + get32(tiffOffset + 4);
  const gpsIfdOffset = findIfdValue(view, ifd0, 0x8825, little, tiffOffset);
  if (!gpsIfdOffset) return null;

  const gpsIfd = tiffOffset + gpsIfdOffset;
  const entries = get16(gpsIfd);
  let latRef = null;
  let lngRef = null;
  let lat = null;
  let lng = null;

  for (let i = 0; i < entries; i += 1) {
    const entry = gpsIfd + 2 + i * 12;
    const tag = get16(entry);
    if (tag === 0x0001) latRef = readExifValue(view, entry, little, tiffOffset);
    if (tag === 0x0002) lat = readExifValue(view, entry, little, tiffOffset);
    if (tag === 0x0003) lngRef = readExifValue(view, entry, little, tiffOffset);
    if (tag === 0x0004) lng = readExifValue(view, entry, little, tiffOffset);
  }

  if (!Array.isArray(lat) || !Array.isArray(lng)) return null;
  const latitude = dmsToDecimal(lat) * (String(latRef).toUpperCase() === 'S' ? -1 : 1);
  const longitude = dmsToDecimal(lng) * (String(lngRef).toUpperCase() === 'W' ? -1 : 1);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { lat: latitude, lng: longitude };
}

function findIfdValue(view, ifdOffset, tagId, little, tiffOffset) {
  const entries = view.getUint16(ifdOffset, little);
  for (let i = 0; i < entries; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    if (view.getUint16(entry, little) === tagId) {
      return readExifValue(view, entry, little, tiffOffset);
    }
  }
  return null;
}

function readExifValue(view, entry, little, tiffOffset) {
  const type = view.getUint16(entry + 2, little);
  const count = view.getUint32(entry + 4, little);
  const valueOffset = entry + 8;
  const typeSize = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8 }[type] || 1;
  const dataOffset = count * typeSize <= 4 ? valueOffset : tiffOffset + view.getUint32(valueOffset, little);

  if (type === 2) return readAscii(view, dataOffset, count).replace(/\0/g, '');
  if (type === 3) return count === 1 ? view.getUint16(dataOffset, little) : Array.from({ length: count }, (_, i) => view.getUint16(dataOffset + i * 2, little));
  if (type === 4) return count === 1 ? view.getUint32(dataOffset, little) : Array.from({ length: count }, (_, i) => view.getUint32(dataOffset + i * 4, little));
  if (type === 5) {
    const values = Array.from({ length: count }, (_, i) => {
      const numerator = view.getUint32(dataOffset + i * 8, little);
      const denominator = view.getUint32(dataOffset + i * 8 + 4, little);
      return denominator ? numerator / denominator : 0;
    });
    return count === 1 ? values[0] : values;
  }
  return null;
}

function readAscii(view, offset, length) {
  let text = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i += 1) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}

function dmsToDecimal(values) {
  return Number(values[0] || 0) + Number(values[1] || 0) / 60 + Number(values[2] || 0) / 3600;
}
