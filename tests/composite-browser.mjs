import {runInPage} from './browser-runner.mjs';
const task=async()=>{
 const $=id=>document.getElementById(id),checks=[],ok=(v,m)=>{if(!v)throw Error(m);checks.push(m);},wait=()=>new Promise(r=>setTimeout(r,280));
 const change=(id,value)=>{const e=$(id);if(e.type==='checkbox')e.checked=value;else e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};
 const snap=()=>chartStudio.snapshot();
 await $('demo').onclick();await wait();
 const image=chartStudio.bundle.current.image;
 const nativeConfirm=window.confirm;window.confirm=()=>true;
 try{
 change('family','composite');await wait();
 ok(snap().project.kind==='barline_n','composite selected through existing chart type selector');
 ok(document.querySelectorAll('[data-prop="role"]').length===2,'existing series editor exposes bar/line roles');
 change('dualYAxis',true);change('rightYTitle','Rate (%)');
 ok(document.querySelectorAll('#axisFields [data-axis="r"]').length>0,'right Y calibration uses existing axis panel');
 // Use existing original image, not fabricated pixel evidence. Calibrate through normal controls.
 const point=(x,y)=>{const canvas=$('canvas'),r=canvas.getBoundingClientRect(),size=snap().imageSize;canvas.dispatchEvent(new PointerEvent('pointerdown',{clientX:r.left+x*r.width/size.width,clientY:r.top+y*r.height/size.height,pointerId:1,bubbles:true,altKey:true}));canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));};
 const axisValue=(axis,field,value)=>{const e=document.querySelector(`[data-axis="${axis}"][data-field="${field}"]`);e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}));};
 for(const [axis,max,x]of [['y',100,80],['r',1000,560]]){
  document.querySelector(`[data-tick="${axis}1"]`).click();point(x,400);axisValue(axis,'v1',0);
  document.querySelector(`[data-tick="${axis}2"]`).click();point(x,50);axisValue(axis,'v2',max);
 }
 ok(snap().project.axes.y.calibrated&&snap().project.axes.r.calibrated,'left and right Y axes calibrated independently by original-image clicks');
 change('sequence','manual');
 const s=snap().project.series,c=snap().project.categoryObjects;
 const target=(series,category)=>{change('activeSeries',series.key);change('activeCategory',category.key);};
 target(s[0],c[0]);document.querySelector('[data-tool="point"]').click();point(150,225);
 target(s[1],c[0]);point(150,225);await wait();
 let state=snap();ok(state.project.rows.length===2,'coincident bar and line points both recorded through existing point tool');
 ok(state.project.rows[0].value===50&&state.project.rows[1].value===500,'same original Y pixel uses role-specific calibration');
 ok(state.renderOk&&state.lastSpec.resolve.scale.y==='independent','dual-axis semantic preview compiles');
 // Recalibration affects only rows attached to that scale and preserves original pixels.
 axisValue('r','v2',2000);await wait();state=snap();
 ok(state.project.rows[0].value===50&&state.project.rows[1].value===1000,'right-axis recalibration leaves left-axis values unchanged');
 ok(Math.abs(state.project.evidence[1].pixel.y-225)<1e-8,'recalibration preserves original pixel evidence');
 $('undoCalibration').click();await wait();
 ok(snap().project.rows[1].value===500&&snap().project.rows[0].value===50&&snap().project.axes.r.v2===1000,'right-axis calibration is undone independently');
 $('redoCalibration').click();await wait();
 ok(snap().project.rows[1].value===1000&&snap().project.rows[0].value===50,'calibration redo changes only its measured series');
 // Table edit clears only edited row evidence under existing rules.
 const edit=document.querySelector('[data-i="1"][data-key="value"]');edit.value='123.4567890123';edit.dispatchEvent(new Event('change',{bubbles:true}));await wait();
 ok(snap().project.rows[1].value===123.4567890123&&!snap().project.evidence[1].pixel,'manual line edits preserve precision and detach pixel evidence');
 $('undo').click();await wait();
 // Existing selector/drag/keyboard edits use the row axis, not the current series.
 document.querySelector('[data-tool="select"]').click();document.querySelector('[data-i="1"][data-key="value"]').click();
 $('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',ctrlKey:true,bubbles:true}));await wait();
 ok(snap().project.rows[1].value>1000&&snap().project.rows[0].value===50,'line keyboard nudge uses the right Y calibration');
 const backup=chartStudio.bundle,upload=async data=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(data)],'composite.project.json',{type:'application/json'}));$('projectInput').files=dt.files;await $('projectInput').onchange({target:$('projectInput')});await wait();};
 await upload(backup);ok(snap().project.dualYAxis&&snap().project.series[1].role==='line'&&snap().project.axes.r.calibrated,'workspace backup/restore retains roles, right-axis calibration and pixels');
 // Native error workflow must advance through bar bounds but never request line bounds.
 change('compositeErrors',true);change('sequence','category');
 target(snap().project.series[0],snap().project.categoryObjects[0]);document.querySelector('[data-tool="point"]').click();
 point(150,190);point(150,260);await wait();
 const bar=snap().project.rows.find(r=>r._seriesKey===s[0].key);
 ok(Number.isFinite(bar.upper)&&Number.isFinite(bar.lower),'existing error workflow measures absolute bar bounds');
 const line=snap().project.rows.find(r=>r._seriesKey===s[1].key);ok(!('lower'in line)&&!('upper'in line),'line rows never acquire bar bounds');
 const gt=snap().lastSpec;ok(gt&&gt.layer[0].layer[1].mark.type==='errorbar','composite export uses native errorbar');
 // Save/download and GT import through same controls as all other chart types.
 let downloaded;const click=HTMLAnchorElement.prototype.click,url=URL.createObjectURL;URL.createObjectURL=blob=>{downloaded=blob;return 'blob:test';};HTMLAnchorElement.prototype.click=function(){};
 try{
 change('reviewed',true);await $('exportGT').onclick();await wait();const exported=JSON.parse(await downloaded.text());ok(exported.data.values.every(r=>r.series_role==='bar')&&exported.layer.at(-1).data.values.some(r=>r.series_role==='line'),'normal reviewed GT download contains both roles');
 await $('batchExport').onclick();const archive=await downloaded.text();ok(archive.includes('series_role')&&archive.includes('export-report.json'),'existing batch ZIP includes reviewed composite GT and its report');
 const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(exported)],'composite.gt.json',{type:'application/json'}));$('specInput').files=dt.files;await $('specInput').onchange({target:$('specInput')});await wait();ok(snap().project.kind==='barline_n'&&!snap().project.reviewed,'existing GT importer restores composite and requires re-review');
 await $('saveProject').onclick();const saved=JSON.parse(await downloaded.text());ok(saved.current.project.kind==='barline_n','normal workspace download supports composites');
 }finally{HTMLAnchorElement.prototype.click=click;URL.createObjectURL=url;}
 return {passed:true,checks};
 }finally{window.confirm=nativeConfirm;}
};
console.log(JSON.stringify(await runInPage('('+task.toString()+')()',process.argv[2]||'--headless'),null,2));
