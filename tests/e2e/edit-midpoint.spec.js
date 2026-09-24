import { test, expect } from '@playwright/test';

for (const mode of ['touch-short', 'touch-long', 'click', 'drag']) {
test(`중간점 ${mode} 후 꼭짓점과 중간점 연결이 일치한다`, async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map-active-project-badge')).toContainText('기본 프로젝트');
    const result = await page.evaluate(async mode => {
        const L = window.L;
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:500px;z-index:99999';
        document.body.appendChild(container);
        const map = L.map(container).setView([37, 127], 16);
        const polygon = L.polygon([[37,127], [37,127.01], [37.01,127.01], [37.01,127]]).addTo(map);
        polygon.editing.enable();
        const handler = polygon.editing._verticesHandlers[0];
        const middle = handler._markers[0]._middleRight;
        const point = map.latLngToContainerPoint(middle.getLatLng());
        const rect = container.getBoundingClientRect();
        const touch = { clientX: rect.left + point.x + 15, clientY: rect.top + point.y + 10 };
        if (mode === 'click') {
            middle.fire('click');
        } else if (mode === 'drag') {
            middle.fire('dragstart');
            middle.setLatLng([37.001, 127.005]);
            middle.fire('drag');
            middle.fire('dragend');
        } else {
            for (let i = 0; i < (mode === 'touch-long' ? 3 : 1); i++) {
                middle.fire('touchmove', { originalEvent: { touches: [{ ...touch, clientY: touch.clientY + i * 5 }] } });
            }
            middle.fire('touchend');
        }
        await new Promise(requestAnimationFrame);
        // Moving the newly added vertex again must keep its neighbors attached.
        middle.fire('touchmove', { originalEvent: { touches: [{ ...touch, clientY: touch.clientY + 30 }] } });
        middle.fire('touchend');
        const vertices = handler._markers;
        const output = {
            vertexIcon: !middle.getElement().classList.contains('leaflet-middle-icon'),
            middlesValid: vertices.every(marker => handler._markerGroup.hasLayer(marker._middleRight) && marker._middleRight === marker._next._middleLeft && marker._middleRight.getLatLng().equals(handler._getMiddleLatLng(marker, marker._next))),
            vertices: vertices.length,
            coordinates: handler._defaultShape().length,
            handles: handler._markerGroup.getLayers().length,
            allVerticesMounted: vertices.every(marker => handler._markerGroup.hasLayer(marker)),
            linksValid: vertices.every((marker, i) => marker._index === i && marker._next === vertices[(i + 1) % vertices.length] && marker._prev === vertices[(i + vertices.length - 1) % vertices.length])
        };
        map.remove();
        container.remove();
        return output;
    }, mode);
    expect(result).toEqual({ vertexIcon: true, middlesValid: true, vertices: 5, coordinates: 5, handles: 10, allVerticesMounted: true, linksValid: true });
});
}
