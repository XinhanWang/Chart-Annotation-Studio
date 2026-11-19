const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),ctx=vm.createContext({console,setTimeout,clearTimeout,performance,structuredClone,TextEncoder});
for(const [,s]of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g))if(s.includes('.vega={}')||s.includes('.vegaLite={}'))vm.runInContext(s,ctx);
vm.runInContext(fs.readFileSync('studio.js','utf8').split('const $=id=>')[0]+';globalThis.api={defaultProject,makeSpec,importSpec,validate,renderSpec,renameObject,measurementAxis};',ctx);
const a=ctx.api,plain=x=>JSON.parse(JSON.stringify(x));
let checks=0;function check(name,fn){fn();console.log('PASS',name);checks++;}
check('unchanged real generator shared/dual and errorbar samples retain scientific values',()=>{
 const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/composite-generator.json','utf8'));
 assert.equal(fixtures.cases.length,4);
 const observations=spec=>spec.data.values.map(r=>JSON.stringify([r.category,r.value,r.lower,r.upper,r.series_role,r.series])).sort();
 for(const {spec} of fixtures.cases){const p=a.importSpec(spec),gt=a.makeSpec(p);assert.deepEqual(plain(observations(gt)),observations(spec));assert.deepEqual(plain(a.makeSpec(a.importSpec(gt))),plain(gt));ctx.vega.parse(ctx.vegaLite.compile(a.renderSpec(gt)).spec);}
});
check('unlabelled legends, logarithmic and reversed calibration retain values and reject invalid inputs',()=>{
 const p=a.defaultProject('barline_n');p.legend=false;p.dualYAxis=true;p.axes.r.type='log';p.axes.r.v1=1;p.axes.r.v2=1000;p.axes.r.p1=50;p.axes.r.p2=400;p.axes.r.calibrated=true;
 const gt=a.makeSpec(p);assert.equal(gt.encoding.color.legend,null);assert(gt.data.values.every(r=>/^Series \d+$/.test(r.series)));assert.deepEqual(plain(a.makeSpec(a.importSpec(gt))),plain(gt));
 p.rows.find(r=>r._seriesKey===p.series[1].key).value=0;assert.throws(()=>a.makeSpec(p));
});
check('shared and dual axes preserve exact observations and roundtrip',()=>{
 for(const dual of [false,true]){
  const p=a.defaultProject('barline_n');p.dualYAxis=dual;p.yTitle='Volume (L)';p.rightYTitle='Rate (%)';p.rows[0].value=1.12345678901234;
  const before=JSON.stringify(p),gt=a.makeSpec(p);assert.equal(JSON.stringify(p),before);assert.equal(gt.data.values[0].value,1.12345678901234);
  assert(gt.data.values.some(r=>r.series_role==='line'));assert.equal(gt.resolve?.scale.y,dual?'independent':undefined);
  const restored=a.importSpec(gt);assert.equal(restored.dualYAxis,dual);assert.equal(restored.rightYTitle,dual?'Rate (%)':'Volume (L)');assert.deepEqual(plain(a.makeSpec(restored)),plain(gt));
  ctx.vega.parse(ctx.vegaLite.compile(a.renderSpec(gt)).spec);
 }
});
check('multiple grouped bars reserve offsets for bars and retain absolute error limits',()=>{
 const p=a.defaultProject('barline_n');const extra={...p.series[0],key:'second-bar',name:'B'};p.series.push(extra);p.rows.push(...p.rows.filter(r=>r._seriesKey===p.series[0].key).map(r=>({...r,_seriesKey:extra.key,series:extra.name,value:r.value+1})));
 p.errorBars=true;for(const r of p.rows)if(p.series.find(s=>s.key===r._seriesKey).role==='bar'){r.lower=r.value-1;r.upper=r.value+2;}
 for(const dual of [false,true]){p.dualYAxis=dual;const gt=a.makeSpec(p),bars=dual?gt.layer[0].layer:gt.layer.slice(0,-1);assert.equal(bars[1].mark.type,'errorbar');assert.equal(bars[0].encoding.xOffset.scale.domain.length,2);assert(!gt.layer.at(-1).encoding?.xOffset);assert.deepEqual(plain(a.makeSpec(a.importSpec(gt))),plain(gt));ctx.vega.parse(ctx.vegaLite.compile(a.renderSpec(gt)).spec);}
});
check('repeated names use independent shared C/S identities',()=>{
 const p=a.defaultProject('barline_n');a.renameObject(p,'category',p.categoryObjects[1].key,'A');a.renameObject(p,'series',p.series[1].key,p.series[0].name);
 const gt=a.makeSpec(p);assert(gt.data.values.every(r=>r.category_id&&r.series_id));assert.deepEqual(plain(a.makeSpec(a.importSpec(gt))),plain(gt));
});
check('line paths retain backwards connections, repeated X does not fabricate order',()=>{
 const p=a.defaultProject('barline_n');const line=p.rows.filter(r=>r._seriesKey===p.series[1].key);p.rows=p.rows.filter(r=>r._seriesKey!==p.series[1].key).concat([line[2],line[0],line[1]]);
 const gt=a.makeSpec(p);assert(gt.data.values.filter(r=>r.series_role==='line').every(r=>Number.isFinite(r.path_order)));assert.deepEqual(plain(a.makeSpec(a.importSpec(gt))),plain(gt));
});
check('unsupported role fields and malformed transforms are rejected',()=>{
 const p=a.defaultProject('barline_n');p.rows.find(r=>r._seriesKey===p.series[1].key).lower=0;assert.throws(()=>a.makeSpec(p));
 const gt=plain(a.makeSpec(a.defaultProject('barline_n')));gt.layer.at(-1).transform.push({filter:'datum.value>0'});assert.throws(()=>a.importSpec(gt));
});
(async()=>{
 for(const dual of [false,true]){const p=a.defaultProject('barline_n');p.dualYAxis=dual;for(const r of p.rows)if(r._seriesKey===p.series[1].key)r.value*=100;
  const vg=ctx.vegaLite.compile(a.renderSpec(a.makeSpec(p))).spec;const view=new ctx.vega.View(ctx.vega.parse(vg),{renderer:'none'});await view.runAsync();assert((await view.toSVG()).includes('<svg'));view.finalize();checks++;}
 console.log(JSON.stringify({passed:true,checks}));
})().catch(e=>{console.error(e);process.exitCode=1;});
