const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const ctx=vm.createContext({console,performance,structuredClone,setTimeout,clearTimeout});
for(const token of ['.vega={}', '.vegaLite={}'])vm.runInContext(scripts.find(s=>s.includes(token)),ctx);
vm.runInContext(html.split('<script type="module">')[1].split('const $=id=>')[0]+
  'globalThis.api={defaultProject,fitBubble,bubbleSizeMapping,bubblePlotArea,makeSpec,importSpec,renderSpec,validate};',ctx);
const {api,vega,vegaLite}=ctx;
const {exportTables}=require('../vendor/vega-lite-table-export.js');
const plain=value=>JSON.parse(JSON.stringify(value));
const fixture=name=>JSON.parse(fs.readFileSync('examples/bubble/'+name+'.gt.json','utf8'));
const point=(x,y)=>({x,y});

test('circle fitting, plotting area and affine size from squared radius',()=>{
  const circle=plain(api.fitBubble([point(90,120),point(100,130),point(110,120)],'circumference'));
  assert.deepEqual(circle,{center:{x:100,y:120},radius:10});
  assert.deepEqual(plain(api.fitBubble([point(2,3),point(5,7)],'center-edge')),{center:{x:2,y:3},radius:5});
  assert.throws(()=>api.fitBubble([point(0,0),point(1,1),point(2,2)],'circumference'),/共线/);
  assert.throws(()=>api.fitBubble([point(0,0),point(0,0)],'center-edge'),/重合/);
  assert.throws(()=>api.fitBubble([point(0,0),point(1,0.001),point(2,0)],'circumference'),/圆弧太短/);
  assert.throws(()=>api.fitBubble([point(90,120),point(100,130),point(110,120)],'circumference',5),/尺寸异常/);
  assert.equal(api.bubblePlotArea([point(200,300),point(50,50)]),37500);
  assert.equal(api.bubblePlotArea([point(1,1),point(1,2)]),null);
  const {slope,intercept}=api.bubbleSizeMapping([{radius:5,value:20},{radius:10,value:80}]);
  assert.equal(slope,.8);assert.equal(intercept,0);
  assert.throws(()=>api.bubbleSizeMapping([{radius:5,value:20},{radius:5.1,value:80}]),/过于接近/);
  assert.throws(()=>api.bubbleSizeMapping([{radius:5,value:80},{radius:10,value:20}]),/递增/);
});

function relative(scale){
  const p=api.defaultProject('scatter_bubble_n');
  p.bubble.mode='relative';
  p.bubble.calibration.bounds=[point(30*scale,50*scale),point(430*scale,300*scale)];
  p.rows=[
    {x:1,y:2,series:'Series 1'},
    {x:1,y:2,series:'Series 2'},
    {x:3,y:3,series:'Series 1'}
  ];
  p.evidence=[{bubbleRadius:10*scale},{bubbleRadius:20*scale},{bubbleRadius:.01*scale}];
  return p;
}

test('relative areas are resolution invariant, stable across additions and preserve coincident bubbles',()=>{
  const p=relative(1),gt=plain(api.makeSpec(p));
  assert.deepEqual(plain(api.makeSpec(relative(3))),gt);
  assert.deepEqual(gt.encoding.size,{field:'size_relative',type:'quantitative',legend:null});
  assert.deepEqual(gt.data.values.map(row=>row.size_relative),[0.003142,0.01257,3.142e-9]);
  assert.deepEqual(gt.data.values.slice(0,2).map(row=>[row.x,row.y]),[[1,2],[1,2]]);
  p.rows.push({x:4,y:4,series:'Series 1'});p.evidence.push({bubbleRadius:100});
  assert.deepEqual(plain(api.makeSpec(p).data.values.slice(0,3)),gt.data.values);
  p.rows.splice(1,1);p.evidence.splice(1,1);
  assert.deepEqual(plain(api.makeSpec(p).data.values.slice(0,2)),[gt.data.values[0],gt.data.values[2]]);
  p.rows[0].needs_review=true;
  assert.throws(()=>api.makeSpec(p),/needs_review/);
});

test('true size uses manual values ahead of calibration, keeps units and percent semantics',()=>{
  const p=api.defaultProject('scatter_bubble_1');
  p.bubble.mode='calibrated';
  p.bubble.title='Share (%)';
  p.percentLabels={size:true};
  p.bubble.calibration.references=[{radius:5,value:20},{radius:10,value:80}];
  p.rows=[{x:1,y:2},{x:3,y:4,size:55.123456789}];
  p.evidence=[{bubbleRadius:8},{bubbleRadius:11}];
  let gt=plain(api.makeSpec(p));
  assert.deepEqual(gt.data.values,[{x:1,y:2,size:.512},{x:3,y:4,size:.55123456789}]);
  assert.match(gt.encoding.size.legend.format,/%|p/);
  assert.equal(gt.encoding.size.title,'Share (%)');
  assert.deepEqual(plain(api.makeSpec(api.importSpec(gt))),gt);
  p.evidence[0].bubbleRadius=12;
  assert(api.validate(p).some(issue=>issue.severity==='warning'&&/外推/.test(issue.message)));
  p.bubble.calibration.references[0].value=80;
  assert.throws(()=>api.makeSpec(p),/递增/);
});

for(const name of ['single-manual','multi-calibrated','multi-relative']){
  test(name+' preserves compact GT and its Markdown and CSV rows',()=>{
    const gt=fixture(name),p=api.importSpec(gt);
    assert.deepEqual(plain(api.makeSpec(p)),gt);
    assert.deepEqual(exportTables(gt)[0].rows,gt.data.values);
    const [table]=exportTables(gt);
    for(const row of gt.data.values){
      const size=String(row[gt.encoding.size.field]);
      assert.ok(table.csv.includes(size)&&table.markdown.includes(size));
    }
    const mixed=plain(gt);
    const other=gt.encoding.size.field==='size'?'size_relative':'size';
    mixed.data.values[0][other]=.001;
    assert.throws(()=>api.importSpec(mixed),/同一种/);
  });
}

test('relative preview yields true geometric areas at two render sizes, including zero',async()=>{
  const gt=fixture('multi-relative');
  for(const [width,height] of [[200,150],[400,260]]){
    const rendered=api.renderSpec(gt);
    const view=new vega.View(vega.parse(vegaLite.compile({...rendered,width,height}).spec),{renderer:'none'});
    try{
      await view.runAsync();
      const symbols=[];
      function visit(node){
        for(const item of node.items??[]){
          if(node.role==='mark'&&node.marktype==='symbol')symbols.push(item);
          if(item.items)visit(item);
        }
      }
      visit(view.scenegraph().root);
      assert.equal(symbols.length,gt.data.values.length);
      for(const symbol of symbols){
        const expected=symbol.datum.size_relative*view.width()*view.height();
        const actual=Math.PI*symbol.size/4;
        assert.ok(Math.abs(actual-expected)<=Math.abs(expected)*Number.EPSILON*5);
        assert.equal(symbol.shape,'circle');
        assert.ok(symbol.fill&&symbol.fill!=='transparent');
      }
      const svg=await view.toSVG();
      const marks=svg.match(/<g class="mark-symbol role-mark[^>]*>(.*?)<\/g>/)[1];
      const paths=[...marks.matchAll(/ d="([^"]+)"/g)].map(match=>match[1]);
      assert.equal(paths.length,symbols.length);
      for(const [i,path] of paths.entries()){
        const expected=Math.sqrt(symbols[i].datum.size_relative*view.width()*view.height()/Math.PI);
        if(expected===0)assert.equal(path,'M0,0');
        else{
          const [,rx,ry]=path.match(/A([0-9.]+),([0-9.]+)/);
          assert.ok(Math.abs(Number(rx)-expected)<=.0005);
          assert.equal(rx,ry);
        }
      }
    }finally{view.finalize();}
  }
  assert.equal(gt.encoding.size.field,'size_relative');
  assert.deepEqual(gt.mark,{type:'point'});
});
