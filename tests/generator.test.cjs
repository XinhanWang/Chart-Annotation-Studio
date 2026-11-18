const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const loadModel=require('../tools/studio-model.cjs'),{exportRun}=require('../tools/export-generator.cjs');
const model=loadModel(),plain=value=>JSON.parse(JSON.stringify(value));
const bar=(rows=[{category:'A',value:1.1234567890123},{category:'B',value:2}])=>({data:{values:rows},mark:{type:'bar'},encoding:{x:{field:'category',type:'nominal',sort:null},y:{field:'value',type:'quantitative',title:'Voltage (mV)'}}});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOC8AAAAASUVORK5CYII=','base64');
test('nine real generator fixtures retain all scientific numbers and compile after canonical export',()=>{
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/generated-nine-kinds.json'),'utf8'));
  const numbers=spec=>spec.data.values.map(row=>JSON.stringify(Object.fromEntries(['value','x','y','lower','upper','start','end'].filter(key=>key in row).map(key=>[key,row[key]])))).sort();
  assert.equal(fixture.cases.length,9);
  for(const {kind,spec} of fixture.cases){
    const project=model.generatedProject(spec,{kind}),gt=plain(model.makeSpec(project));
    assert.equal(project.kind,kind);assert.deepEqual(numbers(gt),numbers(spec),kind+' scientific numbers');
    assert.deepEqual(plain(model.makeSpec(model.importSpec(gt))),gt,kind+' canonical roundtrip');model.compile(gt);
  }
});
test('generated data keeps precise values, duplicate observations and unreviewed provenance',()=>{
  const spec=bar(),before=JSON.stringify(spec),p=model.generatedProject(spec,{sampleId:'b1'});
  assert.equal(JSON.stringify(spec),before);assert.equal(p.reviewed,false);assert.equal(p.yTitle,'Voltage (mV)');
  assert.equal(p.generatedSource.sampleId,'b1');assert(p.evidence.every(e=>e.source==='synthetic_gt'&&!e.point));
  assert(Object.values(p.axes).every(a=>a.calibrated===false));
  const gt=plain(model.makeSpec(p));assert.equal(gt.data.values[0].value,1.1234567890123);assert(!JSON.stringify(gt).includes('synthetic_gt'));
  model.compile(gt);assert.deepEqual(plain(model.makeSpec(model.importSpec(gt))),gt);
  const scatter={data:{values:[{x:1,y:2},{x:1,y:2}]},mark:{type:'point'},encoding:{x:{field:'x',type:'quantitative'},y:{field:'y',type:'quantitative'}}};
  assert.equal(model.makeSpec(model.generatedProject(scatter)).data.values.length,2);
});
test('old rule error bars canonicalize to errorbar and keep absolute bounds',()=>{
  const spec=bar([{category:'A',value:2,lower:1,upper:4}]);delete spec.mark;
  spec.layer=[{mark:{type:'bar'}},{mark:{type:'rule'},encoding:{y:{field:'lower',type:'quantitative'},y2:{field:'upper'}}}];
  const p=model.generatedProject(spec),gt=plain(model.makeSpec(p));
  assert(p.errorBars);assert.equal(gt.layer[1].mark.type,'errorbar');assert.equal(gt.data.values[0].lower,1);assert.equal(gt.data.values[0].upper,4);model.compile(gt);
});
test('independent equal labels retain C/S identities across generated import/export',()=>{
  const spec=bar([{category:'A',category_id:'C1',value:1,series:'Same',series_id:'S1'},{category:'A',category_id:'C2',value:2,series:'Same',series_id:'S2'}]);
  spec.encoding.x.field='category_id';spec.encoding.color={field:'series_id',type:'nominal',sort:null};spec.encoding.xOffset={field:'series_id',type:'nominal',sort:null};
  const gt=plain(model.makeSpec(model.generatedProject(spec)));
  assert.deepEqual(gt.data.values.map(r=>[r.category_id,r.series_id]),[['C1','S1'],['C2','S2']]);
  assert.deepEqual(Object.keys(gt.data.values[0]),['category','category_id','value','series','series_id']);
  assert.deepEqual(Object.keys(gt.encoding),['x','y','xOffset','color']);model.compile(gt);
});
test('unsafe paths, full specs, composites and unsupported scales are rejected',()=>{
  for(const spec of [{...bar(),usermeta:{semantic:{}}},{...bar(),transform:[{filter:'datum.value>0'}]},bar([{category:'A',value:1,series_role:'bar'}])])assert.throws(()=>model.generatedProject(spec));
  const sqrt=bar();sqrt.encoding.y.scale={type:'sqrt'};assert.throws(()=>model.generatedProject(sqrt));
  for(const extra of [{foo:1},{q1:1},{x:3}])assert.throws(()=>model.generatedProject(bar([{category:'A',value:1,...extra}])));
});
test('CLI creates v2 workspace only from accepted samples and reports every skip',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-generator-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.mkdirSync(path.join(dir,'samples/a'),{recursive:true});fs.writeFileSync(path.join(dir,'samples/a/chart.png'),png);fs.writeFileSync(path.join(dir,'samples/a/compact.vl.json'),JSON.stringify(bar()));
  const good={id:'a',kind:'barv_1',status:'accepted',image:'samples/a/chart.png',compact:'samples/a/compact.vl.json'};
  fs.writeFileSync(path.join(dir,'manifest.jsonl'),[good,{...good,id:'b',status:'rejected'},{...good,id:'c',image:'../outside.png'}].map(r=>JSON.stringify(r)).join('\n'));
  const output=path.join(dir,'studio.project.json'),report=exportRun(dir,output);
  assert.equal(report.imported,1);assert.equal(report.skipped,2);assert.equal(report.ok,false);
  const workspace=JSON.parse(fs.readFileSync(output));assert.equal(workspace.version,2);assert.equal(workspace.queue.length,1);assert.equal(workspace.current.project.reviewed,false);assert.equal(workspace.activeId,workspace.queue[0].id);
  assert.throws(()=>exportRun(dir,output),/already exists/);
});
