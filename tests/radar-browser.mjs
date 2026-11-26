import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';

const task=async()=>{
  const $=id=>document.getElementById(id), snap=()=>chartStudio.snapshot(), project=()=>snap().project;
  const checks=[];
  const check=(condition,message)=>{
    if(!condition)throw Error(message+' '+JSON.stringify({tool:snap().tool,issues:$('issues').textContent,toast:$('toast').textContent}));
    checks.push(message);
  };
  const waitFor=async test=>{
    for(let i=0;i<40;i++){if(test())return;await new Promise(resolve=>setTimeout(resolve,100));}
    check(false,'Expected preview state');
  };
  const edit=(element,value)=>{
    element.value=String(value);
    element.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const clickTool=tool=>document.querySelector(`[data-tool="${tool}"]`).click();
  // Native coordinates are derived from the current canvas size and offset, also after zoom.
  const point=(x,y)=>{
    const canvas=$('canvas'),rect=canvas.getBoundingClientRect(),image=snap().imageSize;
    canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,
      clientX:rect.left+x*rect.width/image.width,clientY:rect.top+y*rect.height/image.height}));
    canvas.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));
  };
  const center={x:300,y:200};
  const at=(radius,angle=0)=>point(center.x+radius*Math.cos(angle),center.y+radius*Math.sin(angle));
  const active=()=>{
    const {assist,categoryObjects,series}=project();
    return [categoryObjects.find(cat=>cat.key===assist.category)?.name,series.find(s=>s.key===assist.series)?.name].join('/');
  };
  const switchTarget=(category,series)=>{
    const current=project();
    edit($('activeCategory'),current.categoryObjects.find(cat=>cat.name===category).key);
    if(series)edit($('activeSeries'),current.series.find(s=>s.name===series).key);
  };
  const checkRows=(values,message)=>check(JSON.stringify(project().rows.map(row=>row.value))===JSON.stringify(values),
    message+' actual='+JSON.stringify(project().rows.map(row=>row.value)));
  const downloads=[],blobURLs=new Map(),createURL=URL.createObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=createURL(blob);blobURLs.set(url,blob);return url;};
  HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob:blobURLs.get(this.href)});};
  const zipped=async blob=>{
    const bytes=new Uint8Array(await blob.arrayBuffer()),view=new DataView(bytes.buffer),entries={};
    let offset=0;
    while(view.getUint32(offset,true)===0x04034b50){
      const length=view.getUint32(offset+18,true),nameSize=view.getUint16(offset+26,true),start=offset+30+nameSize;
      const decode=new TextDecoder();
      entries[decode.decode(bytes.slice(offset+30,start))]=decode.decode(bytes.slice(start,start+length));
      offset=start+length;
    }
    return entries;
  };
  const load=async (id,data)=>{
    const input=$(id),files=new DataTransfer();
    files.items.add(new File([JSON.stringify(data)],'test.json',{type:'application/json'}));
    input.files=files.files;
    await input.onchange({target:input});
  };
  window.confirm=()=>true;
  await $('demo').onclick();
  const kinds=['radar_1','radar_n','polar_bar_1','polar_bar_n','polar_bar_stack'];
  edit($('family'),'radar');
  check([...$('kind').options].map(o=>o.value).join()===kinds.join(),'Exactly five polar subclasses are selectable');
  for(const kind of kinds){
    edit($('kind'),kind);
    const stacked=kind==='polar_bar_stack',polar=kind.startsWith('polar_bar'),multiple=kind.endsWith('_n')||stacked;
    if(kind==='radar_1'){
      edit($('radarCategoryCount'),4);
      check(project().categoryObjects.length===4,'Category count reuses object management');
      $('categories').value='A\nB\nC';$('applyCategoryNames').click();
    }
    if(multiple){
      edit($('radarSeriesCount'),3);
      check(project().series.length===3,'Series count reuses object management');
      $('seriesNames').value='S1\nS2';$('applySeriesNames').click();
    }
    if(kind==='radar_n'){
      edit($('radarCenterMode'),'lines');$('radarCenter').click();
      point(320,200);point(350,200);point(300,220);point(300,250);
    }else{$('radarCenter').click();point(center.x,center.y);}
    check(Math.hypot(project().radar.center.x-center.x,project().radar.center.y-center.y)<1e-9,kind+' locates the center');
    $('radarAnchor').click();at(120,-Math.PI/2);
    if(kind==='radar_1'){
      edit($('radarDomainMin'),10);edit($('radarDomainMax'),150);
      $('radarTick1').click();at(20);edit($('radarTickValue1'),30);
      $('radarTick2').click();at(100);edit($('radarTickValue2'),110);
    }else{
      $('radarZero').click();
      $('radarTick2').click();at(100);edit($('radarTickValue2'),100);
    }
    check($('radarCalibrationStatus').textContent.includes('已校准'),kind+' radial calibration succeeds');
    if(kind==='polar_bar_1'){edit($('radarTickValue2'),'100%');check($('radarPercent').checked,'Explicit printed percent activates scale');}
    if(stacked){
      switchTarget('B','S1');$('radarOrder').querySelector('button[data-delta="1"]').click();
      switchTarget('A','S1');
    }
    clickTool('point');
    if(kind==='polar_bar_n'){
      switchTarget('A','S1');$('radarSkip').click();
      check(active()==='B/S1','Missing grouped series advances to the next category');
      at(25,Math.atan2(4,3));at(35,-.8);
      check(active()==='A/S2','Grouped series advance to the first category of the next series');
      at(45,.7);at(50,-.5);at(55,.2);
      checkRows([25,35,45,50,55],'Off-axis grouped bars use true radial distance without adding zeros');
    }else if(stacked){
      at(20);at(50);
      check(active()==='B/S2','Stack follows the next category’s own inner-to-outer order');
      at(40,.6);at(60,.6);
      checkRows([20,30,40,20],'Stack records increments from shared boundaries');
      $('addRow').click();edit(document.querySelector('[data-i="4"][data-key="value"]'),'0');
      $('radarReview').click();
      await waitFor(()=> !snap().renderOk&&$('issues').textContent.includes('待复核'));
      switchTarget('C','S2');$('radarSkip').click();
      switchTarget('A','S1');$('radarRetake').click();at(25);
      checkRows([25,25,40,20,0],'Retaking a shared boundary updates both adjacent segment amounts');
      point(325,200);
      $('canvas').focus();
      $('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',ctrlKey:true,bubbles:true}));
      checkRows([26,24,40,20,0],'Nudging a shared boundary updates both adjacent segments');
      $('undo').click();
      edit($('radarDomainMax'),200);edit($('radarTickValue2'),200);
      checkRows([50,50,80,40,0],'Recalibration updates measured bounds and preserves manual zero');
    }else{
      at(kind==='polar_bar_1'?23.45678:25,.7);
      $('zoomIn').click();at(35,-.8);$('zoomOut').click();
      at(45,.2);
      if(multiple){
        check(active()==='A/S2','Multi-series radar resets category when changing series');
        at(25,.7);at(35,-.8);at(45,.2);
      }
      checkRows(kind==='radar_1'?[35,45,55]:multiple?[25,35,45,25,35,45]:[23.46,35,45],
        kind+' completes measurements through zoom and overlapping points');
    }
    await waitFor(()=>{
      const {renderOk,lastSpec}=snap();
      return renderOk&&lastSpec?.usermeta.chartType===(polar?'polar_bar':'radar')&&
        Boolean(lastSpec.encoding.y.stack)===stacked&&Boolean(lastSpec.encoding.color)===multiple;
    });
    const gt=snap().lastSpec;
    check(gt.mark.type===(polar?'bar':'line')&&Boolean(gt.encoding.y.stack)===stacked&&
      Boolean(gt.encoding.color)===multiple,kind+' exports the matching Compact variant');
    check(!!$('preview').querySelector(polar?'g.mark-arc':'g.mark-line'),kind+' previews with native polar marks');
    check(gt.data.values.every(row=>Object.keys(row).every(key=>['category','series','value','stack_order'].includes(key))),
      kind+' GT excludes private geometry');
    if(kind==='radar_1')check(gt.encoding.y.scale.domain.join()==='10,150','Calibration points do not replace the configured domain');
    if(kind==='polar_bar_1')check(gt.data.values[0].value===.2346&&gt.encoding.y.scale.domain[1]===1,
      'Automatic percentage has two decimal places before fraction conversion');
    if(stacked)check(gt.data.values.filter(row=>row.category==='B').map(r=>[r.series,r.stack_order].join(':')).join()==='S2:1,S1:2',
      'Stack GT preserves the category-specific order');
    $('reviewed').checked=true;$('reviewed').onchange();
    await $('exportGT').onclick();
    check(JSON.stringify(JSON.parse(await downloads.at(-1).blob.text()))===JSON.stringify(gt),kind+' GT download matches preview input');
    await $('exportTables').onclick();
    const tables=await zipped(downloads.at(-1).blob);
    check(Object.keys(tables).some(name=>name.endsWith('data.csv'))&&Object.keys(tables).some(name=>name.endsWith('data.md')),
      kind+' uses the shared Markdown/CSV export');
    if(stacked){
      await $('batchExport').onclick();
      const batch=await zipped(downloads.at(-1).blob);
      check(Object.keys(batch).some(name=>name.startsWith('gt/')&&JSON.stringify(JSON.parse(batch[name]))===JSON.stringify(gt)),
        'Batch export validates and includes native polar previews');
      const backup=structuredClone(chartStudio.bundle);
      await load('projectInput',backup);
      check(JSON.stringify(project().radar)===JSON.stringify(backup.current.project.radar)&&
        JSON.stringify(project().evidence)===JSON.stringify(backup.current.project.evidence),'Project restores calibration, order and raw boundaries');
      backup.current.project.kind='radar_stack';
      await load('projectInput',backup);
      check(project().kind==='polar_bar_stack','Workspace import migrates the legacy stack subtype');
    }
    await load('specInput',gt);
    await waitFor(()=>snap().renderOk&&JSON.stringify(snap().lastSpec)===JSON.stringify(gt));
    check(project().kind===kind,kind+' import preserves subtype and exact GT');
  }
  return {passed:true,checks};
};
const result=await runInPage('('+task.toString()+')()',process.argv[2]);
assert.ok(result.passed);
console.log(JSON.stringify(result,null,2));
