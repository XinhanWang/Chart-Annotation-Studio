const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

const original={
  data:{values:[{category:'Control',value:10},{category:'Test',value:20},{category:'Other',value:70}]},
  title:'Pie angle test',
  mark:{type:'arc'},
  encoding:{theta:{field:'value',type:'quantitative',title:'Share (%)'},color:{field:'category',type:'nominal'}}
};
const center={x:300,y:200};
const angles=[330,20,170];
const ray=degrees=>({x:center.x+140*Math.cos(degrees*Math.PI/180),y:center.y+140*Math.sin(degrees*Math.PI/180)});

async function run(){
  const browser=await chromium.launch({
    headless:true,channel:process.env.STUDIO_BROWSER_CHANNEL||(process.platform==='win32'?'msedge':undefined)
  });
  try{
    for(const donut of [false,true]){
      const page=await browser.newPage({acceptDownloads:true,viewport:{width:1500,height:1000},deviceScaleFactor:1.5});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
      await page.waitForFunction(()=>!!window.chartStudio);
      const snapshot=()=>page.evaluate(()=>window.chartStudio.snapshot());
      const readProject=async()=>(await snapshot()).project;
      const load=(selector,data)=>page.locator(selector).setInputFiles({
        name:'test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))
      });
      const download=async selector=>{
        const pending=page.waitForEvent('download');
        await page.click(selector);
        return JSON.parse(await fs.readFile(await (await pending).path(),'utf8'));
      };
      const waitGT=gt=>page.waitForFunction(expected=>{
        const state=window.chartStudio.snapshot();
        return state.renderOk&&JSON.stringify(state.lastSpec)===expected;
      },JSON.stringify(gt),{timeout:5000});
      await page.selectOption('#family','pie');
      const source=await page.evaluate(({center,angles,donut})=>{
        const canvas=document.createElement('canvas');canvas.width=600;canvas.height=400;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle='white';ctx.fillRect(0,0,600,400);
        angles.forEach((start,i)=>{
          let end=angles[(i+1)%angles.length];if(end<start)end+=360;
          ctx.beginPath();ctx.moveTo(center.x,center.y);
          ctx.arc(center.x,center.y,140,start*Math.PI/180,end*Math.PI/180);
          ctx.closePath();ctx.fillStyle=['#d5b2a8','#e4cf93','#9ebdc7'][i];ctx.fill();
        });
        if(donut){ctx.beginPath();ctx.arc(center.x,center.y,68,0,2*Math.PI);ctx.fillStyle='white';ctx.fill();}
        return canvas.toDataURL().split(',')[1];
      },{center,angles,donut});
      await page.locator('#imageInput').setInputFiles({name:'pie.png',mimeType:'image/png',buffer:Buffer.from(source,'base64')});
      await page.waitForFunction(()=>window.chartStudio.snapshot().imageSize?.width===600);
      await load('#specInput',original);
      await waitGT(original);
      await page.locator('#donut').setChecked(donut);
      await page.check('#reviewed');
      const tool=page.locator('[data-tool="pie-angle"]');
      const panel=page.locator('#pieAnglePanel'),apply=page.locator('#applyPieAngle');
      const canvas=page.locator('#canvas');
      const clickPixel=async point=>{
        await canvas.scrollIntoViewIfNeeded();
        const rect=await canvas.boundingBox();
        await page.mouse.click(rect.x+point.x*rect.width/600,rect.y+point.y*rect.height/400);
      };
      const preserved=await readProject();
      await tool.click();
      await clickPixel(center);
      await clickPixel(ray(angles[0]));
      await page.click('#resetPieAngle');
      assert.equal((await readProject()).pieMeasurement,undefined);
      await clickPixel(center);
      await page.click('#cancelPieAngle');
      assert.ok(await panel.isHidden());
      assert.deepEqual((await readProject()).rows,preserved.rows);
      assert.equal((await readProject()).reviewed,true);

      await tool.click();
      await clickPixel(center);
      if(donut){
        await page.click('#zoomIn');
        await page.setViewportSize({width:1280,height:960});
      }
      for(const angle of angles)await clickPixel(ray(angle));
      assert.equal(await page.locator('#pieAngleRows tr').count(),3);
      await clickPixel(ray(10));
      assert.equal((await readProject()).pieMeasurement.boundaries.length,3);
      await page.click('#undoPieAngle');
      assert.equal(await page.locator('#pieAngleRows tr').count(),2);
      await clickPixel(ray(angles[2]));
      const overlay=await canvas.evaluate(el=>el.toDataURL());
      await page.uncheck('#overlay');
      assert.notEqual(await canvas.evaluate(el=>el.toDataURL()),overlay);
      await page.check('#overlay');
      const sampled=(await readProject()).pieMeasurement;
      for(const [i,point] of [sampled.center,...sampled.boundaries].entries()){
        const expected=i===0?center:ray(angles[i-1]);
        assert.ok(Math.hypot(point.x-expected.x,point.y-expected.y)<2,JSON.stringify({point,expected}));
      }
      const pct=await page.locator('#pieAngleRows tr td:nth-child(3)').allTextContents();
      assert.ok(pct.every(v=>/^\d+\.\d{2}%$/.test(v)));
      const measured=pct.map(parseFloat);
      assert.deepEqual(measured.map(Math.round),[14,42,44]);
      assert.equal(measured.reduce((sum,v)=>sum+Math.round(v*100),0),10000);
      assert.equal(await page.locator('#pieAngleTotal').textContent(),'合计 100.00%');
      const keys=preserved.rows.map(r=>r._categoryKey);
      const selector=i=>page.locator(`[data-pie-sector="${i}"]`);
      for(let i=0;i<3;i++)await selector(i).selectOption(keys[0]);
      assert.ok(await apply.isDisabled());
      for(let i=0;i<3;i++)await selector(i).selectOption(keys[(i+1)%3]);
      assert.ok(await apply.isEnabled());
      assert.deepEqual((await readProject()).rows,preserved.rows);
      const backup=await download('#saveProject');
      await page.click('#cancelPieAngle');
      await load('#projectInput',backup);
      await page.waitForFunction(()=>window.chartStudio.snapshot().tool==='pie-angle');
      assert.deepEqual((await readProject()).pieMeasurement,backup.current.project.pieMeasurement);
      assert.equal((await readProject()).donut,donut);
      page.once('dialog',dialog=>dialog.dismiss());
      await apply.click();
      assert.deepEqual((await readProject()).rows,preserved.rows);
      page.once('dialog',dialog=>dialog.accept());
      await apply.click();
      const expected=structuredClone(original);
      expected.data.values.forEach((row,i)=>row.value=measured[(i+2)%3]);
      await waitGT(expected);
      const applied=await readProject();
      assert.ok(applied.evidence.every(e=>e.source==='pie_angle_measurement'));
      assert.deepEqual(applied.evidence[1].pieAngle,{center:sampled.center,from:sampled.boundaries[0],to:sampled.boundaries[1]});
      assert.ok(await panel.isHidden());
      await page.click('#undo');await waitGT(original);
      await page.click('#redo');await waitGT(expected);
      await page.check('#reviewed');
      assert.deepEqual(await download('#exportGT'),expected);
      const saved=await download('#saveProject');
      await load('#specInput',expected);await waitGT(expected);
      await load('#projectInput',saved);
      await page.waitForFunction(()=>window.chartStudio.snapshot().project.evidence[1]?.pieAngle);
      assert.deepEqual((await readProject()).evidence,applied.evidence);
      const value=page.locator('[data-i="1"][data-key="value"]');
      await value.fill('19.8765');await value.press('Tab');
      assert.equal((await readProject()).rows[1].value,19.8765);
      assert.equal((await readProject()).evidence[1].pieAngle,undefined);
      await page.selectOption('#valueMode','absolute');
      await tool.click();
      assert.ok(await panel.isHidden());
      assert.match(await page.locator('#toast').textContent(),/百分比模式/);
      assert.deepEqual(errors,[]);
      await page.close();
      console.log((donut?'Donut':'Pie')+' angle measurement passed');
    }
  }finally{await browser.close();}
}

run().catch(error=>{console.error(error);process.exitCode=1;});
