import { L } from './vendor-globals.js';
import { lineAnchor, polygonAnchor } from './record-label-geometry.js';
import { isRecordSelected } from './record-selection.js';
import { getRecordName } from './utils.js';
import { AppState } from './state.js';

export function initRecordLabels({map, drawnItems, saveToStorage, renderSurveyList, getCurrentId}) {
    const labels=L.layerGroup().addTo(map);
    const pane=map.createPane('recordLabels');
    pane.style.zIndex='650'; pane.style.pointerEvents='none';
    const style=document.createElement('style');
    style.textContent='.record-map-label{background:transparent;border:0;box-shadow:none;padding:0;line-height:1;white-space:normal;text-align:center;max-width:220px;width:max-content;overflow-wrap:anywhere;text-shadow:0 0 3px white,1px 1px 2px white,-1px -1px 2px white;pointer-events:auto;cursor:pointer}.record-map-label.leaflet-tooltip-top{margin-top:0}.record-map-label:before{display:none}.record-label-form [hidden]{display:none!important}.record-label-toggle{min-height:44px;border:1px solid #d1d5db;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:7px;color:#4b5563;font-size:14px;font-weight:700;cursor:pointer}.record-label-toggle:has(input:checked){border-color:#2563eb;background:#eff6ff;color:#2563eb}.record-label-toggle input{width:16px;height:16px;accent-color:#2563eb}.record-label-preview{min-height:48px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;background:#f8f9fa;display:flex;align-items:center;justify-content:center;text-align:center;overflow-wrap:anywhere}';
    document.head.append(style);
    let frame;
    function schedule(){ if(!frame) frame=requestAnimationFrame(()=>{frame=null;render();}); }
    function viewport(){
        const rect=map.getContainer().getBoundingClientRect();
        let box=[rect.left+8,rect.top+8,rect.right-8,rect.bottom-8];
        for(const selector of ['#bottom-sheet.open','#sidebar-overlay.open .sidebar-content','#sidebar-overlay.visible .sidebar-content']) {
            const el=document.querySelector(selector);
            if(!el || !el.getClientRects().length) continue;
            const r=el.getBoundingClientRect();
            if(r.right<=box[0] || r.left>=box[2] || r.bottom<=box[1] || r.top>=box[3]) continue;
            if(selector.includes('bottom-sheet')) box[3]=Math.min(box[3],r.top-8);
            else if(r.left<=rect.left+20) box[0]=Math.max(box[0],r.right+8);
            else if(r.right>=rect.right-20) box[2]=Math.min(box[2],r.left-8);
        }
        return [box[0]-rect.left,box[1]-rect.top,box[2]-rect.left,box[3]-rect.top];
    }
    const textFor=(props,config)=>config.mode==='text'?String(config.text||''):config.field==='name'?getRecordName(props):String(props[config.field]??'');
    const overlaps=(first,second,gap=3)=>first.left<second.right+gap&&first.right>second.left-gap&&first.top<second.bottom+gap&&first.bottom>second.top-gap;
    function preventLabelOverlaps(items,box){
        const mapRect=map.getContainer().getBoundingClientRect();
        const bounds={left:mapRect.left+box[0],top:mapRect.top+box[1],right:mapRect.left+box[2],bottom:mapRect.top+box[3]};
        const occupied=drawnItems.getLayers()
            .filter(layer=>layer instanceof L.Marker && layer.feature?.properties?.isHidden!==true)
            .map(layer=>layer.getElement?.()||layer._icon)
            .filter(element=>element?.getClientRects().length)
            .map(element=>{
                const rect=element.getBoundingClientRect();
                return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,isMarker:true};
            });
        for(const item of items){
            const element=item.getElement?.();
            if(!element) continue;
            element.style.translate='0 0';
            const original=element.getBoundingClientRect();
            const stepX=Math.max(16,original.width+4),stepY=Math.max(16,original.height+4);
            const candidates=[];
            for(let radius=0;radius<=10;radius++){
                for(let y=-radius;y<=radius;y++) for(let x=-radius;x<=radius;x++) {
                    if(Math.max(Math.abs(x),Math.abs(y))!==radius) continue;
                    candidates.push([x*stepX,y*stepY]);
                }
            }
            candidates.sort((a,b)=>(a[0]**2+a[1]**2)-(b[0]**2+b[1]**2));
            let placed=null;
            for(const [dx,dy] of candidates){
                const rect={left:original.left+dx,right:original.right+dx,top:original.top+dy,bottom:original.bottom+dy};
                if(rect.left<bounds.left||rect.right>bounds.right||rect.top<bounds.top||rect.bottom>bounds.bottom) continue;
                if(occupied.some(other=>overlaps(rect,other,other.isMarker?0:3))) continue;
                element.style.translate=`${dx}px ${dy}px`;
                placed=rect;
                break;
            }
            occupied.push(placed||{left:original.left,right:original.right,top:original.top,bottom:original.bottom});
        }
    }
    function render(){
        labels.clearLayers();
        const minimumZoom = AppState.labelMinZoom === 'same' ? AppState.recordMinZoom : AppState.labelMinZoom;
        if (map.getZoom() < minimumZoom) return;
        const box=viewport();
        if(box[2]<=box[0] || box[3]<=box[1]) return;
        const project=coords=>{const p=map.latLngToContainerPoint([coords[1],coords[0]]);return [p.x,p.y];};
        const renderedLabels=[];
        for(const layer of drawnItems.getLayers()) {
            const props=layer.feature?.properties||{},config=props.label;
            if(!config?.enabled || props.isHidden) continue;
            const text=textFor(props,config).trim(); if(!text) continue;
            try {
                const g=layer.toGeoJSON().geometry; let anchor,offset=0,direction='center';
                if(g.type==='Point') {
                    anchor=project(g.coordinates); direction='top';
                    offset=-(Number(layer.options.icon?.options.iconAnchor?.[1])||18)-2;
                } else if(g.type==='LineString' || g.type==='MultiLineString') {
                    anchor=lineAnchor((g.type==='LineString'?[g.coordinates]:g.coordinates).map(line=>line.map(project)),box);
                    offset=0; direction='top';
                } else if(g.type==='Polygon' || g.type==='MultiPolygon') {
                    anchor=polygonAnchor((g.type==='Polygon'?[g.coordinates]:g.coordinates).map(p=>p.map(r=>r.map(project))),box);
                }
                if(!anchor || anchor[0]<box[0] || anchor[0]>box[2] || anchor[1]<box[1] || anchor[1]>box[3]) continue;
                const content=document.createElement('span');
                content.textContent=text;
                content.style.fontSize=`${Math.min(40,Math.max(10,Number(config.fontSize)||13))}px`;
                content.style.color=/^#[0-9a-f]{6}$/i.test(config.color||'')?config.color:'#111111';
                content.style.fontWeight=config.bold===false?'400':'700';
                content.style.fontStyle=config.italic===true?'italic':'normal';
                const tooltip = L.tooltip({permanent:true,interactive:true,direction,offset:[0,offset],pane:'recordLabels',className:'record-map-label',opacity:1})
                    .setLatLng(map.containerPointToLatLng(anchor)).setContent(content).addTo(labels);
                renderedLabels.push(tooltip);
                tooltip.on('click', event => {
                    L.DomEvent.stopPropagation(event.originalEvent);
                    open(props.id, { edit: true });
                });
            } catch(error) { console.warn('기록 라벨 위치 계산 실패',error); }
        }
        preventLabelOverlaps(renderedLabels,box);
    }
    const resolveLayers = target => drawnItems.getLayers().filter(layer => (
        target === 'selected'
            ? isRecordSelected(layer)
            : String(layer.feature?.properties?.id) === String(target === 'current' ? getCurrentId() : target)
    ));
    const isEnabled = target => resolveLayers(target).some(layer => layer.feature?.properties?.label?.enabled === true);
    const labelIcon = off => `<svg viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="15.5" text-anchor="middle" font-size="10" font-weight="800" font-family="Arial, sans-serif" fill="currentColor">abc</text>${off ? '<line x1="4" y1="19" x2="20" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : ''}</svg>`;
    const syncMenuItem = (element, target) => {
        if (!element) return;
        const enabled = isEnabled(target);
        element.innerHTML = `${labelIcon(enabled)} ${enabled ? '라벨 끄기' : '라벨 표시'}`;
    };
    async function disableLayers(layers) {
        for (const layer of layers) {
            if (layer.feature?.properties?.label) layer.feature.properties.label.enabled = false;
        }
        await saveToStorage();
        renderSurveyList?.();
        schedule();
    }
    function open(target, options = {}){
        const layers=resolveLayers(target);
        if(!layers.length){alert('라벨을 표시할 기록을 선택하세요.');return;}
        document.querySelectorAll('.more-context-menu,.dropdown-menu').forEach(el=>{el.classList.remove('visible');if(el.classList.contains('more-context-menu'))el.style.display='none';});
        if (!options.edit && target !== 'selected' && layers[0].feature?.properties?.label?.enabled === true) {
            void disableLayers(layers);
            return;
        }
        document.getElementById('record-label-modal')?.remove();
        const overlay=document.createElement('div'); overlay.id='record-label-modal';overlay.className='nav-modal-overlay visible';overlay.style.cssText='display:flex;align-items:center;justify-content:center;z-index:13000';
        overlay.innerHTML=`
            <div role="dialog" aria-modal="true" aria-labelledby="record-label-title" onclick="event.stopPropagation()" style="width:min(420px, calc(100vw - 32px)); max-height:calc(100vh - 48px); overflow:auto; background:#fff; border-radius:12px; padding:18px; box-sizing:border-box; -webkit-user-select:text; user-select:text; -webkit-touch-callout:default;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div id="record-label-title" style="font-size:17px; font-weight:800; color:#111827;">라벨 설정</div>
                    <button type="button" class="label-close" aria-label="닫기" style="width:34px; height:34px; border:0; background:#f3f4f6; border-radius:50%; color:#6b7280; font-size:20px; line-height:1;">&times;</button>
                </div>
                <form class="record-label-form">
                    <div class="label-count" style="margin-bottom:12px; font-size:11px; line-height:1.45; color:#6b7280;"></div>
                    <label style="display:block; margin-bottom:12px;">
                        <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">내용 선택</span>
                        <select name="mode" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box;"><option value="field">속성 선택</option><option value="text">직접 입력</option></select>
                    </label>
                    <label class="label-field" style="display:block; margin-bottom:12px;">
                        <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">속성</span>
                        <select name="field" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box;"></select>
                    </label>
                    <label class="label-text" hidden style="display:block; margin-bottom:12px;">
                        <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">라벨 내용</span>
                        <textarea name="text" maxlength="300" style="width:100%; min-height:76px; border:1px solid #d1d5db; border-radius:8px; padding:10px 12px; font-size:14px; line-height:1.45; resize:vertical; box-sizing:border-box;"></textarea>
                    </label>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">
                        <label>
                            <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">폰트 크기</span>
                            <select name="fontSize" style="width:100%; min-height:44px; border:1px solid #d1d5db; border-radius:8px; padding:0 12px; font-size:15px; background:#fff; box-sizing:border-box;">${[10,11,12,13,14,16,18,20,24,28,32,36,40].map(size=>`<option value="${size}">${size}px</option>`).join('')}</select>
                        </label>
                        <label>
                            <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">글자 색상</span>
                            <input name="color" type="color" style="width:100%; height:44px; border:1px solid #d1d5db; border-radius:8px; padding:5px 8px; background:#fff; box-sizing:border-box;">
                        </label>
                    </div>
                    <div style="margin-bottom:12px;">
                        <span style="display:block; font-size:12px; font-weight:700; color:#4b5563; margin-bottom:6px;">글자 모양</span>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                            <label class="record-label-toggle"><input name="bold" type="checkbox">굵게</label>
                            <label class="record-label-toggle"><input name="italic" type="checkbox">기울임</label>
                        </div>
                    </div>
                    <div class="record-label-preview label-preview" style="margin-bottom:6px;"></div>
                    <div style="font-size:11px; line-height:1.45; color:#6b7280;">선택한 속성이 비어 있는 기록에는 라벨을 표시하지 않습니다.</div>
                    <div style="display:flex; gap:8px; margin-top:16px;">
                        <button type="button" class="label-default" style="flex:1; min-height:44px; border:0; border-radius:8px; background:#eff6ff; color:#2563eb; font-size:14px; font-weight:700;">기본값</button>
                        <button type="button" class="label-disable" style="flex:1; min-height:44px; border:0; border-radius:8px; background:#fff1f2; color:#be123c; font-size:14px; font-weight:700;">표시 끄기</button>
                        <button type="button" class="label-cancel" style="flex:1; min-height:44px; border:0; border-radius:8px; background:#f3f4f6; color:#4b5563; font-size:14px; font-weight:700;">취소</button>
                        <button type="submit" style="flex:1; min-height:44px; border:0; border-radius:8px; background:#2563eb; color:#fff; font-size:14px; font-weight:800;">저장</button>
                    </div>
                </form>
            </div>`;
        const form=overlay.querySelector('form'),mode=form.elements.mode,field=form.elements.field,input=form.elements.text,fontSize=form.elements.fontSize,color=form.elements.color,bold=form.elements.bold,italic=form.elements.italic;
        const names={name:'기록명',address:'주소',description:'메모',createdAt:'생성일',updatedAt:'수정일'};
        const excluded=new Set(['id','label','photos','photo','groupId','displayOrder','isHidden','memo']);
        const fields=new Set(['name']);
        for(const layer of layers) for(const [key,value] of Object.entries(layer.feature.properties)) {
            if(!excluded.has(key) && !key.startsWith('custom') && ['string','number','boolean'].includes(typeof value)) fields.add(key);
        }
        for(const key of fields){const opt=document.createElement('option');opt.value=key;opt.textContent=names[key]||key;field.append(opt);}
        const config=layers.length===1?layers[0].feature.properties.label:null;
        mode.value=config?.mode==='text'?'text':'field';field.value=fields.has(config?.field)?config.field:'name';input.value=config?.text||'';
        fontSize.value=String(Math.min(40,Math.max(10,Number(config?.fontSize)||13)));
        color.value=/^#[0-9a-f]{6}$/i.test(config?.color||'')?config.color:'#111111';
        bold.checked=config?.bold!==false;
        italic.checked=config?.italic===true;
        form.querySelector('.label-count').textContent=`${layers.length}개 기록에 적용`;
        const update=()=>{const preview=form.querySelector('.label-preview');form.querySelector('.label-field').hidden=mode.value!=='field';form.querySelector('.label-text').hidden=mode.value!=='text';preview.textContent=textFor(layers[0].feature.properties,{mode:mode.value,field:field.value,text:input.value})||'(값 없음)';preview.style.fontSize=`${fontSize.value}px`;preview.style.color=color.value;preview.style.fontWeight=bold.checked?'700':'400';preview.style.fontStyle=italic.checked?'italic':'normal';};
        form.addEventListener('input',update);form.addEventListener('change',update);update();
        form.querySelector('.label-default').onclick=()=>{
            mode.value='field';
            field.value='name';
            input.value='';
            fontSize.value='13';
            color.value='#111111';
            bold.checked=true;
            italic.checked=false;
            input.setCustomValidity('');
            update();
        };
        const close=()=>{overlay.remove();document.removeEventListener('keydown',escape);schedule();};
        const escape=e=>{if(e.key==='Escape')close();};document.addEventListener('keydown',escape);
        overlay.onclick=e=>{if(e.target===overlay)close();};form.querySelector('.label-cancel').onclick=close;overlay.querySelector('.label-close').onclick=close;
        async function apply(enabled){
            if(enabled && mode.value==='text' && !input.value.trim()){input.focus();input.setCustomValidity('라벨 내용을 입력하세요.');input.reportValidity();return;}
            input.setCustomValidity('');
            for(const layer of layers) {
                if(enabled) layer.feature.properties.label={enabled:true,mode:mode.value,field:field.value,text:input.value.trim(),fontSize:Number(fontSize.value),color:color.value,bold:bold.checked,italic:italic.checked};
                else if(layer.feature.properties.label) layer.feature.properties.label.enabled=false;
            }
            close(); await saveToStorage();renderSurveyList?.();schedule();
        }
        input.addEventListener('input',()=>input.setCustomValidity(''));
        form.onsubmit=e=>{e.preventDefault();void apply(true);};form.querySelector('.label-disable').onclick=()=>apply(false);
        document.body.append(overlay);mode.focus();
    }
    window.openRecordLabelSettings=open;
    window.editRecordLabelSettings=target=>open(target,{edit:true});
    window.isRecordLabelEnabled=isEnabled;
    window.syncRecordLabelMenuItem=syncMenuItem;
    map.on('moveend zoomend resize draw:edited draw:deleted',schedule);
    drawnItems.on('layeradd layerremove',schedule);
    document.addEventListener('records-changed',schedule);
    document.addEventListener('record-display-range-changed',schedule);
    document.addEventListener('label-display-range-changed',schedule);
    for(const id of ['bottom-sheet','sidebar-overlay']) {
        const el=document.getElementById(id);if(el){new MutationObserver(schedule).observe(el,{attributes:true,attributeFilter:['class','style']});el.addEventListener('transitionend',schedule);}
    }
    schedule();
}
