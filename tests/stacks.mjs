import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';
const task=async()=>{
 const checks=[],ok=(x,m)=>{if(!x)throw Error(m);checks.push(m);},near=(a,b)=>Math.abs(a-b)<1e-7,$=id=>document.getElementById(id),wait=()=>new Promise(r=>setTimeout(r,350));
 const downloads=[],blobMap=new Map(),createURL=URL.createObjectURL.bind(URL),anchorClick=HTMLAnchorElement.prototype.click;
 URL.createObjectURL=blob=>{const url=createURL(blob);blobMap.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){if(this.download&&blobMap.has(this.href)){downloads.push({name:this.download,blob:blobMap.get(this.href)});return;}return anchorClick.call(this);};
 const unzip=async blob=>{const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer),files={};let at=0;while(view.getUint32(at,true)===0x04034b50){const size=view.getUint32(at+18,true),n=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),name=new TextDecoder().decode(bytes.slice(at+30,at+30+n)),start=at+30+n+extra;files[name]=new TextDecoder().decode(bytes.slice(start,start+size));at=start+size;}return files;};
 await $('demo').onclick();await wait();const base=structuredClone(chartStudio.bundle),image=base.current.image;
 const upload=async data=>{const dt=new DataTransfer();dt.items.add(new File([JSON.stringify(data)],'stack.project.json',{type:'application/json'}));$('projectInput').files=dt.files;await $('projectInput').onchange({target:$('projectInput')});await wait();};
 const point=(x,y)=>{const c=$('canvas'),b=c.getBoundingClientRect(),size=chartStudio.snapshot().imageSize;c.dispatchEvent(new PointerEvent('pointerdown',{clientX:b.left+x*b.width/size.width,clientY:b.top+y*b.height/size.height,bubbles:true,pointerId:1}));c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));};
 for(const kind of ['barv_stack','barh_stack']){
  const h=kind==='barh_stack',p=structuredClone(base.current.project);delete p.categoryObjects;p.kind=kind;p.legend=true;p.errorBars=false;p.rows=[];p.evidence=[];p.categories=['A','B'];p.series=[{name:'First',color:'#4263eb'},{name:'Second',color:'#e8590c'},{name:'Third',color:'#008b7e'}];p.assist={sequence:'category'};p.axes={x:{p1:80,p2:560,v1:0,v2:60,type:'linear',reverse:false,calibrated:true},y:{p1:400,p2:100,v1:0,v2:60,type:'linear',reverse:false,calibrated:true}};
  await upload({format:'chart-studio-project',version:1,activeId:'stack',queue:[{id:'stack',name:'stack.png',image,project:p}],current:{project:p,image,name:'stack.png'}});
  ok(!$('tableHead').textContent.includes('系列高度'),kind+' ordinary stacks keep their existing table fields');
  ok([...$('kind').options].some(o=>o.value==='barh_stack'),'horizontal stack subtype exists');document.querySelector('[data-tool="point"]').click();const positions=h?[80,160,320,560]:[400,350,250,100],click=(i,category=0)=>h?point(positions[i],150+150*category):point(150+150*category,positions[i]);
  click(0);ok(chartStudio.snapshot().project.rows.length===0,kind+' start click creates no segment');click(1);click(2);ok(chartStudio.snapshot().project.rows.length===2,kind+' three clicks create two segments');
  $('undo').click();ok(chartStudio.snapshot().project.rows.length===1,kind+' undo removes last segment');click(2);ok(near(chartStudio.snapshot().project.rows[1].value,20),kind+' undo resumes shared boundary');
  const partial=structuredClone(chartStudio.bundle);await upload(partial);document.querySelector('[data-tool="point"]').click();click(3);ok(chartStudio.snapshot().project.rows.length===3,kind+' reload resumes final segment from boundary');
  let snap=chartStudio.snapshot();ok(snap.project.rows.every((r,i)=>near(r.value,[10,20,30][i])),kind+' values are segment amounts');ok(snap.project.evidence[1].startPixel[h?'x':'y']===positions[1]&&snap.project.evidence[2].startPixel[h?'x':'y']===positions[2],kind+' shared endpoints are exact');
  click(0,1);ok(chartStudio.snapshot().project.rows.length===3,kind+' next category needs fresh start');for(let i=1;i<4;i++)click(i,1);await wait();snap=chartStudio.snapshot();ok(snap.project.rows.length===6&&snap.renderOk,kind+' two stacks render after eight clicks');
  const gt=snap.lastSpec;ok(gt.data.values.every((r,i)=>near(r.value,[10,20,30][i%3])),kind+' exported GT follows physical stack direction');ok(gt.encoding[h?'x':'y'].field==='value'&&gt.encoding[h?'x':'y'].stack==='zero'&&!gt.encoding[h?'x2':'y2'],kind+' canonical segment value encoding');ok(gt.data.values.every((r,i)=>r.stack_order===i%3&&!('start' in r)&&!('end' in r)),kind+' intermediate endpoints excluded from GT');ok(snap.project.rows.every(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)),kind+' intermediate endpoints retained in records');ok(JSON.stringify(JSON.parse($('jsonPreview').textContent))===JSON.stringify(gt),kind+' compact GT panel equals canonical spec');ok($('seriesOrderNote').textContent.includes(h?'从左到右':'从下到上')&&$('categoryOrderNote').textContent.includes(h?'从上到下':'从左到右'),kind+' type specific legend and category instructions visible');
  $('reviewed').checked=true;$('reviewed').onchange();$('withSchema').checked=false;await $('exportGT').onclick();const single=downloads.at(-1);ok(single?.name.endsWith('.gt.json')&&JSON.stringify(JSON.parse(await single.blob.text()))===JSON.stringify(gt),kind+' downloaded GT equals compact GT');await $('batchExport').onclick();const zip=await unzip(downloads.at(-1).blob),entry=Object.entries(zip).find(([name])=>name.endsWith('.gt.json'));ok(entry&&JSON.stringify(JSON.parse(entry[1]))===JSON.stringify(gt),kind+' ZIP GT equals compact GT');await $('saveProject').onclick();const backup=JSON.parse(await downloads.at(-1).blob.text());ok(backup.current.project.rows.every(r=>Number.isFinite(r.start)&&Number.isFinite(r.end)),kind+' project backup retains measurement endpoints');
  document.querySelector('[data-tool="select"]').click();h?point(320,150):point(150,250);const old=structuredClone(chartStudio.snapshot().project.rows);$('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:h?'ArrowRight':'ArrowUp',ctrlKey:true,bubbles:true}));snap=chartStudio.snapshot();ok(near(snap.project.rows[1].end,snap.project.rows[2].start)&&!near(snap.project.rows[1].value,old[1].value),kind+' boundary nudge updates adjacent segments');$('undo').click();ok(chartStudio.snapshot().project.rows.every((r,i)=>near(r.value,old[i].value)),kind+' boundary edit undo restores both segments');
 }
 const selector=(row,key)=>document.querySelector(`[data-i="${row}"][data-key="${key}"]`);
 const edit=(input,value)=>{input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}));};
 const loadGT=async gt=>{
  const input=$('specInput'),dt=new DataTransfer();
  dt.items.add(new File([JSON.stringify(gt)],'stack.gt.json',{type:'application/json'}));
  input.files=dt.files;await input.onchange({target:input});await wait();
 };
 for(const kind of ['barv_stack_percent','barh_stack_percent']){
  const horizontal=kind.startsWith('barh'),axis=horizontal?'x':'y';
  const project=structuredClone(base.current.project);
  project.kind=kind;project.rows=[];project.evidence=[];project.legend=true;project.errorBars=false;
  project[axis+'Title']='';delete project.categoryObjects;project.categories=['A','B'];
  project.series=['First','Middle','Last'].map((name,stackOrder)=>({name,stackOrder,color:'#4263eb'}));
  project.assist={sequence:'manual'};
  project.axes={x:{p1:80,p2:560,v1:0,v2:100,type:'linear',calibrated:true},
    y:{p1:400,p2:100,v1:0,v2:100,type:'linear',calibrated:true}};
  await upload({format:'chart-studio-project',version:1,activeId:'percent',queue:[{id:'percent',name:'percent.png',image,project}],current:{project,image,name:'percent.png'}});
  const state=()=>chartStudio.snapshot().project;
  const tool=name=>document.querySelector(`[data-tool="${name}"]`).click();
  const target=i=>document.querySelector(`[data-target="${i}"]`).click();
  const choose=field=>document.querySelector(`[data-percent-endpoint="${field}"]`).click();
  const endpoint=()=>document.querySelector('[data-percent-endpoint][aria-pressed="true"]').dataset.percentEndpoint;
  const at=(value,category=0)=>horizontal?point(80+4.8*value,150+150*category):point(150+150*category,400-3*value);
  const label=horizontal?'横向百分比堆叠':'纵向百分比堆叠';
  ok($('kind').selectedOptions[0].textContent===label&&$('skipPercentStack').hidden===false,kind+' selectable with sparse targets');
  ok($('sequenceLabel').hidden&&state().assist.sequence==='category',kind+' fixes category-first traversal in restored projects');
  const ratios=()=>[...$('percentStackRatioCategories').querySelectorAll('[data-percent-ratio-category]')];
  const checked=()=>ratios().map(input=>Number(input.checked)).join(',');
  ok(!$('percentStackRatioControls').hidden&&checked()==='0,0'&&$('clearPercentRatios').disabled,kind+' lists both categories with ratio calculation disabled by default');
  ok(!$('percentStackMode')&&!$('percentStackBarMeasure')&&!$('calibrationPanel').hidden,kind+' uses numeric-axis annotation with no whole-bar calibration controls');

  tool('point');
  ok(endpoint()==='start',kind+' first segment defaults to the start endpoint');
  at(.004);
  ok(state().rows[0].start===0&&selector(0,'start').value==='0'&&endpoint()==='end',kind+' first start is rounded and advances to the end');
  await upload(structuredClone(chartStudio.bundle));tool('point');
  ok(endpoint()==='end',kind+' restored partial segment continues at the end');
  at(37.126);
  ok(state().rows[0].value===37.12&&selector(0,'value').value==='37.12'&&selector(0,'end').value==='37.13',kind+' rounds the raw difference independently of the endpoint display');
  ok(state().rows[0].difference===37.13&&selector(0,'difference').textContent==='37.13',kind+' shows the difference between the displayed endpoints');
  ok(endpoint()==='end'&&$('hint').textContent.includes('37.13'),kind+' second series defaults to the end with an inherited start');
  $('skipPercentStack').click();at(99.976);
  let p=state();
  ok(p.rows.length===2&&p.rows[1].series==='Last'&&p.rows[1].value===62.85,kind+' skips absent middle series and subtracts preceding endpoint');
  ok(p.evidence[0].pixel[axis]===p.evidence[1].startPixel[axis]&&p.rows[1].start===37.13,kind+' reuses exact boundary across absent series');
  ok(endpoint()==='start',kind+' next category begins with a new start');
  $('undo').click();$('redo').click();
  ok(state().rows[1].value===62.85,kind+' undo and redo restore the sparse measurement');

  edit(selector(0,'value'),'36.987654321');
  tool('select');selector(0,'end').click();
  $('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:horizontal?'ArrowRight':'ArrowUp',ctrlKey:true,bubbles:true}));
  p=state();
  ok(p.rows[0].value===36.987654321&&p.evidence[0].valueOverride,kind+' manual value stays locked during shared boundary edits');
  ok(near(p.rows[0].end,p.rows[1].start)&&p.rows[1].value!==62.85,kind+' shared edit recalculates the following measured segment');
  $('undo').click();$('redo').click();
  target(0);choose('start');at(.124);
  ok(endpoint()==='end'&&selector(0,'start').value==='0.12'&&state().rows[0].value===36.987654321,kind+' explicitly retakes a completed start');
  choose('end');at(40.126);p=state();
  ok(selector(0,'end').value==='40.13'&&p.rows[1].start===40.13&&p.rows[0].value===36.987654321,kind+' retakes a shared end and preserves manual value');
  const measured=p.rows[1].value;
  edit(document.querySelector(`[data-axis="${axis}"][data-field="v2"]`),99.9);
  p=state();
  ok(p.rows[0].value===36.987654321&&p.rows[1].value!==measured,kind+' recalibration preserves manual value and updates estimates');

  target(3);$('addRow').click();
  ok(state().rows[2].value===null,kind+' blank manual row does not fabricate a zero percentage');
  edit(selector(2,'value'),'11.23456789');
  target(3);choose('end');at(12,1);
  ok(endpoint()==='start'&&!Number.isFinite(state().rows[2].start),kind+' supports choosing the end before the start');
  at(0,1);
  ok(state().rows.length===3&&state().rows[2].value===11.23456789&&state().evidence[2].pixel,kind+' manual-first data accepts pixel evidence without being overwritten');
  edit(selector(2,'end'),'12.34567');
  ok(selector(2,'end').value==='12.34567'&&state().rows[2].end===12.34567&&!state().evidence[2].pixel,kind+' manual endpoints retain all typed decimal digits');
  target(4);
  ok(endpoint()==='end'&&$('hint').textContent.includes('12.34567'),kind+' inherits a numeric endpoint with no pixel evidence');
  at(55,1);$('skipPercentStack').click();
  p=state();
  ok(p.rows.length===4&&near(p.rows[3].start,p.rows[2].end),kind+' sparse second category reuses the manual segment boundary');
  const customTitle='Relative abundance';
  edit($(axis+'Title'),customTitle);await wait();
  const snap=chartStudio.snapshot(),custom=snap.lastSpec;
  ok(snap.renderOk&&custom.encoding[axis].title===customTitle&&custom.encoding[axis].stack==='zero',kind+' custom axis title and zero-stack preview');
  ok(custom.data.values.map(r=>r.stack_order).join(',')==='0,2,0,1'&&custom.data.values.every(r=>!('start' in r)&&!('end' in r)),kind+' global order and compact observation fields');
  ok(custom.data.values.filter(r=>r.category==='A').reduce((sum,r)=>sum+r.value,0)!==100,kind+' non-100 sums are retained');
  await $('saveProject').onclick();
  const backup=JSON.parse(await downloads.at(-1).blob.text());
  await upload(backup);
  ok(state().kind===kind&&state().rows[0].value===36.987654321&&state().evidence[0].valueOverride&&Object.keys(state().assist.skippedPercentSegments).length===2,kind+' restores manual lock, endpoints and missing targets');
  edit(selector(0,'value'),'');
  ok(!state().evidence[0].valueOverride&&state().rows[0].value!==36.987654321,kind+' clearing a manual value restores endpoint calculation');
  $('undo').click();await wait();
  ok(state().rows[0].value===36.987654321&&state().evidence[0].valueOverride,kind+' undo restores manual precedence');
  $('reviewed').checked=true;$('reviewed').onchange();
  await $('exportGT').onclick();
  ok(JSON.stringify(JSON.parse(await downloads.at(-1).blob.text()))===JSON.stringify(custom),kind+' GT download matches preview');
  await $('batchExport').onclick();
  const zip=await unzip(downloads.at(-1).blob);
  ok(JSON.stringify(JSON.parse(zip['gt/percent.gt.json']))===JSON.stringify(custom),kind+' batch GT download matches preview');
  await loadGT(custom);
  ok(state().kind===kind&&JSON.stringify(chartStudio.snapshot().lastSpec)===JSON.stringify(custom),kind+' imports custom title under matching subtype');
  document.querySelector('[data-move-series="2"][data-delta="-1"]').click();await wait();
  ok(chartStudio.snapshot().lastSpec.data.values.find(r=>r.series==='Last').stack_order===1,kind+' maintains ranks when series are reordered');

  const reload=async(project,id)=>{
   await upload({format:'chart-studio-project',version:1,activeId:id,queue:[{id,name:id+'.png',image,project}],current:{project,image,name:id+'.png'}});
  };
  const ratioProject={...project,rows:[
   {category:'A',series:'First',start:0,end:20,value:20},
   {category:'A',series:'Last',start:20,end:50,value:30},
   {category:'B',series:'First',start:0,end:10,value:12.345678},
   {category:'B',series:'Middle',start:10,end:40,value:30}
  ],evidence:[null,null,{valueOverride:true},null]};
  await reload(ratioProject,'by-ratio');
  const values=()=>state().rows.map(row=>row.value);
  ok(checked()==='0,0'&&values().join(',')==='20,30,12.345678,30',kind+' starts with direct values in each category');
  selector(3,'value').click();
  ratios()[0].click();
  ok(checked()==='1,0'&&values().join(',')==='40,60,12.345678,30',kind+' any category can be enabled independently of the active record');
  ok(state().rows[1].difference===30&&selector(1,'difference').textContent==='30',kind+' preserves endpoint difference while calculating ratio');
  ratios()[0].click();
  ok(checked()==='0,0'&&values().join(',')==='20,30,12.345678,30',kind+' clicking a selected category restores its direct values');

  ratios()[0].click();
  $('selectAllPercentRatios').click();
  ok(checked()==='1,1'&&$('selectAllPercentRatios').disabled&&values().join(',')==='40,60,12.345678,75',kind+' select all calculates each category independently and keeps manual precision');
  $('undo').click();
  ok(checked()==='1,0'&&values()[3]===30,kind+' one undo restores the mixed category selection');
  $('redo').click();
  ok(checked()==='1,1'&&values()[3]===75,kind+' one redo reapplies select all');
  $('clearPercentRatios').click();
  ok(checked()==='0,0'&&$('clearPercentRatios').disabled&&values().join(',')==='20,30,12.345678,30',kind+' clear all restores direct values and preserves the manual percentage');
  $('undo').click();
  ok(checked()==='1,1'&&values()[3]===75,kind+' one undo restores both selected categories');
  await upload(structuredClone(chartStudio.bundle));
  ok(checked()==='1,1'&&values().join(',')==='40,60,12.345678,75',kind+' backup restores selected categories and their percentages');
  const ratioGT=chartStudio.snapshot().lastSpec;
  ok(!Object.hasOwn(ratioGT.encoding[axis],'title')&&ratioGT.encoding[axis].stack==='zero'&&!ratioGT.encoding[axis].scale,kind+' no fabricated axis title or scale');
  ok(ratioGT.data.values.every(row=>Object.keys(row).sort().join(',')==='category,series,stack_order,value'),kind+' differences and ratio settings stay out of GT');

  edit(selector(2,'end'),'');
  await wait();
  ok(values()[0]===40&&values()[2]===12.345678&&values()[3]===null&&$('issues').textContent.includes('缺少有效端点'),kind+' incomplete endpoints only suspend automation in their own category');
  $('undo').click();
  ok(values()[3]===75,kind+' undo restores the category denominator');
  selector(0,'value').click();$('deleteRow').click();
  ok(values()[0]===100&&values()[2]===75,kind+' deleting a recorded segment updates its category only');
  $('undo').click();
  ratios()[1].click();
  ok(checked()==='1,0'&&values().join(',')==='40,60,12.345678,30',kind+' disabling one category leaves the other calculation intact');

  const heightRows=()=>[...$('percentStackHeightCategories').children];
  const heightControl=(category,field)=>heightRows()[category].querySelector('[data-height-'+field+']');
  const heightChecks=()=>heightRows().map(row=>Number(row.querySelector('[data-height-selection]').checked)).join(',');
  ok(!$('percentStackHeightControls').hidden&&!$('percentStackHeightControls').closest('.table-section')&&
    !$('tableHead').textContent.includes('系列高度')&&heightChecks()==='0,0',kind+' category heights are in a separate opt-in panel');
  heightControl(0,'selection').click();
  ok(heightChecks()==='1,0'&&checked()==='1,0',kind+' height selection is independent of ratio selection');
  edit(heightControl(0,'value'),80.125);
  ok(values()[0]===24.96&&values()[1]===37.44&&values()[3]===30,kind+' category height supplies the full denominator without forcing recorded segments to total 100');
  edit(heightControl(0,'value'),0);
  ok(heightControl(0,'value').value==='80.125'&&values()[0]===24.96,kind+' rejects a zero denominator and preserves the measurement');
  edit(heightControl(0,'value'),'');
  ok(values()[0]===40&&values()[1]===60,kind+' a selected category with no height uses segment totals');

  $('selectAllPercentStackHeights').click();
  ok(heightChecks()==='1,1'&&checked()==='1,0',kind+' selects all height targets without changing ratio settings');
  heightControl(0,'pick').click();at(5);
  ok($('hint').textContent.includes('整柱终点')&&values()[0]===40,kind+' first height point is a draft');
  at(5);
  ok($('toast').textContent.includes('不同的整柱终点'),kind+' rejects a zero-length measurement');
  at(85);
  ok(heightControl(0,'value').value==='80'&&values()[0]===25&&values()[1]===37.5,kind+' measures the full bar along the correct axis');
  $('undo').click();
  ok(heightControl(0,'value').value===''&&values()[0]===40,kind+' one undo removes both points and restores segment-total ratios');
  $('redo').click();
  ok(heightControl(0,'value').value==='80'&&values()[0]===25,kind+' redo restores the picked height');
  heightControl(1,'pick').click();at(10,1);at(60,1);
  ratios()[1].click();
  ok(heightControl(1,'value').value==='50'&&values()[2]===12.345678&&values()[3]===60,
    kind+' independent heights and manual percentage precedence');
  $('percentStackSharedHeight').click();
  ok(heightControl(1,'value').disabled&&heightControl(1,'pick').disabled&&heightControl(1,'value').value==='80'&&values()[3]===37.5,
    kind+' shared mode uses the first selected height and only allows taking its points');
  heightControl(0,'selection').click();
  ok(heightChecks()==='0,1'&&!heightControl(1,'pick').disabled&&heightControl(1,'value').value==='50'&&values()[0]===40&&values()[3]===60,
    kind+' changing selection changes the source in visual category order');
  $('undo').click();
  $('clearPercentStackHeights').click();
  ok(heightChecks()==='0,0'&&values()[0]===40&&values()[3]===75,kind+' clearing height selections restores fallback ratios');
  $('undo').click();

  edit(selector(0,'end'),'');
  ok(values()[0]===null&&values()[1]===37.5&&values()[3]===37.5,kind+' a known category height allows complete segments to calculate independently');
  $('undo').click();
  await $('saveProject').onclick();
  await upload(JSON.parse(await downloads.at(-1).blob.text()));
  const heightRecords=state().percentStackCategoryHeights,firstHeight=heightRecords[state().categoryObjects[0].key];
  ok(firstHeight.startPixel&&firstHeight.endPixel&&heightChecks()==='1,1'&&$('percentStackSharedHeight').checked&&values()[3]===37.5,
    kind+' backup restores height selection, sharing and both original points');
  const heightGT=chartStudio.snapshot().lastSpec;
  ok(heightGT.data.values.every(row=>Object.keys(row).sort().join(',')==='category,series,stack_order,value'),
    kind+' category height and evidence stay out of GT');
  $('percentStackSharedHeight').click();
  ok(!heightControl(1,'pick').disabled&&heightControl(1,'value').value==='50'&&values()[3]===60,
    kind+' leaving shared mode restores each category’s own measurement');
  heightControl(0,'pick').click();at(2);$('cancelPercentStackHeight').click();at(82);
  ok(heightControl(0,'value').value==='80'&&values()[0]===25,kind+' cancel discards a pending point only');
  edit(document.querySelector(`[data-axis="${axis}"][data-field="v2"]`),200);
  ok(heightControl(0,'value').value==='160'&&values()[0]===12.5&&values()[3]===30,
    kind+' changing axis calibration updates pixel-derived heights');

  const mark=value=>horizontal?{x:80+4.8*value,y:150}:{x:150,y:400-3*value};
  const legacyBar={...project,percentStackMode:'bar',
   categoryObjects:[{name:'A',key:'legacy-A'},{name:'B',key:'legacy-B'}],
   percentStackBars:{'legacy-A':{start:mark(0),end:mark(50)}},
   rows:[
    {category:'A',series:'First',start:0,end:30,value:30},
    {category:'A',series:'Last',start:30,end:90,value:60}
   ],evidence:[{startPixel:mark(0),pixel:mark(15)},{startPixel:mark(15),pixel:mark(45)}]};
  await reload(legacyBar,'legacy-bar');
  ok(values().join(',')==='30,60'&&!$('percentStackBarMeasure'),kind+' old whole-bar records remain intact without a calibration control');
  target(0);choose('end');at(25);
  ok(values().join(',')==='25,20'&&state().rows[1].start===25&&!state().percentStackBarCategories['legacy-A'],kind+' remeasuring an old category switches its evidence to the calibrated numeric axis');
  $('undo').click();
  ok(values().join(',')==='30,60',kind+' undo restores the historical values');
 }
 return {passed:true,assertions:checks.length,checks};
};
const result=await runInPage('('+task.toString()+')()',process.argv[2]);assert.equal(result.passed,true);console.log(JSON.stringify(result,null,2));
