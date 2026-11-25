import assert from 'node:assert/strict';
import {runInPage} from './browser-runner.mjs';
import fixtures from './precision-v1-fixtures.cjs';
import reference from './precision-reference.cjs';
const {app,plain,mixedLine}=fixtures;
const cases=[];
for(const axis of ['x','y'])for(const repeated of [false,true])for(const retreat of [false,true]){
 const p=mixedLine(axis,repeated,retreat),gt=plain(app.makeSpec(p));cases.push({axis,repeated,retreat,p:plain(p),gt,render:plain(app.renderSpec(gt,p))});
}
const fresh=plain(app.defaultProject('line_n'));
const task=async(cases,fresh)=>{
 const $=id=>document.getElementById(id),state=()=>chartStudio.snapshot(),checks=[];
 const ok=(x,m)=>{if(!x)throw Error(m+'; '+$('toast').textContent+'; '+$('renderState').textContent);checks.push(m);};
 const wait=async(predicate)=>{for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('State wait timed out; '+$('renderState').textContent);};
 const edit=(id,value)=>{const el=$(id);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
 const load=async(id,data)=>{const el=$(id),dt=new DataTransfer();dt.items.add(new File([JSON.stringify(data)],'regression.json',{type:'application/json'}));el.files=dt.files;await el.onchange({target:el});};
 await $('demo').onclick();await wait(()=>state().imageSize);const image=chartStudio.bundle.current.image;
 for(const f of cases){
  const compiled=vegaLite.compile(f.render),view=new vega.View(vega.parse(compiled.spec),{renderer:'none'});await view.runAsync();
  const domain=view.scale(f.axis).domain();ok(JSON.stringify(domain)===JSON.stringify(f.repeated?[f.axis.toUpperCase()+'1',f.axis.toUpperCase()+'2',f.axis.toUpperCase()+'3']:['A','B','C']),'correct discrete '+f.axis+' scale with missing observations, repeated='+f.repeated+', retreat='+f.retreat);
  ok((await view.toSVG()).includes('<svg'),'legal Vega render');view.finalize();
  const tables=VegaLiteTableExport.exportTables(f.gt);ok(tables.length===1&&tables[0].markdown.includes('0.1234567890123')&&tables[0].csv.includes('0.1234567890123'),'Markdown and CSV retain exact scientific values');
  await load('specInput',f.gt);await wait(()=>state().renderOk&&JSON.stringify(state().lastSpec)===JSON.stringify(f.gt));ok(JSON.stringify(state().lastSpec)===JSON.stringify(f.gt),'actual UI GT import and round trip '+f.axis+', repeated='+f.repeated+', retreat='+f.retreat);
 }
 const point=(x,y)=>{const c=$('canvas'),b=c.getBoundingClientRect(),size=state().imageSize;c.dispatchEvent(new PointerEvent('pointerdown',{clientX:b.left+x*b.width/size.width,clientY:b.top+y*b.height/size.height,bubbles:true,pointerId:1}));c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));};
 for(const axis of ['x','y']){
  const p=structuredClone(fresh);p.rows=[{x:1.234567890123,y:20.123456789012,series:p.series[0].name,_seriesKey:p.series[0].key},{x:3.234567890123,y:40.123456789012,series:p.series[0].name,_seriesKey:p.series[0].key}];p.evidence=p.rows.map(()=>({role:'transcribed',source:'manual_entry'}));p.axes.x.calibrated=p.axes.y.calibrated=true;
  await load('projectInput',{format:'chart-studio-project',version:1,queue:[],activeId:null,current:{project:p,image,name:'mixed.png'}});await wait(()=>state().imageSize);const original=state().project;
  edit(axis+'Type','nominal');ok(state().project.rows.length===0,'new '+axis+' mode is independent');const numeric=axis==='x'?'y':'x';ok(!$('axisFields').querySelector('[data-axis="'+axis+'"]')&&!!$('axisFields').querySelector('[data-axis="'+numeric+'"]'),'only '+numeric+' calibration is required');
  for(const field of ['p1','p2','v1','v2']){const calibration=$('axisFields').querySelector('[data-axis="'+numeric+'"][data-field="'+field+'"]');calibration.value=String(p.axes[numeric][field]);calibration.dispatchEvent(new Event('change',{bubbles:true}));}ok(state().project.axes[numeric].calibrated,'new discrete mode has independently calibrated continuous axis');
  $('categories').value='A\nB\nA';$('applyCategoryNames').click();const categories=state().project.categoryObjects;ok(categories.length===3&&categories[0].key!==categories[2].key,'bulk duplicate labels retain separate positions');
  edit('sequence','manual');edit('activeCategory',categories[0].key);edit('activeSeries',p.series[0].key);document.querySelector('[data-tool="point"]').click();point(200,200);
  edit('activeSeries',p.series[1].key);document.querySelector('[data-tool="point"]').click();point(220,220);await wait(()=>state().renderOk);
  const measured=state().project;ok(measured.rows.length===2,'two actual mixed-axis measurements');ok(measured.evidence[0].pixel[axis]===measured.evidence[1].pixel[axis],'series share the original-pixel category anchor');
  for(let i=0;i<2;i++)ok(measured.rows[i][numeric]===measurement(measured.evidence[i].pixel[numeric],measured.axes[numeric]),'pixel measurement follows Precision V1');
  document.querySelector('[data-tool="select"]').click();$('canvas').dispatchEvent(new KeyboardEvent('keydown',{key:axis==='x'?'ArrowUp':'ArrowRight',bubbles:true}));const nudged=state().project;ok(nudged.rows[1][numeric]!==measured.rows[1][numeric]&&nudged.evidence[1].pixel[axis]===measured.evidence[1].pixel[axis],'keyboard nudge changes only continuous coordinate');$('undo').click();ok(JSON.stringify(state().project.rows)===JSON.stringify(measured.rows),'undo restores exact measurements');
  const saved=state().project;edit(axis+'Type','quantitative');ok(JSON.stringify(state().project.rows)===JSON.stringify(original.rows)&&JSON.stringify(state().project.axes)===JSON.stringify(original.axes),'continuous mode restores typed values and calibration');edit(axis+'Type','nominal');ok(JSON.stringify(state().project.rows)===JSON.stringify(saved.rows)&&JSON.stringify(state().project.assist.categoryPixels)===JSON.stringify(saved.assist.categoryPixels),'discrete mode restores data and anchors');
  const backup=chartStudio.bundle;await load('projectInput',backup);ok(JSON.stringify(state().project.rows)===JSON.stringify(saved.rows)&&JSON.stringify(state().project.lineModes)===JSON.stringify(saved.lineModes),'project backup restores inactive modes');
 }
 const fractions={data:{values:[{category:'A',value:.10000000000000003},{category:'B',value:.8999999999999999}]},mark:{type:'arc'},encoding:{theta:{field:'value',type:'quantitative'},color:{field:'category',type:'nominal'}}};
 await load('specInput',fractions);await wait(()=>state().renderOk&&state().lastSpec?.encoding?.theta?.format===undefined&&JSON.stringify(state().lastSpec?.data)===JSON.stringify(fractions.data));ok(state().project.valueMode==='absolute'&&!$('confirmPieFractions').hidden,'unformatted pie remains ambiguous until explicit confirmation');$('confirmPieFractions').click();await wait(()=>state().renderOk&&!!state().lastSpec?.encoding?.theta?.format&&JSON.stringify(state().lastSpec.data)===JSON.stringify(fractions.data));ok(state().project.valueMode==='percent'&&JSON.stringify(state().lastSpec.data)===JSON.stringify(fractions.data),'explicit fraction confirmation preserves exact floating-point source');
 edit('valueTitle','Revenue (万元)');edit('valueMode','absolute');edit('valueMode','percent');ok($('valueTitle').value==='Revenue (万元)','pie mode switches preserve custom scientific titles');
 return {passed:true,assertions:checks.length,checks};
};
const result=await runInPage(`(()=>{${reference.browserSource}return (${task.toString()})(${JSON.stringify(cases)},${JSON.stringify(fresh)});})()`,process.argv[2]);assert(result.passed);console.log(JSON.stringify(result,null,2));
