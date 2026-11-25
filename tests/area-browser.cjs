const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const samples=require('./fixtures/area-nominal.json');
const {measurement}=require('./precision-reference.cjs');

const root=path.resolve(__dirname,'..');
const linearValue=(pixel,axis)=>axis.v1+(pixel-axis.p1)/(axis.p2-axis.p1)*(axis.v2-axis.v1);
const measuredFields=[['y','pixel'],['baseline','baselinePixel']];

function assertMeasurementPrecision(project){
  let hadExtraDecimals=false;
  for(const [i,row] of project.rows.entries()){
    for(const [field,handle] of measuredFields){
      const original=linearValue(project.evidence[i][handle].y,project.axes.y);
      assert.equal(row[field],measurement(project.evidence[i][handle].y,project.axes.y));
      hadExtraDecimals||=row[field]!==original;
    }
  }
  assert.ok(hadExtraDecimals);
}

async function run(){
  const browser=await chromium.launch({
    headless:true,channel:process.env.STUDIO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)
  });
  try{
    const page=await browser.newPage({acceptDownloads:true,viewport:{width:1600,height:1100}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.waitForFunction(()=>!!window.chartStudio);
    const snapshot=()=>page.evaluate(()=>window.chartStudio.snapshot());
    const load=(selector,data)=>page.locator(selector).setInputFiles({
      name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))
    });
    const waitGT=gt=>page.waitForFunction(expected=>{
      const state=window.chartStudio.snapshot();
      return state.renderOk&&JSON.stringify(state.lastSpec)===expected;
    },JSON.stringify(gt),{timeout:5000});
    const download=async selector=>{
      const pending=page.waitForEvent('download');
      await page.click(selector);
      return JSON.parse(await fs.readFile(await (await pending).path(),'utf8'));
    };
    const numeric={};
    for(const [name,nominal] of Object.entries(samples)){
      const input=JSON.parse(await fs.readFile(path.join(root,name+' Area.json'),'utf8'));
      numeric[name]=structuredClone(input);
      if(numeric[name].encoding.order)delete numeric[name].encoding.order.sort;
      for(const gt of [nominal,numeric[name]])gt.usermeta={table_export:{tables:[{id:'data',path:'/data/values'}]}};
      for(const [mode,source,gt] of [['nominal',nominal,nominal],['quantitative',input,numeric[name]]]){
        await load('#specInput',source);
        await waitGT(gt);
        assert.equal(await page.inputValue('#xType'),mode);
        assert.equal(await page.locator('[data-tick="x1"]').count(),mode==='nominal'?0:1);
        assert.ok(await page.locator('#preview [aria-roledescription="area mark"]').count());
        await page.check('#reviewed');
        assert.deepEqual(await download('#exportGT'),gt);
      }
      console.log(name+' area: Nominal and Quantitative GT import, SVG and download');
    }

    await page.click('#demo');
    await page.waitForFunction(()=>window.chartStudio.snapshot().imageSize!==null);
    await load('#specInput',numeric.Stacked);
    await waitGT(numeric.Stacked);
    await page.selectOption('#xType','nominal');
    assert.equal((await snapshot()).project.rows.length,0);
    await page.click('#categoryBulk summary');
    await page.fill('#categories','2024\n2021');
    await page.click('#applyCategoryNames');
    assert.deepEqual((await snapshot()).project.categories,['2024','2021']);
    await page.click('[data-tool="calibrate"]');
    const clickPixel=async(x,y)=>{
      const canvas=page.locator('#canvas');
      await canvas.scrollIntoViewIfNeeded();
      const rect=await canvas.boundingBox();
      const image=(await snapshot()).imageSize;
      await page.mouse.click(rect.x+x*rect.width/image.width,rect.y+y*rect.height/image.height);
    };
    await page.click('[data-tick="y1"]');
    await clickPixel(80,400);
    await page.click('[data-tick="y2"]');
    await clickPixel(80,50);
    assert.equal((await snapshot()).project.axes.x.calibrated,false);
    await page.click('#pickCategory');
    await clickPixel(180,400);
    await clickPixel(190,330);
    assert.match(await page.locator('#targetHint').innerText(),/取下界/);
    const partial=await download('#saveProject');
    await load('#projectInput',partial);
    await page.waitForFunction(()=>document.getElementById('toast').textContent==='工程已恢复');
    await page.click('[data-tool="point"]');
    await clickPixel(270,365);
    await clickPixel(190,260);
    await clickPixel(270,330);
    await page.click('#pickCategory');
    await clickPixel(390,400);
    await clickPixel(400,312.5);
    await clickPixel(490,358);
    await clickPixel(400,242.5);
    await clickPixel(490,312.5);
    await page.waitForFunction(()=>window.chartStudio.snapshot().renderOk);

    const measuredBeforeEdit=(await snapshot()).project;
    assertMeasurementPrecision(measuredBeforeEdit);
    await page.click('[data-tool="select"]');
    await page.locator('#tableBody tr[data-row="0"] td').first().click();
    await page.locator('#canvas').press('ArrowUp');
    assert.equal((await snapshot()).project.evidence[0].pixel.y,measuredBeforeEdit.evidence[0].pixel.y-1);
    assertMeasurementPrecision((await snapshot()).project);
    await page.click('[data-tool="area-baseline"]');
    await clickPixel(260,363.5);
    assertMeasurementPrecision((await snapshot()).project);
    const yMax=page.locator('[data-axis="y"][data-field="v2"]');
    await yMax.fill('101.234');
    await yMax.press('Tab');
    const measured=(await snapshot()).project;
    assert.equal(measured.axes.y.v2,101.234);
    assertMeasurementPrecision(measured);
    assert.deepEqual(measured.rows.map(r=>r.category),['2024','2024','2021','2021']);
    assert.deepEqual(measured.rows.map(r=>r.series),['S1','S2','S1','S2']);
    assert.ok(measured.evidence.every(e=>e.pixel.x===e.baselinePixel.x));
    assert.equal(measured.evidence[0].pixel.x,measured.evidence[1].pixel.x);
    for(const [row,y,baseline] of measuredBeforeEdit.rows.map((r,i)=>[r,...[[20,10],[40,20],[25,12],[45,25]][i]])){
      assert.ok(Math.abs(row.y-y)<0.5&&Math.abs(row.baseline-baseline)<0.5);
    }
    await page.locator('[data-move-category][data-delta="-1"]').nth(1).click();
    await page.click('[data-move-series="1"][data-delta="-1"]');
    await page.waitForFunction(()=>{
      const state=window.chartStudio.snapshot();
      return state.renderOk&&state.lastSpec.data.values[0].category==='2021'&&state.lastSpec.data.values[0].series==='S2';
    });
    const nominalGT=(await snapshot()).lastSpec;
    assert.deepEqual(nominalGT.data.values.map(r=>r.stack_order),[0,1,0,1]);
    for(const r of nominalGT.data.values){
      const original=measured.rows.find(row=>row.category===r.category&&row.series===r.series);
      assert.equal(r.y,original.y);
      assert.equal(r.baseline,original.baseline);
    }
    await page.waitForFunction(expected=>new Promise(resolve=>{
      const open=indexedDB.open('chart-studio',1);
      open.onerror=()=>resolve(false);
      open.onsuccess=()=>{
        const db=open.result;
        const read=db.transaction('drafts').objectStore('drafts').get('workspace');
        read.onerror=()=>{db.close();resolve(false);};
        read.onsuccess=()=>{
          const draft=read.result?.current.project;
          db.close();
          resolve(draft?.xType==='nominal'&&JSON.stringify(draft.rows)===expected);
        };
      };
    }),JSON.stringify(measured.rows),{timeout:5000});
    await page.check('#reviewed');
    assert.deepEqual(await download('#exportGT'),nominalGT);

    const project=await download('#saveProject');
    assertMeasurementPrecision(project.current.project);
    const legacy=structuredClone(project);
    for(const old of [legacy.current.project,legacy.queue.find(item=>item.id===legacy.activeId).project]){
      for(const [i,row] of old.rows.entries()){
        for(const [field,handle] of measuredFields){
          row[field]=linearValue(old.evidence[i][handle].y,old.axes.y);
        }
      }
    }
    const legacyGT=structuredClone(nominalGT);
    for(const row of legacyGT.data.values){const saved=legacy.current.project.rows.find(r=>r.category===row.category&&r.series===row.series);row.y=saved.y;row.baseline=saved.baseline;}
    await page.selectOption('#xType','quantitative');
    await waitGT(numeric.Stacked);
    await load('#projectInput',legacy);
    await waitGT(legacyGT);
    assert.deepEqual((await snapshot()).project.evidence,measured.evidence);
    await page.selectOption('#xType','quantitative');
    await waitGT(numeric.Stacked);
    await page.selectOption('#xType','nominal');
    await waitGT(legacyGT);

    await load('#specInput',samples.Stacked);
    await waitGT(samples.Stacked);
    await page.selectOption('#xType','quantitative');
    await waitGT(numeric.Stacked);
    console.log('Browser workflow: paired Y-only capture, categories, layers, both modes and project restore');

    await load('#specInput',samples['Single-series']);
    await waitGT(samples['Single-series']);
    const edit=async(input,value)=>{
      await input.fill(value);
      await input.press('Tab');
    };
    await page.click('#addCategory');
    const added=(await snapshot()).project.categoryObjects.at(-1).key;
    await edit(page.locator('#categoryObjects input[data-category]').last(),'2020');
    await page.selectOption('#activeCategory',added);
    await page.click('#addRow');
    await edit(page.locator('[data-key="y"][data-i="3"]'),'8.12345');
    await edit(page.locator('[data-key="baseline"][data-i="3"]'),'-2.12345');
    const withManual=structuredClone(samples['Single-series']);
    withManual.data.values.push({category:'2020',y:8.12345,baseline:-2.12345});
    await waitGT(withManual);
    await page.locator('#tableBody tr[data-row="3"] td').first().click();
    await page.click('#deleteRow');
    await waitGT(samples['Single-series']);
    console.log('Browser table: category rename, manual bounds, preview and row deletion');

    await page.selectOption('#xType','quantitative');
    await page.click('[data-tool="calibrate"]');
    for(const [tick,x,y] of [['x1',80,400],['x2',560,400],['y1',80,400],['y2',80,50]]){
      await page.click(`[data-tick="${tick}"]`);
      await clickPixel(x,y);
    }
    await page.click('[data-tool="point"]');
    await clickPixel(128.3,329.7);
    await clickPixel(200,364.5);
    const {rows,evidence,axes}=(await snapshot()).project;
    assert.equal(rows.length,1);
    assert.ok(Math.abs(rows[0].x-1)<0.05&&Math.abs(rows[0].y-20)<0.5);
    assert.ok(Math.abs(rows[0].baseline-10)<0.5&&!('category' in rows[0]));
    const measuredX=linearValue(evidence[0].xPixel,axes.x);
    assert.equal(rows[0].x,measurement(evidence[0].xPixel,axes.x));
    assertMeasurementPrecision({rows,evidence,axes});
    assert.equal(evidence[0].pixel.x,evidence[0].baselinePixel.x);

    const fixedX=page.locator('#fixedX');
    await edit(fixedX,'3.125');
    await page.click('#pickX');
    assert.equal(await fixedX.inputValue(),'');
    await clickPixel(230,400);
    assert.equal(await fixedX.inputValue(),'');
    await clickPixel(280,250);
    await clickPixel(280,350);
    assert.equal((await snapshot()).project.rows[1].x,3.125);

    await page.click('#pickX');
    await clickPixel(350.5,400);
    const locked=(await snapshot()).project.assist;
    const expectedX=measurement(locked.fixedXPixel,axes.x);
    assert.notEqual(expectedX,3.125);
    assert.equal(locked.fixedXValue,expectedX);
    assert.equal(await fixedX.inputValue(),'');
    await clickPixel(490,215);
    await clickPixel(490,335);
    const captured=(await snapshot()).project;
    assert.equal(captured.rows[2].x,expectedX);
    assert.equal(captured.evidence[2].pixel.x,locked.fixedXPixel);
    assertMeasurementPrecision(captured);
    assert.deepEqual(errors,[]);
    console.log('Quantitative browser capture: Precision V1 measurements and consecutive X anchors');
  }finally{await browser.close();}
}

run().catch(error=>{console.error(error);process.exitCode=1;});
