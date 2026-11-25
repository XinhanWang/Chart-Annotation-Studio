const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,plain,mixedLine}=require('./precision-v1-fixtures.cjs'),{measurement}=require('./precision-reference.cjs');
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
test('Precision V1 golden decimal midpoints, tiny values, log axes and exact endpoints agree with independent reference',()=>{
 for(const axis of [{p1:0,p2:100,v1:0,v2:1e-8,type:'linear'},{p1:0,p2:100,v1:-1,v2:1,type:'linear'},{p1:100,p2:0,v1:1e-6,v2:1e2,type:'log'}])for(const pixel of [axis.p1,axis.p2,25,33.3333,66.6667])assert.equal(app.measuredAxisValue(pixel,axis),measurement(pixel,axis));
 assert.equal(app.measuredAxisValue(11.5,{p1:0,p2:20,v1:0,v2:2,type:'linear'}),1.2);assert.equal(app.measuredAxisValue(8.5,{p1:0,p2:20,v1:-2,v2:0,type:'linear'}),-1.2);
 const center={x:1000,y:1000},rays=radius=>[330,20,170].map(d=>({x:center.x+radius*Math.cos(d*Math.PI/180),y:center.y+radius*Math.sin(d*Math.PI/180)}));assert.deepEqual(plain(app.measurePieSectors(center,rays(100))).map(r=>r.value),[13.9,41.7,44.4]);assert.deepEqual(plain(app.measurePieSectors(center,rays(1000))).map(r=>r.value),[13.89,41.67,44.44]);
});
