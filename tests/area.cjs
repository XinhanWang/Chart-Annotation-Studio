const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const app=scripts.find(s=>s.includes('function makeAreaSpec(p)'));
const ctx=vm.createContext({console,setTimeout,clearTimeout,performance,structuredClone});
for(const script of scripts.filter(s=>s.includes('.vega={}')||s.includes('.vegaLite={}'))){
  vm.runInContext(script,ctx);
}
vm.runInContext(app.split('const $=id=>')[0]+
  'globalThis.api={importSpec,makeSpec,renderSpec,validate,requiredAxes,moveSeries,moveObject,applyObjectNames,switchAreaMode};',ctx);
const {importSpec,makeSpec,renderSpec,validate,requiredAxes,moveSeries,moveObject,applyObjectNames,switchAreaMode}=ctx.api;
const plain=value=>JSON.parse(JSON.stringify(value));
const rawSample=name=>JSON.parse(fs.readFileSync(path.join(root,name+' Area.json'),'utf8'));
function sample(name){
  const gt=rawSample(name);
  if(gt.encoding.order)delete gt.encoding.order.sort;
  gt.usermeta={table_export:{tables:[{id:'data',path:'/data/values'}]}};
  return gt;
}
const nominalSamples=require('./fixtures/area-nominal.json');
for(const gt of Object.values(nominalSamples))gt.usermeta={table_export:{tables:[{id:'data',path:'/data/values'}]}};

test('Calibrated area axes preserve original screen direction',async()=>{
  const x={p1:10,p2:110,v1:20,v2:1,type:'log',calibrated:true};
  const y={p1:20,p2:200,v1:1,v2:20,type:'linear',calibrated:true};
  for(const gt of [sample('Single-series'),sample('Stacked'),nominalSamples['Multi-series']]){
    const p=importSpec(gt);
    if(p.xType!=='nominal')for(const row of p.rows)row.x+=1;
    p.axes.x=x;
    p.axes.y=y;
    const exported=plain(makeSpec(p));
    if(p.xType==='nominal')assert.equal(exported.encoding.x.scale,undefined);
    else assert.deepEqual(exported.encoding.x.scale,{type:'log',reverse:true});
    assert.deepEqual(exported.encoding.y.scale,{reverse:true});
    await assertPreview(exported);
    const manual=importSpec(exported);
    assert.deepEqual(plain(makeSpec(manual)),exported);
    manual.axes.y={...y,v1:20,v2:1};
    assert.equal(makeSpec(manual).encoding.y.scale,undefined);
  }
});

async function assertPreview(gt){
  const expected=gt.data.values;
  const xField=gt.encoding.x.field;
  const warnings=[],logger=ctx.vega.logger(ctx.vega.Warn);
  logger.warn=(...args)=>{warnings.push(args.join(' '));return logger;};
  const compiled=ctx.vegaLite.compile(renderSpec(gt),{logger}).spec;
  const view=new ctx.vega.View(ctx.vega.parse(compiled),{renderer:'none',logger});
  try{
    await view.runAsync();
    const points=[],paths=[];
    function visit(item){
      if(item.role==='mark'&&item.marktype==='area'){
        points.push(...item.items);
        paths.push(item.items);
      }
      else for(const child of item.items||[])visit(child);
    }
    visit(view.scenegraph().root);
    assert.equal(points.length,expected.length);
    for(const row of expected){
      const item=points.find(({datum})=>datum[xField]===row[xField]&&datum.series===row.series);
      assert.ok(item,'area vertex missing');
      const scale=view.scale('x');
      assert.equal(item.x,scale(row[xField])+(scale.bandwidth?.()??0)/2);
      assert.equal(item.y,view.scale('y')(row.y));
      assert.equal(item.y2,view.scale('y')(row.baseline));
    }
    if(xField==='category'){
      assert.deepEqual(plain(view.scale('x').domain()),[...new Set(expected.map(r=>r.category))]);
      for(const vertices of paths){
        const series=vertices[0].datum.series;
        const path=expected.filter(r=>r.series===series).map(r=>r.category);
        assert.deepEqual(plain(vertices.map(v=>v.datum.category)),path,'area path follows category order');
        assert.equal(new Set(vertices.map(v=>v.datum.series)).size,1);
      }
      assert.equal(paths.length,new Set(expected.map(r=>r.series)).size);
    }
    assert.equal(warnings.length,0,warnings.join('\n'));
    assert.match(await view.toSVG(),/<path[^>]+aria-roledescription="area mark"/);
  }finally{view.finalize();}
}

for(const [name,kind] of [
  ['Single-series','area_1'],['Multi-series','area_n'],['Stacked','area_stack']
]){
  test(name+' sample round trips exactly and renders both actual boundaries',async()=>{
    const gt=sample(name),project=importSpec(gt);
    assert.equal(project.kind,kind);
    assert.deepEqual(plain(requiredAxes(project)),['x','y']);
    assert.deepEqual(plain(validate(project)),[]);
    assert.deepEqual(plain(makeSpec(project)),gt);
    await assertPreview(gt);
  });
  test(name+' nominal sample round trips and follows left-to-right order',async()=>{
    const gt=nominalSamples[name],project=importSpec(gt);
    assert.equal(project.kind,kind);
    assert.equal(project.xType,'nominal');
    assert.deepEqual(plain(requiredAxes(project)),['y']);
    assert.deepEqual(plain(validate(project)),[]);
    const exported=plain(makeSpec(project));
    assert.deepEqual(exported,gt);
    await assertPreview(exported);
  });
}

test('Renaming and reordering categories preserves rows and stacked bounds',async()=>{
  const gt=nominalSamples.Stacked,p=importSpec(gt);
  applyObjectNames(p,'category','March\nJanuary\nFebruary');
  moveObject(p,'category',p.categoryObjects[2].key,-1);
  moveSeries(p,1,-1);
  const exported=plain(makeSpec(p)),labels={March:'03',February:'02',January:'01'};
  assert.deepEqual([...new Set(exported.data.values.map(r=>r.category))],Object.keys(labels));
  for(const row of exported.data.values){
    const original=gt.data.values.find(r=>r.category===labels[row.category]&&r.series===row.series);
    assert.equal(row.y,original.y);
    assert.equal(row.baseline,original.baseline);
    assert.equal(row.stack_order,1-original.stack_order);
  }
  await assertPreview(exported);
});

test('Stacked area imports legacy ascending order and exports the minimal encoding on both axes',()=>{
  for(const [legacy,canonical] of [
    [rawSample('Stacked'),sample('Stacked')],
    [plain(nominalSamples.Stacked),nominalSamples.Stacked]
  ]){
    legacy.encoding.order.sort='ascending';
    assert.deepEqual(plain(makeSpec(importSpec(legacy))),canonical);
    assert.deepEqual(plain(makeSpec(importSpec(canonical))).encoding.order,
      {field:'stack_order',type:'quantitative'});
    legacy.encoding.order.sort='descending';
    assert.throws(()=>importSpec(legacy));
  }
});

test('Mode changes preserve both datasets through a project JSON round trip',()=>{
  const numeric=sample('Stacked'),nominal=nominalSamples.Stacked;
  let p=importSpec(numeric);
  const axes=plain(p.axes);
  p.evidence=[{pixel:{x:100,y:270},baselinePixel:{x:100,y:300}}];
  switchAreaMode(p,'nominal');
  assert.equal(p.rows.length,0);
  const data=importSpec(nominal);
  for(const field of ['rows','series','categoryObjects','title','xTitle','yTitle'])p[field]=data[field];
  p.axes.y.v2=1000;
  p=plain(p);
  switchAreaMode(p,'quantitative');
  assert.deepEqual(plain(makeSpec(p)),numeric);
  assert.deepEqual(plain(p.axes),axes);
  assert.equal(p.evidence[0].baselinePixel.y,300);
  switchAreaMode(p,'nominal');
  assert.deepEqual(plain(makeSpec(p)),nominal);
  assert.equal(p.axes.y.v2,1000);
});

test('Nominal validation rejects coerced category labels and duplicate targets',()=>{
  const gt=plain(nominalSamples['Multi-series']);
  gt.data.values[0].category=2023;
  assert.throws(()=>importSpec(gt),/category.*字符串/);
  const p=importSpec(nominalSamples['Multi-series']);
  p.rows.push(plain(p.rows[0]));
  assert.throws(()=>makeSpec(p),/只允许一条/);
  p.rows.pop();
  p.categoryObjects[0].name=p.categoryObjects[1].name;
  assert.throws(()=>makeSpec(p),/唯一的文字标签/);
});

test('Nonzero and varying baselines survive independently in ordinary areas',async()=>{
  for(const name of ['Single-series','Multi-series']){
    const gt=sample(name);
    gt.data.values.forEach((row,i)=>row.baseline=i%2?1.25:-0.5);
    const exported=plain(makeSpec(importSpec(gt)));
    assert.deepEqual(exported,gt);
    await assertPreview(exported);
  }
});

test('Layer ordering and project serialization preserve measured cumulative bounds',async()=>{
  const gt=sample('Stacked');
  for(const row of gt.data.values)row.stack_order+=3;
  const project=importSpec(gt);
  assert.deepEqual(plain(makeSpec(project)),gt);
  moveSeries(project,1,-1);
  const saved=plain(project);
  const exported=plain(makeSpec(saved));
  for(const row of exported.data.values){
    const original=gt.data.values.find(r=>r.x===row.x&&r.series===row.series);
    assert.equal(row.y,original.y);
    assert.equal(row.baseline,original.baseline);
    assert.equal(row.stack_order,original.series==='S2'?3:4);
  }
  assert.equal(plain(validate(saved)).some(i=>i.severity==='warning'&&i.message.includes('未对齐')),true);
  await assertPreview(exported);
});

test('Area import and quality checks reject missing bounds and incompatible GT',()=>{
  const gt=sample('Stacked'),invalid=change=>{const copy=plain(gt);change(copy);return copy;};
  for(const change of [
    spec=>delete spec.data.values[0].baseline,
    spec=>spec.data.values[0].baseline=100,
    spec=>spec.data.values[0].stack_order=4,
    spec=>spec.encoding.y.stack='zero',
    spec=>spec.encoding.y2={datum:0},
    spec=>spec.transform=[{stack:'y',as:['start','end']}]
  ])assert.throws(()=>importSpec(invalid(change)));
  const project=importSpec(gt);
  project.rows[0].baseline=null;
  assert.throws(()=>makeSpec(project),/baseline/);
});
