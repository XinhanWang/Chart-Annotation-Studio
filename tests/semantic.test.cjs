const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').split('<script type="module">')[1].split('const $=id=>')[0];
function api(html=source){const context=vm.createContext({});vm.runInContext(html+';globalThis.api={KINDS,defaultProject,validate,makeSpec,importSpec,pixelToValue,valueToPixel,boxValueAt};',context);return context.api;}
const app=api(),plain=x=>JSON.parse(JSON.stringify(x));
const rows=[{category:'Late',lower:0.123456789012345,q1:10,median:20,q3:30,upper:99.9876543210987,outliers:[-25,120.1234567890123]},{category:'Early',lower:2,q1:3,median:4,q3:5,upper:6,outliers:[]}];
function box(kind='boxplot_v'){const p=app.defaultProject(kind);p.rows=plain(rows);p.title='Five number summary';p.xTitle=kind==='boxplot_h'?'Duration (ms)':'Treatment';p.yTitle=kind==='boxplot_h'?'Treatment':'Duration (ms)';return p;}
test('Pie preserves entered order, precision, original totals and units in both modes',()=>{
 for(const mode of ['percent','absolute']){const p=app.defaultProject('pie');p.valueMode=mode;p.valueTitle=mode==='percent'?'Share (%)':'Revenue (万元)';p.title='Budget';p.donut=true;p.rows=[{category:'Z',value:33.1234567890123},{category:'A',value:65.5}];
 const before=plain(p),gt=plain(app.makeSpec(p));assert.deepEqual(plain(p),before);assert.deepEqual(gt.data.values,p.rows);assert.deepEqual(gt.mark,{type:'arc'});assert.equal(gt.encoding.theta.title,p.valueTitle);assert(!gt.transform);assert(!gt.encoding.order);assert(!JSON.stringify(gt).includes('Pixel'));assert.equal(app.validate(p).some(i=>i.severity==='warning'),mode==='percent');assert.deepEqual(plain(app.makeSpec(app.importSpec(gt))),gt);
 }
});
test('Both Box Plot directions retain exact precomputed data, empty outliers and scientific units',()=>{
 for(const kind of ['boxplot_v','boxplot_h']){const p=box(kind),before=plain(p),gt=plain(app.makeSpec(p)),axis=kind==='boxplot_h'?'x':'y';assert.deepEqual(plain(p),before);assert.deepEqual(gt.data.values,rows);assert.deepEqual(gt.layer.map(l=>l.mark.type),['rule','bar','tick','point']);assert.equal(gt.layer[0].encoding[axis].title,'Duration (ms)');assert.equal(gt.layer[0].encoding[axis+'2'].field,'upper');assert.equal(gt.layer[1].encoding[axis].field,'q1');assert.equal(gt.layer[1].encoding[axis+'2'].field,'q3');assert.deepEqual(gt.layer[3].transform,[{flatten:['outliers']}]);assert.deepEqual(plain(app.makeSpec(app.importSpec(gt))),gt);}
});
test('Box Plot checks ordering and finite outliers without applying IQR fences or changing data',()=>{const p=box();p.rows[0].lower=-1e9;p.rows[0].outliers=[20];assert.equal(app.validate(p).length,0);const gt=plain(app.makeSpec(p));assert.equal(gt.data.values[0].lower,-1e9);assert.deepEqual(gt.data.values[0].outliers,[20]);p.rows[0].q1=25;assert(app.validate(p).some(i=>i.message.includes('lower ≤ q1')));assert.throws(()=>app.makeSpec(p));p.rows[0].q1=10;p.rows[0].outliers=[null];assert.throws(()=>app.makeSpec(p));});
test('Pie rejects invalid values while incomplete percentage totals stay exportable',()=>{const p=app.defaultProject('pie');p.rows=[{category:'A',value:35},{category:'B',value:35}];assert.doesNotThrow(()=>app.makeSpec(p));p.rows[0].value=-5;assert.throws(()=>app.makeSpec(p));p.rows[0].value=Infinity;assert.throws(()=>app.makeSpec(p));});
test('Calibration handles vertical, horizontal, inverted and logarithmic axes without rounding',()=>{for(const axis of [{p1:400,p2:50,v1:0,v2:100,type:'linear'},{p1:80,p2:560,v1:100,v2:-20,type:'linear'},{p1:50,p2:450,v1:.01,v2:100,type:'log'}])for(const pixel of [100,123.456,350])assert(Math.abs(app.valueToPixel(app.pixelToValue(pixel,axis),axis)-pixel)<1e-9);});
test('Box pixel measurements round to two decimals without changing pixels or calibration',()=>{
 for(const kind of ['boxplot_v','boxplot_h']){
  const p=box(kind),axis=kind==='boxplot_h'?'x':'y';p.axes[axis]={p1:0,p2:300,v1:-50,v2:50,type:'linear'};
  for(const [pixel,expected] of [[100,-16.67],[200,16.67],[150,0],[1,-49.67]]){
   const pt={x:pixel,y:pixel},before=plain({p,pt});assert.equal(app.boxValueAt(pt,p),expected);assert.deepEqual(plain({p,pt}),before);
  }
  p.axes[axis]={p1:0,p2:300,v1:1,v2:100,type:'log'};assert.equal(app.boxValueAt({x:100,y:100},p),4.64);
 }
});
test('Imported units can be retained as axis formats without converting original values',()=>{const p=box();p.valueFormat='.0%';const gt=app.makeSpec(p),imported=app.importSpec(gt);assert.equal(imported.valueFormat,'.0%');assert.deepEqual(plain(app.makeSpec(imported)),plain(gt));});
test('Existing chart types and legacy imports match latest main canonical GT and validation',()=>{
 const {cases}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/main-contract.json'),'utf8'));
 for(const {name,project,gt,issues,roundTrip,importedGT} of cases){assert.deepEqual(plain(app.makeSpec(project)),gt,name);assert.deepEqual(plain(app.validate(project)),issues,name);assert.deepEqual(plain(app.makeSpec(app.importSpec(importedGT??gt))),roundTrip,name);}
});
test('Statistical import refuses unsupported transforms rather than silently changing observations',()=>{const gt=plain(app.makeSpec(box()));gt.layer[0].transform=[{filter:'datum.lower > 0'}];assert.throws(()=>app.importSpec(gt));const pie=app.defaultProject('pie');pie.rows=[{category:'A',value:10}];const pg=plain(app.makeSpec(pie));pg.transform=[{window:[{op:'row_number',as:'order'}]}];assert.throws(()=>app.importSpec(pg));});
