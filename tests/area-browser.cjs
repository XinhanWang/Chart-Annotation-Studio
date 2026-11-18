const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const samples=require('./fixtures/area-nominal.json');

const root=path.resolve(__dirname,'..');

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
      numeric[name]=JSON.parse(await fs.readFile(path.join(root,name+' Area.json'),'utf8'));
      for(const [mode,gt] of [['nominal',nominal],['quantitative',numeric[name]]]){
        await load('#specInput',gt);
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

    const measured=(await snapshot()).project;
    assert.deepEqual(measured.rows.map(r=>r.category),['2024','2024','2021','2021']);
    assert.deepEqual(measured.rows.map(r=>r.series),['S1','S2','S1','S2']);
    assert.ok(measured.evidence.every(e=>e.pixel.x===e.baselinePixel.x));
    assert.equal(measured.evidence[0].pixel.x,measured.evidence[1].pixel.x);
    for(const [row,y,baseline] of measured.rows.map((r,i)=>[r,...[[20,10],[40,20],[25,12],[45,25]][i]])){
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

    const project=await download('#saveProject');
    await page.selectOption('#xType','quantitative');
    await waitGT(numeric.Stacked);
    await load('#projectInput',project);
    await waitGT(nominalGT);
    assert.deepEqual((await snapshot()).project.evidence,measured.evidence);
    await page.selectOption('#xType','quantitative');
    await waitGT(numeric.Stacked);
    await page.selectOption('#xType','nominal');
    await waitGT(nominalGT);

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
    await edit(page.locator('[data-key="y"][data-i="3"]'),'8');
    await edit(page.locator('[data-key="baseline"][data-i="3"]'),'-2');
    const withManual=structuredClone(samples['Single-series']);
    withManual.data.values.push({category:'2020',y:8,baseline:-2});
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
    await clickPixel(128,330);
    await clickPixel(200,365);
    const {rows,evidence}= (await snapshot()).project;
    assert.equal(rows.length,1);
    assert.ok(Math.abs(rows[0].x-1)<0.05&&Math.abs(rows[0].y-20)<0.5);
    assert.ok(Math.abs(rows[0].baseline-10)<0.5&&!('category' in rows[0]));
    assert.equal(evidence[0].pixel.x,evidence[0].baselinePixel.x);
    assert.deepEqual(errors,[]);
    console.log('Quantitative browser capture: both axes, numeric X and paired bounds');
  }finally{await browser.close();}
}

run().catch(error=>{console.error(error);process.exitCode=1;});
