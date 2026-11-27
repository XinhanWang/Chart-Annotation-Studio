const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const {exportTables}=require('../vendor/vega-lite-table-export.js');

const html=readFileSync(path.join(__dirname,'../index.html'),'utf8');
const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const ctx=vm.createContext({console,setTimeout,clearTimeout,performance,structuredClone,TextEncoder});
for(const script of scripts.filter(s=>s.includes('.vega={}')||s.includes('.vegaLite={}')))vm.runInContext(script,ctx);
const app=scripts.find(s=>s.includes('function baseSpec('));
vm.runInContext(app.split('const $=id=>')[0]+
  ';globalThis.api={defaultProject,makeSpec,importSpec,renderSpec,renameObject,setObjectNames};',ctx);
const {defaultProject,makeSpec,importSpec,renderSpec,renameObject,setObjectNames}=ctx.api;
const plain=value=>JSON.parse(JSON.stringify(value));
const ids=count=>Array.from({length:count},(_,i)=>'C'+(i+1));

function fixture(kind,labels){
  const p=defaultProject(kind);
  setObjectNames(p,'category',labels);
  p.rows=p.categoryObjects.flatMap((c,i)=>p.series.map((s,j)=>({
    category:c.name,_categoryKey:c.key,series:s.name,_seriesKey:s.key,value:20+i*5+j*8,
    ...(p.errorBars?{lower:19+i*5+j*8,upper:22+i*5+j*8}:{}),
    ...(kind.includes('_stack')&&!kind.endsWith('_percent')?{stack_order:j+1}:{})
  })));
  if(kind.endsWith('_percent'))p.percentLabels={[kind.startsWith('barh')?'x':'y']:true};
  return p;
}

async function rendered(gt,cat){
  const spec=renderSpec(gt),view=new ctx.vega.View(ctx.vega.parse(ctx.vegaLite.compile(spec).spec),{renderer:'none'});
  try{
    await view.runAsync();
    const bars=[],labels=[],stacks=new Map();
    const visit=node=>{
      for(const item of node.items||[]){
        if(node.role==='axis-label'&&/^C[0-9]+$/.test(item.datum.value))labels.push(item.text);
        if(node.role==='mark'&&node.marktype==='rect'){
          const {category_id:id,value_start:start,value_end:end}=item.datum;
          bars.push(id);
          if(start!==undefined){
            if(!stacks.has(id))stacks.set(id,[]);
            stacks.get(id).push([start,end]);
          }
        }
        if(item.items)visit(item);
      }
    };
    visit(view.scenegraph().root);
    return {domain:plain(view.scale(cat).domain()),labels,bars,stacks};
  }finally{view.finalize();}
}

for(const [cat,prefix] of [['x','barv'],['y','barh']]){
  for(const variant of ['1','n','stack','stack_percent','1_error','n_error']){
    const kind=prefix+'_'+variant;
    test(kind+' keeps positions, labels, numeric fields and compact round trips',async()=>{
      const ordinary=plain(makeSpec(fixture(kind,['A','B','C'])));
      assert.equal(ordinary.encoding[cat].field,'category');
      assert(ordinary.data.values.every(row=>!('category_id' in row)));
      const oneBlank=fixture(kind,['A','','C']);
      assert.equal(makeSpec(oneBlank).data.values.find(r=>r.category==='null').category_id,'C2');
      const repeated=makeSpec(fixture(kind,['A','A','C']));
      assert(repeated.data.values.every(row=>row.category_id));
      const labels=['A','null','null','A','E','null','G','H','I','J','K'];
      const project=fixture(kind,labels);
      project[cat+'Title']='Category title';
      const gt=plain(makeSpec(project)),observations=gt.data.values;
      assert.deepEqual(gt.encoding[cat],{field:'category_id',type:'nominal',title:'Category title',sort:null});
      assert(!JSON.stringify(gt).includes('labelExpr'));
      const expectedIDs=ids(labels.length);
      for(const [i,id] of expectedIDs.entries()){
        const rows=observations.filter(row=>row.category_id===id);
        assert.equal(rows.length,project.series.length);
        assert(rows.every(row=>row.category===labels[i]));
      }
      const imported=importSpec(gt);
      assert.deepEqual(plain(imported.categoryObjects.map(c=>c.name)),labels);
      assert.deepEqual(plain(makeSpec(imported)),gt);
      const once=await rendered(gt,cat);
      assert.deepEqual(once.domain,expectedIDs);
      assert.deepEqual(once.labels.filter(Boolean),labels.filter(label=>label!=='null'));
      assert.deepEqual(once.bars.slice().sort(),observations.map(row=>row.category_id).sort());
      if(variant.startsWith('stack')){
        for(const id of expectedIDs){
          const segments=once.stacks.get(id).sort((a,b)=>a[0]-b[0]);
          assert.equal(segments[0][0],0);
          assert.equal(segments[1][0],segments[0][1]);
          assert.equal(segments[1][1],observations.filter(row=>row.category_id===id).reduce((sum,row)=>sum+row.value,0));
        }
      }
      const shuffled=plain(gt);
      shuffled.data.values.sort((a,b)=>a.category_id.localeCompare(b.category_id));
      assert.deepEqual((await rendered(shuffled,cat)).domain,expectedIDs);
      assert.deepEqual(plain(makeSpec(importSpec(shuffled))),gt);
    });
  }
}

test('shared exporter keeps both formats in observation order, including sparse grouped series',()=>{
  for(const name of ['single','grouped','stacked']){
    const gt=JSON.parse(readFileSync(path.join(__dirname,'../examples/bar-positions',name+'.gt.json'),'utf8'));
    const [table]=exportTables(gt);
    assert.deepEqual(table.rows,gt.data.values);
    const categoryID=table.fields.indexOf('category_id'),category=table.fields.indexOf('category'),value=table.fields.indexOf('value');
    const csv=table.csv.trim().split(/\r\n/).slice(1).map(line=>line.split(','));
    const md=table.markdown.split('\n').slice(2).map(line=>line.slice(2,-2).split(' | '));
    const expected=gt.data.values.map(row=>[row.category_id,row.category,String(row.value)]);
    for(const data of [csv,md])assert.deepEqual(data.map(row=>[row[categoryID],row[category],row[value]]),expected);
    assert.deepEqual(plain(makeSpec(importSpec(gt))),gt);
  }
});

test('editing blank and legacy numeric bar names still exports strings',()=>{
  const p=defaultProject('barv_1');
  renameObject(p,'category',p.categoryObjects[0].key,'  ');
  renameObject(p,'category',p.categoryObjects[1].key,1993);
  const gt=plain(makeSpec(p));
  assert.deepEqual(gt.data.values.map(r=>r.category),['null','1993','C']);
});
