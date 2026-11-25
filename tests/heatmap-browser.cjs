const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const {measurement}=require('./precision-reference.cjs');
const examples=require('../example.json');
for(const gt of Object.values(examples))gt.usermeta={table_export:{tables:[{id:'data',path:'/data/values'}]}};

const root=path.resolve(__dirname,'..');
const plot={x:[55,343],y:[40,244]};
const colors=[[18,66,185],[238,237,215],[198,36,44]];
const entries=gt=>gt.data.values;
const idIndex=id=>Number(id.slice(1))-1;
const cellIndex=(row,width)=>idIndex(row.y_id)*width+idIndex(row.x_id);
const palette=(position,diverging)=>{
  const steps=diverging?colors:[[35,20,85],[235,215,55]];
  const k=Math.min(steps.length-2,Math.floor(position*(steps.length-1)));
  const t=position*(steps.length-1)-k;
  return steps[k].map((component,i)=>Math.round(component*(1-t)+steps[k+1][i]*t));
};

async function sourceImage(page,gt,{vertical=false,reverse=false,diverging=false,centerOutlier=false,override={}}={}){
  const boundaries=Object.fromEntries(['x','y'].map(axis=>{
    const [start,end]=plot[axis],rows=entries(gt);
    const count=Math.max(...rows.map(r=>idIndex(r[axis+'_id'])))+1;
    if(gt.encoding[axis].type!=='quantitative')return [axis,Array.from({length:count+1},(_,i)=>start+(end-start)*i/count)];
    const values=rows.flatMap(r=>[r[axis],r[axis+'2']]);
    const min=Math.min(...values),max=Math.max(...values);
    const coords=[...new Set(values)].sort((a,b)=>axis==='x'?a-b:b-a);
    return [axis,coords.map(n=>start+(end-start)*(axis==='x'?n-min:max-n)/(max-min))];
  }));
  const values=entries(gt).map(r=>r.value).filter(Number.isFinite);
  const min=Math.min(...values),max=Math.max(...values),padding=(max-min)*.12||1;
  const ends=[min-padding,max+padding];
  if(reverse)ends.reverse();
  const anchors=diverging?[ends[0],min+.36*(max-min),ends[1]]:ends;
  const tFor=value=>{
    const middle=anchors[1],k=anchors.length===3&&(reverse?value<middle:value>middle)?1:0;
    return (k+(value-anchors[k])/(anchors[k+1]-anchors[k]))/(anchors.length-1);
  };
  const legend=vertical?{x:401,y:40,length:220}:{x:55,y:295,length:288};
  const cells=entries(gt).map(row=>{
    const column=idIndex(row.x_id),line=idIndex(row.y_id);
    const key=cellIndex(row,boundaries.x.length-1);
    return {x:boundaries.x.slice(column,column+2),y:boundaries.y.slice(line,line+2),
      rgb:override[key]??(row.value===null?[230,230,230]:palette(tFor(row.value),diverging))};
  });
  const ramp=Array.from({length:legend.length+1},(_,i)=>palette(i/legend.length,diverging));
  const url=await page.evaluate(({legend,vertical,ramp,cells,centerOutlier})=>{
    const canvas=document.createElement('canvas');
    canvas.width=442;canvas.height=344;
    const c=canvas.getContext('2d');
    c.fillStyle='#fff';c.fillRect(0,0,canvas.width,canvas.height);
    for(const {x,y,rgb} of cells){
      const w=x[1]-x[0],h=y[1]-y[0],cx=x[0]+w/2,cy=y[0]+h/2;
      c.fillStyle='rgb('+rgb.join(',')+')';
      c.fillRect(x[0],y[0],w,h);
      c.strokeStyle='#101010';c.lineWidth=2;
      c.strokeRect(x[0],y[0],w,h);
      if(centerOutlier){
        c.fillStyle='#14eb37';c.fillRect(cx-w*.22,cy-h*.22,w*.44,h*.44);
      }else{
        c.fillStyle='#101010';c.font='20px sans-serif';c.fillText('1.23',cx-12,cy+5);
      }
    }
    ramp.forEach((rgb,i)=>{
      c.fillStyle='rgb('+rgb.join(',')+')';
      c.fillRect(legend.x+(vertical?0:i),legend.y+(vertical?i:0),vertical?13:1,vertical?1:13);
    });
    return canvas.toDataURL();
  },{legend,vertical,ramp,cells,centerOutlier});
  const anchorPoints=anchors.map((value,i)=>{
    const offset=legend.length*i/(anchors.length-1);
    return {value,x:legend.x+(vertical?6:offset),y:legend.y+(vertical?offset:6)};
  });
  return {buffer:Buffer.from(url.split(',')[1],'base64'),boundaries,anchors:[anchorPoints[0],anchorPoints.at(-1),...anchorPoints.slice(1,-1)]};
}

async function run(){
  const browser=await chromium.launch({headless:true,channel:process.env.STUDIO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)});
  try{
    const page=await browser.newPage({acceptDownloads:true,viewport:{width:1650,height:1100},deviceScaleFactor:1.25});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.waitForFunction(()=>!!window.chartStudio);
    const snapshot=()=>page.evaluate(()=>window.chartStudio.snapshot());
    const project=async()=>(await snapshot()).project;
    const load=async(selector,buffer,name)=>{
      await page.locator(selector).setInputFiles({name,mimeType:name.endsWith('.png')?'image/png':'application/json',buffer});
      await page.waitForFunction(id=>document.querySelector(id).value==='',selector);
    };
    const loadJSON=(selector,data)=>load(selector,Buffer.from(JSON.stringify(data)),'heatmap.json');
    const waitGT=gt=>page.waitForFunction(expected=>{
      const s=window.chartStudio.snapshot();
      return s.renderOk&&JSON.stringify(s.lastSpec)===expected;
    },JSON.stringify(gt));
    const waitText=(selector,pattern)=>page.waitForFunction(({selector,pattern})=>
      new RegExp(pattern).test(document.querySelector(selector).textContent),{selector,pattern});
    const waitIssue=pattern=>waitText('#issues',pattern);
    const edit=async(selector,value)=>{
      await page.locator(selector).fill(String(value));
      await page.locator(selector).press('Tab');
    };
    const cell=i=>'[data-heatmap-cell="'+i+'"]';
    const focus=i=>page.locator(cell(i)).focus();
    const record=async i=>{
      const p=await project(),x=p.heatmap.x[i%p.heatmap.x.length].key,y=p.heatmap.y[Math.floor(i/p.heatmap.x.length)].key;
      const j=p.rows.findIndex(r=>r._xKey===x&&r._yKey===y);
      return {row:p.rows[j],evidence:p.evidence?.[j]};
    };
    const clickPixel=async(x,y)=>{
      const canvas=page.locator('#canvas');
      await canvas.scrollIntoViewIfNeeded();
      const rect=await canvas.boundingBox(),size=(await snapshot()).imageSize;
      await page.mouse.click(rect.x+x*rect.width/size.width,rect.y+y*rect.height/size.height);
    };
    const locate=async(source,gt)=>{
      await page.click('#heatmapCorners');
      await clickPixel(plot.x[0],plot.y[0]);await clickPixel(plot.x[1],plot.y[1]);
      const columns=source.boundaries.x.length-1,rows=source.boundaries.y.length-1;
      await waitText('#heatmapGridStatus','已定位 '+columns+' / '+columns+' 列、'+rows+' / '+rows+' 行');
      await clickPixel(plot.x[1]-10,plot.y[1]-10);
      assert.equal((await snapshot()).selected,columns*rows-1,'all pixel cells are selectable after picking two corners');
      for(const axis of ['x','y'].filter(axis=>gt.encoding[axis].type==='quantitative')){
        await page.selectOption('#heatmapBoundaryAxis',axis);
        await page.selectOption('#heatmapBoundaryIndex','1');
        await page.click('#heatmapBoundary');
        for(const v of source.boundaries[axis].slice(1,-1))
          await clickPixel(axis==='x'?v:plot.x[0]+5,axis==='y'?v:plot.y[0]+5);
      }
      for(const [i,q] of source.anchors.entries()){
        await page.click('#heatmapColorPoint');
        await clickPixel(q.x+.15,q.y+.15);
        await edit('[data-hm-color="'+i+'"]',q.value);
      }
    };
    const download=async selector=>{
      const pending=page.waitForEvent('download');
      await page.click(selector);
      return fs.readFile(await (await pending).path());
    };
    const visual=()=>page.locator('#preview [aria-roledescription="rect mark"]').evaluateAll(nodes=>
      nodes.map(node=>{
        const {x,y,width,height}=node.getBBox();
        return {x,y,width,height,label:node.getAttribute('aria-label'),fill:node.getAttribute('fill')};
      }));
    async function exportGT(gt){
      await page.check('#reviewed');
      assert.deepEqual(JSON.parse(await download('#exportGT')),gt);
    }

    for(const [i,[name,gt]] of Object.entries(examples).entries()){
      const centerOutlier=name==='continuous_bins';
      const source=await sourceImage(page,gt,{vertical:i%2===1,reverse:i%3===1,diverging:i%3===2,centerOutlier});
      await load('#imageInput',source.buffer,name+'.png');
      if(i===0){
        await page.selectOption('#family','heatmap');
        assert.equal((await project()).kind,'heatmap_dd');
      }
      await loadJSON('#specInput',gt);
      await waitGT(gt);
      await exportGT(gt);
      const width=source.boundaries.x.length-1;
      const marks=await visual(),missing=entries(gt).filter(r=>r.value===null);
      assert.equal(marks.length,entries(gt).length,name);
      assert.equal(marks.filter(m=>m.fill==='#d8dee5').length,missing.length,name);
      assert.ok(marks.every(m=>!/[XY]\d+/.test(m.label)),JSON.stringify(marks));
      const axes=await page.locator('#preview [aria-roledescription="axis"]').evaluateAll(nodes=>nodes.map(n=>({
        title:n.getAttribute('aria-label'),labels:[...n.querySelectorAll('g.role-axis-label text')].map(el=>el.textContent)
      })));
      for(const axis of ['x','y'].filter(axis=>gt.encoding[axis].type==='ordinal')){
        const labels=[...new Map(entries(gt).map(r=>[r[axis+'_id'],r[axis]])).entries()].sort(([a],[b])=>idIndex(a)-idIndex(b)).map(([,label])=>label);
        assert.ok(axes.some(a=>JSON.stringify(a.labels)===JSON.stringify(labels)),JSON.stringify(axes));
      }
      if(name==='continuous_bins'){
        assert.ok(marks[1].width>2*marks[0].width,'unequal X bins render to scale');
        assert.ok(marks[0].height>1.9*marks[2].height,'unequal Y bins render to scale');
        assert.ok(marks[0].y<marks[2].y,'Y1 appears above Y2');
      }
      await locate(source,gt);
      const finite=entries(gt).filter(r=>r.value!==null);
      const first=cellIndex(finite[0],width),second=cellIndex(finite[1],width);
      await edit(cell(first),'');
      await edit(cell(second),'');
      for(let j=0;j<(source.boundaries.y.length-1)*width;j++){
        if(!entries(gt).some(r=>cellIndex(r,width)===j)){
          await focus(j);await page.click('#heatmapOmit');
        }
      }
      await focus(first);
      await page.click('#heatmapMeasureCell');
      const single=await record(first);
      assert.equal(single.evidence.source,'heatmap_color',name);
      assert.equal(single.evidence.warning,'',name+': '+JSON.stringify(single.evidence));
      assert.ok(Math.abs(single.row.value-finite[0].value)<(name==='confusion_matrix'?1.25:.065),JSON.stringify(single));
      assert.equal(Number(await page.locator(cell(first)).inputValue()),(await record(first)).row.value);
      assert.ok(Number.isFinite((await record(first)).row.value));
      await page.click('#heatmapMeasureBatch');
      const batch=await record(second);
      assert.equal(batch.evidence.warning,'',name+': '+JSON.stringify(batch.evidence));
      assert.ok(Math.abs(batch.row.value-finite[1].value)<(name==='confusion_matrix'?1.25:.065),JSON.stringify(batch));
      assert.ok(batch.evidence.legendPixel&&batch.evidence.bounds&&batch.evidence.samples>1,name);
      if(centerOutlier){
        for(const {evidence} of [single,batch]){
          assert.equal(evidence.samples,49);
          for(const axis of ['x','y']){
            const [lo,hi]=evidence.bounds[axis];
            assert.equal(evidence.pixel[axis],Math.floor(lo+.12*(hi-lo)),'use the first pixel of the dominant color');
          }
        }
      }
      for(const row of missing)assert.equal((await record(cellIndex(row,width))).row.value,null,name);
      await page.click('#undo');
      assert.equal((await record(second)).row,undefined);
      await page.click('#redo');
      assert.deepEqual(await record(second),batch);
      await edit(cell(first),finite[0].value);
      await edit(cell(second),finite[1].value);
      await waitGT(gt);
      await exportGT(gt);
      console.log('PASS heatmap fixture:',name);
    }

    const source=await sourceImage(page,examples.discrete,{override:{0:[20,235,55]}});
    await load('#imageInput',source.buffer,'manual.png');
    assert.deepEqual(await page.locator('#family option').allTextContents(),
      ['柱线复合图','柱状图','折线图','散点图','热力图','直方图','面积图','饼图','箱线图']);
    await page.selectOption('#kind','heatmap_cc');
    assert.equal(await page.locator('#kind option').count(),4);
    await page.selectOption('#kind','heatmap_dd');
    await page.fill('#heatmapColumns','2');await page.fill('#heatmapRows','2');await page.click('#heatmapResize');
    for(const [axis,labels] of [['x','Jan\nJan'],['y','Week 1\nWeek 2']]){
      const bulk=page.locator('#heatmapAxes section').filter({has:page.locator('[data-hm-names="'+axis+'"]')}).locator('details');
      await bulk.locator('summary').click();
      await bulk.locator('textarea').fill(labels);
      await bulk.locator('button').click();
    }
    await page.locator('#heatmapCellControls details summary').click();
    await page.fill('#heatmapPaste','0\t-0.123456789\nnull\t');
    await page.click('#heatmapApplyPaste');
    assert.equal((await record(0)).row.value,0);
    assert.equal((await record(1)).row.value,-.123456789);
    assert.equal((await record(2)).row.value,null);
    assert.equal((await record(3)).row,undefined);
    await page.locator(cell(3)).evaluate(input=>{
      const data=new DataTransfer();
      data.setData('text/plain','0.31234567\t-2');
      input.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));
    });
    assert.equal(await page.locator(cell(4)).count(),1,await page.locator('#toast').textContent());
    assert.equal((await record(4)).row.value,.31234567);
    await waitIssue('未填写原始标签');
    await page.click('#undo');
    const columns=(await project()).heatmap.x;
    await page.click('[data-hm-axis="x"][data-hm-index="0"][data-hm-action="next"]');
    assert.deepEqual((await project()).heatmap.x,[...columns].reverse());
    assert.equal((await record(0)).row.value,-.123456789);
    await page.click('[data-hm-axis="x"][data-hm-index="1"][data-hm-action="delete"]');
    assert.equal((await project()).heatmap.x.length,1);
    await page.click('#undo');await page.click('#undo');
    assert.deepEqual((await project()).heatmap.x,columns);
    await page.locator(cell(0)).fill('0.123456789012');
    await page.locator(cell(0)).press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('data-heatmap-cell'),'1');
    assert.equal((await record(0)).row.value,.123456789012);
    await page.locator(cell(1)).fill('1foo');
    await page.locator(cell(1)).press('Enter');
    assert.equal(await page.locator(':focus').getAttribute('data-heatmap-cell'),'1');
    assert.equal((await record(1)).row.value,-.123456789);

    await locate(source,examples.discrete);
    await focus(0);await page.click('#heatmapClearCell');
    await page.click('[data-tool="heatmap-measure"]');
    await clickPixel(100,100);
    assert.equal((await record(0)).row.value,undefined);
    await waitIssue('估值待核对');
    assert.match((await record(0)).evidence.warning,/偏离色标/);
    assert.ok(await page.locator('#heatmapAcceptEstimate').isVisible());
    await page.click('#heatmapAcceptEstimate');
    assert.ok((await record(0)).evidence.accepted);
    await page.click('#undo');
    await edit(cell(0),'0.9999999999');
    assert.equal((await record(0)).row.value,.9999999999);
    assert.ok((await record(0)).evidence.measurement.pixel);
    await page.waitForFunction(()=>window.chartStudio.snapshot().lastSpec?.data.values[0].value===.9999999999);
    await page.check('#reviewed');
    const backup=JSON.parse(await download('#saveProject'));
    await loadJSON('#projectInput',backup);
    assert.deepEqual(await project(),backup.current.project);
    const zip=await download('#batchExport');
    const files=new Map();
    for(let at=0;zip.readUInt32LE(at)===0x04034b50;){
      const size=zip.readUInt32LE(at+18),nameLength=zip.readUInt16LE(at+26),start=at+30+nameLength+zip.readUInt16LE(at+28);
      const name=zip.toString('utf8',at+30,at+30+nameLength),content=zip.toString('utf8',start,start+size);
      files.set(name,name.endsWith('.json')?JSON.parse(content):content);
      at=start+size;
    }
    assert.equal(files.get('export-report.json').exported,8);
    for(const [name,gt] of Object.entries(examples))
      assert.deepEqual(files.get('gt/'+name+'.gt.json'),gt);
    assert.equal(files.get('gt/manual.gt.json').data.values[0].value,.9999999999);
    assert.ok(!zip.includes(Buffer.from('legendPixel')));
    console.log('PASS matrix entry, sparse cells, independent IDs, review, project recovery and ZIP');

    await page.selectOption('#kind','heatmap_cc');
    await page.fill('#heatmapColumns','2');await page.fill('#heatmapRows','2');await page.click('#heatmapResize');
    await page.locator('[data-tool="calibrate"]').click();
    for(const [axis,ticks] of [['x',[[55,260,0],[343,260,12]]],['y',[[35,40,20],[35,244,0]]]]){
      for(const [i,[x,y,value]] of ticks.entries()){
        await page.click('[data-tick="'+axis+(i+1)+'"]');
        await clickPixel(x,y);
        await edit('[data-axis="'+axis+'"][data-field="v'+(i+1)+'"]',value);
      }
    }
    await page.click('#heatmapCorners');
    await clickPixel(plot.x[0],plot.y[0]);await clickPixel(plot.x[1],plot.y[1]);
    // Locate the two internal shared boundaries. Both adjacent bins reference each picked pixel.
    for(const [axis,v] of [['x',127],['y',142]]){
      await page.selectOption('#heatmapBoundaryAxis',axis);
      await page.selectOption('#heatmapBoundaryIndex','1');
      await page.click('#heatmapBoundary');
      await clickPixel(axis==='x'?v:60,axis==='y'?v:45);
    }
    await page.fill('#heatmapPaste','0,1\n2,3');await page.click('#heatmapApplyPaste');
    await page.waitForFunction(()=>window.chartStudio.snapshot().lastSpec?.encoding.x2);
    const gt=(await snapshot()).lastSpec;
    const [a,b,c]=entries(gt);
    assert.equal(a.x2,b.x);
    assert.equal(a.y,c.y2);
    assert.ok(Math.abs(a.x2-3)<.05&&Math.abs(a.y-10)<.06);
    const xEnd='[data-axis="x"][data-field="v2"]';
    await edit(xEnd,24.123456);
    await page.waitForFunction(()=>window.chartStudio.snapshot().lastSpec?.data.values[0].x2>5.9);
    const calibrated=(await snapshot()).lastSpec;
    const {axes,heatmap}=await project(),{p1,p2,v1,v2}=axes.x;
    const rounded=String(measurement(heatmap.pixels.x[1],axes.x));
    assert.equal(entries(calibrated)[0].x2,Number(rounded));
    assert.equal(entries(calibrated)[1].x,Number(rounded));
    assert.equal(await page.inputValue('[data-hm-axis="x"][data-hm-index="0"][data-hm-field="end"]'),rounded);
    assert.equal(await page.inputValue('[data-hm-axis="y"][data-hm-index="0"][data-hm-field="end"]'),String(entries(calibrated)[0].y2));
    assert.ok(!JSON.stringify(calibrated).includes('calibrated'));
    await edit(xEnd,.004);
    await page.waitForFunction(()=>chartStudio.snapshot().lastSpec?.data.values[0].x2>0&&chartStudio.snapshot().lastSpec.data.values[0].x2<.004);
    const small=(await snapshot()).lastSpec.data.values;assert(small[0].x2>small[0].x&&small[1].x2>small[1].x);
    await edit('[data-axis="x"][data-field="v1"]',10000);await edit(xEnd,10000.004);
    await waitIssue('当前图像精度下起止值相同');
    await edit('[data-axis="x"][data-field="v1"]',v1);await edit(xEnd,24.123456);
    const manualStart='[data-hm-axis="x"][data-hm-index="0"][data-hm-field="start"]';
    await edit(manualStart,-.123456789);
    await page.waitForFunction(()=>window.chartStudio.snapshot().lastSpec?.data.values[0].x===-.123456789);
    assert.equal(await page.inputValue(manualStart),'-0.123456789');
    console.log('PASS rounded shared boundaries, manual precision and numeric recalibration');

    const cellFocus=async(index)=>{
      assert.equal((await snapshot()).selected,index);
      assert.equal(await page.locator(':focus').getAttribute('data-heatmap-cell'),String(index));
    };
    const coordinate=(axis,i)=>'[data-axis="'+axis+'"][data-field="v'+i+'"]';
    for(const kind of ['heatmap_dd','heatmap_cc','heatmap_dc','heatmap_cd']){
      await page.selectOption('#kind',kind);
      await page.fill('#heatmapColumns','2');await page.fill('#heatmapRows','2');await page.click('#heatmapResize');
      await page.click('#heatmapCorners');
      await clickPixel(plot.x[0],plot.y[0]);await clickPixel(plot.x[1],plot.y[1]);
      await waitText('#heatmapGridStatus','已定位 2 / 2 列、2 / 2 行');
      await clickPixel(plot.x[1]-10,plot.y[1]-10);
      assert.equal((await snapshot()).selected,3);
      await page.locator('#canvas').press('ArrowUp');
      assert.equal((await snapshot()).selected,1);
      await page.locator(cell(0)).fill('0.123456789012');
      await page.locator(cell(0)).press('ArrowDown');await cellFocus(2);
      assert.equal((await record(0)).row.value,.123456789012);
      await page.locator(cell(2)).press('ArrowLeft');await cellFocus(2);
      await page.locator(cell(2)).press('ArrowRight');await cellFocus(3);
      await page.locator(cell(3)).press('ArrowDown');await cellFocus(3);
      await page.locator(cell(3)).press('ArrowUp');await cellFocus(1);
      await page.locator(cell(1)).press('ArrowRight');await cellFocus(1);
      await page.locator(cell(1)).press('ArrowLeft');await cellFocus(0);
      await page.locator(cell(0)).press('ArrowUp');await cellFocus(0);

      const axes=await page.locator('#axisFields [data-field="v1"]').evaluateAll(inputs=>inputs.map(input=>input.dataset.axis));
      for(const axis of ['x','y']){
        if(axes.includes(axis)){
          const start=page.locator('[data-hm-axis="'+axis+'"][data-hm-index="0"][data-hm-field="start"]');
          assert.equal(await start.inputValue(),'','pixel locations alone do not create scientific values');
          const reference=axis==='x'?[0,12]:[20,0];
          await edit(coordinate(axis,1),reference[0]);await edit(coordinate(axis,2),reference[1]);
          assert.equal(await start.inputValue(),axis==='x'?'0':'10');
          assert.equal(await page.locator('[data-axis-status="'+axis+'"]').textContent(),'已校准');
        }else{
          for(let i=0;i<2;i++)await edit('[data-hm-axis="'+axis+'"][data-hm-index="'+i+'"][data-hm-field="label"]',axis+i);
        }
      }
      await page.fill('#heatmapPaste','0,1\n2,3');await page.click('#heatmapApplyPaste');
      await page.waitForFunction(()=>window.chartStudio.snapshot().renderOk&&window.chartStudio.snapshot().lastSpec.data.values.length===4);
      for(const axis of axes){
        const records=entries((await snapshot()).lastSpec);
        const [first,second]=[records[0],records[axis==='x'?1:2]];
        assert.equal(axis==='x'?first.x2:first.y,axis==='x'?second.x:second.y2);
        await page.selectOption('#heatmapBoundaryAxis',axis);
        await page.selectOption('#heatmapBoundaryIndex','1');
        await page.click('#heatmapBoundary');
        await clickPixel(axis==='x'?127:60,axis==='y'?91:45);
        await page.waitForFunction(axis=>{
          const row=window.chartStudio.snapshot().lastSpec?.data.values[0];
          return axis==='x'?row?.x2<4:row?.y>14;
        },axis);
        const updated=entries((await snapshot()).lastSpec);
        assert.equal(axis==='x'?updated[0].x2:updated[0].y,axis==='x'?updated[1].x:updated[2].y2);
        assert.ok(Math.abs((axis==='x'?updated[0].x2:updated[0].y)-(axis==='x'?3:15))<.1);
      }
    }
    console.log('PASS four-way matrix navigation and corner-based grids in all four modes');

    const nullOnly={data:{values:[{x:'A: "A"',x_id:'X2',y:'B',y_id:'Y1',value:null}]},
      mark:{type:'rect'},encoding:structuredClone(examples.discrete.encoding)};
    nullOnly.usermeta={table_export:{tables:[{id:'data',path:'/data/values'}]}};
    const decorated=structuredClone(nullOnly);
    decorated.mark.stroke='#aabbcc';
    decorated.encoding.x.axis={labelAngle:90};
    decorated.encoding.color.scale={scheme:'reds'};
    await loadJSON('#specInput',decorated);
    await waitGT(nullOnly);
    const missingMarks=await visual();
    assert.equal(missingMarks.length,1);
    assert.equal(missingMarks[0].fill,'#d8dee5');
    assert.ok(missingMarks[0].x>100,'leading omitted position retains its visual slot');
    assert.match(missingMarks[0].label,/A: "A"/);
    assert.equal(await page.locator('#preview [aria-roledescription="legend"]').count(),0);
    const invalid=structuredClone(examples.duplicate_labels);
    invalid.data.values[2].x='conflicting label';
    await loadJSON('#specInput',invalid);
    await waitText('#toast','对应的原始标签或区间不一致');
    await waitGT(nullOnly);
    assert.deepEqual(errors,[]);
    console.log('PASS null-only preview, sparse ID gap, stripped visuals and conflicting import rejection');
  }finally{await browser.close();}
}

run().catch(error=>{console.error(error);process.exitCode=1;});
