// Independent fixtures from the documented compact stack schema, tested against the real app.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]),app=scripts.find(s=>s.includes('function makeSpec(p)'));
const ctx=vm.createContext({console,setTimeout,clearTimeout,performance,structuredClone,TextEncoder});
for(const s of scripts.filter(s=>s.includes('.vega={}')||s.includes('.vegaLite={}')))vm.runInContext(s,ctx);
vm.runInContext(app.slice(0,app.indexOf("let p=defaultProject('scatter_1')"))+'\nglobalThis.testing={defaultProject,makeSpec,importSpec,validate,annotationOrder,renameObject,ensureIdentities,addObject,syncPercentStackRatios};',ctx);
const {defaultProject,makeSpec,importSpec,validate,annotationOrder,renameObject,ensureIdentities,addObject,syncPercentStackRatios}=ctx.testing,plain=x=>JSON.parse(JSON.stringify(x));
let count=0;
function fixture(kind){const p=defaultProject(kind);p.title='Measurement';p.xTitle=kind==='barh_stack'?'Value (MPa)':'Sample';p.yTitle=kind==='barh_stack'?'Sample':'Value (MPa)';renameObject(p,'series',p.series[0].key,'S1');renameObject(p,'series',p.series[1].key,'S2');p.rows=[{category:'B',value:6,start:4,end:10,series:'S2'},{category:'A',value:7,start:3,end:10,series:'S2'},{category:'B',value:4,start:0,end:4,series:'S1'},{category:'A',value:3,start:0,end:3,series:'S1'}];return p;}
function expected(h){return {title:'Measurement',data:{values:[{category:'A',value:3,stack_order:0,series:'S1'},{category:'A',value:7,stack_order:1,series:'S2'},{category:'B',value:4,stack_order:0,series:'S1'},{category:'B',value:6,stack_order:1,series:'S2'}]},mark:{type:'bar'},encoding:h?{x:{field:'value',type:'quantitative',title:'Value (MPa)',stack:'zero'},y:{field:'category',type:'nominal',title:'Sample',sort:null},color:{field:'series',type:'nominal',sort:null},order:{field:'stack_order',type:'quantitative'}}:{x:{field:'category',type:'nominal',title:'Sample',sort:null},y:{field:'value',type:'quantitative',title:'Value (MPa)',stack:'zero'},color:{field:'series',type:'nominal',sort:null},order:{field:'stack_order',type:'quantitative'}}};}
async function render(gt,h){const view=new ctx.vega.View(ctx.vega.parse(ctx.vegaLite.compile(gt).spec),{renderer:'none'});await view.runAsync();const bars=[];function visit(s){for(const i of s.items||[]){if(s.role==='mark'&&s.marktype==='rect')bars.push(i);if(i.items)visit(i);}}visit(view.scenegraph().root);assert.equal(bars.length,4);for(const cat of ['A','B']){const segs=bars.filter(b=>b.datum.category===cat).sort((a,b)=>h?a.x-b.x:b.y-a.y);assert.deepEqual(segs.map(b=>b.datum.series),['S1','S2']);}view.finalize();count++;}

function percentFixture(horizontal){
 const category={field:'category',type:'nominal',sort:null,title:'Sample'};
 const value={field:'value',type:'quantitative',title:'Share (%)',stack:'zero'};
 return {title:'Composition',data:{values:[
  {category:'A',value:30,stack_order:0,series:'S1'},
  {category:'A',value:70,stack_order:1,series:'S2'},
  {category:'B',value:60,stack_order:0,series:'S1'},
  {category:'B',value:40,stack_order:1,series:'S2'}
 ]},mark:{type:'bar'},encoding:{x:horizontal?value:category,y:horizontal?category:value,
  color:{field:'series',type:'nominal',sort:null},order:{field:'stack_order',type:'quantitative'}}};
}

async function checkPercentStack(horizontal){
 const kind=horizontal?'barh_stack_percent':'barv_stack_percent',axis=horizontal?'x':'y';
 const gt={...percentFixture(horizontal),usermeta:{table_export:{tables:[{id:'data',path:'/data/values'}]}}},project=importSpec(gt);
 assert.equal(project.kind,kind);
 assert.deepEqual(plain(makeSpec(project)),gt);
 assert.equal(importSpec(gt,horizontal?'barh_stack':'barv_stack').kind,horizontal?'barh_stack':'barv_stack');
 await render(gt,horizontal);
 project[axis+'Title']='';
 const untitled=plain(makeSpec(project));
 assert.equal(Object.hasOwn(untitled.encoding[axis],'title'),false);
 assert.equal(defaultProject(kind)[axis+'Title'],'');
 assert.equal(defaultProject(kind).axes[axis].v2,null);
 assert.equal(importSpec(untitled).kind,horizontal?'barh_stack':'barv_stack');
 assert.equal(importSpec(untitled,kind).kind,kind);
 assert.deepEqual(plain(makeSpec(importSpec(untitled,kind))),untitled);

 const sparse=plain(gt);
 sparse.data.values.splice(0,1);
 sparse.data.values[0].value=99.99999991;
 sparse.data.values[1].value=0;
 sparse.data.values[2].value=99.98;
 for(const row of sparse.data.values)if(row.series==='S2')row.stack_order=2;
 const imported=importSpec(sparse);
 assert.deepEqual(plain(imported.series.map(s=>s.name)),['S1','S2']);
 assert.deepEqual(plain(makeSpec(imported)),sparse);
 assert.ok(validate(imported).some(issue=>issue.severity==='warning'&&/合计偏离 100%/.test(issue.message)));
 Object.assign(imported.rows[0],{start:0,end:95});
 assert.deepEqual(plain(makeSpec(imported)),sparse,'raw measurement evidence does not replace recorded percentages');

 const one=plain(sparse);one.data.values=[{...sparse.data.values[0],value:100.01}];
 const oneSeries=importSpec(one);oneSeries.legend=false;
 const oneExport=makeSpec(oneSeries);
 assert.equal(oneExport.data.values[0].value,100.01);
 assert.equal(oneExport.encoding.color.field,'series');
 assert.equal(oneExport.data.values[0].stack_order,2);
 assert.ok(validate(oneSeries).some(issue=>issue.severity==='warning'&&/大于 100/.test(issue.message)));

 const named=plain(sparse);named.encoding[axis].title='Relative abundance';
 assert.equal(importSpec(named).kind,horizontal?'barh_stack':'barv_stack');
 assert.deepEqual(plain(makeSpec(importSpec(named,kind))),named);
 const ordinary=plain(gt);ordinary.encoding[axis].title='Efficiency (%)';
 assert.equal(importSpec(ordinary).kind,horizontal?'barh_stack':'barv_stack');
 assert.deepEqual(plain(makeSpec(importSpec(ordinary))),ordinary);
 const signed=plain(gt);
 signed.data.values[0].value=-20;
 const signedProject=importSpec(signed);
 assert.equal(signedProject.kind,horizontal?'barh_stack':'barv_stack');
 assert.deepEqual(plain(makeSpec(signedProject)),signed);
 assert.throws(()=>importSpec(signed,kind),/段占比不能为负数/);
 const normalized=plain(gt);normalized.encoding[axis].stack='normalize';
 assert.throws(()=>importSpec(normalized,kind),/zero/);
 const badRank=plain(gt);badRank.data.values.at(-1).stack_order=9;
 assert.throws(()=>importSpec(badRank),/同一系列的 stack_order/);
 const duplicate=plain(gt);duplicate.data.values.push({...duplicate.data.values[0]});
 assert.throws(()=>importSpec(duplicate),/同一类别和系列/);

 const ratios=defaultProject(kind);
 ratios.rows=[
  {category:'A',series:'Series 1',start:0,end:200,value:200},
  {category:'A',series:'Series 2',start:200,end:500,value:300},
  {category:'B',series:'Series 1',start:0,end:160,value:160},
  {category:'B',series:'Series 2',start:160,end:200,value:19.98765}
 ];
 ratios.evidence=[null,null,null,{valueOverride:true}];
 ensureIdentities(ratios);
 const [categoryA,categoryB]=ratios.categoryObjects;
 syncPercentStackRatios(ratios);
 assert.deepEqual(plain(ratios.rows.map(r=>r.value)),[200,300,160,19.98765]);
 ratios.percentStackRatioCategories={[categoryA.key]:true};
 syncPercentStackRatios(ratios);
 assert.deepEqual(plain(ratios.rows.map(r=>r.value)),[40,60,160,19.98765]);
 ratios.percentStackRatio=true;
 ensureIdentities(ratios);syncPercentStackRatios(ratios);
 assert.equal(ratios.percentStackRatioCategories[categoryB.key],true);
 assert.equal(ratios.percentStackRatio,undefined);
 const newCategory=addObject(ratios,'category','New');
 assert.equal(ratios.percentStackRatioCategories[newCategory.key],undefined);
 assert.deepEqual(plain(ratios.rows.map(r=>r.value)),[40,60,80,19.98765]);
 assert.deepEqual(plain(ratios.rows.map(r=>r.difference)),[200,300,160,40]);
 assert.ok(makeSpec(ratios).data.values.every(r=>!('difference' in r)));
 const zero=defaultProject(kind);zero.percentStackRatio=true;
 zero.rows=[{category:'A',series:'Series 1',start:17,end:17,value:0}];
 ensureIdentities(zero);
 syncPercentStackRatios(zero);
 assert.equal(zero.rows[0].value,null);
 assert.ok(validate(zero).some(issue=>/差值合计无效或为 0/.test(issue.message)));
 zero.rows[0].height=-1;
 assert.ok(validate(zero).some(issue=>issue.severity==='error'&&/系列高度必须为有限的非负数/.test(issue.message)));
 count++;
}
(async()=>{for(const kind of ['barv_stack','barh_stack']){const h=kind==='barh_stack',p=fixture(kind),before=JSON.stringify(p),gt=plain(makeSpec(p));assert.deepEqual(gt,{...expected(h),usermeta:{table_export:{tables:[{id:'data',path:'/data/values'}]}}});assert.equal(JSON.stringify(p),before,'export must not alter measurement evidence');assert.equal(JSON.stringify(makeSpec(importSpec(gt))),JSON.stringify(gt),'canonical serialized roundtrip');await render(plain(gt),h);count++;
 const both=fixture(kind);both.rows.forEach(r=>r.stack_order=r.series==='S1'?0:1);assert(!validate(both).some(x=>x.severity==='error'));assert.deepEqual(plain(makeSpec(both)),gt,'intermediate rank + boundaries are accepted, only rank exported');count++;
 const legacy=plain(gt),v=h?'x':'y';legacy.data.values.forEach(r=>{r.start=r.stack_order===0?0:r.category==='A'?3:4;r.end=r.start+r.value;delete r.stack_order;});legacy.encoding[v]={...legacy.encoding[v],field:'end',stack:null};legacy.encoding[v+'2']={field:'start'};delete legacy.encoding.order;assert.deepEqual(plain(makeSpec(importSpec(legacy))),gt,'legacy ordinary endpoint GT migrates to canonical values');count++;
 const exceptional=fixture(kind);exceptional.rows.forEach(r=>{r.start+=5;r.end+=5;});assert.deepEqual(plain(makeSpec(exceptional)),gt,'measured origin is intermediate evidence, not an exported offset');exceptional.stackEndpointMode='explicit';const e=plain(makeSpec(exceptional));assert(e.data.values.every(r=>'start' in r&&'end' in r&&!('stack_order' in r)));assert.equal(e.encoding[v].field,'end');assert.equal(e.encoding[v].stack,null);assert.deepEqual(e.encoding[v+'2'],{field:'start'});assert.equal(JSON.stringify(makeSpec(importSpec(e))),JSON.stringify(e),'explicit exceptional GT roundtrip');count++;
 const bad=fixture(kind);bad.rows[0].value=999;assert.throws(()=>makeSpec(bad),/value 必须等于/);count++;
 const duplicate=fixture(kind);renameObject(duplicate,'category',duplicate.categoryObjects[1].key,'A');renameObject(duplicate,'series',duplicate.series[1].key,'S1');const d=plain(makeSpec(duplicate));assert(d.data.values.every(r=>r.category_id&&r.series_id&&!('start' in r)));assert.equal(JSON.stringify(makeSpec(importSpec(d))),JSON.stringify(d));count++;
 }
 for(const kind of ['barh_1','barh_n','barv_1','barv_n','barv_stack','barh_stack','line_1','line_n','scatter_1','scatter_n']){const guide=annotationOrder(defaultProject(kind));assert(guide.series&&guide.category&&guide.records);count++;}
 await checkPercentStack(false);await checkPercentStack(true);
 console.log(JSON.stringify({passed:true,testGroups:count}));})().catch(e=>{console.error(e.stack);process.exitCode=1;});
