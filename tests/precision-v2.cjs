const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,plain,mixedLine}=require('./precision-v2-fixtures.cjs'),{measurement}=require('./precision-reference.cjs');
for(const axis of ['x','y'])for(const repeated of [false,true])test('Mixed '+axis+' line: exact observations, missing categories, identities, retreat and independent saved modes; repeated='+repeated,()=>{
 const p=mixedLine(axis,repeated),numeric=axis==='x'?'y':'x',gt=plain(app.makeSpec(p));
 assert.equal(gt.encoding[axis].type,'nominal');assert.deepEqual(plain(app.requiredAxes(p)),[numeric]);assert.equal(gt.data.values[0][numeric],.1234567890123);
 assert.deepEqual(plain(app.makeSpec(app.importSpec(gt))),gt);assert(!gt.encoding.order);if(repeated)assert(gt.data.values.every(r=>r[axis+'_id']));
 const axes=plain(p.axes);app.switchLineMode(p,'quantitative');assert.equal(p.rows.length,0);app.switchLineMode(p,axis);assert.deepEqual(plain(app.makeSpec(p)),gt);assert.deepEqual(plain(p.axes),axes);
 const back=mixedLine(axis,repeated,true),ranked=plain(app.makeSpec(back));assert.equal(ranked.encoding.order.field,'path_order');assert(Array.isArray(ranked.encoding[axis].sort));assert.deepEqual(plain(app.makeSpec(app.importSpec(ranked))),ranked);
});
for(const kind of ['boxplot_v','boxplot_h'])test(kind+' single guide, precise fractions, legacy repeated guides and conflict rejection',()=>{
 const p=app.defaultProject(kind),axis=kind==='boxplot_h'?'x':'y';p[axis+'Title']='Rate (%)';p.percentLabels={[axis]:true};p.rows=[{category:'A',lower:.123456789012345,q1:1,median:2,q3:3,upper:4,outliers:[5.123456789012345,5.123456789012345]}];
 const gt=plain(app.makeSpec(p));assert.match(gt.layer[0].encoding[axis].axis.format,/^\.\d+~p$/);assert(!gt.layer.slice(1).some(l=>l.encoding[axis].axis||l.encoding[axis].title));assert.deepEqual(plain(app.makeSpec(app.importSpec(gt))),gt);
 const legacy=plain(gt);legacy.layer.forEach(l=>l.encoding[axis].axis={format:gt.layer[0].encoding[axis].axis.format});assert.deepEqual(plain(app.makeSpec(app.importSpec(legacy))),gt);legacy.layer[1].encoding[axis].axis.format='.0%';assert.throws(()=>app.importSpec(legacy),/冲突/);
});
for(const kind of ['barv_1_error','barh_1_error'])test(kind+' top-level guide, exact bounds, legacy rule and conflicting formats',()=>{
 const p=app.defaultProject(kind),axis=kind.startsWith('barh')?'x':'y';p[axis+'Title']='Rate (%)';p.percentLabels={[axis]:true};p.rows=[{category:'A',value:12.3456789012345,lower:10.1234567890123,upper:15.9876543210987,series:'Series 1'}];
 const gt=plain(app.makeSpec(p));assert(gt.encoding[axis].axis);assert(!gt.layer[1].encoding[axis].title&&!gt.layer[1].encoding[axis].axis);assert.deepEqual(plain(app.makeSpec(app.importSpec(gt))),gt);
 const legacy=plain(gt);legacy.layer[1].mark.type='rule';legacy.layer[1].encoding[axis].axis={format:gt.encoding[axis].axis.format};assert.deepEqual(plain(app.makeSpec(app.importSpec(legacy))),gt);legacy.layer[1].encoding[axis].axis.format='.0%';assert.throws(()=>app.importSpec(legacy),/冲突/);
});
test('Pie exact fractions, optional/custom titles, legal preview, explicit ambiguity confirmation and bulk category history',()=>{
 const gt={data:{values:[{category:'A',value:.12345678901234567},{category:'B',value:.8765432109876543}]},mark:{type:'arc'},encoding:{theta:{field:'value',type:'quantitative',format:'.4~p'},color:{field:'category',type:'nominal'}}};
 const p=app.importSpec(gt),out=plain(app.makeSpec(p)),render=plain(app.renderSpec(out,p));assert.deepEqual(out.data,gt.data);assert(!out.encoding.theta.title);assert(!render.encoding.theta.format);assert.equal(render.encoding.tooltip.format,'.4~p');
 const old=plain(p.rows),keys=p.rows.map(r=>r._categoryKey);app.applyPieCategoryNames(p,'Alpha\nBeta\nGamma');assert.deepEqual(plain(p.rows.slice(0,2).map(r=>r._categoryKey)),plain(keys));assert.equal(p.rows[0].value,old[0].value);assert.equal(p.rows[0]._pieFraction,old[0]._pieFraction);assert.equal(p.rows[2].value,null);assert.equal(p.evidence[2].source,'manual_entry');
 const ambiguous=plain(gt);delete ambiguous.encoding.theta.format;const q=app.importSpec(ambiguous);assert.equal(q.valueMode,'absolute');assert.deepEqual(plain(app.makeSpec(q).data),gt.data);app.confirmPieFractions(q);assert.equal(q.valueMode,'percent');assert.deepEqual(plain(app.makeSpec(q).data),gt.data);q.valueTitle='Revenue (万元)';assert.equal(app.makeSpec(q).encoding.theta.title,'Revenue (万元)');
});
test('Precision V2 golden decimal midpoints, tiny values, log axes and exact endpoints agree with independent reference',()=>{
 for(const axis of [{p1:0,p2:100,v1:0,v2:1e-8,type:'linear'},{p1:0,p2:100,v1:-1,v2:1,type:'linear'},{p1:100,p2:0,v1:1e-6,v2:1e2,type:'log'}])for(const pixel of [axis.p1,axis.p2,25,33.3333,66.6667])assert.equal(app.measuredAxisValue(pixel,axis),measurement(pixel,axis));
 assert.equal(app.measuredAxisValue(11.55,{p1:0,p2:20,v1:0,v2:2,type:'linear'}),1.16);assert.equal(app.measuredAxisValue(8.45,{p1:0,p2:20,v1:-2,v2:0,type:'linear'}),-1.16);
 const center={x:1000,y:1000},rays=radius=>[330,20,170].map(d=>({x:center.x+radius*Math.cos(d*Math.PI/180),y:center.y+radius*Math.sin(d*Math.PI/180)}));assert.deepEqual(plain(app.measurePieSectors(center,rays(100))).map(r=>r.value),[13.89,41.67,44.44]);assert.deepEqual(plain(app.measurePieSectors(center,rays(1000))).map(r=>r.value),[13.89,41.67,44.44]);
});

const golden=require('./fixtures/precision-v2-generator.json');
test('Matches the generator Precision V2 numbers, decimal ties and largest-remainder output',()=>{
 for(const [cases,options] of [[golden.ordinary,{}],[golden.computed,{computed:true}],[golden.percent,{percent:true}],[golden.fraction,{percent:true,fraction:true}]]){
  for(const [input,expected] of cases)assert.equal(app.quantizeMeasurement(input,options),expected,String(input));
 }
 for(const [input,expected] of golden.parts)assert.deepEqual(plain(app.percentageParts(input)),expected);
 for(const input of golden.vanishingParts)assert.throws(()=>app.percentageParts(input),/复核/);
});

test('Automatic percentages round before conversion and exact annotations survive Compact, preview and table export',()=>{
 const tableExport=require('../vendor/vega-lite-table-export.js');
 const project=app.defaultProject('scatter_1');
 project.yTitle='Rate (%)';
 project.axes.y={p1:0,p2:100,v1:0,v2:100,type:'linear',calibrated:true};
 const measure=()=>app.measureProjectAxis(project,'y',23.45678);
 assert.equal(measure(),23.46);
 project.percentLabels={y:true};
 assert.equal(app.measureProjectAxis(project,'y',0.1234567),.12);
 project.rows=[{x:1,y:measure()},{x:2,y:12.34567890123}];
 const gt=plain(app.makeSpec(project));
 const expected=[.2346,.1234567890123];
 assert.deepEqual(gt.data.values.map(row=>row.y),expected);
 assert.equal(gt.encoding.y.axis.format,'.13~p');
 assert.deepEqual(plain(app.renderSpec(gt,project).data),gt.data);
 const [table]=tableExport.exportTables(gt);
 assert.deepEqual(table.rows.map(row=>row.y),expected);
 assert.equal(table.csv.trim().split(/\r?\n/).slice(1).map(line=>Number(line.split(',')[1])).join(),expected.join());
 for(const value of expected)assert.match(table.markdown,new RegExp(String(value).replace('.','\\.')));
 const restored=app.importSpec(gt);restored.title='Updated title';
 assert.deepEqual(plain(app.makeSpec(restored).data),gt.data);
});

test('Precision V2 flags collapsed structures while preserving observed coincidences and imported values',()=>{
 const box=app.defaultProject('boxplot_v');
 box.axes.y={p1:100,p2:0,v1:1,v2:2,type:'linear',calibrated:true};
 box.rows=[{category:'A',lower:1,q1:1.01,median:1.01,q3:1.01,upper:2,outliers:[]}];
 box.evidence=[{q1Pixel:{y:99.2},q3Pixel:{y:98.8}}];
 assert.ok(app.validate(box).some(issue=>/四分位距为零/.test(issue.message)));
 const gt=plain(app.makeSpec(box));
 assert.deepEqual(plain(app.makeSpec(app.importSpec(gt))),gt);
 box.evidence[0].q3Pixel={y:99.2};
 assert.ok(!app.validate(box).some(issue=>/四分位距为零/.test(issue.message)));
 const bar=app.defaultProject('barv_1_error');
 bar.rows=[{category:'A',value:1.01,lower:1.01,upper:1.01}];
 bar.axes.y=box.axes.y;
 bar.evidence=[{lowerPixel:{y:99.2},upperPixel:{y:98.8}}];
 assert.ok(app.validate(bar).some(issue=>/误差区间上下界重合/.test(issue.message)));
 bar.evidence=[];
 assert.ok(!app.validate(bar).some(issue=>/误差区间上下界重合/.test(issue.message)));
 const histogram=app.defaultProject('histogram_v_1');
 histogram.rows=[{bin_start:1.01,bin_end:1.01,value:2}];
 assert.throws(()=>app.makeSpec(histogram),/复核分箱/);
});

test('An imported exact percentage fraction survives edits to other observed fields',()=>{
 const original=.8765432109876543;
 const gt={data:{values:[{x:1,y:original},{x:2,y:.18}]},mark:{type:'point'},
   encoding:{x:{field:'x',type:'quantitative'},y:{field:'y',type:'quantitative',axis:{format:'.17~p'}}}};
 const project=app.importSpec(gt);
 assert.deepEqual(plain(app.makeSpec(project).data),gt.data);
 project.rows[0].x=3.123456789;
 const edited=plain(app.makeSpec(project));
 assert.deepEqual(edited.data.values,[{x:2,y:.18},{x:3.123456789,y:original}]);
});

test('Percentage stack apportions complete automatic groups and respects a manual component',()=>{
 const project=app.defaultProject('barv_stack_percent');
 project.rows=[{category:'A',series:'Series 1',start:0,end:33.335,value:33.34},
   {category:'A',series:'Series 2',start:33.335,end:100,value:66.67}];
 app.ensureIdentities(project);
 app.syncPercentStackRatios(project);
 assert.deepEqual(plain(project.rows.map(row=>row.value)),[33.34,66.66]);
 project.evidence=[{valueOverride:true},null];
 project.rows[0].value=33.33333333;
 project.percentStackRatioCategories={[project.categoryObjects[0].key]:true};
 app.syncPercentStackRatios(project);
 assert.deepEqual(plain(project.rows.map(row=>row.value)),[33.33333333,66.67]);
});

test('Legacy heatmap intervals restore at their saved precision until their axis is measured again',()=>{
 const project=app.defaultProject('heatmap_cd');
 project.precisionVersion=1;
 project.axes.x={p1:0,p2:10,v1:0,v2:100,type:'linear',calibrated:true};
 project.heatmap.x=[{key:'first',fromPixels:true},{key:'second',fromPixels:true}];
 project.heatmap.pixels.x=[0,4.123456,10];
 app.preserveLegacyHeatmapIntervals(project);
 assert.deepEqual(plain(app.heatmapIntervals(project,'x')),[[0,40],[40,100]]);
 project.title='Updated title';
 assert.deepEqual(plain(app.heatmapIntervals(project,'x')),[[0,40],[40,100]]);
 app.updateHeatmapIntervals(project,'x');
 assert.deepEqual(plain(app.heatmapIntervals(project,'x')),[[0,41.23],[41.23,100]]);
});

test('Heatmap color estimates use percent-point precision only for a percentage color scale',()=>{
 const read=()=>[58,0,0],ramp=[{t:0,rgb:[0,0,0],value:0},{t:.05,rgb:[250,0,0],value:1.01106}];
 assert.equal(app.measureHeatmapColor(read,ramp,null,{x:10,y:10}).value,.2346);
 assert.equal(app.measureHeatmapColor(read,ramp,null,{x:10,y:10},true).value,.23);
});
