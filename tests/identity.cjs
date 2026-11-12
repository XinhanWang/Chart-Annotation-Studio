// Real standalone-app model + bundled Vega, no mock renderer.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const app=scripts.find(s=>s.includes('function makeSpec(p)'));
const ctx=vm.createContext({console,setTimeout,clearTimeout,performance,structuredClone,TextEncoder});
for(const s of scripts.filter(s=>s.includes('.vega={}')||s.includes('.vegaLite={}')))vm.runInContext(s,ctx);
vm.runInContext(app.slice(0,app.indexOf("let p=defaultProject('scatter_1')"))+'\nglobalThis.testing={defaultProject,makeSpec,importSpec,validate,renderSpec,ensureIdentities,renameObject,moveObject,addObject,removeObject,identity,categoryIdentity};',ctx);
const {defaultProject,makeSpec,importSpec,validate,renderSpec,ensureIdentities,renameObject,moveObject,addObject,removeObject,identity,categoryIdentity}=ctx.testing;
const plain=x=>JSON.parse(JSON.stringify(x));
let count=0;const check=(name,fn)=>{fn();count++;console.log('PASS '+name);};
function assertGT(gt){
 const keys=['category','category_id','value','x','x_id','y','lower','upper','path_order','stack_order','start','end','series','series_id'];
 for(const r of gt.data.values){assert.deepEqual(Object.keys(r),keys.filter(k=>k in r));assert(!Object.keys(r).some(k=>k.endsWith('_instance')||k.startsWith('_')));}
 assert(!JSON.stringify(gt).includes('labelExpr'));
 assert.deepEqual(plain(makeSpec(importSpec(plain(gt)))),plain(gt),'round trip');
}
function duplicate(kind='barv_n'){
 const p=defaultProject(kind),cats=p.categoryObjects,ss=p.series;
 renameObject(p,'category',cats[1].key,cats[0].name);
 renameObject(p,'series',ss[1].key,ss[0].name);
 return p;
}
check('all nine kinds: no redundant IDs, stable round trip',()=>{
 for(const k of ['barh_1','barh_n','barv_1','barv_n','barv_stack','line_1','line_n','scatter_1','scatter_n']){const gt=plain(makeSpec(defaultProject(k)));assertGT(gt);for(const r of gt.data.values)assert(!r.category_id&&!r.series_id&&!r.x_id);}
});
check('single series with no legend omits series',()=>{const gt=plain(makeSpec(defaultProject('barv_1')));assert(gt.data.values.every(r=>!('series' in r)));assertGT(gt);});
check('shared category across series is not a duplicate label identity',()=>{const gt=plain(makeSpec(defaultProject('barv_n')));assert(gt.data.values.every(r=>!r.category_id));});
check('same category text at separate positions gets C1 C2 C3',()=>{const p=defaultProject('barv_n');renameObject(p,'category',p.categoryObjects[1].key,'A');const gt=plain(makeSpec(p));assertGT(gt);assert.deepEqual(gt.data.values.map(r=>r.category_id),['C1','C1','C2','C2','C3','C3']);assert(gt.data.values.every(r=>!r.series_id));});
check('duplicate legends: stable objects and S1 S2',()=>{const p=defaultProject('barv_n');renameObject(p,'series',p.series[1].key,'Series 1');const gt=plain(makeSpec(p));assertGT(gt);assert.deepEqual(gt.data.values.map(r=>r.series_id),['S1','S2','S1','S2','S1','S2']);assert(gt.data.values.every(r=>!r.category_id));});
check('both duplicate dimensions, numeric extras precede series',()=>{const p=duplicate();p.rows.forEach(r=>{r.lower=r.value-1;r.upper=r.value+1;});const gt=plain(makeSpec(p));assertGT(gt);assert.deepEqual(Object.keys(gt.data.values[0]),['category','category_id','value','lower','upper','series','series_id']);});
check('rename only updates bound object, adding/removing data keeps keys',()=>{const p=duplicate(),c=p.categoryObjects[1].key,s=p.series[1].key,old=p.rows.filter(r=>r._categoryKey===c&&r._seriesKey===s).map(r=>r.value);renameObject(p,'category',c,'Renamed');renameObject(p,'series',s,'Second');assert.deepEqual(p.rows.filter(r=>r._categoryKey===c&&r._seriesKey===s).map(r=>r.value),old);p.rows.push({...p.rows[0],value:999});p.rows.splice(1,1);assertGT(plain(makeSpec(p)));});
check('reorder duplicate objects preserves row attachment and reprojections',()=>{const p=duplicate(),c=p.categoryObjects[1].key,s=p.series[1].key,before=p.rows.map(r=>[r._categoryKey,r._seriesKey,r.value]);moveObject(p,'category',c,-1);moveObject(p,'series',s,-1);assert.deepEqual(p.rows.map(r=>[r._categoryKey,r._seriesKey,r.value]),before);const gt=plain(makeSpec(p));assertGT(gt);assert.equal(gt.data.values[0].value,45);assert.equal(gt.data.values[0].category_id,'C1');assert.equal(gt.data.values[0].series_id,'S1');});
check('new category/series share only selected actual object',()=>{const p=duplicate(),c=addObject(p,'category','A'),s=addObject(p,'series','Series 1');for(const series of p.series)p.rows.push({category:'A',value:17,series:series.name,_categoryKey:c.key,_seriesKey:series.key});p.rows.push({category:'A',value:42,series:s.name,_categoryKey:p.categoryObjects[0].key,_seriesKey:s.key});assertGT(plain(makeSpec(p)));removeObject(p,'category',c.key);assert(!p.rows.some(r=>r._categoryKey===c.key));removeObject(p,'series',s.key);assert(!p.rows.some(r=>r._seriesKey===s.key));assertGT(plain(makeSpec(p)));});
check('IDs disappear when ambiguity disappears, without losing internal objects',()=>{const p=duplicate();renameObject(p,'category',p.categoryObjects[1].key,'B');renameObject(p,'series',p.series[1].key,'Second');const gt=plain(makeSpec(p));assert(gt.data.values.every(r=>!r.category_id&&!r.series_id));assertGT(gt);});
check('legacy project and GT import migrate integer instances',()=>{const gt=plain(makeSpec(duplicate())),legacy=plain(gt);for(const r of legacy.data.values){r.category_instance=Number(r.category_id.slice(1))-1;r.series_instance=Number(r.series_id.slice(1))-1;delete r.category_id;delete r.series_id;}for(const d of Object.values(legacy.encoding)){if(d.field==='category_id')d.field='category_instance';if(d.field==='series_id')d.field='series_instance';}assert.deepEqual(plain(makeSpec(importSpec(legacy))),gt);const old=plain(defaultProject('barv_n'));delete old.categoryObjects;old.categories=['A','B','C'];for(const r of old.rows){delete r._categoryKey;delete r._seriesKey;}for(const s of old.series)delete s.key;ensureIdentities(old);assertGT(plain(makeSpec(old)));});
check('ordinal X is separate X1... identity namespace',()=>{const p=defaultProject('line_n');p.rows=[];p.xType='ordinal';for(const c of p.categoryObjects)for(const series of p.series)p.rows.push({x:c.name,y:3,_categoryKey:c.key,_seriesKey:series.key,series:series.name});renameObject(p,'category',p.categoryObjects[1].key,'A');const gt=plain(makeSpec(p));assertGT(gt);assert.equal(gt.encoding.x.field,'x_id');assert.deepEqual(gt.data.values.map(r=>r.x_id),['X1','X1','X2','X2','X3','X3']);});
check('project save/reload keeps keys including unobserved objects',()=>{const p=duplicate();addObject(p,'category','A');const snapshot=plain(p),restored=ensureIdentities(plain(snapshot));assert.deepEqual(plain(restored),snapshot);assertGT(plain(makeSpec(restored)));});
check('renderer expression uses JSON escaping, never edits GT',()=>{const p=duplicate(),name='引号" \\ 换行\n';for(const c of p.categoryObjects)renameObject(p,'category',c.key,name);for(const s of p.series)renameObject(p,'series',s.key,name);const gt=plain(makeSpec(p)),before=JSON.stringify(gt),preview=plain(renderSpec(gt));assert(preview.encoding.x.axis.labelExpr.includes('C1'));assert(preview.encoding.color.legend.labelExpr.includes('S1'));assert.equal(JSON.stringify(gt),before);assertGT(gt);});
(async()=>{
 const cases=['barh_n','barv_n','barv_stack'];
 for(const kind of cases){
 const p=duplicate(kind),gt=plain(makeSpec(p)),before=JSON.stringify(gt),spec=plain(renderSpec(gt)),warnings=[];
 const logger=ctx.vega.logger(ctx.vega.Warn);logger.warn=(...args)=>{warnings.push(args.join(' '));return logger};
 const compiled=ctx.vegaLite.compile(spec,{logger}).spec,view=new ctx.vega.View(ctx.vega.parse(compiled),{renderer:'none',logger});await view.runAsync();
 const marks=[],axis=[],legend=[];function visit(scene){for(const item of scene.items||[]){if(scene.role==='mark')marks.push(item);if(scene.role==='axis-label')axis.push(item.text);if(scene.role==='legend-label')legend.push(item.text);if(item.items)visit(item);}}visit(view.scenegraph().root);
 assert.equal(marks.length,6,kind+' distinct marks');assert.equal(axis.filter(t=>t==='A').length,2,kind+' duplicate axis labels');assert.equal(legend.filter(t=>t==='Series 1').length,2,kind+' duplicate legend labels');assert.equal(warnings.length,0,warnings.join('\n'));assert.equal(JSON.stringify(gt),before);view.finalize();count++;console.log('PASS real renderer '+kind);
 }
 {const fixtures=JSON.parse(fs.readFileSync(process.argv[2]||path.join(__dirname,'identity-fixtures.json'),'utf8'));for(const f of fixtures){const gt=plain(makeSpec(importSpec(f.gt)));assert.deepEqual(gt,f.gt,'cross-repo '+f.name);assertGT(gt);count++;}}
 console.log(JSON.stringify({passed:true,testGroups:count}));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
