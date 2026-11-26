const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');

const html=fs.readFileSync('index.html','utf8');
const context=vm.createContext({console,setTimeout,clearTimeout,performance});
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(match=>match[1]);
vm.runInContext(scripts.find(script=>script.includes('.vega={}')),context);
const app=html.split('<script type="module">')[1].split('const $=id=>')[0];
vm.runInContext(app+`
globalThis.api={defaultProject,ensureIdentities,validate,makeSpec,importSpec,renderSpec,recalculateRadar,
  radarCalibration,radarPreview,migrateRadarProject};
`,context);
const {api,vega}=context;
const tableExport=require('../vendor/vega-lite-table-export.js');
const plain=object=>JSON.parse(JSON.stringify(object));
const categories=['A','B','C'];
const single=categories.map((category,i)=>({category,value:20+i*10}));
const multiple=single.flatMap(row=>[{...row,series:'S1'},{...row,value:row.value+5,series:'S2'}]);
const stacked=multiple.map((row,i)=>({...row,stack_order:i%2+1}));
function compact(chartType,rows,stack=false){
  return {title:'Measures',data:{values:rows.map(row=>({...row}))},
    mark:{type:chartType==='radar'?'line':'bar'},
    encoding:{
      x:{field:'category',type:'nominal',sort:categories},
      y:{field:'value',type:'quantitative',title:null,scale:{domain:[0,100]},...(stack?{stack:'zero'}:{})},
      ...(rows[0].series?{color:{field:'series',type:'nominal'}}:{}),
      ...(stack?{order:{field:'stack_order',type:'quantitative'}}:{})
    },usermeta:{chartType,table_export:{tables:[{id:'data',path:'/data/values'}]}}};
}
const cases=[
  ['radar_1',compact('radar',single)],
  ['radar_n',compact('radar',multiple)],
  ['polar_bar_1',compact('polar_bar',single)],
  ['polar_bar_n',compact('polar_bar',multiple)],
  ['polar_bar_stack',compact('polar_bar',stacked,true)]
];
for(const [kind,gt] of cases)test(kind+' canonical GT, Vega and exact table export',async()=>{
  const p=api.importSpec(gt);
  assert.equal(p.kind,kind);
  assert.deepEqual(plain(api.makeSpec(p)),gt);
  const preview=plain(api.renderSpec(gt,p));
  const view=new vega.View(vega.parse(preview),{renderer:'none'});
  try{
    const svg=await view.toSVG();
    assert.match(svg,/role="graphics-object"/);
  }finally{view.finalize();}
  assert.equal(preview.marks.some(mark=>mark.type==='arc'),kind.startsWith('polar_bar'));
  assert.deepEqual(plain(api.makeSpec(p)),gt);
  const [table]=tableExport.exportTables(gt);
  assert.deepEqual(table.rows,gt.data.values);
  assert.match(table.markdown,/\| A \| 20 \|/);
  assert.match(table.csv,/A,20/);
});

test('stacked preview uses local order and segment values independent of row order',()=>{
  const rows=stacked.map(row=>row.category==='B'?{...row,stack_order:3-row.stack_order}:row);
  const gt=compact('polar_bar',rows.reverse(),true);
  const observations=plain(api.radarPreview(gt)).data.find(data=>data.name==='observations').values;
  const b=observations.filter(row=>row.category==='B');
  assert.deepEqual(b.map(r=>r.series),['S2','S1']);
  assert.deepEqual(b.map(r=>[r.innerRadius,r.outerRadius]),[[0,.35*88],[.35*88,.65*88]]);
  assert.equal(b[0].startAngle,b[1].startAngle);
  assert.equal(b[0].endAngle,b[1].endAngle);
  assert.equal(api.importSpec(gt).kind,'polar_bar_stack');
});

test('grouped preview reserves a missing series slot and never stacks',()=>{
  const rows=multiple.filter(row=>row.category!=='A'||row.series!=='S1');
  const gt=compact('polar_bar',rows);
  assert.deepEqual(plain(api.makeSpec(api.importSpec(gt))),gt);
  const observations=plain(api.radarPreview(gt)).data.find(data=>data.name==='observations').values;
  assert.equal(observations.length,5);
  assert.ok(observations.every(row=>row.innerRadius===0));
  const a=observations.find(row=>row.category==='A'), b=observations.filter(row=>row.category==='B');
  assert.equal(a.series,'S2');
  assert.ok(Math.abs((b[1].startAngle-a.startAngle)-2*Math.PI/3)<1e-12);
  assert.ok(b[0].endAngle<b[1].startAngle);
});

test('legacy explicitly stacked Radar GT and saved projects migrate, ordinary legacy Radar stays Radar',()=>{
  const gt=compact('radar',stacked,true);
  assert.deepEqual(plain(api.makeSpec(api.importSpec(gt))),compact('polar_bar',stacked,true));
  delete gt.encoding.order;
  assert.deepEqual(plain(api.makeSpec(api.importSpec(gt))),compact('polar_bar',stacked,true));
  assert.equal(api.importSpec(compact('radar',multiple)).kind,'radar_n');
  const project=api.importSpec(compact('polar_bar',stacked,true));
  project.kind='radar_stack';
  project.radar.center={x:20,y:30};
  api.migrateRadarProject(project);
  assert.equal(project.kind,'polar_bar_stack');
  assert.deepEqual(plain(project.radar.center),{x:20,y:30});
  assert.deepEqual(plain(api.makeSpec(project)),compact('polar_bar',stacked,true));
});

test('percent axes preserve exact fractions and an independent GT domain',()=>{
  const gt=compact('polar_bar',single.map(row=>({...row,value:.8765432109876543})));
  gt.encoding.y.scale.domain=[0,.9754321987654321];
  gt.encoding.y.axis={format:'.17~p'};
  const p=api.importSpec(gt);
  assert.deepEqual(plain(api.makeSpec(p)),gt);
  p.radar.domain=[0,100];delete p.percentGuides.y.domain;
  assert.deepEqual(plain(api.makeSpec(p)).encoding.y.scale.domain,[0,1]);
  const plainAxis=compact('radar',[{category:'A',value:18},...single.slice(1)]);
  const q=api.importSpec(plainAxis);
  q.rows[0]._percentData={value:'y'};
  assert.equal(api.makeSpec(q).data.values[0].value,.18);
});

test('radial measurement uses actual distance, Precision V2 and shared boundaries with priority for manual values',()=>{
  const p=api.importSpec(compact('polar_bar',stacked,true));
  p.radar.center={x:0,y:0};
  p.radar.tickPoints=[null,{x:0,y:100}];p.radar.tickValues=[null,100];p.radar.centerZero=true;
  p.evidence=[{pixel:{x:12,y:16}},{pixel:{x:30,y:-40}}];
  api.recalculateRadar(p);
  assert.deepEqual(plain(p.rows.slice(0,2).map(r=>r.value)),[20,30]);
  p.evidence[0].pixel={x:0,y:23.45678};
  api.recalculateRadar(p);
  assert.deepEqual(plain(p.rows.slice(0,2).map(r=>r.value)),[23.46,26.54]);
  p.evidence[0]={source:'manual_edit'};p.rows[0].value=23.456789123;
  api.recalculateRadar(p);
  assert.equal(p.rows[0].value,23.456789123);
  assert.equal(p.rows[1].value,26.54);
  p.evidence[1].pixel={x:0,y:23.456789123};
  api.recalculateRadar(p);
  assert.equal(p.rows[1].value,null);
  assert.match(api.validate(p).map(issue=>issue.message).join('\n'),/待复核/);
});

test('tiny scientific radial scales keep nonzero Precision V2 measurements',()=>{
  const p=api.importSpec(compact('radar',single));
  p.radar.center={x:0,y:0};
  p.radar.tickPoints=[null,{x:100,y:0}];p.radar.tickValues=[null,1e-20];p.radar.centerZero=true;
  p.radar.domain=[0,1e-20];
  p.evidence=[{pixel:{x:23.45678,y:0}}];
  api.recalculateRadar(p);
  assert.equal(p.rows[0].value,2.346e-21);
});
