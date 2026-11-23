const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const kinds=['1','n','stack'];

function sample(kind,horizontal,equal){
  const multi=kind!=='1',stacked=kind==='stack';
  const bin={field:'bin_start',type:'quantitative',bin:'binned',title:'Length (mm)'};
  const end={field:'bin_end'},value={field:'value',type:'quantitative',title:'Density (1/mm)'};
  if(multi)value.stack=stacked?'zero':null;
  const encoding=horizontal?{y:bin,y2:end,x:value}:{x:bin,x2:end,y:value};
  if(multi)encoding.color={field:'series',type:'nominal',sort:null};
  if(stacked)encoding.order={field:'stack_order',type:'quantitative'};
  const values=[[0,1],[1,equal?2:3]].flatMap(([bin_start,bin_end],i)=>
    (multi?['S1','S2']:['S1']).map((series,rank)=>({bin_start,bin_end,value:1+i+rank,
      ...(stacked?{stack_order:rank}:{}),...(multi?{series}:{})})));
  return {title:'Measurement',data:{values},mark:{type:'bar'},encoding,usermeta:{table_export:{tables:[{id:'data',path:'/data/values'}]}}};
}

async function run(){
  const browser=await chromium.launch({
    headless:true,channel:process.env.STUDIO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)
  });
  try{
    const page=await browser.newPage({acceptDownloads:true,viewport:{width:1600,height:1100}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.waitForFunction(()=>!!window.chartStudio);
    const snapshot=()=>page.evaluate(()=>window.chartStudio.snapshot());
    const project=async()=>(await snapshot()).project;
    const load=async(selector,data)=>{
      await page.locator(selector).setInputFiles({
        name:'histogram.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))
      });
      await page.waitForFunction(id=>document.querySelector(id).value==='',selector);
    };
    const waitGT=gt=>page.waitForFunction(expected=>{
      const state=window.chartStudio.snapshot();
      return state.renderOk&&JSON.stringify(state.lastSpec)===expected;
    },JSON.stringify({...gt,usermeta:{table_export:{tables:[{id:'data',path:'/data/values'}]}}}),{timeout:5000});
    const waitNotice=(selector,pattern)=>page.waitForFunction(({selector,pattern})=>
      new RegExp(pattern).test(document.querySelector(selector).textContent),{selector,pattern},{timeout:5000});
    const download=async selector=>{
      const pending=page.waitForEvent('download');
      await page.click(selector);
      return fs.readFile(await (await pending).path());
    };
    const edit=async(selector,value)=>{
      await page.locator(selector).fill(String(value));
      await page.locator(selector).press('Tab');
    };
    const cell=(i,field)=>`[data-i="${i}"][data-key="${field}"]`;
    const boundary=(i,field)=>`#histogramBinsBody [data-bin="${i}"][data-field="${field}"]`;
    const rowBin=i=>`[data-i="${i}"][data-row-bin]`;
    const tool=name=>page.click(`[data-tool="${name}"]`);
    const notice=pattern=>waitNotice('#toast',pattern);
    const issue=pattern=>waitNotice('#issues',pattern);

    for(const kind of kinds)for(const horizontal of [false,true])for(const equal of [false,true]){
      const gt=sample(kind,horizontal,equal);
      await load('#specInput',gt);
      await waitGT(gt);
      assert.equal((await project()).kind,'histogram_'+(horizontal?'h':'v')+'_'+kind);
      const marks=await page.locator('#preview [aria-roledescription="bar"]').evaluateAll(nodes=>
        nodes.map(node=>{const {x,y,width,height}=node.getBBox();return {x,y,width,height};}));
      assert.equal(marks.length,gt.data.values.length);
      const width=horizontal?'height':'width';
      const binWidths=[...new Set(marks.map(mark=>Math.round(mark[width])))].sort((a,b)=>a-b);
      assert.equal(binWidths.length,equal?1:2);
      if(!equal)assert.ok(binWidths[1]>1.5*binWidths[0],JSON.stringify(binWidths));
      if(kind==='stack'){
        const axis=horizontal?'x':'y',size=horizontal?'width':'height';
        const first=marks.filter(mark=>Math.round(mark[width])===binWidths[0]).slice(0,2).sort((a,b)=>a[axis]-b[axis]);
        assert.ok(Math.abs(first[0][axis]+first[0][size]-first[1][axis])<.01,'adjacent stack segments');
        assert.ok(Math.abs(Math.max(first[0][size],first[1][size])/Math.min(first[0][size],first[1][size])-2)<.01);
      }
      if(!equal){
        await page.check('#reviewed');
        assert.deepEqual(JSON.parse(await download('#exportGT')),gt);
      }
    }
    console.log('Histogram matrix: six types, equal and unequal bins, SVG geometry and GT download');

    const stack=sample('stack',false,false);
    const malformed=[
      [gt=>gt.transform=[{bin:true,field:'value',as:['lo','hi']}],'仅支持预分箱'],
      [gt=>gt.mark.binSpacing=0,'仅支持预分箱'],
      [gt=>gt.encoding.xOffset={field:'series',type:'nominal'},'编码不符合'],
      [gt=>gt.data.values[0].stack_order=4,'stack_order'],
      [gt=>gt.data.values[1].stack_order=gt.data.values[3].stack_order=0,'不同的非负整数'],
      [gt=>gt.data.values[0].value=-1,'不能为负数'],
      [gt=>gt.data.values.push({...gt.data.values[0]}),'重复记录']
    ];
    for(const [mutate,message] of malformed){
      const bad=structuredClone(stack);
      mutate(bad);
      const before=await project();
      await load('#specInput',bad);
      await notice('导入失败.*'+message);
      assert.deepEqual(await project(),before);
    }
    await load('#specInput',stack);
    await waitGT(stack);
    assert.equal(await page.locator('#tableBody [data-key="bin_end"]').count(),0);
    assert.equal(await page.locator(rowBin(3)).inputValue(),(await project()).histogramBins[1].key);
    await edit(boundary(1,'bin_start'),.5);
    await issue('分箱边界.*不一致');
    await edit(boundary(1,'bin_end'),.5);
    await issue('bin_end 必须大于');
    await edit(boundary(1,'bin_end'),3);
    await edit(boundary(1,'bin_start'),1);
    await edit(cell(0,'value'),'');
    await issue('value 必须是有限数字');
    await edit(cell(0,'value'),1);
    const secondName='#seriesList [data-series="1"][data-prop="name"]';
    await edit(secondName,'S1');
    await issue('唯一的系列名称');
    await edit(secondName,'S2');
    await page.click('[data-move-series="1"][data-delta="-1"]');
    const reordered=structuredClone(stack);
    reordered.data.values.forEach(r=>r.stack_order=1-r.stack_order);
    await waitGT(reordered);
    assert.deepEqual((await project()).series.map(s=>s.name),['S2','S1']);
    await page.click('#undo');
    await waitGT(stack);

    await page.click('#demo');
    await page.waitForFunction(()=>window.chartStudio.snapshot().imageSize!==null);
    await page.selectOption('#family','histogram');
    assert.equal(await page.locator('#kind option').count(),6);
    const clickPixel=async(x,y)=>{
      const canvas=page.locator('#canvas');
      await canvas.scrollIntoViewIfNeeded();
      const rect=await canvas.boundingBox(),size=(await snapshot()).imageSize;
      await page.mouse.click(rect.x+x*rect.width/size.width,rect.y+y*rect.height/size.height);
    };
    const ticks={x1:[80,400],x2:[560,400],y1:[80,400],y2:[80,50]};
    const tick=(axis,n)=>`[data-axis="${axis}"][data-field="v${n}"]`;
    const pickTicks=async()=>{
      await tool('calibrate');
      for(const [name,point] of Object.entries(ticks)){
        await page.click(`[data-tick="${name}"]`);
        await clickPixel(...point);
      }
    };
    const enterTickValues=async()=>{
      await edit(tick('x',1),0);
      await edit(tick('x',2),10.123);
      await edit(tick('y',1),0);
      await edit(tick('y',2),100.123);
      assert.ok(Object.values((await project()).axes).every(a=>a.calibrated));
    };
    const at=(axis,pt)=>axis.v1+(pt-axis.p1)/(axis.p2-axis.p1)*(axis.v2-axis.v1);
    const rounded=n=>Number(n.toFixed(2));

    await page.click('#addRow');
    const start=page.locator(cell(0,'bin_start'));
    await start.fill('3.01234');
    await start.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('data-key'),'bin_end');
    await page.locator(':focus').fill('4');
    await page.locator(':focus').press('Tab');
    await page.locator(':focus').fill('0');
    await page.locator(':focus').press('Tab');
    await waitGT({
      title:'Calibration sample',data:{values:[{bin_start:3.01234,bin_end:4,value:0}]},mark:{type:'bar'},
      encoding:{
        x:{field:'bin_start',type:'quantitative',bin:'binned',title:'Time (s)'},
        x2:{field:'bin_end'},y:{field:'value',type:'quantitative',title:'Response'}
      }
    });

    await page.click('#addRow');
    await pickTicks();
    assert.ok(Object.values((await project()).axes).every(a=>!a.calibrated));
    await tool('point');
    await clickPixel(105,340);
    await notice('两个真实刻度校准 X');
    assert.equal((await project()).rows[1].bin_start,null);
    await edit(tick('x',1),0);
    await edit(tick('x',2),10.123);
    await clickPixel(105,340);
    await clickPixel(182,340);
    assert.ok(Number.isFinite((await project()).rows[1].bin_end));
    await clickPixel(150,372);
    await notice('两个真实刻度校准 Y');
    assert.equal((await project()).rows[1].value,null);
    await edit(tick('y',1),0);
    await edit(tick('y',2),100.123);
    await clickPixel(150,372);
    const measured=await project(),{axes}=measured,e=measured.evidence[1],r=measured.rows[1];
    assert.equal(r.bin_start,rounded(at(axes.x,e.bin_startPixel.x)));
    assert.equal(r.bin_end,rounded(at(axes.x,e.bin_endPixel.x)));
    assert.equal(r.value,rounded(at(axes.y,e.valuePixel.y)));
    assert.equal(await page.inputValue(cell(1,'value')),r.value.toFixed(2));

    await edit(cell(1,'bin_start'),0.123456);
    await edit(cell(1,'value'),8.123456);
    await page.selectOption('#histogramField','valuePixel');
    await clickPixel(150,350);
    await notice('此值由手动录入或 GT 导入');
    await edit(tick('x',2),11.345);
    await edit(tick('y',2),120.121);
    const recalibrated=await project(),corrected=recalibrated.rows[1];
    assert.equal(corrected.bin_start,0.123456);
    assert.equal(corrected.bin_end,rounded(at(recalibrated.axes.x,e.bin_endPixel.x)));
    assert.notEqual(corrected.bin_end,r.bin_end);
    assert.equal(corrected.value,8.123456);
    await edit(tick('x',2),0);
    await issue('X 轴上的测量记录需要重新校准');
    await edit(tick('x',2),11.345);
    const backup=JSON.parse(await download('#saveProject'));
    await load('#projectInput',backup);
    await notice('工程已恢复');
    assert.deepEqual((await project()).rows,recalibrated.rows);
    assert.deepEqual((await project()).evidence,recalibrated.evidence);
    await page.locator(cell(1,'value')).click();
    await tool('point');
    await page.selectOption('#histogramField','valuePixel');
    await clickPixel(150,350);
    await notice('此值由手动录入或 GT 导入');
    assert.equal((await project()).rows[1].value,8.123456);
    console.log('Histogram browser entry: manual precision, measurement, recalibration and project restore');

    for(const horizontal of [false,true]){
      await page.selectOption('#kind','histogram_'+(horizontal?'h':'v')+'_stack');
      await pickTicks();
      await enterTickValues();
      const points=horizontal?[[140,370],[140,330],[140,355],[240,355]]:
        [[125,330],[225,330],[165,340],[165,220]];
      const [,end]=await page.locator('#activeSeries option').evaluateAll(nodes=>nodes.map(node=>node.value));
      await page.selectOption('#activeSeries',end);
      await page.click('#addRow');
      const binChoice=page.locator(rowBin(0));
      assert.equal(await binChoice.inputValue(),'');
      await page.click('#addHistogramBin');
      await page.click('#measureHistogramBin');
      for(const point of points.slice(0,2))await clickPixel(...point);
      const bin=(await project()).histogramBins[0];
      await binChoice.selectOption(bin.key);
      await page.locator('#tableBody [data-row="0"] td').first().click();
      await tool('point');
      assert.deepEqual(await page.locator('#histogramField option').evaluateAll(nodes=>nodes.map(node=>node.value)),
        ['valueStartPixel','valueEndPixel']);
      await clickPixel(...points[2]);
      assert.equal((await project()).rows[0].value,null);
      await clickPixel(...points[3]);
      const stackProject=await project(),row=stackProject.rows[0],ev=stackProject.evidence[0];
      const valAxis=horizontal?'x':'y',binAxis=horizontal?'y':'x';
      assert.equal(row.series,'Series 2');
      assert.equal(row._histogramBin,bin.key);
      assert.equal(row.bin_start,rounded(at(stackProject.axes[binAxis],bin.evidence.bin_startPixel[binAxis])));
      assert.equal(row.bin_end,rounded(at(stackProject.axes[binAxis],bin.evidence.bin_endPixel[binAxis])));
      const startValue=at(stackProject.axes[valAxis],ev.valueStartPixel[valAxis]);
      const endValue=at(stackProject.axes[valAxis],ev.valueEndPixel[valAxis]);
      assert.equal(row.value,rounded(endValue-startValue));
      assert.notEqual(row.value,rounded(endValue));

      await tool('select');
      await page.locator(cell(0,'value')).click();
      await page.locator('#canvas').press(horizontal?'ArrowRight':'ArrowUp');
      assert.notEqual((await project()).rows[0].value,row.value);
      await page.click('#undo');
      assert.equal((await project()).rows[0].value,row.value);

      await page.click('#addHistogramBin');
      await edit(boundary(1,'bin_start'),11);
      await edit(boundary(1,'bin_end'),12);
      const second=(await project()).histogramBins[1];
      await binChoice.selectOption(second.key);
      assert.equal((await project()).rows[0].bin_end,12);
      await page.click('[data-delete-bin="1"]');
      await issue('请选择所属分箱');
      assert.equal((await project()).rows[0].value,row.value);
      assert.equal(await binChoice.inputValue(),'');
      await binChoice.selectOption(bin.key);
      assert.equal((await project()).rows[0].bin_end,row.bin_end);
      await page.click('#addRow');
      await page.selectOption(rowBin(1),bin.key);
      await notice('该分箱和系列已有记录');
      assert.equal(await page.inputValue(rowBin(1)),'');
      await page.click('#deleteRow');
      assert.equal((await project()).rows.length,1);
      await page.click('[data-select-bin="0"]');
      await page.click('#measureHistogramBin');
      await page.selectOption('#histogramField','bin_endPixel');
      const moved=horizontal?[points[1][0],points[1][1]-10]:[points[1][0]+10,points[1][1]];
      await clickPixel(...moved);
      const measured=(await project()).rows[0];
      assert.ok(measured.bin_end>row.bin_end);
      assert.equal(measured.value,row.value);
      if(horizontal){
        const backup=JSON.parse(await download('#saveProject'));
        for(const saved of [backup.current.project,backup.queue.find(item=>item.id===backup.activeId).project]){
          Object.assign(saved.evidence[0],saved.histogramBins[0].evidence);
          delete saved.rows[0]._histogramBin;
          delete saved.histogramBins;
          delete saved.assist.histogramBin;
        }
        await load('#projectInput',backup);
        const restored=await project();
        assert.equal(restored.rows[0]._histogramBin,restored.histogramBins[0].key);
        assert.equal(restored.rows[0].bin_end,measured.bin_end);
        assert.equal(restored.rows[0].value,measured.value);
        assert.ok(restored.histogramBins[0].evidence.bin_endPixel);
      }
    }
    const exactCalibration=async()=>{
      await tool('calibrate');
      for(const [axis,fields] of Object.entries({x:{p1:80,p2:560,v1:0,v2:12},y:{p1:400,p2:50,v1:0,v2:10}})){
        for(const [field,value] of Object.entries(fields)){
          await edit(`[data-axis="${axis}"][data-field="${field}"]`,value);
        }
      }
    };
    const startRun=async count=>{
      await page.fill('#histogramBinCount',String(count));
      await page.click('#histogramStart');
      assert.equal((await project()).histogramRun.count,count);
    };
    const restoreProgress=async(legacy=false)=>{
      const current=await project();
      const archive=JSON.parse(await download('#saveProject'));
      if(legacy){
        for(const saved of [archive.current.project,archive.queue.find(item=>item.id===archive.activeId).project]){
          const run=saved.histogramRun;
          delete run.phase;
          run.step+=run.count;
          for(const key of ['pending','skipped']){
            run[key]=Object.fromEntries(Object.entries(run[key]).map(([step,value])=>[Number(step)+run.count,value]));
          }
        }
      }
      await load('#projectInput',archive);
      await notice('工程已恢复');
      const restored=await project();
      assert.deepEqual(restored.histogramRun,current.histogramRun);
      assert.deepEqual(restored.histogramBins,current.histogramBins);
      assert.deepEqual(restored.rows,current.rows);
      assert.deepEqual(restored.evidence,current.evidence);
      assert.equal((await snapshot()).tool,'point');
    };
    const measurePoint=(horizontal,bin,value)=>horizontal?clickPixel(80+40*value,400-35*bin):
      clickPixel(80+40*bin,400-35*value);
    const handle=()=>page.inputValue('#histogramField');
    const skip=()=>page.click('#histogramSkip');

    await page.selectOption('#kind','histogram_v_1');
    await exactCalibration();
    await startRun(3);
    assert.equal(await handle(),'bin_startPixel');
    await measurePoint(false,0,0);
    assert.equal(await handle(),'bin_endPixel');
    await measurePoint(false,1,0);
    assert.equal(await handle(),'valuePixel');
    await page.click('#histogramPrevious');
    assert.equal(await handle(),'bin_endPixel');
    await page.click('#histogramRetake');
    await measurePoint(false,1.2,0);
    await measurePoint(false,.5,3);
    assert.equal(await page.locator('#targetProgress').innerText(),'1/3');
    assert.equal(await handle(),'bin_endPixel');
    let rows=(await project()).rows;
    assert.equal(rows[1].bin_start,rows[0].bin_end);
    await restoreProgress();
    await edit(cell(0,'bin_end'),1.25);
    assert.equal((await project()).rows[1].bin_start,1.25);
    await edit(cell(1,'bin_start'),1.54321);
    await edit(cell(0,'bin_end'),1.3);
    assert.equal((await project()).rows[1].bin_start,1.54321);
    await measurePoint(false,2,0);
    await measurePoint(false,1.8,4);
    assert.equal(await handle(),'bin_endPixel');
    await page.selectOption('#histogramField','bin_startPixel');
    await measurePoint(false,2.5,0);
    await measurePoint(false,3,0);
    await measurePoint(false,2.8,5);
    rows=(await project()).rows;
    assert.equal(rows.length,3);
    assert.ok(rows[2].bin_start>rows[1].bin_end);
    assert.equal(await page.locator('#targetProgress').innerText(),'3/3');
    assert.equal((await snapshot()).tool,'select');
    await measurePoint(false,4,6);
    assert.deepEqual((await project()).rows,rows);

    for(const horizontal of [true,false]){
      await page.selectOption('#kind',horizontal?'histogram_h_n':'histogram_v_n');
      await exactCalibration();
      await startRun(3);
      await measurePoint(horizontal,1,0);
      await measurePoint(horizontal,2,0);
      await measurePoint(horizontal,1.5,3);
      assert.equal(await page.locator('#targetProgress').innerText(),'1/3');
      assert.equal(await handle(),'bin_endPixel');
      const inherited=(await project()).rows[1].bin_start;

      await measurePoint(horizontal,2,0);
      await notice('结束边界必须大于起始边界');
      assert.equal((await project()).rows[1].bin_end,null);
      assert.equal(await handle(),'bin_endPixel');

      // An invalid boundary typed in the table must not trap the guide on the value.
      await edit(cell(1,'bin_end'),inherited);
      await page.selectOption('#histogramField','valuePixel');
      await measurePoint(horizontal,2.5,4);
      const value=(await project()).rows[1].value;
      assert.equal(value,4);
      assert.equal(await handle(),'bin_endPixel');
      await edit(cell(1,'bin_end'),'');
      await measurePoint(horizontal,3,0);
      assert.equal(await page.locator('#targetProgress').innerText(),'2/3');
      assert.equal((await project()).rows[1].value,value);
      assert.equal(await handle(),'bin_endPixel');
      await measurePoint(horizontal,4,0);
      await measurePoint(horizontal,3.5,5);
      assert.equal(await page.locator('#targetProgress').innerText(),'3/3');
    }
    console.log('Guided overlap: invalid or coincident boundaries recover and retained values advance both orientations');

    await page.selectOption('#kind','histogram_h_n');
    await exactCalibration();
    for(const [i,key] of (await project()).series.map(s=>s.key).entries()){
      await page.selectOption('#activeSeries',key);
      await startRun(2);
      await measurePoint(true,i,0);
      await measurePoint(true,2+i,0);
      await measurePoint(true,1+i,3);
      assert.equal(await handle(),'bin_endPixel');
      await measurePoint(true,4+i,0);
      await measurePoint(true,3+i,4);
    }
    rows=(await project()).rows;
    assert.deepEqual(rows.map(r=>r.series),['Series 1','Series 1','Series 2','Series 2']);
    assert.equal(rows[1].bin_start,rows[0].bin_end);
    assert.equal(rows[3].bin_start,rows[2].bin_end);
    assert.notEqual(rows[0].bin_start,rows[2].bin_start);
    await page.click('#addSeries');
    const manualSeries=(await project()).series.at(-1);
    await page.selectOption('#activeSeries',manualSeries.key);
    await page.locator('#tableBody [data-row="0"] td').first().click();
    assert.equal(await page.inputValue('#activeSeries'),manualSeries.key);
    await page.click('#histogramManualRow');
    await measurePoint(true,6,0);
    await measurePoint(true,7,0);
    await measurePoint(true,6.5,3);
    rows=(await project()).rows;
    assert.equal(rows.length,5);
    assert.equal(rows.at(-1).series,manualSeries.name);
    assert.ok(Number.isFinite(rows.at(-1).value));
    console.log('Guided ordinary histograms: bin count, previous point, inherited boundaries, restore and per-series runs');

    for(const horizontal of [false,true]){
      await page.selectOption('#kind','histogram_'+(horizontal?'h':'v')+'_stack');
      await exactCalibration();
      await page.fill('#histogramSeriesCount','3');
      await page.click('#histogramApplySeries');
      for(const [i,name] of ['S1','S2','S3'].entries()){
        await edit(`#seriesList [data-series="${i}"][data-prop="name"]`,name);
      }
      await page.click('[data-move-series="2"][data-delta="-1"]');
      assert.deepEqual((await project()).series.map(s=>[s.name,s.stackOrder]),[['S1',0],['S3',1],['S2',2]]);
      await startRun(3);
      assert.equal(await page.locator('[data-move-series="2"][data-delta="-1"]').isDisabled(),false);
      assert.equal(await page.locator('#histogramStartSeries').isDisabled(),true);
      await measurePoint(horizontal,0,0);
      await measurePoint(horizontal,1,0);
      assert.equal(await handle(),'bin_endPixel');
      if(!horizontal)await restoreProgress();
      await edit('#histogramBinsBody [data-bin="1"][data-field="bin_start"]',1.25);
      await measurePoint(horizontal,2,0);
      assert.equal(await handle(),'bin_endPixel');
      await measurePoint(horizontal,3,0);
      const shared=(await project()).histogramBins;
      assert.equal(shared[1].bin_start,1.25);
      assert.equal(shared[2].bin_start,shared[1].bin_end);
      assert.equal((await project()).rows.length,0);
      assert.equal((await snapshot()).tool,'select');
      assert.equal((await project()).histogramRun.phase,'bounds');
      await page.click('#histogramStartSeries');
      assert.equal((await project()).histogramRun.phase,'segment');
      assert.equal(await page.locator('[data-move-series="2"][data-delta="-1"]').isDisabled(),true);
      assert.equal(await handle(),'valueStartPixel');

      await measurePoint(horizontal,.5,0);
      await restoreProgress(horizontal);
      assert.equal(await handle(),'valueEndPixel');
      await measurePoint(horizontal,.5,-.5);
      await notice('高度不能为负数');
      assert.equal((await project()).rows.length,0);
      await measurePoint(horizontal,.5,2);
      await measurePoint(horizontal,1.5,0);
      await skip();
      await skip();
      assert.match(await page.locator('#targetHint').innerText(),/S3.*第 1 箱/);
      await skip();
      if(horizontal)await skip();
      else await edit('#histogramSegmentValue',4.123456);
      await skip();
      assert.match(await page.locator('#targetHint').innerText(),/S2.*第 1 箱/);
      await measurePoint(horizontal,.5,2);
      await measurePoint(horizontal,.5,6);
      await skip();
      await edit('#histogramSegmentValue',5.123456);
      assert.equal(await page.locator('#targetProgress').innerText(),'3/3');
      assert.equal((await snapshot()).tool,'select');

      const final=await project();
      assert.equal(final.rows.length,horizontal?3:4);
      for(const [i,row] of final.rows.entries()){
        const bin=shared.find(b=>b.key===row._histogramBin);
        assert.deepEqual([row.bin_start,row.bin_end],[bin.bin_start,bin.bin_end]);
        const ev=final.evidence[i],axis=horizontal?'x':'y';
        if(ev.valueEndPixel)assert.equal(row.value,rounded(at(final.axes[axis],ev.valueEndPixel[axis])-
          at(final.axes[axis],ev.valueStartPixel[axis])));
      }
      await page.waitForFunction(count=>{
        const state=window.chartStudio.snapshot();
        return state.renderOk&&state.lastSpec?.data.values.length===count;
      },final.rows.length);
      const gt=(await snapshot()).lastSpec;
      assert.deepEqual(gt.data.values.map(r=>r.stack_order),horizontal?[0,2,2]:[0,1,2,2]);
      assert.deepEqual(Object.keys(gt.data.values[0]),['bin_start','bin_end','value','stack_order','series']);
      assert.equal(gt.encoding[horizontal?'x':'y'].stack,'zero');
      assert.equal(await page.locator('#issues .error').count(),0);
      const marks=await page.locator('#preview [aria-roledescription="bar"]').evaluateAll(nodes=>
        nodes.map(node=>{const {x,y,width,height}=node.getBBox();return {x,y,width,height};}));
      assert.equal(marks.length,final.rows.length);
      const binAxis=horizontal?'y':'x',valueAxis=horizontal?'x':'y',size=horizontal?'width':'height';
      const firstBin=marks.filter(mark=>mark[binAxis]===marks[0][binAxis]).sort((a,b)=>a[valueAxis]-b[valueAxis]);
      const thirdBin=marks.at(-1);
      assert.equal(firstBin.length,2);
      assert.ok(Math.abs(firstBin[0][valueAxis]+firstBin[0][size]-firstBin[1][valueAxis])<.01);
      const baseline=mark=>horizontal?mark.x:mark.y+mark.height;
      assert.ok(Math.abs(baseline(horizontal?firstBin[0]:firstBin[1])-baseline(thirdBin))<.01);
      const stillManual=final.rows.at(-1).value;
      await edit(tick(horizontal?'x':'y',2),horizontal?18:15);
      assert.equal((await project()).rows.at(-1).value,stillManual);
      const updated=await project();
      assert.notEqual(updated.rows[0].value,final.rows[0].value);
      await edit('#histogramBinsBody [data-bin="0"][data-field="bin_end"]',1.125);
      assert.ok((await project()).rows.filter(row=>row._histogramBin===shared[0].key).every(row=>row.bin_end===1.125));
      const complete=await project();
      await load('#projectInput',JSON.parse(await download('#saveProject')));
      assert.deepEqual((await project()).histogramRun,complete.histogramRun);
      const expected={...gt,data:{values:complete.rows.map(({bin_start,bin_end,value,series,_seriesKey})=>({
        bin_start,bin_end,value,stack_order:complete.series.find(s=>s.key===_seriesKey).stackOrder,series
      }))}};
      await waitGT(expected);
      await page.check('#reviewed');
      assert.deepEqual(JSON.parse(await download('#exportGT')),expected);
      await load('#specInput',expected);
      await waitGT(expected);
    }
    console.log('Guided stacks: independent boundary and series runs, sparse groups, calibrated differences and exact GT');
    assert.deepEqual(errors,[]);
    console.log('Manual stacks: add, edit, measure, assign and remove bins, isolated segment measurements and legacy restore');
  }finally{await browser.close();}
}

run().catch(error=>{console.error(error);process.exitCode=1;});
