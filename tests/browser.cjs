// End-to-end checks use public controls/file inputs; chartStudio only supplies read-only evidence.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'examples/statistical');fs.mkdirSync(out,{recursive:true});
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),context=vm.createContext({});
vm.runInContext(html.split('<script type="module">')[1].split('const $=id=>')[0]+';globalThis.api={defaultProject,makeSpec};',context);
const plain=x=>JSON.parse(JSON.stringify(x));
const fixtures=[];
for(const [name,mode,title,values,donut]of[
 ['pie-percent','percent','Share (%)',[32.1234567890123,27.8765432109877,40],false],
 ['pie-absolute','absolute','Revenue (万元)',[125.75,60.1234567890123,48],false],
 ['pie-donut','percent','Share (%)',[55,30,15],true]
]){const p=plain(context.api.defaultProject('pie'));Object.assign(p,{title:name,valueMode:mode,valueTitle:title,donut,rows:values.map((value,i)=>({category:['Research','Operations','Other'][i],value})),evidence:[],reviewed:false});delete p.categoryObjects;fixtures.push({name,project:p});}
for(const [name,kind,outliers]of[['box-vertical-outliers','boxplot_v',[-7,107.1234567890123]],['box-horizontal-empty','boxplot_h',[]]]){
 const p=plain(context.api.defaultProject(kind));Object.assign(p,{title:name,xTitle:kind==='boxplot_h'?'Duration (ms)':'Treatment',yTitle:kind==='boxplot_v'?'Duration (ms)':'Treatment',categories:['A','B'],rows:[{category:'A',lower:10,q1:25,median:40,q3:65,upper:90,outliers},{category:'B',lower:20,q1:35,median:50,q3:70,upper:85,outliers:[]}],evidence:[],reviewed:false});delete p.categoryObjects;fixtures.push({name,project:p});
}
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);});
let browser;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1680,height:1120},deviceScaleFactor:1}),errors=[],checks=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
 const url=`http://127.0.0.1:${server.address().port}`;
 await page.goto(url);await page.waitForFunction(()=>window.chartStudio);
 const snapshot=()=>page.evaluate(()=>window.chartStudio.snapshot());
 const chooseCategory=async name=>{const value=await page.locator('#activeCategory option').evaluateAll((options,name)=>options.find(o=>o.textContent.replace(/（[0-9]+）$/,'')===name)?.value,name);await page.selectOption('#activeCategory',value);};
 const scientificRows=p=>p.rows.map(r=>Object.fromEntries((p.kind==='pie'?['category','value']:['category','lower','q1','median','q3','upper','outliers']).map(k=>[k,r[k]])));
 const currentCategory=p=>p.categoryObjects.find(c=>c.key===p.assist.category)?.name;
 const inputJSON=async(selector,data)=>{await page.locator(selector).setInputFiles({name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});await page.waitForTimeout(250);};
 const settle=async()=>{await page.waitForTimeout(250);await page.waitForFunction(()=>window.chartStudio.snapshot().renderOk,{},{timeout:5000}).catch(async e=>{console.error('RENDER FAILED',JSON.stringify(await snapshot()),await page.locator('#issues').innerText(),await page.locator('#renderState').innerText());throw e;});};
 const field=async(selector,value)=>{await page.locator(selector).fill(String(value));await page.locator(selector).press('Tab');};
 const openProject=async(project,image,name)=>{
  await inputJSON('#projectInput',{format:'chart-studio-project',version:1,queue:[],activeId:null,current:{project,image,name}});
  assert.equal((await snapshot()).project.kind,project.kind);
 };
 const downloadJSON=async(id)=>{const download=page.waitForEvent('download');await page.click(id);return JSON.parse(fs.readFileSync(await (await download).path(),'utf8'));};
 const canvasPoint=async(x,y,action='click',extra={})=>{
  await page.locator('#canvasWrap').scrollIntoViewIfNeeded();await page.locator('#canvasWrap').evaluate(e=>{e.scrollTop=0;e.scrollLeft=0;});
  const rect=await page.locator('#canvas').boundingBox(),size=(await snapshot()).imageSize;const px=rect.x+x*rect.width/size.width,py=rect.y+y*rect.height/size.height;
  if(action==='move')await page.mouse.move(px,py);else await page.mouse.click(px,py,extra);
 };
 // Render synthetic reference images. Box fixtures use fixed pixel coordinates for known calibration checks.
 for(const f of fixtures){
  const gt=plain(context.api.makeSpec(f.project));fs.writeFileSync(path.join(out,f.name+'.gt.json'),JSON.stringify(gt,null,2)+'\n');
  f.image=await page.evaluate(async({gt,p})=>{
   if(p.kind==='pie'){const div=document.createElement('div');document.body.append(div);const result=await vegaEmbed(div,{...gt,width:430,height:350,background:'white',...(p.donut?{mark:{type:'arc',innerRadius:85}}:{})},{actions:false});const img=await result.view.toImageURL('png');result.finalize();div.remove();return img;}
   const c=document.createElement('canvas');c.width=640;c.height=460;const g=c.getContext('2d'),h=p.kind==='boxplot_h',pos=v=>h?100+4*v:400-3*v;
   g.fillStyle='white';g.fillRect(0,0,640,460);g.fillStyle='#243344';g.font='17px sans-serif';g.fillText(p.title,130,28);g.font='13px sans-serif';
   g.strokeStyle='#566878';g.beginPath();g.moveTo(100,55);g.lineTo(100,400);g.lineTo(560,400);g.stroke();
   for(let v=0;v<=100;v+=20){if(h){g.fillText(String(v),pos(v)-6,423);g.beginPath();g.moveTo(pos(v),400);g.lineTo(pos(v),405);g.stroke();}else{g.fillText(String(v),66,pos(v)+4);g.beginPath();g.moveTo(95,pos(v));g.lineTo(100,pos(v));g.stroke();}}
   if(h)g.fillText(p.xTitle,245,448);else{g.save();g.translate(25,290);g.rotate(-Math.PI/2);g.fillText(p.yTitle,0,0);g.restore();}
   for(const [i,r]of p.rows.entries()){
    const cat=h?150+i*130:250+i*160;g.strokeStyle='#008b7e';g.fillStyle='#dff3ec';g.lineWidth=2;
    if(h){g.fillRect(pos(r.q1),cat-20,pos(r.q3)-pos(r.q1),40);g.strokeRect(pos(r.q1),cat-20,pos(r.q3)-pos(r.q1),40);}else{g.fillRect(cat-25,pos(r.q3),50,pos(r.q1)-pos(r.q3));g.strokeRect(cat-25,pos(r.q3),50,pos(r.q1)-pos(r.q3));}
    g.beginPath();g.moveTo(h?pos(r.lower):cat,h?cat:pos(r.lower));g.lineTo(h?pos(r.upper):cat,h?cat:pos(r.upper));for(const key of ['lower','median','upper']){g.moveTo(h?pos(r[key]):cat-25,h?cat-20:pos(r[key]));g.lineTo(h?pos(r[key]):cat+25,h?cat+20:pos(r[key]));}g.stroke();
    g.fillStyle='#243344';g.fillText(r.category,h?65:cat-4,h?cat+4:425);
    for(const v of r.outliers){g.beginPath();g.arc(h?pos(v):cat,h?cat:pos(v),4,0,Math.PI*2);g.stroke();}
   }return c.toDataURL();
  },{gt,p:f.project});
  fs.writeFileSync(path.join(out,f.name+'.png'),Buffer.from(f.image.split(',')[1],'base64'));
  await openProject(f.project,f.image,f.name+'.png');await settle();
  await page.check('#reviewed');const exported=await downloadJSON('#exportGT');assert.deepEqual(exported,gt);
  const saved=await downloadJSON('#saveProject');fs.writeFileSync(path.join(out,f.name+'.project.json'),JSON.stringify(saved,null,2)+'\n');
  await inputJSON('#specInput',gt);await settle();assert.deepEqual((await snapshot()).lastSpec,gt);
  await inputJSON('#projectInput',saved);await settle();assert.equal((await snapshot()).project.donut, f.project.donut);assert.equal((await snapshot()).project.reviewed,true);assert((await snapshot()).imageSize.width>0);if(f.project.kind!=='pie')assert.equal((await snapshot()).imageSize.width,640);
  await page.evaluate(()=>{window.scrollTo(0,0);document.getElementById('toast').style.display='none';});await page.screenshot({path:path.join(out,f.name+'.studio.png'),fullPage:true});
  checks.push(f.name+': GT import/export, saved image/data/units/review state, semantic rendering');
 }
 // Statistical charts use the upstream v2 workspace, project switch, focus and batch ZIP flows.
 const workspaceFixtures=[fixtures[1],fixtures[3]],queue=workspaceFixtures.map((f,i)=>({id:'stat-'+i,projectId:'statistics',name:'samples/'+f.name+'.png',image:f.image,project:{...plain(f.project),reviewed:true}}));
 await inputJSON('#projectInput',{format:'chart-studio-project',version:2,projects:[{id:'statistics',name:'统计图核验'}],currentProjectId:'statistics',activeId:queue[0].id,queue,current:{project:queue[0].project,image:queue[0].image,name:queue[0].name}});await settle();
 assert.equal((await snapshot()).currentProjectId,'statistics');assert.equal(await page.locator('#queue [data-queue]').count(),2);
 const batchDownload=page.waitForEvent('download');await page.click('#batchExport');const archive=fs.readFileSync(await (await batchDownload).path()),entries={};let at=0;
 while(archive.readUInt32LE(at)===0x04034b50){const size=archive.readUInt32LE(at+18),length=archive.readUInt16LE(at+26),extra=archive.readUInt16LE(at+28),start=at+30+length+extra,name=archive.subarray(at+30,at+30+length).toString('utf8');entries[name]=JSON.parse(archive.subarray(start,start+size).toString('utf8'));at=start+size;}
 assert.equal(entries['export-report.json'].exported,2);assert.equal(entries['export-report.json'].skipped,0);
 for(const f of workspaceFixtures)assert.deepEqual(entries['gt/samples/'+f.name+'.gt.json'],plain(context.api.makeSpec(f.project)));
 await page.click('[data-queue="stat-1"]');await settle();const priorFocus=(await snapshot()).project;await page.click('#focusToggle');await page.waitForFunction(()=>!!document.fullscreenElement);assert.equal((await snapshot()).focusMode,true);await page.locator('#canvas').press('Escape');await page.waitForFunction(()=>!document.fullscreenElement);assert.equal((await snapshot()).focusMode,false);assert.deepEqual((await snapshot()).project,priorFocus);
 const workspaceSaved=await downloadJSON('#saveProject');assert.equal(workspaceSaved.version,2);await inputJSON('#projectInput',workspaceSaved);await settle();assert.equal((await snapshot()).currentProjectId,'statistics');assert.deepEqual((await snapshot()).project,priorFocus);
 checks.push('Pie/Box: named v2 workspace, mixed-chart batch ZIP with exact GT/units, image switching, focus/Escape and archive restore');
 // Pie editing, order, delete/undo, warning without normalization, and absolute mode.
 const pie=fixtures[0];await openProject(pie.project,pie.image,'pie-percent.png');await settle();
 await field('[data-i="0"][data-key="value"]','31.1234567890123');await settle();assert.match(await page.locator('#issues').innerText(),/不等于 100/);assert.equal((await snapshot()).lastSpec.data.values[0].value,31.1234567890123);
 await page.click('[data-index="0"][data-move="1"]');assert.equal((await snapshot()).project.rows[1].category,'Research');
 await page.click('#deleteRow');assert.equal((await snapshot()).project.rows.length,2);assert(!(await snapshot()).project.rows.some(r=>r.category==='Research'));await page.click('#undo');assert.equal((await snapshot()).project.rows.length,3);
 const rowsBeforeModeSwitch=(await snapshot()).project.rows;
 await page.selectOption('#valueMode','absolute');assert.equal(await page.inputValue('#valueTitle'),'Value');await settle();assert.equal((await snapshot()).lastSpec.encoding.theta.title,'Value');assert.doesNotMatch(await page.locator('#issues').innerText(),/不等于 100/);
 await field('#valueTitle','Revenue (万元)');await page.selectOption('#valueMode','percent');assert.equal(await page.inputValue('#valueTitle'),'Share (%)');await settle();assert.equal((await snapshot()).lastSpec.encoding.theta.title,'Share (%)');assert.deepEqual((await snapshot()).project.rows,rowsBeforeModeSwitch);
 await page.click('#undo');assert.equal(await page.inputValue('#valueMode'),'absolute');assert.equal(await page.inputValue('#valueTitle'),'Revenue (万元)');await page.click('#redo');assert.equal(await page.inputValue('#valueMode'),'percent');assert.equal(await page.inputValue('#valueTitle'),'Share (%)');
 await page.selectOption('#valueMode','absolute');assert.equal(await page.inputValue('#valueTitle'),'Value');await field('#valueTitle','Revenue (万元)');await settle();assert.deepEqual((await snapshot()).project.rows,rowsBeforeModeSwitch);
 const pieSave=await downloadJSON('#saveProject');await inputJSON('#projectInput',pieSave);await settle();assert.equal((await snapshot()).project.valueMode,'absolute');assert.equal((await snapshot()).project.rows[1].value,31.1234567890123);checks.push('Pie: numeric editing, row order, deletion/undo, percent warning, absolute mode and project restore');
 // Test image clicking with only the numerical axis calibrated, in both orientations.
 for(const fixture of fixtures.filter(f=>f.project.kind.startsWith('boxplot'))){
  const horizontal=fixture.project.kind==='boxplot_h',v=horizontal?'x':'y',p=plain(fixture.project);p.rows=[];p.evidence=[];p.categories=['A'];delete p.categoryObjects;
  await openProject(p,fixture.image,fixture.name+'.png');
  assert.equal(await page.locator('#axisFields .axis-group').count(),1);
  for(const [n,real,pixel]of [[1,0,horizontal?100:400],[2,100,horizontal?500:100]]){
   await page.locator('#calibrationPanel').evaluate(e=>e.open=true);await page.click(`[data-tick="${v}${n}"]`);await canvasPoint(horizontal?pixel:100,horizontal?400:pixel);await field(`[data-axis="${v}"][data-field="v${n}"]`,real);
  }
  assert.equal((await snapshot()).project.axes[v].calibrated,true);assert.equal((await snapshot()).project.axes[horizontal?'y':'x'].calibrated,false);
  await page.click('[data-tool="point"]');const point=value=>horizontal?[100+4*value,150]:[250,400-3*value];
  for(const value of [10+1/3,25+1/3,40,65+1/3,90+1/3])await canvasPoint(...point(value));await settle();
  let state=await snapshot();for(const [k,val]of Object.entries({lower:10.33,q1:25.33,median:40,q3:65.33,upper:90.33}))assert.equal(state.project.rows[0][k],val,k);assert.equal(Object.keys(state.project.evidence[0]).filter(k=>k.endsWith('Pixel')).length,5);
  // Each statistic can be independently selected and nudged in edit mode.
  await page.click('[data-tool="select"]');
  for(const key of ['lower','q1','median','q3','upper']){
   const before=await snapshot();await page.selectOption('#boxField',key);await page.locator('#canvas').focus();await page.locator('#canvas').press(horizontal?'ArrowRight':'ArrowUp');
   const after=await snapshot();assert.equal(after.selectedHandle,key+'Pixel');assert(after.project.rows[0][key]>before.project.rows[0][key]);for(const other of ['lower','q1','median','q3','upper'].filter(k=>k!==key))assert.equal(after.project.rows[0][other],before.project.rows[0][other]);await page.click('#undo');
  }
  // Select/drag median, then fine-tune it by one original pixel.
  await page.click('[data-tool="select"]');await canvasPoint(...point(40));const rect=await page.locator('#canvas').boundingBox(),scale=rect.width/640,from=point(40),to=point(42);
  await page.mouse.move(rect.x+from[0]*scale,rect.y+from[1]*scale);await page.mouse.down();await page.mouse.move(rect.x+to[0]*scale,rect.y+to[1]*scale,{steps:4});await page.mouse.up();
  await page.locator('#canvas').press(horizontal?'ArrowRight':'ArrowUp');state=await snapshot();assert.equal(state.project.rows[0].median,horizontal?42.25:42.33);assert.equal(state.selectedHandle,'medianPixel');
  // Manual change detaches only the edited statistic; the other four handles stay valid.
  await field('[data-i="0"][data-key="q1"]','26.1234567890123');state=await snapshot();assert(!state.project.evidence[0].q1Pixel);assert(state.project.evidence[0].medianPixel&&state.project.evidence[0].lowerPixel&&state.project.evidence[0].upperPixel);
  await field(`[data-axis="${v}"][data-field="v2"]`,200);state=await snapshot();assert.equal(state.project.rows[0].q1,26.1234567890123);assert.equal(state.project.rows[0].median,horizontal?84.5:84.67);await page.click('#undo');
  await page.selectOption('#boxField','q1');await page.click('[data-tool="point"]');await canvasPoint(...point(25+1/3));assert.equal((await snapshot()).project.rows[0].q1,25.33);
  // Continuous outliers, independent remeasurement, manual add/delete and index/geometry alignment.
  await page.selectOption('#boxField','outliers');await page.selectOption('#outlierTarget','new');for(const value of [105+1/3,110+1/3])await canvasPoint(...point(value));
  assert.deepEqual((await snapshot()).project.rows[0].outliers,[105.33,110.33]);
  await page.selectOption('#outlierTarget','0');await canvasPoint(...point(106+1/3));assert.equal((await snapshot()).project.rows[0].outliers[0],106.33);
  await page.click('[data-add-outlier="0"]');await field('[data-i="0"][data-outlier="2"]','120.1234567890123');await page.click('[data-index="0"][data-delete-outlier="0"]');state=await snapshot();assert.equal(state.project.rows[0].outliers.length,2);assert.deepEqual(state.project.rows[0].outliers,[110.33,120.1234567890123]);assert(state.project.evidence[0].outlier0Pixel);assert(!state.project.evidence[0].outlier1Pixel);
  // Ordering errors are shown without repairing observations.
  await field('[data-i="0"][data-key="median"]','99');await page.waitForTimeout(250);assert.match(await page.locator('#issues').innerText(),/lower ≤ q1/);assert.equal((await snapshot()).project.rows[0].median,99);await page.click('#undo');await settle();
  // Guides, magnification and zoom retain original pixels.
  await page.selectOption('#boxField','median');await page.click('[data-tool="select"]');await canvasPoint(...point(42),'move');assert(await page.locator('#magnifier').isVisible());assert((await snapshot()).projectionInfo);assert.match(await page.locator('#cursorInfo').innerText(),/median: 42\.00$/);
  const beforeZoom=(await snapshot()).project.rows;await page.click('#zoomIn');assert.deepEqual((await snapshot()).project.rows,beforeZoom);
  await page.check('#reviewed');await settle();const gt=await downloadJSON('#exportGT');assert.equal(gt.layer[0].encoding[v].title,'Duration (ms)');assert.deepEqual(gt.data.values,scientificRows((await snapshot()).project));
  const saved=await downloadJSON('#saveProject');await inputJSON('#projectInput',saved);await settle();assert.deepEqual((await snapshot()).project.evidence,saved.current.project.evidence);assert.deepEqual((await snapshot()).project.axes,saved.current.project.axes);assert.equal((await snapshot()).project.reviewed,true);
  fs.writeFileSync(path.join(out,fixture.name+'.measured.project.json'),JSON.stringify(saved,null,2)+'\n');fs.writeFileSync(path.join(out,fixture.name+'.measured.gt.json'),JSON.stringify(gt,null,2)+'\n');
  await page.evaluate(()=>{window.scrollTo(0,0);document.getElementById('toast').style.display='none';});await page.screenshot({path:path.join(out,fixture.name+'.measured.studio.png'),fullPage:true});
  // Local draft restoration and multiple-image queue preserve measured evidence.
  await page.waitForTimeout(700);await page.reload();await page.waitForFunction(()=>window.chartStudio?.snapshot().project.rows.length===1);await settle();assert.deepEqual((await snapshot()).project.evidence,saved.current.project.evidence);
  const queueBeforeUpload=(await snapshot()).queue.length;await page.locator('#imageInput').setInputFiles(fixtures.slice(3).map(f=>path.join(out,f.name+'.png')));await page.waitForTimeout(250);assert.equal(await page.locator('#queue [data-queue]').count(),queueBeforeUpload+2);await inputJSON('#projectInput',saved);await settle();
  // Remove all outliers via UI; empty array must survive GT export/import.
  while((await snapshot()).project.rows[0].outliers.length)await page.click('[data-index="0"][data-delete-outlier="0"]');await settle();assert.deepEqual((await snapshot()).lastSpec.data.values[0].outliers,[]);assert.equal((await snapshot()).lastSpec.layer.length,4);
  await inputJSON('#specInput',(await snapshot()).lastSpec);await settle();assert.deepEqual((await snapshot()).project.rows[0].outliers,[]);
  checks.push(fixture.name+': axis calibration, five ordered clicks, individual selection/drag/nudge/remeasure, two-decimal pixel values and preserved manual/import precision, outlier clicks/edit/add/delete, validation, guides/zoom, pixels/draft/project restore, image queue, empty-outlier GT');
 }
 // Nearby and coincident points must never intercept the current annotation target.
 const calibratedProject=kind=>{
  const p=plain(context.api.defaultProject(kind));p.rows=[];p.evidence=[];p.categories=['A','B'];delete p.categoryObjects;
  p.axes.x={p1:100,p2:500,v1:0,v2:100,type:'linear',calibrated:true,point1:{x:100,y:400},point2:{x:500,y:400}};
  p.axes.y={p1:400,p2:100,v1:0,v2:100,type:'linear',calibrated:true,point1:{x:100,y:400},point2:{x:100,y:100}};
  return p;
 };
 const dragPoint=async(from,to)=>{
  await canvasPoint(...from,'move');await page.mouse.down();await canvasPoint(...to,'move');await page.mouse.up();
 };
 for(const kind of ['boxplot_v','boxplot_h']){
  const horizontal=kind==='boxplot_h',point=value=>horizontal?[100+4*value,150]:[250,400-3*value];
  await openProject(calibratedProject(kind),fixtures[3].image,'close-'+kind+'.png');await page.click('[data-tool="point"]');
  const fields=['lower','q1','median','q3','upper'],values=[40,40+1/3,40+1/3,40+2/3,41];
  for(const category of ['A','B'])for(const [j,value]of values.entries()){
   const before=await snapshot();await canvasPoint(...point(value));const after=await snapshot(),i=category==='A'?0:1;
   assert.equal(after.project.rows.length,i+1);assert.equal(after.selectedHandle,fields[j]+'Pixel');
   for(let prior=0;prior<j;prior++)assert.deepEqual(after.project.evidence[i][fields[prior]+'Pixel'],before.project.evidence[i][fields[prior]+'Pixel']);
   assert.equal(after.project.assist.boxField,j<4?fields[j+1]:'lower');assert.equal(currentCategory(after.project),category==='A'&&j===4?'B':category);
  }
  await settle();let state=await snapshot();assert.deepEqual(state.project.rows.map(r=>fields.map(f=>r[f])),[[40,40.33,40.33,40.67,41],[40,40.33,40.33,40.67,41]]);
  assert.deepEqual(state.project.evidence[0].q1Pixel,state.project.evidence[0].medianPixel);assert.deepEqual(state.project.evidence[0].medianPixel,state.project.evidence[1].medianPixel);
  const beforeKeys=state.project.rows;await page.locator('#canvas').press(horizontal?'ArrowRight':'ArrowUp');assert.deepEqual((await snapshot()).project.rows,beforeKeys);
  await chooseCategory('A');await page.selectOption('#boxField','outliers');await page.selectOption('#outlierTarget','new');
  for(const value of [42,42,42+1/3])await canvasPoint(...point(value));assert.deepEqual((await snapshot()).project.rows[0].outliers,[42,42,42.33]);
  // Field selection disambiguates overlapping statistics and rows, even while dragging near another point.
  await page.click('[data-tool="select"]');await page.locator('[data-i="0"][data-key="median"]').click();
  const beforeMedian=await snapshot();await dragPoint(point(40+1/3),point(40+2/3));state=await snapshot();assert.equal(state.selected,0);assert.equal(state.selectedHandle,'medianPixel');assert.equal(state.project.rows[0].median,40.67);assert.equal(state.project.rows[0].q1,40.33);assert.deepEqual(state.project.rows[1],beforeMedian.project.rows[1]);
  await page.selectOption('#boxField','outliers');await page.selectOption('#outlierTarget','1');await dragPoint(point(42),point(43));state=await snapshot();assert.equal(state.selectedHandle,'outlier1Pixel');assert.deepEqual(state.project.rows[0].outliers,[42,43,42.33]);
  await page.locator('#canvas').press(horizontal?'ArrowRight':'ArrowUp');assert.deepEqual((await snapshot()).project.rows[0].outliers,[42,horizontal?43.25:43.33,42.33]);
  // Remeasure a selected field in add mode without dragging any overlapping handle.
  await page.selectOption('#boxField','q1');await page.click('[data-tool="point"]');await canvasPoint(...point(40+1/3));assert.equal((await snapshot()).project.rows[0].q1,40.33);assert.equal((await snapshot()).project.assist.boxField,'median');
  await field('[data-i="0"][data-key="q1"]','40.1234567890123');await settle();assert.equal((await snapshot()).lastSpec.data.values[0].q1,40.1234567890123);assert(!(await snapshot()).project.evidence[0].q1Pixel);
  const gt=(await snapshot()).lastSpec;await inputJSON('#specInput',gt);await settle();assert.deepEqual((await snapshot()).lastSpec,gt);
  checks.push(kind+': close/coincident statistics across categories, next-field progression, duplicate outliers, selected-field drag/nudge, add-mode key isolation, two-decimal measurements and manual/GT precision');
 }
 // Exercise the changed add/edit hit testing on every original chart type, including stacked endpoints.
 for(const kind of ['barh_1','barh_n','barv_1','barv_n','barv_stack','line_1','line_n','scatter_1','scatter_n']){
  const p=calibratedProject(kind),bar=kind.startsWith('bar'),horizontal=kind.startsWith('barh'),stack=kind==='barv_stack';
  await openProject(p,fixtures[3].image,'close-'+kind+'.png');await page.click('[data-tool="point"]');
  const count=bar?p.categories.length*p.series.length:3;
  for(let i=0;i<count;i++){
   const previous=(await snapshot()).project.rows;
   if(stack){await canvasPoint(250,i?299:300);assert.equal((await snapshot()).project.rows.length,i);await canvasPoint(250,299);}
   else await canvasPoint(250,i?299:300);
   const state=await snapshot();assert.equal(state.project.rows.length,i+1,kind);assert.deepEqual(state.project.rows.slice(0,i),previous,kind);
   if(!bar&&i)assert.deepEqual(state.project.evidence[i].pixel,state.project.evidence[1].pixel);
  }
  if(!bar&&p.series.length>1){await page.selectOption('#activeSeries',p.series[1].key);await canvasPoint(250,299);assert.equal((await snapshot()).project.rows.length,count+1);}
  await settle();const before=await snapshot();await page.locator('#canvas').press('ArrowUp');assert.deepEqual((await snapshot()).project.rows,before.project.rows);
  await page.click('[data-tool="select"]');await page.locator(`[data-i="1"][data-key="${bar?'value':'y'}"]`).click();
  await dragPoint([250,299],horizontal?[253,299]:[250,296]);const after=await snapshot();assert.equal(after.selected,1,kind);assert.equal(after.selectedHandle,'pixel');assert.notDeepEqual(after.project.rows[1],before.project.rows[1]);assert.deepEqual(after.project.rows.filter((_,i)=>i!==1),before.project.rows.filter((_,i)=>i!==1));
  if(bar){
   const archived=(await snapshot()).project;archived.errorBars=true;await openProject(archived,fixtures[3].image,'error-'+kind+'.png');await page.locator('[data-i="1"][data-key="value"]').click();
   const center=horizontal?[253,299]:[250,296];
   for(const limit of ['lower','upper']){await page.click(`[data-tool="${limit}"]`);await canvasPoint(...center);}
   await page.click('[data-tool="select"]');await page.locator('[data-i="1"][data-key="lower"]').click();const limits=(await snapshot()).project.rows[1];await page.locator('#canvas').focus();await page.locator('#canvas').press(horizontal?'ArrowLeft':'ArrowDown');const nudged=await snapshot();assert.equal(nudged.selectedHandle,'lowerPixel');assert(nudged.project.rows[1].lower<limits.lower);assert.equal(nudged.project.rows[1].upper,limits.upper);assert.equal(nudged.project.rows[1].value,limits.value);
   // The original GT contract requires both error endpoints on every row.
   for(let i=0;i<nudged.project.rows.length;i++)if(i!==1){
    await page.locator(`[data-i="${i}"][data-key="value"]`).click();const pixel=nudged.project.evidence[i].pixel;
    for(const limit of ['lower','upper']){await page.click(`[data-tool="${limit}"]`);await canvasPoint(pixel.x,pixel.y);}
   }
  }
  await settle();checks.push(kind+': close/coincident additions, edit-mode field selection and drag, add-mode key isolation'+(bar?', error endpoint editing':''));
 }
 // Original interaction flow remains usable for scatter; semantic regression tests cover all nine kinds.
 await openProject({...plain(context.api.defaultProject('scatter_1')),rows:[],evidence:[]},null,'');await page.click('#demo');await page.waitForTimeout(200);assert.equal((await snapshot()).project.kind,'scatter_1');await canvasPoint(128,344);await settle();assert.equal((await snapshot()).project.rows.length,1);assert.equal((await snapshot()).lastSpec.encoding.x.title,'Time (s)');checks.push('Legacy scatter demo: calibrated image click and semantic rendering');
 assert.deepEqual(errors,[]);
 const report={passed:true,date:new Date().toISOString(),browser:await browser.version(),checks,pageErrors:errors};fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();});
