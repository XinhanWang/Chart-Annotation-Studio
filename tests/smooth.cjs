const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
const context=vm.createContext({console,performance,structuredClone,setTimeout,clearTimeout});
for(const token of ['.vega={}', '.vegaLite={}'])vm.runInContext(scripts.find(script=>script.includes(token)),context);
vm.runInContext(html.split('<script type="module">')[1].split('const $=id=>')[0]+
  'globalThis.api={makeSpec,importSpec,renderSpec,compileStudioVega,smoothAnchorProfile,sampleSmoothPosition,projectSmoothSamplePositions,applySmoothSamplePositions,refreshSmoothPositions,validate};',context);
const {api,vega,vegaLite}=context;
const tableExport=require('../vendor/vega-lite-table-export.js');
const plain=object=>JSON.parse(JSON.stringify(object));
const fixture=name=>JSON.parse(fs.readFileSync('examples/smooth-curves/'+name+'.json','utf8'));
async function svgFor(gt,project){
  const vl={...api.renderSpec(gt,project),width:200,height:140};
  const vegaSpec=plain(api.compileStudioVega(vl,vegaLite));
  const view=new vega.View(vega.parse(vegaSpec),{renderer:'none'});
  try{return await view.toSVG();}finally{view.finalize();}
}
for(const series of ['single','multi'])for(const mode of ['xy','x-category','x-free','y-category','y-free']){
  const name=series+'-'+mode;
  test(name+' round-trips, renders monotone and exports the observed table',async()=>{
    const gt=fixture(name),serialized=JSON.stringify(gt),p=api.importSpec(gt);
    assert.equal(p.kind,series==='single'?'line_smooth_1':'line_smooth_n');
    assert.equal(p.xType,mode.startsWith('x-')?'nominal':'quantitative');
    assert.equal(p.yType,mode.startsWith('y-')?'nominal':'quantitative');
    assert.deepEqual(plain(api.makeSpec(p)),gt);
    const svg=await svgFor(gt,p);
    const paths=[...svg.matchAll(/line mark" d="([^"]*)"/g)].map(match=>match[1]);
    assert.equal(paths.length,series==='single'?1:2);
    assert.ok(paths.every(path=>path.includes('C')));
    assert.deepEqual(tableExport.exportTables(gt)[0].rows,gt.data.values);
    if(mode.endsWith('free')){
      assert.match(svg,/>A<\/text>/);
      assert.match(svg,/>B<\/text>/);
      assert.match(svg,/>C<\/text>/);
    }
    assert.equal(JSON.stringify(gt),serialized);
  });
}
for(const mode of ['y-category','y-free'])test(mode+' uses a vertical tangent at a horizontal extremum',async()=>{
  const gt=fixture('single-'+mode);
  gt.data.values=mode==='y-free'?
    [{y:'A',y_id:0,x:1},{y:'B',y_id:1,x:4},{y:'C',y_id:2.5,x:2}]:
    [{y:'A',x:1},{y:'B',x:4},{y:'C',x:2}];
  const svg=await svgFor(gt,api.importSpec(gt));
  const path=svg.match(/line mark" d="([^"]*)"/)[1];
  const [,a,b]=path.split('C');
  const control1=a.split(',').map(Number),control2=b.split(',').map(Number);
  assert.equal(control1[2],control1[4]);
  assert.equal(control2[0],control1[4]);
  assert.ok(control1[3]<control1[5]&&control1[5]<control2[1]);
});
test('nonuniform positions, repeated or escaped labels and an entirely unsampled category are lossless',async()=>{
  const gt=fixture('single-x-free');
  gt.data.values=gt.data.values.filter(row=>row.x!=='B');
  gt.data.values.at(-1).x='A"\\ [name]';
  gt.data.values[0].x='A"\\ [name]';
  gt.usermeta.x_labels=[{position:1.25,label:'Missing "B"'}];
  const p=api.importSpec(gt);
  assert.deepEqual(plain(api.makeSpec(p)),gt);
  const preview=plain(api.renderSpec(gt,p));
  assert.deepEqual(preview.encoding.x.axis.values,[0,1.25,2.5]);
  const svg=await svgFor(gt,p);
  assert.match(svg,/>Missing "B"<\/text>/);
  assert.equal([...svg.matchAll(/>A"\\ \[name\]<\/text>/g)].length,2);
});
test('legacy nominal duplicate labels migrate to numeric position IDs without adding samples',async()=>{
  const gt=fixture('single-y-category');
  gt.encoding.y.field='y_id';
  gt.data.values=[{x:20,y:'同名',y_id:'Y1'},{x:40,y:'同名',y_id:'Y3'}];
  gt.usermeta.y_labels=[{position:1,label:'无观测'}];
  const p=api.importSpec(gt);
  assert.equal(p.smoothPositioned,false);
  const result=plain(api.makeSpec(p));
  assert.deepEqual(result.encoding.y,{field:'y_id',type:'quantitative'});
  assert.deepEqual(result.data.values,[{x:20,y:'同名',y_id:0},{x:40,y:'同名',y_id:2}]);
  assert.deepEqual(result.usermeta.y_labels,gt.usermeta.y_labels);
  assert.deepEqual(plain(api.makeSpec(api.importSpec(result))),result);
  const svg=await svgFor(result,p);
  assert.match(svg,/>无观测<\/text>/);
});
test('legacy ordinary line defaults to explicit linear and keeps opaque duplicate IDs',()=>{
  const gt=fixture('single-x-category');
  delete gt.mark.interpolate;
  gt.encoding.x.field='x_id';
  gt.data.values=[{x:'Same',x_id:'X1',y:2},{x:'Same',x_id:'X2',y:4}];
  const p=api.importSpec(gt);
  assert.equal(p.kind,'line_1');
  const exported=plain(api.makeSpec(p));
  assert.equal(exported.mark.interpolate,'linear');
  assert.deepEqual(exported.data.values,gt.data.values);
  assert.equal(exported.encoding.x.type,'nominal');
});
test('breaks, vertical steps and path retreats require review',()=>{
  const gt=fixture('single-xy');
  const p=api.importSpec(gt);
  p.rows[2]._curveReview=true;
  assert.throws(()=>api.makeSpec(p),/待复核/);
  for(const [updates,pattern] of [[{x:0},/回走/],[{x:.5},/重合/],[{y:null},/断点/]]){
    const invalid=plain(gt);Object.assign(invalid.data.values[2],updates);
    assert.throws(()=>api.importSpec(invalid),pattern);
  }
});
test('normalizes nonuniform anchors before rounding, and uses raw anchors to measure clicks',()=>{
  const p=api.importSpec(fixture('single-x-category'));
  [100,200,342.3187].forEach((pixel,i)=>p.categoryObjects[i].curvePixel=pixel);
  api.refreshSmoothPositions(p);
  assert.deepEqual(Array.from(p.categoryObjects,c=>c.curvePosition),[0,1,2.42]);
  const profile=api.smoothAnchorProfile(p);
  for(const [position,expected] of [[0,0],[.253847,.25],[.501892,.5],[.876532,.88],
      [1.423187,1.42],[2.005,2.01],[-.253847,-.25]]){
    const sampled=api.sampleSmoothPosition(profile,100+position*100);
    assert.equal(sampled.position,expected);
    if(position)assert.ok(Math.abs(sampled.raw-position)<1e-14);
  }
  assert.equal(api.sampleSmoothPosition(profile,300.501).position,2.01);
  assert.deepEqual(plain(api.makeSpec(p)).data.values.map(row=>row.x_id),[0,1,2.42]);
});

test('smooth axes omit blank titles, retain real titles and accept legacy null titles',()=>{
  for(const name of ['single-xy','multi-y-free']){
    const gt=fixture(name);
    gt.encoding.x.title=null;
    gt.encoding.y.title='Response';
    const project=api.importSpec(gt);
    project.xTitle='  ';
    const exported=plain(api.makeSpec(project));
    assert.equal(Object.hasOwn(exported.encoding.x,'title'),false);
    assert.equal(exported.encoding.y.title,'Response');
    assert.equal(api.renderSpec(exported,project).encoding.x.title,null);
  }
});

test('collisions refine only affected IDs in the same series and try to retain saved IDs',()=>{
  const p=api.importSpec(fixture('multi-x-free'));
  const [a,b]=p.series;
  const sample=(raw,series=a)=>({x:null,y:20,_seriesKey:series.key,_curveRawPosition:raw});
  const old=sample(2.3421),right=sample(2.3423),other=sample(2.3423,b),unrelated=sample(1.7861);
  const save=rows=>api.applySmoothSamplePositions(api.projectSmoothSamplePositions(p,rows));
  save([old,other]);
  assert.equal(old._curvePosition,2.34);
  save([right,old,other,unrelated]);
  assert.equal(old._curvePosition,2.34);
  assert.equal(right._curvePosition,2.342);
  assert.equal(other._curvePosition,2.34);
  assert.equal(unrelated._curvePosition,1.79);
  const before=sample(2.3411);
  save([old,before,right,other,unrelated]);
  assert.ok(before._curvePosition<old._curvePosition&&old._curvePosition<right._curvePosition);
  const retained=old._curvePosition;
  save([old,other,unrelated,sample(.294)]);
  assert.equal(old._curvePosition,retained);
  assert.equal(other._curvePosition,2.34);
  assert.equal(unrelated._curvePosition,1.79);
  assert.throws(()=>save([old,{...old,y:99}]),/已有采样点/);
});

test('a rounded tick refines only when needed and keeps the same ID for every series and export',()=>{
  const p=api.importSpec(fixture('multi-y-category'));
  [100,1100,1523.187].forEach((pixel,i)=>p.categoryObjects[i].curvePixel=pixel);
  api.refreshSmoothPositions(p);
  assert.equal(p.categoryObjects[2].curvePosition,1.42);
  const free={x:99,y:null,_seriesKey:p.series[1].key,_curveRawPosition:1.421};
  p.rows.push(free);
  api.applySmoothSamplePositions(api.projectSmoothSamplePositions(p,p.rows));
  p.smoothPositioned=true;
  const gt=plain(api.makeSpec(p));
  const tick=gt.data.values.filter(row=>row.y==='C').map(row=>row.y_id);
  assert.deepEqual(tick,[1.423,1.423]);
  assert.equal(free._curvePosition,1.42);
  assert.deepEqual(plain(api.makeSpec(api.importSpec(gt))),gt);
  assert.deepEqual(tableExport.exportTables(gt)[0].rows,gt.data.values);
  assert.deepEqual(plain(api.renderSpec(gt,p)).encoding.y.axis.values,[0,1,1.423]);
});

test('out of order discrete observations are grouped by series and retain scientific values',()=>{
  const gt=fixture('multi-y-free'),base=plain(gt);
  [gt.data.values[1],gt.data.values[6]]=[gt.data.values[6],gt.data.values[1]];
  const project=api.importSpec(gt),result=plain(api.makeSpec(project));
  assert.deepEqual(result,base);
  assert.deepEqual(tableExport.exportTables(result)[0].rows,base.data.values);
});

test('grouping preserves sparse category order and removes unneeded IDs when the last free point is deleted',()=>{
  const gt=fixture('multi-x-category');
  const p=api.importSpec(gt);
  p.rows=p.rows.filter(row=>!(row.series==='S1'&&row.x==='B'));
  const grouped=plain(api.makeSpec(p));
  assert.deepEqual(grouped.data.values.map(row=>row.x_id),[0,2,0,1,2]);
  assert.deepEqual(plain(api.makeSpec(api.importSpec(grouped))),grouped);
  const simple=api.importSpec(fixture('single-x-free'));
  simple.categoryObjects[2].curvePosition=2;
  simple.rows=simple.rows.filter(row=>row.x!==null);
  const nominal=plain(api.makeSpec(simple));
  assert.deepEqual(nominal.encoding.x,{field:'x',type:'nominal',sort:null});
  assert.ok(nominal.data.values.every(row=>!Object.hasOwn(row,'x_id')));
});
