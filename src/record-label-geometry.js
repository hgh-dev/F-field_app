import intersect from '@turf/intersect';

// Screen-space geometry: clipping and distances follow the current map projection.
export function lineAnchor(lines, box) {
    const [x0,y0,x1,y1] = box;
    let best = [], bestLength = 0;
    for (const line of lines) {
        let run = [], length = 0;
        const flush = () => { if (length > bestLength) { best = run; bestLength = length; } run = []; length = 0; };
        for (let i=1;i<line.length;i++) {
            const a=line[i-1], b=line[i], dx=b[0]-a[0], dy=b[1]-a[1];
            let lo=0, hi=1, valid=true;
            for (const [p,q] of [[-dx,a[0]-x0],[dx,x1-a[0]],[-dy,a[1]-y0],[dy,y1-a[1]]]) {
                if (p===0) { if(q<0) valid=false; }
                else if(p<0) lo=Math.max(lo,q/p); else hi=Math.min(hi,q/p);
            }
            if(!valid || lo>hi) { flush(); continue; }
            const start=[a[0]+dx*lo,a[1]+dy*lo], end=[a[0]+dx*hi,a[1]+dy*hi];
            const prev=run.at(-1);
            if(prev && Math.hypot(prev[0]-start[0],prev[1]-start[1])>0.01) flush();
            if(!run.length) run.push(start);
            run.push(end); length+=Math.hypot(end[0]-start[0],end[1]-start[1]);
            if(hi<1) flush();
        }
        flush();
    }
    let remaining=bestLength/2;
    for(let i=1;i<best.length;i++) {
        const a=best[i-1],b=best[i],d=Math.hypot(b[0]-a[0],b[1]-a[1]);
        if(d && remaining<=d) return [a[0]+(b[0]-a[0])*remaining/d,a[1]+(b[1]-a[1])*remaining/d];
        remaining-=d;
    }
    return null;
}
function ringArea(ring) { return Math.abs(ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-b[0]*a[1];},0))/2; }
function distanceToPolygon(x,y,rings) {
    let inside=false,min=Infinity;
    for(const ring of rings) for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
        const a=ring[i],b=ring[j];
        if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
        const dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;
        const t=den?Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/den)):0;
        min=Math.min(min,Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy));
    }
    return (inside?1:-1)*min;
}
export function polygonAnchor(polygons, box) {
    const [x0,y0,x1,y1]=box;
    const clip={type:'Polygon',coordinates:[[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]]]};
    const parts=[];
    for(const coordinates of polygons) {
        const result=intersect({type:'Polygon',coordinates},clip);
        if(result) parts.push(...(result.geometry.type==='Polygon'?[result.geometry.coordinates]:result.geometry.coordinates));
    }
    parts.sort((a,b)=>(ringArea(b[0])-b.slice(1).reduce((s,r)=>s+ringArea(r),0))-(ringArea(a[0])-a.slice(1).reduce((s,r)=>s+ringArea(r),0)));
    if(!parts.length) return null;
    const rings=parts[0], xs=rings[0].map(p=>p[0]),ys=rings[0].map(p=>p[1]);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const cell=(x,y,h)=>{const d=distanceToPolygon(x,y,rings);return {x,y,h,d,max:d+h*Math.SQRT2};};
    let best=cell((left+right)/2,(top+bottom)/2,0);
    const queue=[cell(best.x,best.y,Math.max(right-left,bottom-top)/2)];
    while(queue.length) {
        queue.sort((a,b)=>a.max-b.max);
        const c=queue.pop();
        if(c.d>best.d) best=c;
        if(c.max-best.d<=0.75) continue;
        const h=c.h/2;
        for(const dx of [-h,h]) for(const dy of [-h,h]) queue.push(cell(c.x+dx,c.y+dy,h));
    }
    return best.d>0?[best.x,best.y]:null;
}
