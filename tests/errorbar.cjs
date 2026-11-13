// Offline tests against the actual standalone app and its bundled Vega libraries.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const app=scripts.find(s=>s.includes('function makeSpec(p)'));
assert(app,'app script missing');
const ctx=vm.createContext({console,setTimeout,clearTimeout,performance,structuredClone,TextEncoder});
for(const s of scripts.filter(s=>s.includes('.vega={}')||s.includes('.vegaLite={}')))vm.runInContext(s,ctx);
// Avoid app initialization / DOM mutation; run only its real pure model functions.
vm.runInContext(app.slice(0,app.indexOf("let p=defaultProject('scatter_1')"))+'\nglobalThis.testing={defaultProject,makeSpec,importSpec,validate,requiredAxes,zipBytes,safeExportName};',ctx);
assert(ctx.vega&&ctx.vegaLite,'bundled Vega libraries missing');
const {defaultProject,makeSpec,importSpec,validate,requiredAxes,zipBytes,safeExportName}=ctx.testing;
const plain=x=>JSON.parse(JSON.stringify(x));
async function renderCheck(gt,label){
  const warnings=[],logger=ctx.vega.logger(ctx.vega.Warn);
  logger.warn=(...args)=>{warnings.push(args.join(' '));return logger};
  const compiled=ctx.vegaLite.compile(gt,{logger}).spec;
  const view=new ctx.vega.View(ctx.vega.parse(compiled),{renderer:'none',logger});
  await view.runAsync();
  const marks=[];
  function visit(scene){for(const item of scene.items||[]){if(scene.role==='mark')marks.push({type:scene.marktype,item});if(item.items)visit(item);}}
  visit(view.scenegraph().root);
  const bars=marks.filter(m=>m.type==='rect'),rules=marks.filter(m=>m.type==='rule');
  assert.equal(rules.length,gt.data.values.length,label+' interval count');
  assert.equal(bars.length,gt.data.values.length,label+' bar count');
  const horizontal=gt.encoding.x.field==='value',val=horizontal?'x':'y',cat=horizontal?'y':'x';
  const same=(a,b)=>['category','category_instance','series','series_instance'].every(k=>a[k]===b[k]);
  for(const {item} of rules){
    const datum=item.datum,bar=bars.find(m=>same(m.item.datum,datum))?.item;
    assert(bar,label+' matching bar missing');
    const expected=[view.scale(val)(datum.lower),view.scale(val)(datum.upper)].sort((a,b)=>a-b);
    const actual=[item[val],item[val+'2']].sort((a,b)=>a-b);
    expected.forEach((v,i)=>assert(Math.abs(v-actual[i])<1e-6,label+' absolute interval endpoint drift'));
    assert(Math.abs(item[cat]-(bar[cat]+bar[horizontal?'height':'width']/2))<1e-6,label+' interval/group offset drift');
  }
  assert.equal(warnings.length,0,label+': '+warnings.join('; '));
  assert((await view.toSVG()).includes('<svg'),label+' SVG missing');
  view.finalize();
  return {label,bars:bars.length,intervals:rules.length,warnings};
}
(async()=>{
  const results=[];
  for(const kind of ['barh_1','barh_n','barv_1','barv_n']){
    const p=defaultProject(kind+'_error');
    assert.equal(p.kind,kind);assert.equal(p.errorBars,true);
    assert.equal(p.legend,kind.endsWith('_n'));
    assert.deepEqual(plain(requiredAxes(p)),[kind.startsWith('barh')?'x':'y']);
    assert.throws(()=>makeSpec(p),/每条记录填写/,'incomplete error bars must not export as plain bars');
    p.rows.forEach(r=>{r.lower=r.value-2;r.upper=r.value+3;});
    assert.equal(validate(p).filter(i=>i.severity==='error').length,0);
    delete p.rows[0].lower;
    assert.throws(()=>makeSpec(p),/lower|每条记录填写/,'partial intervals must not export');
  }
  for(const kind of ['line_1','scatter_1'])assert.equal(defaultProject(kind).legend,false);
  const ordinal=defaultProject('line_1');ordinal.xType='ordinal';
  assert.deepEqual(plain(requiredAxes(ordinal)),['y']);
  assert.equal(safeExportName('../批次/图2.png'),'批次/图2.gt.json');
  assert.equal(safeExportName('a\\b:c.png'),'a/b_c.gt.json');
  const zip=zipBytes([{name:'gt/图2.gt.json',text:'{"title":"中文"}'}]);
  const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
  assert.equal(view.getUint32(0,true),0x04034b50);assert.equal(view.getUint16(6,true),0x0800);
  assert.equal(view.getUint32(zip.length-22,true),0x06054b50);
  assert.equal(view.getUint16(zip.length-14,true),1);

  for(const kind of ['barh_1','barh_n','barv_1','barv_n','barv_stack']){
    const p=defaultProject(kind);
    p.rows.forEach(r=>{r.lower=r.value-2;r.upper=r.value+3;});
    const gt=plain(makeSpec(p));
    assert.deepEqual(gt.layer[1].mark,{type:'errorbar'});
    const val=kind.startsWith('barh')?'x':'y';
    assert.equal(gt.layer[1].encoding[val].field,'lower');
    assert.equal(gt.layer[1].encoding[val+'2'].field,'upper');
    if(kind==='barv_stack')assert.equal(gt.layer[1].encoding.y.stack,null);
    const imported=importSpec(gt);
    assert.deepEqual(plain(makeSpec(imported)),gt,kind+' native round trip');
    const legacy=plain(gt);legacy.layer[1].mark={type:'rule'};
    assert.deepEqual(plain(makeSpec(importSpec(legacy))),gt,kind+' legacy normalization');
    const strings=plain(gt);strings.layer[1].mark='errorbar';
    assert.deepEqual(plain(makeSpec(importSpec(strings))),gt,kind+' object normalization');
    results.push(await renderCheck(gt,kind));
  }
  const p=defaultProject('barv_stack');
  p.rows.forEach((r,i)=>{r.start=5+(i%3)*2;r.end=r.start+r.value;r.lower=r.end-1;r.upper=r.end+2;delete r.stack_order;});
  p.stackEndpointMode='explicit'; // Imported interval placement is intentionally preserved.
  const endpoints=plain(makeSpec(p));
  assert.equal(endpoints.encoding.y.field,'end');
  assert.equal(endpoints.layer[1].encoding.y.stack,null);
  assert.deepEqual(plain(makeSpec(importSpec(endpoints))),endpoints,'stack endpoint round trip');
  results.push(await renderCheck(endpoints,'barv_stack_endpoints'));
  const invalid=plain(endpoints);invalid.layer.push({mark:{type:'rule'},encoding:{y:{field:'lower'},y2:{field:'upper'}}});
  assert.throws(()=>importSpec(invalid),/只支持/,'reject duplicate interval layers');
  console.log(JSON.stringify({passed:true,tests:results.length,results},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
