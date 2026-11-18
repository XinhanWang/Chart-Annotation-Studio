// Test the real model extracted from the generated offline application.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const app=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('function makeSpec(p)'));
const ctx=vm.createContext({console,Math:Object.assign(Object.create(Math),{random:()=>0})});
vm.runInContext(app.slice(0,app.indexOf("let p=defaultProject('scatter_1')"))+'\nglobalThis.testing={defaultProject,makeSpec,applyObjectNames,parseObjectNames,addObject,nextSeriesColor,SERIES_COLORS};',ctx);
const {defaultProject,makeSpec,applyObjectNames,parseObjectNames,addObject,nextSeriesColor,SERIES_COLORS}=ctx.testing,plain=x=>JSON.parse(JSON.stringify(x));
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
check('LF, CRLF and CR inputs trim whitespace, skip empty lines and retain duplicate names',()=>assert.deepEqual(plain(parseObjectNames('  A  \r\n\r\n B\rA\n  ')),['A','B','A']));
for(const kind of ['barh_n','barv_n','barv_stack','line_n','scatter_n'])check(kind+': bulk series preserves stable keys, values, evidence and duplicate objects',()=>{
 const p=defaultProject(kind),keys=p.series.map(s=>s.key),colors=p.series.map(s=>s.color),rows=plain(p.rows);p.evidence=p.rows.map((r,i)=>({pixel:{x:i,y:i+1}}));const evidence=plain(p.evidence);
 applyObjectNames(p,'series','Control\nControl\nNew');assert.deepEqual(plain(p.series.slice(0,2).map(s=>s.key)),plain(keys));assert.deepEqual(plain(p.series.slice(0,2).map(s=>s.color)),plain(colors));
 assert.equal(new Set(p.series.map(s=>s.key)).size,3);assert.equal(new Set(p.series.map(s=>s.color)).size,3);assert.deepEqual(plain(p.rows.map(r=>({...r,series:rows.find(old=>old._seriesKey===r._seriesKey).series}))),rows);assert.deepEqual(plain(p.evidence),evidence);
 const gt=makeSpec(p);assert.equal(new Set(gt.data.values.map(r=>r.series_id)).size,2);assert(!JSON.stringify(gt).includes('color":"#'));
});
for(const kind of ['barh_n','barv_n','barv_stack','line_n'])check(kind+': bulk category renames keep independent positions and row bindings',()=>{
 const p=defaultProject(kind);if(kind==='line_n'){p.rows=[];delete p.categoryObjects;p.xType='ordinal';}const before=p.categoryObjects?.map(c=>c.key);applyObjectNames(p,'category','Same\nSame\nLast\nExtra');
 assert.equal(p.categoryObjects.length,4);assert.equal(new Set(p.categoryObjects.map(c=>c.key)).size,4);if(before)assert.deepEqual(plain(p.categoryObjects.slice(0,3).map(c=>c.key)),plain(before));assert.deepEqual(plain(p.categories),['Same','Same','Last','Extra']);
 for(const r of p.rows)assert.equal(r.category,p.categoryObjects.find(c=>c.key===r._categoryKey).name);
});
check('shrinking lists removes only trailing objects and aligned evidence',()=>{const p=defaultProject('barv_n');p.evidence=p.rows.map((r,i)=>({index:i}));const first=p.series[0].key;applyObjectNames(p,'series','Kept');assert(p.rows.every(r=>r._seriesKey===first));assert.deepEqual(plain(p.evidence.map(e=>e.index)),[0,1,2]);applyObjectNames(p,'category','A');assert.equal(p.rows.length,1);assert.deepEqual(plain(p.evidence),[{index:0}]);});
check('empty input and multiple names for single-series types fail without changing the project',()=>{for(const text of [' \n ','One\nTwo']){const p=defaultProject('barv_1'),before=JSON.stringify(p);assert.throws(()=>applyObjectNames(p,'series',text));assert.equal(JSON.stringify(p),before);}});
check('single add and bulk add share unused-color allocation',()=>{const p=defaultProject('scatter_n');for(let i=0;i<100;i++)addObject(p,'series','S'+i);assert.equal(new Set(p.series.map(s=>s.color)).size,p.series.length);assert(p.series.every(s=>/^#[0-9a-f]{6}$/.test(s.color)));});
check('palette exhaustion and case-insensitive custom colors do not collide, even with fixed RNG',()=>{const series=SERIES_COLORS.map(color=>({color:color.toUpperCase()}));for(let i=0;i<100;i++)series.push({color:nextSeriesColor(series,()=>0)});assert.equal(new Set(series.map(s=>s.color.toLowerCase())).size,series.length);});
check('random sampling can select different unused palette entries',()=>assert.notEqual(nextSeriesColor([],()=>0),nextSeriesColor([],()=>.99)));
check('bulk adding 100 series allocates distinct colors beyond the palette',()=>{const p=defaultProject('scatter_n');applyObjectNames(p,'series',Array.from({length:100},(_,i)=>'S'+i).join('\n'));assert.equal(p.series.length,100);assert.equal(new Set(p.series.map(s=>s.color)).size,100);});
console.log(count+' model checks passed');
