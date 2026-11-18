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
  'globalThis.api={importSpec,makeSpec,renderSpec,validate,requiredAxes,moveSeries};',ctx);
const {importSpec,makeSpec,renderSpec,validate,requiredAxes,moveSeries}=ctx.api;
const plain=value=>JSON.parse(JSON.stringify(value));
const sample=name=>JSON.parse(fs.readFileSync(path.join(root,name+' Area.json'),'utf8'));

async function assertPreview(gt){
  const expected=gt.data.values;
  const warnings=[],logger=ctx.vega.logger(ctx.vega.Warn);
  logger.warn=(...args)=>{warnings.push(args.join(' '));return logger;};
  const compiled=ctx.vegaLite.compile(renderSpec(gt),{logger}).spec;
  const view=new ctx.vega.View(ctx.vega.parse(compiled),{renderer:'none',logger});
  try{
    await view.runAsync();
    const points=[];
    function visit(item){
      if(item.role==='mark'&&item.marktype==='area')points.push(...item.items);
      else for(const child of item.items||[])visit(child);
    }
    visit(view.scenegraph().root);
    assert.equal(points.length,expected.length);
    for(const row of expected){
      const item=points.find(({datum})=>datum.x===row.x&&datum.series===row.series);
      assert.ok(item,'area vertex missing');
      assert.equal(item.x,view.scale('x')(row.x));
      assert.equal(item.y,view.scale('y')(row.y));
      assert.equal(item.y2,view.scale('y')(row.baseline));
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
}

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
