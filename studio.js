/** Compact-v4 semantic GT. Image geometry and review evidence stay in project files. */
const KINDS = ['barh_1','barh_n','barv_1','barv_n','barv_stack','barh_stack','line_1','line_n','scatter_1','scatter_n','pie','boxplot_v','boxplot_h','area_1','area_n','area_stack'];
const copy = value => JSON.parse(JSON.stringify(value));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const present = n => n !== undefined && n !== null && n !== '';
const unique = values => [...new Set(values)];
const isBar = p => p.kind.startsWith('bar');
const isStack = p => ['barv_stack','barh_stack'].includes(p.kind);
const isHorizontal = p => p.kind.startsWith('barh')||p.kind==='boxplot_h';
const isPie = p => p.kind==='pie';
const isBox = p => p.kind.startsWith('boxplot_');
const isStat = p => isPie(p)||isBox(p);
const isArea = p => p.kind.startsWith('area_');
const isNominalArea = p => isArea(p)&&p.xType==='nominal';
const categoryField = p => isBar(p)||isStat(p)||isNominalArea(p)?'category':'x';
const stackRank = (series,index) => series?.stackOrder??index;
const BOX_FIELDS = ['lower','q1','median','q3','upper'];
const valueAxis = p => isHorizontal(p)?'x':'y';

// Choose unused, contrasting colors first; generate new hues after the palette is exhausted.
const SERIES_COLORS=['#4263eb','#e8590c','#2f9e44','#9c36b5','#0891b2','#d6336c','#795548','#f59f00','#5c940d','#6741d9','#0c8599','#c92a2a','#364fc7','#a61e4d','#087f5b','#7048e8','#cc5de8','#1098ad','#e67700','#66a80f','#845ef7','#f06595','#5f7c8a','#b67932'];
function hslHex(h,s,l){
  const a=s*Math.min(l,1-l),channel=n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};
  return '#'+channel(0)+channel(8)+channel(4);
}
function nextSeriesColor(series,random=Math.random){
  const used=new Set(series.map(s=>s.color?.toLowerCase()).filter(Boolean)),available=SERIES_COLORS.filter(c=>!used.has(c));
  if(available.length)return available[Math.floor(random()*available.length)];
  const seed=random()*360;
  // Golden-angle hue spacing prevents short color cycles, even with a fixed RNG.
  for(let i=0;i<=used.size;i++){const color=hslHex((seed+i*137.508)%360,.62+(i%3)*.08,.42+(i%4)*.04);if(!used.has(color))return color;}
  // A bounded exact-color fallback also handles unusually large imported palettes.
  let rgb=Math.floor(random()*0xffffff);while(used.has('#'+rgb.toString(16).padStart(6,'0')))rgb=(rgb+1)%0x1000000;
  return '#'+rgb.toString(16).padStart(6,'0');
}
// Stable project keys are opaque and survive renames/reorders; GT IDs are a projection.
let keyCounter=0;
const newKey=prefix=>prefix+':'+(globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+':'+(++keyCounter));
const identity=r=>r._seriesKey??r.series_id??r.series_instance??r.series??'Series 1';
const categoryIdentity=r=>r._categoryKey??r.category_id??r.x_id??r.category_instance??r.x_instance??r.category??r.x;
const ROW_FIELDS=['category','category_id','value','x','x_id','y','lower','upper','path_order','stack_order','start','end','series','series_id'];
const orderRow=r=>Object.fromEntries(ROW_FIELDS.filter(k=>k in r).map(k=>[k,r[k]]));
const categoryName=(p,key)=>p.categoryObjects?.find(c=>c.key===key)?.name??key;
const seriesName=(p,key)=>p.series?.find(c=>c.key===key)?.name??key;
function ensureIdentities(p){
  const field=categoryField(p),categorical=field==='category'||p.xType==='ordinal';
  p.series??=[];
  for(const s of p.series)s.key??=newKey('series');
  // Legacy projects with explicit instance/ID columns reconstruct object identity first.
  const explicitSeries=p.rows.some(r=>present(r.series_id)||present(r.series_instance));
  const explicitCategory=p.rows.some(r=>present(r[field+'_id'])||present(r[field+'_instance']));
  if(!p.categoryObjects){
    const groups=new Map();
    if(explicitCategory)for(const r of p.rows){const id=r[field+'_id']??r[field+'_instance'];if(!present(id))throw Error('历史类别身份字段不能部分缺失');if(groups.has(id)&&groups.get(id).name!==r[field])throw Error('类别 ID 对应的标签冲突');if(!groups.has(id))groups.set(id,{key:newKey('category'),name:r[field],legacy:id});}
    p.categoryObjects=explicitCategory?[...groups.values()]:(p.categories||[]).map(name=>({key:newKey('category'),name}));
  }
  if(explicitSeries&&p.rows.some(r=>!r._seriesKey)){
    const groups=new Map();for(const r of p.rows){const id=r.series_id??r.series_instance;if(!present(id))throw Error('历史系列身份字段不能部分缺失');if(groups.has(id)&&groups.get(id).name!==r.series)throw Error('系列 ID 对应的标签冲突');if(!groups.has(id))groups.set(id,{key:newKey('series'),name:r.series,legacy:id,color:p.series[groups.size]?.color||'#4263eb'});}
    p.series=[...groups.values()];
  }
  for(const r of p.rows){
    if(!r._seriesKey){
      let matches=explicitSeries?p.series.filter(s=>s.legacy===(r.series_id??r.series_instance)):p.series.filter(s=>s.name===(r.series??p.series[0]?.name));
      if(matches.length>1)throw Error('重名系列缺少实际对象身份，请从系列选择器指定对象');
      if(!matches.length){const obj={key:newKey('series'),name:r.series??'Series 1',color:'#4263eb'};p.series.push(obj);matches=[obj];}
      r._seriesKey=matches[0].key;
    }
    const series=p.series.find(s=>s.key===r._seriesKey);if(!series)throw Error('记录引用了不存在的系列对象');r.series=series.name;
    if(categorical){
      if(!r._categoryKey){
        let matches=explicitCategory?p.categoryObjects.filter(c=>c.legacy===(r[field+'_id']??r[field+'_instance'])):p.categoryObjects.filter(c=>c.name===r[field]);
        if(matches.length>1)throw Error('重名类别缺少实际位置身份，请从类别选择器指定位置');
        if(!matches.length){const obj={key:newKey('category'),name:r[field]};p.categoryObjects.push(obj);matches=[obj];}
        r._categoryKey=matches[0].key;
      }
      const cat=p.categoryObjects.find(c=>c.key===r._categoryKey);if(!cat)throw Error('记录引用了不存在的类别对象');r[field]=cat.name;
    }
    for(const k of ['category_id','x_id','series_id','category_instance','x_instance','series_instance'])delete r[k];
  }
  p.categories=p.categoryObjects.map(c=>c.name);
  return p;
}
function renameObject(p,kind,key,name){ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects,obj=list.find(o=>o.key===key);if(!obj)throw Error('对象不存在');obj.name=name;const field=kind==='series'?'series':categoryField(p),ref=kind==='series'?'_seriesKey':'_categoryKey';for(const r of p.rows)if(r[ref]===key)r[field]=name;p.categories=p.categoryObjects.map(c=>c.name);}
function moveObject(p,kind,key,delta){ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects,i=list.findIndex(o=>o.key===key),j=i+delta;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];p.categories=p.categoryObjects.map(c=>c.name);}
function moveSeries(p,index,delta){
  const series=p.series[index],other=p.series[index+delta];
  if(!other)return;
  if(p.kind==='area_stack'){
    [series.stackOrder,other.stackOrder]=[stackRank(other,index+delta),stackRank(series,index)];
  }
  moveObject(p,'series',series.key,delta);
}
function newObject(p,kind,name){
  const obj={key:newKey(kind),name};
  if(kind==='series'){
    obj.color=nextSeriesColor(p.series);
    if(p.kind==='area_stack')obj.stackOrder=stackRank(p.series.at(-1),p.series.length-1)+1;
  }
  return obj;
}
function addObject(p,kind,name){ensureIdentities(p);const obj=newObject(p,kind,name);(kind==='series'?p.series:p.categoryObjects).push(obj);p.categories=p.categoryObjects.map(c=>c.name);return obj;}
function removeObject(p,kind,key){ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects;if(kind==='series'&&list.length===1)throw Error('至少保留一个系列');const ref=kind==='series'?'_seriesKey':'_categoryKey',keep=p.rows.map((r,i)=>r[ref]===key?-1:i).filter(i=>i>=0);p.rows=keep.map(i=>p.rows[i]);if(p.evidence)p.evidence=keep.map(i=>p.evidence[i]);list.splice(list.findIndex(o=>o.key===key),1);p.categories=p.categoryObjects.map(c=>c.name);}
function parseObjectNames(text){return text.split(/\r\n?|\n/).map(name=>name.trim()).filter(Boolean);}
function applyObjectNames(p,kind,text){
  const names=parseObjectNames(text);if(!names.length)throw Error('请至少输入一个名称');
  if(kind==='series'&&p.kind.endsWith('_1')&&names.length>1)throw Error('单系列类型只允许一个系列，请先选择多系列图表');
  ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects;
  // Match by visible position, never by name: duplicate labels remain distinct objects.
  const removed=new Set(list.slice(names.length).map(o=>o.key)),ref=kind==='series'?'_seriesKey':'_categoryKey';
  const keep=p.rows.map((r,i)=>removed.has(r[ref])?-1:i).filter(i=>i>=0);
  p.rows=keep.map(i=>p.rows[i]);if(p.evidence)p.evidence=keep.map(i=>p.evidence[i]);
  list.splice(names.length);
  names.forEach((name,i)=>{if(list[i])list[i].name=name;else list.push(newObject(p,kind,name));});
  const byKey=new Map(list.map(o=>[o.key,o.name])),field=kind==='series'?'series':categoryField(p);
  for(const r of p.rows)r[field]=byKey.get(r[ref]);
  p.categories=p.categoryObjects.map(c=>c.name);return names.length;
}
function renderSpec(gt){
  const out=copy(gt),rows=out.data.values;
  function view(node){for(const [channel,d] of Object.entries(node.encoding||{})){
    const field=d.field,label={category_id:'category',x_id:'x',series_id:'series'}[field];
    if(label&&['x','y','color'].includes(channel)){
      const mapping=Object.fromEntries(rows.map(r=>[r[field],r[label]]));
      const property=channel==='color'?'legend':'axis';
      if(d[property]!==null)d[property]={...(d[property]||{}),labelExpr:JSON.stringify(mapping)+'[datum.value]'};
    }
  }for(const child of node.layer||[])view(child);}
  view(out);return out;
}

// p.categories is an explicit screen order: left-to-right, or top-to-bottom for horizontal bars.
function orderedRows(p) {
  if(isStat(p))return copy(p.rows);
  ensureIdentities(p);
  const source=p.rows.map((r,i)=>({...r,__input:i}));
  const categorical=isBar(p)||p.xType==='ordinal';
  const categoryField=isBar(p)?'category':'x';
  const categories=p.categoryObjects.map(c=>c.key);
  const series=p.series.map(s=>s.key);
  const xReverse=!!p.axes?.x?.reverse||(p.axes?.x?.calibrated&&(p.axes.x.v2-p.axes.x.v1)/(p.axes.x.p2-p.axes.x.p1)<0);
  const yReverse=!!p.axes?.y?.reverse||(p.axes?.y?.calibrated&&(p.axes.y.v2-p.axes.y.v1)/(p.axes.y.p2-p.axes.y.p1)>0);
  const sx=xReverse?-1:1, sy=yReverse?1:-1;
  const totals=new Map();
  if(isStack(p))for(const r of [...source].sort((a,b)=>(a.stack_order??series.indexOf(identity(a)))-(b.stack_order??series.indexOf(identity(b)))||a.__input-b.__input)) {
    const key=JSON.stringify([categoryIdentity(r),r.value<0]);
    const start=present(r.start)?r.start:(totals.get(key)||0);
    const end=present(r.end)?r.end:start+r.value;
    r.__mid=(start+end)/2;totals.set(key,end);
  }
  const compare=(a,b)=>{
    const ac=categorical?(categories.indexOf(categoryIdentity(a))):sx*a.x;
    const bc=categorical?(categories.indexOf(categoryIdentity(b))):sx*b.x;
    if(ac!==bc)return ac-bc;
    if(isStack(p))return (isHorizontal(p)?sx:-sy)*(a.__mid-b.__mid)||a.__input-b.__input;
    if(p.kind.startsWith('scatter'))return sy*(a.y-b.y)||a.__input-b.__input;
    return (series.indexOf(identity(a)))-(series.indexOf(identity(b)))||a.__input-b.__input;
  };
  if(p.kind.startsWith('line')) {
    // Keep actual adjacency; explicit imported ranks describe the same path.
    const explicit=source.every(r=>present(r.path_order));
    const paths=new Map();
    for(const id of unique(source.map(identity)))paths.set(id,source.filter(r=>identity(r)===id)
      .sort((a,b)=>explicit?a.path_order-b.path_order:a.__input-b.__input));
    source.sort(compare);
    const used=new Map();
    for(let i=0;i<source.length;i++){
      const id=identity(source[i]),n=used.get(id)||0;
      source[i]=paths.get(id)[n];used.set(id,n+1);
    }
    const last=new Map();let retreat=false;
    for(const r of source){const x=categorical?categories.indexOf(categoryIdentity(r)):sx*r.x;const id=identity(r);if(last.has(id)&&x<last.get(id))retreat=true;last.set(id,x);}
    const counts=new Map();for(const r of source){delete r.path_order;if(retreat){const id=identity(r),i=counts.get(id)||0;r.path_order=i;counts.set(id,i+1);}}
  } else source.sort(compare);
  for(const r of source){delete r.__input;delete r.__mid;}
  return source;
}

function defaultProject(kind='scatter_1') {
  if (!KINDS.includes(kind.replace(/_error$/,'')) || kind.endsWith('_error')&&!['barh_1','barh_n','barv_1','barv_n'].includes(kind.slice(0,-6))) throw Error('未知图表类型');
  const errorBars=kind.endsWith('_error');if(errorBars)kind=kind.slice(0,-6);
  const multi=kind.endsWith('_n')||isStack({kind})||kind==='area_stack';
  const series=[{name:'Series 1',color:'#4263eb'},...(multi?[{name:'Series 2',color:'#e8590c'}]:[])];
  if(kind==='area_stack')series.forEach((s,i)=>s.stackOrder=i);
  const categories=isPie({kind})||isArea({kind})?[]:['A','B','C'];
  return ensureIdentities({kind,title:'',xTitle:'',yTitle:'',xType:'quantitative',legend:multi,errorBars,...(isPie({kind})?{valueMode:'percent',valueTitle:'Share (%)',donut:false}:{}),
    rows:isStat({kind})?[]:series.flatMap((s,j)=>categories.map((category,i)=>isBar({kind})?
      {category,value:20+i*15+j*10,series:s.name,...(isStack({kind})?{stack_order:j}:{})}:
      {x:i*4+1,y:20+i*15+j*10,series:s.name})),
    axes:{x:{p1:80,p2:560,v1:0,v2:10,type:'linear',reverse:false,calibrated:false},y:{p1:400,p2:50,v1:0,v2:100,type:'linear',reverse:false,calibrated:false}},categories,series});
}

function axisTransform(axis) {
  if (!axis || !['p1','p2','v1','v2'].every(k=>finite(axis[k]))) throw Error('标定点和数值必须为有限数字');
  if(axis.p1===axis.p2 || axis.v1===axis.v2) throw Error('两个标定点及其数值必须不同');
  if(axis.type==='log' && (axis.v1<=0||axis.v2<=0)) throw Error('对数轴标定值必须大于零');
  if(axis.type && !['linear','log'].includes(axis.type)) throw Error('仅支持线性或对数轴标定');
  return axis.type==='log' ? {f:Math.log,inv:Math.exp} : {f:v=>v,inv:v=>v};
}
function pixelToValue(pixel,axis) {
  if(!finite(pixel)) throw Error('像素坐标必须为有限数字');
  const {f,inv}=axisTransform(axis);
  return inv(f(axis.v1)+(pixel-axis.p1)/(axis.p2-axis.p1)*(f(axis.v2)-f(axis.v1)));
}
function boxValueAt(pt,p) {
  const axis=valueAxis(p);
  return Number(pixelToValue(pt[axis],p.axes[axis]).toFixed(2));
}
const roundAreaMeasurement=value=>Number(value.toFixed(2));
const areaValueAt=(pixel,axis)=>roundAreaMeasurement(pixelToValue(pixel,axis));
function valueToPixel(value,axis) {
  if(!finite(value)) throw Error('数值必须为有限数字');
  const {f}=axisTransform(axis);
  if(axis.type==='log'&&value<=0) throw Error('对数轴数值必须大于零');
  return axis.p1+(f(value)-f(axis.v1))/(f(axis.v2)-f(axis.v1))*(axis.p2-axis.p1);
}

function validateAxes(p,issue){
  for(const axis of requiredAxes(p)){
    if(p.axes?.[axis]?.calibrated){
      try{axisTransform(p.axes[axis]);}catch(e){issue('error',`${axis.toUpperCase()} 轴：${e.message}`);}
    }
  }
}
function validate(p) {
  try{p=ensureIdentities(copy(p));}catch(e){return [{severity:'error',message:e.message}];}
  const out=[];
  const issue=(severity,message)=>out.push({severity,message});
  if(!p || !KINDS.includes(p.kind)) return [{severity:'error',message:'未知图表类型'}];
  if(!Array.isArray(p.rows)||!p.rows.length) return [{severity:'error',message:'至少需要一行观测数据'}];
  if(p.rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return [{severity:'error',message:'每一行必须为观测对象'}];
  if(isStat(p))return validateStat(p);
  const bar=isBar(p), stack=isStack(p), line=p.kind.startsWith('line');
  for(const key of ['title','xTitle','yTitle'])if(present(p[key])&&!(typeof p[key]==='string'||Array.isArray(p[key])&&p[key].length&&p[key].every(v=>typeof v==='string')))issue('error',`${key} 需要文字或非空文字数组`);
  if(isArea(p)){validateArea(p,issue);validateAxes(p,issue);return out;}
  const fields=unique(p.rows.flatMap(r=>Object.keys(r).filter(k=>present(r[k]))));
  for(const name of ['lower','upper','start','end','path_order','stack_order']) {
    if(p.rows.some(r=>present(r[name])) && !p.rows.every(r=>present(r[name]))) issue('error',`${name} 需要覆盖每一行，不能部分缺失`);
  }
  if(p.rows.some(r=>present(r.lower)!==present(r.upper))) issue('error','误差区间需要同时填写 lower 和 upper');
  if(p.rows.some(r=>present(r.start)!==present(r.end))) issue('error','堆叠端点需要同时填写 start 和 end');
  if(!bar&&fields.some(f=>['lower','upper','start','end','stack_order'].includes(f))) issue('error','当前规范中折线和散点只支持 x/y、系列与路径顺序；误差区间仅用于柱图');
  if(!stack&&fields.some(f=>['start','end','stack_order'].includes(f))) issue('error','只有堆叠图可填写堆叠端点或 stack_order');
  if(!line&&fields.includes('path_order')) issue('error','只有折线图可填写 path_order');
  const ids=unique(p.rows.map(identity));
  const configured=new Set((p.series||[]).map(s=>s.name));
  if(configured.size&&p.rows.some(r=>present(r.series)&&!configured.has(r.series)))issue('error','记录中的系列名称未在左侧系列列表中定义，请先添加或修改系列');
  if(p.kind.endsWith('_1')&&ids.length!==1) issue('error','单系列图只允许一个系列');
  if((p.kind.endsWith('_n')||stack)&&ids.length<2) issue('warning','当前只有一个系列，请确认图表类型');
  p.rows.forEach((r,i)=>{
    const prefix=`第 ${i+1} 行：`;
    for(const f of ['category','x','series'])if(present(r[f])&&!(typeof r[f]==='string'||finite(r[f])))issue('error',prefix+f+' 必须是文字或有限数字');
    for(const f of bar?['value']:['y',...(p.xType==='ordinal'?[]:['x'])]) if(!finite(r[f])) issue('error',prefix+f+' 必须是有限数字');
    for(const f of ['lower','upper','start','end','path_order','stack_order']) if(present(r[f])&&!finite(r[f])) issue('error',prefix+f+' 必须是有限数字');
    if(bar&&!present(r.category)) issue('error',prefix+'缺少类别');
    if(!bar&&p.xType==='ordinal'&&!present(r.x)) issue('error',prefix+'缺少 x 类别');
    if(present(r.lower)&&finite(r.lower)&&finite(r.upper)&&r.lower>r.upper) issue('error',prefix+'lower 不能大于 upper');
    if(present(r.start)&&finite(r.start)&&finite(r.end)&&finite(r.value)&&Math.abs((r.end-r.start)-r.value)>1e-8*Math.max(1,Math.abs(r.value))) issue('error',prefix+'堆叠段 value 必须等于 end − start');
    for(const channel of ['x','y']) {
      const quantitative=bar?(isHorizontal(p)?channel==='x':channel==='y'):(channel==='y'||p.xType!=='ordinal');
      const field=bar?'value':channel;
      if(quantitative&&p.axes?.[channel]?.type==='log'&&(!(r[field]>0)||['lower','upper','start','end'].some(k=>present(r[k])&&r[k]<=0))) issue('error',prefix+'对数轴数值及区间必须大于零');
    }
    for(const [key,value] of Object.entries(r)) if(typeof value==='number'&&!Number.isFinite(value)) issue('error',prefix+key+' 不能为 NaN 或 Infinity');
  });
  if(p.errorBars&&(!bar||p.rows.some(r=>!finite(r.lower)||!finite(r.upper))))issue('error','误差棒柱图需为每条记录填写数值下界和上界');
  validateAxes(p,issue);
  if(bar&&fields.includes('lower')&&p.rows.some(r=>finite(r.lower)&&finite(r.upper)&&(r.value<r.lower||r.value>r.upper))) issue('warning','部分数值位于误差区间外，请核对区间是否为绝对上下界');
  if(line&&!fields.includes('path_order')) {
    const last=new Map();let nonmonotonic=false;
    for(const r of p.rows){const x=p.xType==='ordinal'?p.categoryObjects.map(c=>c.key).indexOf(categoryIdentity(r)):r.x;const s=identity(r);if(last.has(s)&&x<last.get(s))nonmonotonic=true;last.set(s,x);}
    if(nonmonotonic) issue('warning','折线路径包含 X 回退，导出时自动生成 path_order');
  }
  return out;
}

// Boundaries are measurement evidence. Ordinary zero-based stacks export segment values.
function stackNeedsEndpoints(p) {
  if(!isStack(p)||!p.rows.every(r=>present(r.start)&&present(r.end)))return false;
  const series=p.series.map(s=>s.key),totals=new Map(),near=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
  const rows=[...p.rows].sort((a,b)=>(a.stack_order??series.indexOf(identity(a)))-(b.stack_order??series.indexOf(identity(b))));
  for(const r of rows){const key=JSON.stringify([categoryIdentity(r),r.value<0]),start=totals.get(key)||0,end=start+r.value;if(!near(r.start,start)||!near(r.end,end))return true;totals.set(key,end);}
  return false;
}
function annotationOrder(p) {
  const stack=isStack(p),horizontal=isHorizontal(p),bar=isBar(p),line=p.kind.startsWith('line');
  let series,category,records;
  if(isArea(p))return {
    series:p.kind==='area_stack'?'系列按底层到顶层填写，用 ↑ / ↓ 调整堆叠顺序。':'填写原图的系列名称。',
    category:'类别按原图从左到右填写，一行一个类别。',
    records:isNominalArea(p)?'选择类别和系列，在同一类别位置依次取上界和下界。GT 按类别位置从左到右排列。':'在同一 X 依次取上界和下界。'
  };
  if(isPie(p))return {series:'',category:'',records:'按原图扇区顺序录入类别与数值，可用表格行首箭头调整。'};
  if(isBox(p))return {series:'',category:horizontal?'类别按原图从上到下填写，一行一个类别。':'类别按原图从左到右填写，一行一个类别。',records:'校准数值轴后，依次测量下须、Q1、中位数、Q3、上须；异常值可连续取点。'};
  if(stack){series=horizontal?'图例 / 系列按柱段从左到右填写，一行一个系列；不要照图例框的排版顺序。':'图例 / 系列按柱段从下到上填写，一行一个系列；不要照图例框的排版顺序。';category=horizontal?'类别按原图从上到下填写，一行一个类别。':'类别按原图从左到右填写，一行一个类别。';records=horizontal?'每组从左到右：起点 → 各段交界点 → 终点。':'每组从下到上：起点 → 各段交界点 → 终点。';records+='N 段点 N+1 次，每个新类别重新点起点。';}
  else if(bar){series=p.kind.endsWith('_n')?(horizontal?'系列按每组柱子从上到下填写。':'系列按每组柱子从左到右填写。'):'单系列仅填写原图中可读的图例名称；无图例时不填系列名。';category=horizontal?'类别按原图从上到下填写，一行一个类别。':'类别按原图从左到右填写，一行一个类别。';records='GT 先按类别，再按组内柱子的可见顺序记录；误差上下界随对应柱子保存。';}
  else {series='系列按从左到右扫描原图时首次出现的顺序填写；同一位置按从上到下区分。';category=line&&p.xType==='ordinal'?'离散 X 类别按原图从左到右填写，一行一个位置。':'连续数值轴无需填写类别列表。';records=line?'每条线沿真实路径取点；GT 保留路径顺序，仅同一条线发生画面 X 回退时自动输出 path_order。重复 X 不算回退。':'点击和表格录入顺序不限；训练 GT 自动按画面从左到右、同一 X 从上到下排序。';}
  if(p.legend===false&&!p.kind.endsWith('_1'))series+=' 原图无可读图例时，按上述顺序使用 Series 1、Series 2 等，不推测名称。';
  return {series,category,records};
}

// Canonical output order is shared by preview, JSON and ZIP exports.
function orderEncoding(enc) {
  const priority=['x','y','xOffset','yOffset','x2','y2','theta','theta2','radius','radius2','longitude','longitude2','latitude','latitude2','color'];
  const keys=priority.filter(k=>Object.hasOwn(enc,k));
  return Object.fromEntries([...keys,...Object.keys(enc).filter(k=>!keys.includes(k))].map(k=>[k,enc[k]]));
}

function makeSpec(p) {
  const errors=validate(p).filter(x=>x.severity==='error');
  if(errors.length) throw Error(errors.map(x=>x.message).join('\n'));
  if(isStat(p))return makeStatSpec(p);
  if(isArea(p))return makeAreaSpec(ensureIdentities(copy(p)));
  const bar=isBar(p),stack=isStack(p),horizontal=isHorizontal(p),line=p.kind.startsWith('line');
  p=ensureIdentities(copy(p));
  const ordered=orderedRows(p),categoryField=bar?'category':'x';
  const seriesKeys=unique(ordered.map(identity)),categoryKeys=unique(ordered.map(categoryIdentity));
  const multi=seriesKeys.length>1,withSeries=p.legend!==false||multi;
  const repeatedSeries=unique(seriesKeys.map(k=>seriesName(p,k))).length<seriesKeys.length;
  const repeatedCategory=(bar||p.xType==='ordinal')&&unique(categoryKeys.map(k=>categoryName(p,k))).length<categoryKeys.length;
  const categoryID=bar?'category_id':'x_id';
  const endpoints=stack&&p.stackEndpointMode==='explicit'&&stackNeedsEndpoints(p);
  const optional=['lower','upper','start','end','path_order','stack_order'].filter(k=>ordered.every(r=>present(r[k]))&&(!stack||(['start','end'].includes(k)?endpoints:k==='stack_order'?!endpoints:true)));
  const stackKeys=p.series.map(s=>s.key);
  const rows=ordered.map(r=>{
    const out=bar?{category:r.category,value:r.value}:{x:r.x,y:r.y};
    if(repeatedCategory)out[categoryID]=(bar?'C':'X')+(categoryKeys.indexOf(categoryIdentity(r))+1);
    for(const k of optional)out[k]=r[k];
    if(stack&&!optional.includes('start')&&!optional.includes('stack_order'))out.stack_order=stackKeys.indexOf(identity(r));
    if(withSeries){out.series=p.legend===false?'Series '+(seriesKeys.indexOf(identity(r))+1):r.series;if(repeatedSeries&&p.legend!==false)out.series_id='S'+(seriesKeys.indexOf(identity(r))+1);}
    return orderRow(out);
  });
  const axis=(channel,field,type)=>{
    const out={field,type};
    const title=channel==='x'?p.xTitle:p.yTitle;
    if(present(title))out.title=copy(title);
    if(type==='quantitative') {if(p.axes[channel].type==='log')out.scale={type:'log'};}
    else out.sort=null;
    return out;
  };
  const cat=horizontal?'y':'x',val=horizontal?'x':'y';
  const enc=bar?{[cat]:axis(cat,repeatedCategory?'category_id':'category','nominal'),[val]:axis(val,'value','quantitative')}:
    {x:axis('x',repeatedCategory?'x_id':'x',p.xType==='ordinal'?'ordinal':'quantitative'),y:axis('y','y','quantitative')};
  if(line&&p.xType==='quantitative'&&(p.axes.x.reverse||(p.axes.x.calibrated&&(p.axes.x.v2-p.axes.x.v1)/(p.axes.x.p2-p.axes.x.p1)<0)))enc.x.scale={...(enc.x.scale||{}),reverse:true};
  if(line&&p.xType==='ordinal'&&optional.includes('path_order'))enc.x.sort=p.categoryObjects.filter(c=>categoryKeys.includes(c.key)).map(c=>repeatedCategory?'X'+(categoryKeys.indexOf(c.key)+1):c.name);
  if(withSeries)enc.color={field:rows[0].series_id?'series_id':'series',type:'nominal',sort:null};
  if(['barh_n','barv_n'].includes(p.kind))enc[cat+'Offset']={...enc.color};
  if(stack) {
    if(optional.includes('start')) {enc[val].field='end';enc[val].stack=null;enc[val+'2']={field:'start'};}
    else {enc[val].stack='zero';enc.order={field:'stack_order',type:'quantitative'};}
  }
  let mark={type:bar?'bar':line?'line':'point'};
  if(line&&unique(p.rows.map(identity)).some(id=>p.rows.filter(r=>identity(r)===id).length===1))mark.point=true;
  if(line&&optional.includes('path_order'))enc.order={field:'path_order',type:'quantitative'};
  else if(line){const last=new Map();if(ordered.some(r=>{const id=identity(r),x=p.xType==='ordinal'?categoryKeys.indexOf(categoryIdentity(r)):r.x;const same=last.has(id)&&x<=last.get(id);last.set(id,x);return same;}))mark.order=false;}
  const out={};
  if(present(p.title))out.title=copy(p.title);
  out.data={values:rows};
  if(bar&&optional.includes('lower')) {
    out.encoding=orderEncoding(enc);
    out.layer=[{mark:{type:'bar'}},{mark:{type:'errorbar'},encoding:orderEncoding({[val]:{field:'lower',type:'quantitative',...(stack?{stack:null}:{})},[val+'2']:{field:'upper'}})}];
  } else {out.mark=mark;out.encoding=orderEncoding(enc);}
  return out;
}

function importSpec(input) {
  const s=copy(input);
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('GT 必须为 JSON 对象');
  if(!s.data||!Array.isArray(s.data.values)||!s.data.values.length)throw Error('只支持包含 data.values 的非空内联 Vega-Lite 图表');
  if(markType(s.mark)==='area')return importAreaSpec(s);
  if(markType(s.mark)==='arc'||Array.isArray(s.layer)&&s.layer.some(l=>markType(l.mark)==='tick'))return importStatSpec(s);
  if(s.transform||s.concat||s.hconcat||s.vconcat||s.facet||s.repeat)throw Error('当前工具不支持变换或组合图表导入');
  if(s.usermeta?.semantic)throw Error('请导入合成数据的精简 GT，而不是包含 plot_* 布局字段的完整渲染 spec');
  if(s.layer&&(!Array.isArray(s.layer)||s.layer.some(l=>l.transform||l.data||l.layer||l.resolve)))throw Error('不支持带独立数据、变换或嵌套结构的图层');
  const primary=s.layer?.find(l=>['bar','line','point'].includes(typeof l.mark==='string'?l.mark:l.mark?.type));
  const enc={...(s.encoding||{}),...(primary?.encoding||{})};
  const mark=primary?.mark??s.mark;
  const type=typeof mark==='string'?mark:mark?.type;
  if(!['bar','line','point'].includes(type)||!enc.x||!enc.y)throw Error('仅支持柱、折线、散点图的 x/y 编码');
  if(typeof mark==='object'&&Object.keys(mark).some(k=>!['type','order','point'].includes(k)))throw Error('导入包含额外标记属性，请先转换为精简 GT');
  if(Object.keys(enc).some(k=>!['x','y','x2','y2','color','xOffset','yOffset','order'].includes(k)))throw Error('导入包含当前十类工具尚不支持的视觉编码');
  for(const [channel,def] of Object.entries(enc)) {
    const lineDomain=type==='line'&&channel==='x'&&enc.order?.field==='path_order'&&Array.isArray(def.sort);
    if(lineDomain&&(new Set(def.sort).size!==def.sort.length||def.sort.length!==unique(s.data.values.map(r=>r[def.field])).length||s.data.values.some(r=>!def.sort.includes(r[def.field]))))throw Error('折线显式 X 顺序必须恰好覆盖观测位置');
    if(def.condition||def.aggregate||def.bin||def.timeUnit||def.datum!==undefined||def.value!==undefined||def.sort!=null&&!lineDomain)throw Error('导入包含条件、聚合、分箱、常数或不支持的排序编码，不进行有损转换');
    if(def.axis?.labelExpr||def.legend?.labelExpr)throw Error('请使用当前规范的 category_id / x_id / series_id 身份字段，不导入旧版标签表达式');
  }
  const horizontal=type==='bar'&&['nominal','ordinal'].includes(enc.y.type);
  const val=horizontal?'x':'y',cat=horizontal?'y':'x';
  const seriesField=enc.color?.field;
  const ids=unique(s.data.values.map(r=>seriesField?r[seriesField]:'Series 1'));
  const stacked=type==='bar'&&(present(enc[val].stack)&&enc[val].stack!==null||enc[val+'2']||enc.order?.field==='stack_order');

  if(enc[val].stack&&!['zero'].includes(enc[val].stack))throw Error('当前规范仅支持 zero 堆叠；百分比图需直接标注图中归一化数值');
  const kind=type==='bar'?(stacked?`bar${horizontal?'h':'v'}_stack`:`bar${horizontal?'h':'v'}_${ids.length>1||enc[cat+'Offset']?'n':'1'}`):`${type==='line'?'line':'scatter'}_${ids.length>1?'n':'1'}`;
  const p=defaultProject(kind);
  p.title=typeof s.title==='object'&&!Array.isArray(s.title)?s.title.text??'':s.title??'';
  p.xTitle=enc.x.title??enc.x.axis?.title??'';p.yTitle=enc.y.title??enc.y.axis?.title??'';
  p.xType=enc.x.type==='quantitative'?'quantitative':'ordinal';
  p.legend=!!seriesField&&enc.color.legend!==null;
  p.series=ids.map((name,i)=>({name:s.data.values.find(r=>r[seriesField]===name)?.series??name,color:['#4263eb','#e8590c','#12b886','#ae3ec9'][i%4]}));
  for(const channel of ['x','y']) {
    const scale=enc[channel].scale;
    if(scale?.type&&!['linear','log'].includes(scale.type))throw Error('当前测量工具仅支持线性/对数轴；不转换其他非线性轴');
    p.axes[channel].type=scale?.type??'linear';
    p.axes[channel].reverse=!!scale?.reverse;
    if(scale?.type==='log')p.axes[channel].v1=1;
  }
  // Legacy rule intervals are accepted only on import and always re-exported as native errorbar.
  const errorLayer=s.layer?.find(l=>['errorbar','rule'].includes(typeof l.mark==='string'?l.mark:l.mark?.type));
  if(s.layer&&(type!=='bar'||s.layer.length>(errorLayer?2:1)||s.layer.some(l=>l!==primary&&l!==errorLayer)))throw Error('只支持主柱图层与显式误差区间 errorbar 图层（兼容导入旧版 rule）');
  if(errorLayer&&(!errorLayer.encoding?.[val]?.field||!errorLayer.encoding?.[val+'2']?.field||Object.keys(errorLayer.encoding).some(k=>![val,val+'2'].includes(k))))throw Error('误差图层只允许数值轴的 lower/upper 区间编码');
  p.rows=s.data.values.map(r=>{
    const row=type==='bar'?{category:r[enc[cat].field],value:r[enc[val].field]}:{x:r[enc.x.field],y:r[enc.y.field]};
    row.series=seriesField?(r.series??r[seriesField]):'Series 1';
    for(const k of ['category_id','x_id','series_id','category_instance','x_instance','series_instance','path_order','stack_order','start','end','lower','upper'])if(present(r[k]))row[k]=r[k];
    for(const field of ['category','x'])if([field+'_instance',field+'_id'].includes(enc[type==='bar'?cat:'x'].field))row[field]=r[field];
    if(stacked&&enc[val+'2']) {row.start=r[enc[val+'2'].field];row.end=r[enc[val].field];row.value=r.value??row.end-row.start;}
    if(errorLayer) {row.lower=r[errorLayer.encoding?.[val]?.field];row.upper=r[errorLayer.encoding?.[val+'2']?.field];}
    return row;
  });
  p.categories=unique(p.rows.map(r=>type==='bar'?r.category:r.x));delete p.categoryObjects;ensureIdentities(p);
  if(type==='line'&&p.xType==='ordinal'&&Array.isArray(enc.x.sort)){
    const refs=new Map(s.data.values.map((r,i)=>[r[enc.x.field],p.rows[i]._categoryKey]));
    p.categoryObjects.sort((a,b)=>enc.x.sort.findIndex(v=>refs.get(v)===a.key)-enc.x.sort.findIndex(v=>refs.get(v)===b.key));p.categories=p.categoryObjects.map(c=>c.name);
  }
  if(stacked&&enc[val+'2']&&stackNeedsEndpoints(p))p.stackEndpointMode='explicit';
  // Compact-v4 omits display reversal; its observation table still follows screen order.
  // Recover a descending reading direction from that table for lossless re-export.
  if(type==='point'&&p.xType==='quantitative'&&!enc.x.scale?.reverse) {
    const xs=unique(p.rows.map(r=>r.x));
    if(xs.length>1&&xs.every((v,i)=>!i||v<xs[i-1]))p.axes.x.reverse=true;
  }
  if(type==='point'&&!enc.y.scale?.reverse) {
    const tie=p.rows.findIndex((r,i)=>i>0&&r.x===p.rows[i-1].x&&r.y!==p.rows[i-1].y);
    if(tie>0)p.axes.y.reverse=p.rows[tie].y>p.rows[tie-1].y;
  }

  return p;
}

function markType(mark){return typeof mark==='string'?mark:mark?.type;}

function validateArea(p,issue){
  const multi=p.kind!=='area_1',stacked=p.kind==='area_stack',nominal=isNominalArea(p);
  const ranks=new Map(p.series.map((s,i)=>[s.key,stackRank(s,i)]));
  if(nominal){
    const names=p.categoryObjects.map(c=>c.name);
    if(names.some(name=>typeof name!=='string'||!name.trim())||new Set(names).size!==names.length){
      issue('error','Nominal 面积图的类别位置须使用非空且唯一的文字标签');
    }
  }
  if(!multi&&p.series.length!==1)issue('error','单系列面积图只允许一个系列');
  if(multi&&(p.series.some(s=>typeof s.name!=='string'||!s.name.trim())||
      new Set(p.series.map(s=>s.name)).size!==p.series.length)){
    issue('error','面积图系列名称必须非空且唯一');
  }
  if(stacked&&p.series.some((s,i)=>{
    const rank=ranks.get(s.key);
    return !Number.isSafeInteger(rank)||rank<0||i>0&&rank<=ranks.get(p.series[i-1].key);
  }))issue('error','堆叠顺序须为从底层到顶层递增的非负整数');
  const bySeries=new Map(),byX=new Map();
  p.rows.forEach((r,i)=>{
    const prefix=`第 ${i+1} 行：`;
    for(const field of nominal?['y','baseline']:['x','y','baseline']){
      if(!finite(r[field]))issue('error',prefix+field+' 必须是有限数字');
      else if(p.axes[field==='x'?'x':'y'].type==='log'&&r[field]<=0)issue('error',prefix+field+' 在对数轴上必须大于零');
    }
    if(finite(r.y)&&finite(r.baseline)&&r.y<r.baseline)issue('error',prefix+'上边界 y 不能小于下边界 baseline');
    const id=identity(r);
    if(!bySeries.has(id))bySeries.set(id,[]);
    const x=nominal?categoryIdentity(r):r.x;
    bySeries.get(id).push(x);
    if(stacked&&(nominal||finite(x))&&finite(r.y)&&finite(r.baseline)){
      if(!byX.has(x))byX.set(x,new Map());
      byX.get(x).set(ranks.get(id),r);
    }
  });
  if(multi&&bySeries.size<2)issue('warning','当前只有一个系列，请确认面积图子类型');
  if([...bySeries.values()].some(xs=>new Set(nominal?xs:xs.filter(finite)).size<2)){
    issue('warning',nominal?'部分系列不足两个类别，无法显示有宽度的面积':'部分系列不足两个不同的 X，无法显示有宽度的面积');
  }
  if([...bySeries.values()].some(xs=>xs.length!==new Set(xs).size)){
    if(nominal)issue('error','每个类别和系列只允许一条面积边界记录');
    else issue('warning','同一系列存在重复 X，请核对边界取样顺序');
  }
  if(stacked&&p.series.slice(1).some((s,i)=>{
    const lower=ranks.get(p.series[i].key),upper=ranks.get(s.key);
    return [...byX.values()].some(layers=>{
      const y=layers.get(lower)?.y,baseline=layers.get(upper)?.baseline;
      return finite(y)&&finite(baseline)&&Math.abs(y-baseline)>1e-8*Math.max(1,Math.abs(y),Math.abs(baseline));
    });
  }))issue('warning','部分堆叠层在共同 X 处的相邻边界未对齐，请核对原图或堆叠顺序');
}

function makeAreaSpec(p){
  const stacked=p.kind==='area_stack',multi=p.kind!=='area_1',nominal=isNominalArea(p);
  const xField=categoryField(p);
  const ranks=new Map(p.series.map((s,i)=>[s.key,stackRank(s,i)]));
  let rows=p.rows;
  if(nominal){
    const positions=new Map(p.categoryObjects.map((c,i)=>[c.key,i]));
    rows=[...rows].sort((a,b)=>positions.get(categoryIdentity(a))-positions.get(categoryIdentity(b))||
      (stacked?ranks.get(identity(a))-ranks.get(identity(b)):0));
  }
  const values=rows.map(r=>({[xField]:r[xField],y:r.y,baseline:r.baseline,
    ...(multi?{series:r.series}:{}),...(stacked?{stack_order:ranks.get(identity(r))}:{})}));
  // Vega-Lite uses order for path sorting. Equal ranks within a series therefore need X-ordered input.
  if(stacked&&!nominal)values.sort((a,b)=>a.x-b.x||a.stack_order-b.stack_order);
  const encoding={};
  for(const axis of ['x','y']){
    const title=p[axis+'Title'];
    if(axis==='x'&&nominal){
      encoding.x={field:xField,type:'nominal',sort:null,...(present(title)?{title:copy(title)}:{})};
      continue;
    }
    const def=encoding[axis]={field:axis,type:'quantitative'};
    if(present(title))def.title=copy(title);
    const {type,reverse:importedReverse,calibrated,p1,p2,v1,v2}=p.axes[axis];
    // Calibration takes precedence over the axis direction from an imported GT.
    const slope=(v2-v1)/(p2-p1);
    const reverse=calibrated?(axis==='x'?slope<0:slope>0):importedReverse;
    if(type==='log'||reverse)def.scale={...(type==='log'?{type}:{}),...(reverse?{reverse:true}:{})};
  }
  encoding.y.stack=null;
  encoding.y2={field:'baseline'};
  if(multi)encoding.color={field:'series',type:'nominal',sort:null};
  if(stacked)encoding.order={field:'stack_order',type:'quantitative'};
  return {...(present(p.title)?{title:copy(p.title)}:{}),data:{values},mark:{type:'area'},encoding};
}

function importAreaSpec(s){
  if(['transform','layer','concat','hconcat','vconcat','facet','repeat'].some(k=>k in s)){
    throw Error('面积图 GT 只支持直接记录上下边界的单图');
  }
  if(typeof s.mark==='object'&&Object.keys(s.mark).some(k=>k!=='type'))throw Error('面积图 GT 仅接受 area 标记类型');
  const enc=s.encoding;
  if(!enc||typeof enc!=='object'||Array.isArray(enc))throw Error('面积图 GT 缺少 encoding 对象');
  const stacked='order' in enc,multi='color' in enc,nominal=enc.x?.type==='nominal';
  const xField=nominal?'category':'x';
  const channels=['x','y','y2',...(multi?['color']:[]),...(stacked?['order']:[])];
  const matches=(def,fields,optional=[])=>def&&Object.keys(def).every(k=>k in fields||optional.includes(k))&&
    Object.entries(fields).every(([k,v])=>def[k]===v);
  if(Object.keys(enc).some(k=>!channels.includes(k))||
      !(nominal?matches(enc.x,{field:xField,type:'nominal',sort:null},['title']):
        matches(enc.x,{field:xField,type:'quantitative'},['title','scale']))||
      !matches(enc.y,{field:'y',type:'quantitative',stack:null},['title','scale'])||
      !matches(enc.y2,{field:'baseline'})||
      multi&&!matches(enc.color,{field:'series',type:'nominal',sort:null})||
      stacked&&(!multi||!matches(enc.order,{field:'stack_order',type:'quantitative'},['sort'])||
        enc.order.sort!==undefined&&enc.order.sort!=='ascending')){
    throw Error('面积图 GT 须使用数值 x 或 Nominal category，并绑定 y、y2=baseline、y.stack=null；多系列绑定 series，堆叠顺序绑定 stack_order');
  }
  const p=defaultProject(stacked?'area_stack':multi?'area_n':'area_1');
  if(nominal)p.xType='nominal';
  p.title=s.title??'';
  for(const axis of ['x','y']){
    const def=enc[axis],scale=def.scale??{};
    if(Object.keys(scale).some(k=>!['type','reverse'].includes(k))||
        !['linear','log'].includes(scale.type??'linear')||typeof (scale.reverse??false)!=='boolean'){
      throw Error('面积图仅支持线性或对数数值轴');
    }
    p[axis+'Title']=def.title??'';
    p.axes[axis].type=scale.type??'linear';
    p.axes[axis].reverse=scale.reverse??false;
    if(scale.type==='log')p.axes[axis].v1=1;
  }
  const series=new Map(),fields=[xField,'y','baseline',...(multi?['series']:[]),...(stacked?['stack_order']:[])];
  p.rows=s.data.values.map(r=>{
    if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).some(k=>!fields.includes(k))||
        multi&&(typeof r.series!=='string'||!r.series.trim())){
      throw Error('面积图数据行须使用 '+xField+'、y、baseline 及该子类型的系列字段');
    }
    const name=multi?r.series:'Series 1';
    if(!series.has(name))series.set(name,{key:newKey('series'),name,
      color:['#4263eb','#e8590c','#12b886','#ae3ec9'][series.size%4],...(stacked?{stackOrder:r.stack_order}:{})});
    const item=series.get(name);
    if(stacked&&(!Number.isSafeInteger(r.stack_order)||r.stack_order<0||item.stackOrder!==r.stack_order)){
      throw Error('同一系列的 stack_order 必须为一致的非负整数');
    }
    return {[xField]:r[xField],y:r.y,baseline:r.baseline,series:name,_seriesKey:item.key};
  });
  p.series=[...series.values()];
  if(stacked)p.series.sort((a,b)=>a.stackOrder-b.stackOrder);
  if(nominal){
    if(p.rows.some(r=>typeof r.category!=='string'||!r.category.trim()))throw Error('Nominal 面积图的 category 必须为非空字符串');
    ensureIdentities(p);
  }
  const errors=validate(p).filter(i=>i.severity==='error');
  if(errors.length)throw Error(errors.map(i=>i.message).join('\n'));
  return p;
}
function validateStat(p){
  const issues=[],issue=(severity,message)=>issues.push({severity,message});
  const text=v=>typeof v==='string'||Array.isArray(v)&&v.length>0&&v.every(x=>typeof x==='string');
  for(const k of ['title','xTitle','yTitle','valueTitle','valueFormat'])if(present(p[k])&&!text(p[k]))issue('error',k+' 需要文字');
  if(isPie(p)&&!['percent','absolute'].includes(p.valueMode))issue('error','请选择百分比或绝对数值模式');
  const seen=new Set();
  p.rows.forEach((r,i)=>{
    const prefix=`第 ${i+1} 行：`;
    if(typeof r.category!=='string'||!r.category.trim())issue('error',prefix+'类别不能为空');
    if(seen.has(r.category))issue('error',prefix+'类别重复，请核对');seen.add(r.category);
    for(const k of isPie(p)?['value']:BOX_FIELDS)if(!finite(r[k]))issue('error',prefix+k+' 必须是有限数字');
    if(isPie(p)){if(finite(r.value)&&r.value<0)issue('error',prefix+'饼图数值不能为负数');}
    else{
      if(!Array.isArray(r.outliers)||!r.outliers.every(finite))issue('error',prefix+'outliers 必须是有限数字数组');
      if(BOX_FIELDS.every(k=>finite(r[k]))&&BOX_FIELDS.some((k,j)=>j&&r[BOX_FIELDS[j-1]]>r[k]))issue('error',prefix+'必须满足 lower ≤ q1 ≤ median ≤ q3 ≤ upper');
      if(p.axes?.[valueAxis(p)]?.type==='log'&&[...BOX_FIELDS.map(k=>r[k]),...(Array.isArray(r.outliers)?r.outliers:[])].some(v=>finite(v)&&v<=0))issue('error',prefix+'对数轴数值必须大于零');
    }
  });
  if(isPie(p)){
    const total=p.rows.reduce((n,r)=>n+r.value,0);
    if(finite(total)&&total<=0)issue('error','饼图至少需要一个正数值');
    if(p.valueMode==='percent'&&p.rows.every(r=>finite(r.value))&&Math.abs(total-100)>1e-8)issue('warning',`百分比总和为 ${total}，不等于 100；请核对原图，数据未被修改。`);
  }
  for(const a of requiredAxes(p))if(p.axes?.[a]?.calibrated)try{axisTransform(p.axes[a]);}catch(e){issue('error',a.toUpperCase()+' 轴：'+e.message);}
  return issues;
}
function makeStatSpec(p){
  const fields=isPie(p)?['category','value']:['category',...BOX_FIELDS,'outliers'];
  const spec={data:{values:p.rows.map(r=>Object.fromEntries(fields.map(k=>[k,copy(r[k])])) )}};
  if(present(p.title))spec.title=copy(p.title);
  if(isPie(p)){
    spec.mark={type:'arc'};
    spec.encoding={theta:{field:'value',type:'quantitative',...(present(p.valueTitle)?{title:copy(p.valueTitle)}:{})},color:{field:'category',type:'nominal'}};
  }else{
    const v=valueAxis(p),c=v==='x'?'y':'x',title=p[v+'Title'];
    const position={field:'lower',type:'quantitative',...(present(title)?{title:copy(title)}:{}),...(p.valueFormat?{axis:{format:p.valueFormat}}:{})};
    if(p.axes[v].type==='log')position.scale={type:'log'};
    spec.encoding={[c]:{field:'category',type:'nominal',sort:null,...(present(p[c+'Title'])?{title:copy(p[c+'Title'])}:{})}};
    spec.layer=[
      {mark:{type:'rule'},encoding:{[v]:position,[v+'2']:{field:'upper'}}},
      {mark:{type:'bar'},encoding:{[v]:{field:'q1',type:'quantitative'},[v+'2']:{field:'q3'}}},
      {mark:{type:'tick'},encoding:{[v]:{field:'median',type:'quantitative'}}},
      {transform:[{flatten:['outliers']}],mark:{type:'point'},encoding:{[v]:{field:'outliers',type:'quantitative'}}}
    ];
  }
  return spec;
}
function importStatSpec(s){
  if(s.transform||s.concat||s.hconcat||s.vconcat||s.facet||s.repeat||s.usermeta?.semantic)throw Error('请使用内联数据的 Pie / 预计算 Box Plot Compact GT');
  const pie=markType(s.mark)==='arc',layers=s.layer||[],enc=s.encoding||{};
  const horizontal=['nominal','ordinal'].includes(enc.y?.type),v=horizontal?'x':'y',c=horizontal?'y':'x';
  const p=defaultProject(pie?'pie':horizontal?'boxplot_h':'boxplot_v');
  const title=d=>d?.title??d?.axis?.title??'';
  const checkDef=d=>{if(!d||typeof d.field!=='string'||d.aggregate||d.bin||d.timeUnit||d.condition||d.datum!==undefined||d.value!==undefined||d.sort!=null)throw Error('只支持无统计变换和显式排序的字段映射');};
  let mapping;
  if(pie){
    if(s.layer||!enc.theta||!enc.color||Object.keys(enc).some(k=>!['theta','color'].includes(k)))throw Error('Pie 需要 theta 数值和 color 类别映射');
    checkDef(enc.theta);checkDef(enc.color);
    if(enc.theta.type!=='quantitative'||!['nominal','ordinal'].includes(enc.color.type))throw Error('Pie 字段类型不正确');
    mapping={category:enc.color.field,value:enc.theta.field};p.valueTitle=title(enc.theta);p.valueMode=String(p.valueTitle).includes('%')?'percent':'absolute';p.donut=!!s.mark?.innerRadius;
  }else{
    if(layers.length!==4||!['rule','bar','tick','point'].every((k,i)=>markType(layers[i].mark)===k)||!enc[c]||Object.keys(enc).some(k=>![c,v].includes(k)))throw Error('Box Plot 需要类别映射和 rule + bar + tick + point 四层');
    checkDef(enc[c]);
    const defs=layers.map(l=>({...enc,...l.encoding}));
    const pos=defs[0][v];checkDef(pos);
    if(pos.type!=='quantitative')throw Error('箱线图数值轴必须为 quantitative');
    mapping={category:enc[c].field,lower:pos.field,upper:defs[0][v+'2']?.field,q1:defs[1][v]?.field,q3:defs[1][v+'2']?.field,median:defs[2][v]?.field};
    for(const l of layers){if(l.data||l.layer||l.resolve||Object.keys(l.encoding||{}).some(k=>![v,v+'2'].includes(k)))throw Error('箱线图层只支持数值轴映射');for(const d of Object.values(l.encoding||{}))checkDef(d);}
    if(layers.slice(0,3).some(l=>l.transform))throw Error('五数统计量必须预先计算');
    const ts=layers[3].transform,flat=ts?.[0];
    if(!Array.isArray(ts)||ts.length>2||flat?.flatten?.length!==1||Object.keys(flat).some(k=>!['flatten','as'].includes(k)))throw Error('异常值图层需要单列 flatten');
    const output=flat.as?.[0]??flat.flatten[0];
    if(defs[3][v]?.field!==output||ts[1]&&ts[1].filter!==`isValid(datum.${output})`)throw Error('不支持该异常值过滤或字段映射');
    mapping.outliers=flat.flatten[0];p[v+'Title']=title(pos);p[c+'Title']=title(enc[c]);p.valueFormat=pos.axis?.format??'';
    const scale=pos.scale;
    if(scale?.type&&!['linear','log'].includes(scale.type))throw Error('仅支持线性和对数数值轴');
    p.axes[v].type=scale?.type??'linear';if(p.axes[v].type==='log')p.axes[v].v1=1;
  }
  if(Object.values(mapping).some(k=>typeof k!=='string'))throw Error('统计字段映射不完整');
  p.title=typeof s.title==='object'&&!Array.isArray(s.title)?s.title.text??'':s.title??'';
  p.rows=s.data.values.map(r=>Object.fromEntries(Object.entries(mapping).map(([k,f])=>[k,copy(r[f]===undefined?null:r[f])])));
  p.categories=p.rows.map(r=>r.category);delete p.categoryObjects;ensureIdentities(p);
  const errors=validate(p).filter(i=>i.severity==='error');if(errors.length)throw Error(errors.map(i=>i.message).join('\n'));
  return p;
}

function requiredAxes(p){return isPie(p)?[]:isBar(p)||isBox(p)?[valueAxis(p)]:isNominalArea(p)||!isArea(p)&&p.xType==='ordinal'?['y']:['x','y'];}
function hasRows(p){
  return p.rows.length>0||isArea(p)&&Object.values(p.areaModes??{}).some(mode=>mode.rows.length>0);
}
const AREA_MODE_FIELDS=['rows','evidence','categoryObjects','series','axes','assist','title','xTitle','yTitle'];
const areaMode=p=>isNominalArea(p)?'nominal':'quantitative';
const areaModeData=p=>Object.fromEntries(AREA_MODE_FIELDS.map(k=>[k,p[k]]));
function switchAreaMode(p,next){
  const current=areaMode(p);
  if(current===next)return;
  p.areaModes??={};
  const active=p.areaModes[next]??{rows:[],evidence:[],categoryObjects:[],series:copy(p.series),axes:copy(p.axes),
    title:p.title,xTitle:p.xTitle,yTitle:p.yTitle};
  p.areaModes[current]=areaModeData(p);
  delete p.areaModes[next];
  for(const field of AREA_MODE_FIELDS)p[field]=active[field];
  p.xType=next;
  ensureIdentities(p);
}
function keepOtherAreaMode(p,next){
  if(!isArea(next)||next.kind!==p.kind)return;
  next.areaModes=areaMode(next)===areaMode(p)?p.areaModes:{[areaMode(p)]:areaModeData(p)};
}
function restoreAreaMeasurementPrecision(p){
  if(!isArea(p))return;
  // Pixel evidence identifies which boundary in an older draft was measured.
  for(const mode of [p,...Object.values(p.areaModes??{})]){
    if(!Array.isArray(mode?.rows))continue;
    mode.rows.forEach((row,i)=>{
      const e=mode.evidence?.[i];
      if(finite(e?.xPixel)&&finite(row?.x))row.x=roundAreaMeasurement(row.x);
      if(e?.pixel&&finite(row?.y))row.y=roundAreaMeasurement(row.y);
      if(e?.baselinePixel&&finite(row?.baseline))row.baseline=roundAreaMeasurement(row.baseline);
    });
  }
}
function hasErrors(p){return !!p.errorBars||isBar(p)&&p.rows.some(r=>present(r.lower)||present(r.upper));}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// ZIP stored entries with UTF-8 names: a single download, no runtime dependencies.
function zipBytes(entries){const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;
for(const entry of entries){const name=encoder.encode(entry.name),data=encoder.encode(entry.text),crc=crc32(data);if(name.length>65535||data.length>0xffffffff)throw Error('ZIP 条目过大');const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);parts.push(local,data);directory.push(central);offset+=local.length+data.length;}
if(entries.length>65535||offset>0xffffffff)throw Error('ZIP 超过容量限制，请拆分项目');const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);const out=new Uint8Array(offset+size+22);let at=0;for(const b of [...parts,...directory,end]){out.set(b,at);at+=b.length;}return out;}
function safeExportName(name){return String(name||'chart').replace(/\\/g,'/').split('/').filter(v=>v&&v!=='.'&&v!=='..').map(v=>v.replace(/[<>:"|?*\u0000-\u001f]/g,'_')).join('/').replace(/\.[^/.]+$/,'')+'.gt.json';}

const $=id=>document.getElementById(id), clone=x=>structuredClone(x);
const labels={barh_1:'单系列横向柱图',barh_n:'分组横向柱图',barv_1:'单系列纵向柱图',barv_n:'分组纵向柱图',barv_stack:'堆叠纵向柱图',barh_stack:'堆叠横向柱图',line_1:'单系列折线图',line_n:'多系列折线图',scatter_1:'单系列散点图',scatter_n:'多系列散点图',area_1:'Single-series Area / 单系列',area_n:'Multi-series Area / 多系列',area_stack:'Stacked Area / 堆叠',pie:'Pie / 饼图（含环形）',boxplot_v:'Box Plot Vertical / 纵向',boxplot_h:'Box Plot Horizontal / 横向'};
for(const kind of ['barh_1','barh_n','barv_1','barv_n'])labels[kind+'_error']=labels[kind]+' · 误差棒';
let projects=[],currentProjectId=null,focusMode=false,focusZoom=1,imageLoadVersion=0,activationVersion=0;
let hover=null,selectedHandle='pixel',dragOrigin=null,projectionInfo=null;
let p=defaultProject('scatter_1'),image=null,imageData=null,fileName='',tool='select',selected=-1,zoom=1,calTarget='x1',pendingStart=null,drag=null,history=[],future=[],queue=[],activeId=null,renderTimer,saveTimer,renderOk=false,lastSpec=null;
const canvas=$('canvas'),ctx=canvas.getContext('2d');
const bar=()=>p.kind.startsWith('bar'), horizontal=()=>isHorizontal(p), categorical=()=>!isPie(p)&&(bar()||isBox(p)||isNominalArea(p)||p.xType==='ordinal');
function fresh(kind,xType){const q=defaultProject(kind);if(isArea(q)&&xType==='nominal')q.xType=xType;q.rows=[];q.evidence=[];q.reviewed=false;for(const a of Object.values(q.axes))a.calibrated=false;return q;}
p=fresh('scatter_1');
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500);}
function checkpoint(){history.push(clone(p));if(history.length>80)history.shift();future=[];}
function dirty(){p.reviewed=false;$('reviewed').checked=false;}
function change(fn,{form=false}={}){const old=clone(p);checkpoint();try{fn();}catch(e){p=old;history.pop();toast(e.message);return;}dirty();refresh(form);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function options(el,values,chosen){el.innerHTML=values.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');if(values.some(([v])=>String(v)===String(chosen)))el.value=chosen;}
const familyOf=kind=>kind==='pie'?'pie':kind.startsWith('boxplot')?'boxplot':kind.startsWith('bar')?'bar':kind.startsWith('line')?'line':kind.startsWith('area_')?'area':'scatter';
function syncTypes(){const family=familyOf(p.kind);$('family').value=family;options($('kind'),Object.entries(labels).filter(([k])=>familyOf(k)===family),p.kind+(hasErrors(p)&&!isStack(p)?'_error':''));}
syncTypes();
function syncForm(){ensureIdentities(p);syncTypes();$('seriesNames').value=p.series.map(s=>s.name).join('\n');for(const key of ['title','xTitle','yTitle','notes'])$(key).value=p[key]??'';$('legend').checked=p.legend;$('reviewed').checked=!!p.reviewed;syncCategoryList();$('xTypeLabel').hidden=!isArea(p)&&!p.kind.startsWith('line');
options($('xType'),isArea(p)?[['quantitative','Quantitative / 连续数值'],['nominal','Nominal / 类别']]:[['quantitative','连续数值'],['ordinal','离散类别']],p.xType??'quantitative');
$('areaModeNote').hidden=!isArea(p);$('addSeries').hidden=p.kind.endsWith('_1');$('activeSeries').closest('label').hidden=p.kind.endsWith('_1');$('seriesSection').hidden=p.kind.endsWith('_1')&&!p.legend;$('roleLabel').hidden=!p.kind.startsWith('line');$('connect').closest('label').hidden=!p.kind.startsWith('line');$('tableNote').textContent=bar()?(hasErrors(p)?'下限 / 上限是绝对数值界限，不是误差长度。':isStack(p)?'数据记录保留段起点 / 段终点供测量核对；普通堆叠的精简 GT / 导出 GT 统一使用 value、stack_order，不导出这些中间端点。':'每条记录对应一个柱子。'):p.kind.startsWith('line')?'默认按取点顺序连接；复杂路径可展开高级字段调整顺序。':'每条记录对应一个可见散点。';$('categoryLabel').hidden=!categorical();$('activeCategoryLabel').hidden=!categorical();const order=annotationOrder(p);$('orderGuide').textContent=order.records;$('seriesOrderNote').textContent=order.series;$('categoryOrderNote').textContent=order.category;
const active=$('activeSeries').value;options($('activeSeries'),p.series.map((s,i)=>[s.key,s.name+'（'+(i+1)+'）']),active);options($('activeCategory'),p.categoryObjects.map((c,i)=>[c.key,c.name+'（'+(i+1)+'）']),$('activeCategory').value);
$('seriesList').innerHTML=p.series.map((s,i)=>`<div class="series-row"><input type="color" aria-label="系列颜色" value="${esc(s.color||'#008b7e')}" data-series="${i}" data-prop="color"><input aria-label="系列名称" value="${esc(s.name)}" data-series="${i}" data-prop="name"><button data-move-series="${i}" data-delta="-1" title="上移">↑</button><button data-move-series="${i}" data-delta="1" title="下移">↓</button><button data-remove-series="${i}" title="删除系列">×</button></div>`).join('');
syncStatForm();
if(isArea(p)){
  $('legend').parentElement.hidden=true;
  $('seriesSection').hidden=p.kind==='area_1';
  $('tableNote').textContent=p.kind==='area_stack'?'每层记录累计上界 y 和实际下界 baseline；贡献值 = y − baseline。堆叠顺序在系列列表中调整。':'每个 X 记录实际的上界 y 和下界 baseline，包括固定或非零基线。';
}
if(!isArea(p)&&tool.startsWith('area-'))setTool('select');
else{axisForm();syncAssist();}}
function axisForm(){ const required=requiredAxes(p);$('categoryAxisNote').hidden=required.length===2;$('categoryAxisNote').textContent=required.length===1?(required[0]==='x'?'Y':'X')+' 轴是类别轴，无需数值标定；在类别顺序中填写标签即可。':'';$('axisFields').innerHTML=required.map(a=>`<div class="axis-group"><h4>${a.toUpperCase()} 轴 <small>${p.axes[a].calibrated?'已校准':'待校准'}</small></h4><label>坐标类型<select data-axis="${a}" data-field="type"><option value="linear" ${p.axes[a].type!=='log'?'selected':''}>线性</option><option value="log" ${p.axes[a].type==='log'?'selected':''}>对数</option></select></label>${[1,2].map(n=>`<div class="tick-row"><button data-tick="${a}${n}" class="${tool==='calibrate'&&calTarget===a+n?'active':''}">${a.toUpperCase()}${n} 取刻度</button><label>原图像素<input type="number" step="any" data-axis="${a}" data-field="p${n}" value="${p.axes[a]['p'+n]}"></label><label>真实数值<input type="number" step="any" data-axis="${a}" data-field="v${n}" value="${p.axes[a]['v'+n]}"></label></div>`).join('')}</div>`).join('');$('calibrationStatus').textContent=required.every(a=>p.axes[a].calibrated)?'所需数值轴已校准':'先取两个刻度再测量';}
function columns(){if(isPie(p))return ['category','value'];if(isBox(p))return ['category',...BOX_FIELDS,'outliers'];const series=p.kind.endsWith('_1')?[]:['series'];if(isArea(p))return [categoryField(p),'y','baseline',...series,...(p.kind==='area_stack'?['stack_order']:[])];return bar()?['category','value',...series,...(isStack(p)?['start','end']:[]),...(hasErrors(p)?['lower','upper']:[])]:['x','y',...series,...(p.kind.startsWith('line')&&$('advancedFields').checked?['path_order']:[])];}
const columnNames={category:'类别',value:'数值',series:'系列',x:'X',y:'Y',baseline:'下界 baseline',start:'段起点',end:'段终点',stack_order:'堆叠顺序',path_order:'路径顺序',lower:'下限',upper:'上限',q1:'Q1',median:'中位数',q3:'Q3',outliers:'异常值'};
function table(){const cols=columns();$('tableHead').innerHTML='<tr><th># / 来源</th>'+cols.map(k=>`<th>${isArea(p)&&k==='y'?'上界 Y':columnNames[k]}</th>`).join('')+'</tr>';
$('tableBody').innerHTML=p.rows.map((r,i)=>`<tr class="${i===selected?'selected':''}" data-row="${i}"><td>${isStat(p)?`<button class="small" data-move="-1" data-index="${i}" title="上移类别">↑</button><button class="small" data-move="1" data-index="${i}" title="下移类别">↓</button> `:''}${i+1} ${p.evidence?.[i]?.pixel?'⌖':'✎'}</td>${cols.map(k=>{
if(isBox(p)&&k==='outliers')return `<td>${outlierCells(r,i)}</td>`;if(isPie(p)&&k==='category')return `<td><input aria-label="第${i+1}行 类别" data-i="${i}" data-key="category" value="${esc(r.category)}"></td>`;
if(isArea(p)&&k==='stack_order'){const index=p.series.findIndex(s=>s.key===identity(r));return `<td>${stackRank(p.series[index],index)}</td>`;}
const kind=k==='series'?'series':k==='category'||k==='x'&&categorical()?'category':null;
if(kind){const list=kind==='series'?p.series:p.categoryObjects,ref=kind==='series'?'_seriesKey':'_categoryKey';return `<td><select aria-label="第${i+1}行 ${columnNames[k]}" data-i="${i}" data-object="${kind}">${list.map((o,j)=>`<option value="${esc(o.key)}" ${r[ref]===o.key?'selected':''}>${esc(o.name)}（${j+1}）</option>`).join('')}</select></td>`;}
return `<td><input aria-label="第${i+1}行 ${columnNames[k]}" data-i="${i}" data-key="${k}" value="${esc(r[k])}" type="number" step="any"></td>`;
}).join('')}</tr>`).join('');$('countBadge').textContent=`${p.rows.length} 条记录`;$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function syncCategoryList(){
  $('categories').value=p.categoryObjects.map(c=>c.name).join('\n');const list=$('categoryObjects');
  list.innerHTML=p.categoryObjects.map((c,i)=>`<div class="series-row"><input aria-label="类别位置 ${i+1} 名称" data-category="${esc(c.key)}" value="${esc(c.name)}"><button data-move-category="${esc(c.key)}" data-delta="-1" title="上移">↑</button><button data-move-category="${esc(c.key)}" data-delta="1" title="下移">↓</button><button data-remove-category="${esc(c.key)}" title="删除类别及记录">×</button></div>`).join('')+'<button type="button" id="addCategory">＋ 添加类别位置</button>';
  list.onchange=e=>{if(e.target.dataset.category)change(()=>renameObject(p,'category',e.target.dataset.category,e.target.value),{form:true});};
  list.onclick=e=>{const d=e.target.dataset;if(e.target.id==='addCategory')change(()=>addObject(p,'category','新类别'),{form:true});else if(d.moveCategory)change(()=>moveObject(p,'category',d.moveCategory,Number(d.delta)),{form:true});else if(d.removeCategory){if(p.rows.some(r=>r._categoryKey===d.removeCategory)&&!confirm('删除该类别位置及其全部记录？'))return;change(()=>{removeObject(p,'category',d.removeCategory);selected=-1;},{form:true});}};
}
function refresh(form=false){ensureIdentities(p);queueUI();if(form)syncForm();table();syncAssist();draw();clearTimeout(renderTimer);renderTimer=setTimeout(render,130);clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,450);}
let renderVersion=0;
async function render(){const version=++renderVersion;renderOk=false;let issues=validate(p);if(p.rows.length===0)issues=[{severity:'warning',message:'添加数据记录后生成 GT。'}];$('issues').innerHTML=issues.length?issues.map(i=>`<li class="${i.severity}">${esc(i.message)}</li>`).join(''):'<li class="ok">数据结构检查通过。请继续核对原图与科学数值。</li>';$('validationBadge').textContent=issues.filter(i=>i.severity==='error').length+' 个错误';
try{const gt=makeSpec(p);$('jsonPreview').textContent=JSON.stringify(gt,null,2);if(!window.vegaEmbed)throw Error('本地 Vega 渲染组件未加载');const spec={...renderSpec(gt),width:230,height:210};for(const a of ['x','y']){if(!isStat(p)&&!isArea(p)&&spec.encoding[a])spec.encoding[a].title=p[a+'Title']||null;}if(!isStat(p)&&!isArea(p)&&spec.encoding.color){spec.encoding.color.legend=p.legend?{...(spec.encoding.color.legend||{}),title:null}:null;const keys=unique(orderedRows(p).map(identity));spec.encoding.color.scale={domain:unique(gt.data.values.map(r=>r.series_id??r.series)),range:keys.map(k=>p.series.find(s=>s.key===k)?.color||'#008b7e')};}if(isPie(p)&&p.donut)spec.mark={type:'arc',innerRadius:55};if(isBox(p)){const v=valueAxis(p);spec.layer[1].mark={type:'bar',size:26};spec.layer[2].mark={type:'tick',orient:horizontal()?'vertical':'horizontal',color:'#243344',size:26,thickness:2};if(p.axes[v].type==='log')for(const l of spec.layer)l.encoding[v].scale={type:'log'};}const holder=document.createElement('div');const result=await window.vegaEmbed(holder,spec,{actions:false,renderer:'svg'});result.view.finalize();if(version!==renderVersion)return;$('preview').replaceChildren(holder);lastSpec=gt;renderOk=true;$('renderState').textContent='Vega-Lite v6 · 语义渲染成功';}catch(e){if(version!==renderVersion)return;lastSpec=null;$('jsonPreview').textContent='请先修正数据结构。';$('preview').replaceChildren();$('renderState').textContent=p.rows.length?'无法渲染：'+e.message:'添加记录后显示语义重绘';}}
function assist(){
  ensureIdentities(p);p.assist??={};const a=p.assist;
  a.sequence??=bar()||isNominalArea(p)?'category':'series';if(isStack(p)&&a.sequence!=='manual')a.sequence='category';a.errorOrder??='per-bar';a.projections??=true;a.magnify??=true;a.dragAxis??='free';a.categoryPixels??={};if(isBox(p)){a.boxField??='lower';a.outlierTarget??='new';}
  if(!p.series.some(s=>s.key===a.series))a.series=p.series.find(s=>s.name===a.series)?.key??p.series[0]?.key??'';
  if(!p.categoryObjects.some(c=>c.key===a.category))a.category=p.categoryObjects.find(c=>c.name===a.category)?.key??p.categoryObjects[0]?.key??'';
  return a;
}
function targetPairs(){const a=assist(),cats=p.categoryObjects.map(c=>c.key),series=p.series.map(s=>s.key);if(isBox(p))return cats.map(category=>({category,series:a.series}));return a.sequence==='series'?series.flatMap(series=>cats.map(category=>({series,category}))):cats.flatMap(category=>series.map(series=>({series,category})));}
function targetIndex(t){if(isBox(p))return p.rows.findIndex(r=>categoryIdentity(r)===t.category);return p.rows.findIndex(r=>identity(r)===t.series&&categoryIdentity(r)===t.category);}
function areaComplete(row){return finite(row?.y)&&finite(row?.baseline);}
function targetComplete(t){
  const row=p.rows[targetIndex(t)];
  if(isNominalArea(p))return areaComplete(row);
  if(isBox(p))return !!row&&BOX_FIELDS.every(k=>finite(row[k]));
  return hasErrors(p)?errorComplete(t):!!row;
}
function nextTarget(){const a=assist(),pairs=targetPairs(),at=pairs.findIndex(t=>t.series===a.series&&t.category===a.category);for(let offset=1;offset<=pairs.length;offset++){const t=pairs[(Math.max(at,0)+offset)%pairs.length];if(targetIndex(t)<0||(isBox(p)||isNominalArea(p))&&!targetComplete(t)){if(isBox(p))a.boxField='lower';a.series=t.series;a.category=t.category;syncAssist();return true;}}syncAssist();return false;}
function errorTask(){if(!hasErrors(p)||isStack(p))return null;const a=assist(),pairs=targetPairs(),fields=['value','upper','lower'];const missing=t=>{const i=targetIndex(t);return i<0||!finite(p.rows[i][t.field]);};if(!pairs.length)return {category:'',series:a.series,field:'value'};if(a.errorOrder==='passes')return fields.flatMap(field=>pairs.map(t=>({...t,field}))).find(missing)||null;const current={category:a.category,series:a.series},own=fields.map(field=>({...current,field})).find(missing);return own||pairs.flatMap(t=>fields.map(field=>({...t,field}))).find(missing)||null;}
function syncErrorTarget(){const t=errorTask();if(t){assist().series=t.series;assist().category=t.category;}return t;}
function errorComplete(t){const i=targetIndex(t);return i>=0&&['value','lower','upper'].every(k=>finite(p.rows[i][k]));}
function measureError(raw){const t=syncErrorTarget();if(!t){toast('误差棒全部标注完成；选择 / 拖动可复查');return;}calibrated();if(!t.category)throw Error('请先填写类别');const i=targetIndex(t),axis=horizontal()?'x':'y';const pt=t.field==='value'?constrainAdd(raw):{...raw,...(p.evidence?.[i]?.pixel?{[horizontal()?'y':'x']:p.evidence[i].pixel[horizontal()?'y':'x']}:{})};const value=pixelToValue(pt[axis],p.axes[axis]);change(()=>{let index=i;if(t.field==='value'&&i<0){p.rows.push({category:categoryName(p,t.category),series:seriesName(p,t.series),_categoryKey:t.category,_seriesKey:t.series,value});p.evidence??=[];p.evidence.push({role:'observation',source:'pixel_measurement',createdAt:new Date().toISOString()});index=p.rows.length-1;}p.rows[index][t.field]=value;p.evidence??=[];p.evidence[index]??={role:'observation',source:'pixel_measurement'};const key=t.field==='value'?'pixel':t.field+'Pixel';p.evidence[index][key]=pt;if(t.field==='value'&&assist().lockCategory){if(horizontal())p.evidence[index].fixedY={pixel:pt.y};else p.evidence[index].fixedX={pixel:pt.x};}selected=index;selectedHandle=key;syncErrorTarget();});}
function anchorKey(){const a=assist();return JSON.stringify(p.kind==='barv_n'||p.kind==='barh_n'?[a.category,a.series]:[a.category]);}
function syncAssist(){
  const a=assist(),task=syncErrorTarget();$('errorOrderLabel').hidden=!hasErrors(p)||isStack(p);$('errorOrder').value=a.errorOrder;for(const k of ['lower','upper'])document.querySelector('[data-tool='+k+']').hidden=!hasErrors(p);
  for(const k of ['area-upper','area-baseline']){
    const button=document.querySelector('[data-tool='+k+']');
    button.hidden=!isArea(p);button.disabled=!p.rows[selected]||!(isNominalArea(p)?present(p.rows[selected].category):finite(p.rows[selected].x));
  }$('advancedFieldsLabel').hidden=!p.kind.startsWith('line');$('activeSeries').value=a.series;$('activeCategory').value=a.category;
  $('sequence').value=a.sequence;$('sequenceLabel').hidden=!categorical()||isBox(p);$('nextTarget').hidden=!categorical();$('numericLock').hidden=categorical()||isPie(p);$('categoryLock').hidden=!categorical();
  for(const [id,key]of [['projections','projections'],['magnify','magnify'],['lockX','lockX'],['lockCategory','lockCategory']])$(id).checked=!!a[key];
  if(document.activeElement!==$('fixedX')){
    $('fixedX').value=isArea(p)&&(tool==='lock-x'||finite(a.fixedXPixel))?'':a.fixedXValue??'';
  }
  $('dragAxis').value=a.dragAxis;
  const pairs=categorical()?targetPairs():[],done=pairs.filter(targetComplete).length;
  $('targetHint').textContent=isPie(p)?'Pie：在数据表录入类别及原始数值':isBox(p)?`当前目标：${categoryName(p,a.category)||'请填写类别'} · ${a.boxField}`:categorical()?`当前目标：${categoryName(p,a.category)||'请先填写类别'} · ${seriesName(p,a.series)}`:`当前系列：${seriesName(p,a.series)}${a.lockX?' · 固定 X = '+(a.fixedXValue??'待填写'):''}`;
  if(isArea(p)){
    if(tool==='point'){
      const row=p.rows[areaTargetIndex()];
      $('targetHint').textContent+=isNominalArea(p)&&areaComplete(row)?' · 边界已完成':
        finite(row?.y)?' · 取下界 baseline（同一 X）':' · 取上界 Y';
    }else if(tool==='area-upper'||tool==='area-baseline'){
      $('targetHint').textContent=p.rows[selected]?`第 ${selected+1} 行 · X = ${p.rows[selected][categoryField(p)]} · ${tool==='area-upper'?'重取上界':'重取下界'}`:'请先选中有 X 数值的记录';
    }
  }
  if(hasErrors(p)&&!isStack(p))$('targetHint').textContent=task?'下一点：'+categoryName(p,task.category)+' · '+seriesName(p,task.series)+' · '+({value:'柱子数值端点',upper:'误差上界（较大值）',lower:'误差下界（较小值）'}[task.field]):'误差棒取点完成，可选择标记复查';$('targetTop').textContent=$('targetHint').textContent; $('targetProgress').textContent=pairs.length?`${done} / ${pairs.length} 已标注`:'';
  $('targetGrid').hidden=!categorical();$('targetGrid').innerHTML=pairs.map((t,i)=>`<button class="target-cell ${targetComplete(t)?'done':''} ${t.series===a.series&&t.category===a.category?'current':''}" data-target="${i}" title="${esc(categoryName(p,t.category)+' · '+seriesName(p,t.series))}">${targetComplete(t)?'✓ ':''}${esc(categoryName(p,t.category))} <small>${isBox(p)?BOX_FIELDS.filter(k=>finite(p.rows[targetIndex(t)]?.[k])).length+'/5':esc(seriesName(p,t.series))}</small></button>`).join('');
  const anchor=a.categoryPixels[anchorKey()];$('anchorStatus').textContent=Number.isFinite(anchor)?`已定位 ${anchor.toFixed(1)} px`:'尚未定位';
  $('unlockPoint').disabled=selected<0||!p.evidence?.[selected]?.fixedX;
  syncBoxTarget();$('magnifier').hidden=!image||!a.magnify||!hover;document.querySelector('.lens-dock').hidden=!a.magnify;document.querySelector('.image-stage').classList.toggle('no-lens',!a.magnify);
}
function constrainAdd(pt){const a=assist(),out={...pt};if(categorical()&&a.lockCategory){const pixel=a.categoryPixels[anchorKey()];if(!Number.isFinite(pixel))throw Error('请先定位当前类别刻度（分组柱需定位当前系列的柱中心）');out[horizontal()?'y':'x']=pixel;}
  if(!categorical()&&a.lockX){if(!Number.isFinite(a.fixedXValue))throw Error('请先填写固定 X 的真实数值');if(p.axes.x.type==='log'&&a.fixedXValue<=0)throw Error('对数 X 数值必须大于零');if(Number.isFinite(a.fixedXPixel))out.x=a.fixedXPixel;else{if(!p.axes.x.calibrated)throw Error('请在原图定位 X 刻度，或先校准 X 轴');out.x=valueToPixel(a.fixedXValue,p.axes.x);}}
  return bounded(out);
}
function bounded(pt){return{x:Math.max(0,Math.min(image.width,pt.x)),y:Math.max(0,Math.min(image.height,pt.y))};}
function constrainDrag(pt,i,kind='pixel',shift=false){const out=bounded(pt),e=p.evidence[i],old=e[kind]||e.pixel,a=assist();if(kind==='pixel'&&e.fixedX)out.x=old.x;if(kind==='pixel'&&e.fixedY)out.y=old.y;if(isBar(p)&&(kind==='lowerPixel'||kind==='upperPixel'))out[horizontal()?'y':'x']=(e.pixel||old)[horizontal()?'y':'x'];
  if(kind==='baselinePixel'||kind==='pixel'&&isNominalArea(p)||kind==='startPixel'&&e.fixedX)out.x=old.x;
  if(a.dragAxis==='y')out.x=old.x;if(a.dragAxis==='x')out.y=old.y;
  if(shift&&dragOrigin){if(Math.abs(out.x-dragOrigin.x)>=Math.abs(out.y-dragOrigin.y))out.y=dragOrigin.y;else out.x=dragOrigin.x;}return out;
}
function editHandle(i,kind,pt){
  if(isArea(p)){editAreaHandle(i,kind,pt);return;}
  if(isBox(p)){
    calibrated();
    const row=p.rows[i],field=boxHandleField(kind),value=boxValueAt(pt,p);
    if(field==='outliers')row.outliers[Number(kind.match(/\d+/)[0])]=value;
    else row[field]=value;
    p.evidence[i][kind]=pt;
    p.evidence[i].modifiedAt=new Date().toISOString();
    return;
  }
  const old=p.evidence[i][kind],axis=horizontal()?'x':'y';
  const related=isStack(p)&&['pixel','startPixel'].includes(kind)&&old?p.rows.flatMap((r,j)=>j!==i&&categoryIdentity(r)===categoryIdentity(p.rows[i])?['pixel','startPixel'].filter(k=>{const q=p.evidence?.[j]?.[k];return q&&q.x===old.x&&q.y===old.y;}).map(k=>({j,k})):[]):[];
  const update=(j,k)=>{if(k==='pixel')applyPixel(j,pt);else if(k==='startPixel'){p.evidence[j].startPixel={...pt};p.rows[j].start=pixelToValue(pt[axis],p.axes[axis]);p.rows[j].value=p.rows[j].end-p.rows[j].start;}else{const key=k==='lowerPixel'?'lower':'upper';p.evidence[j][k]={...pt};p.rows[j][key]=pixelToValue(pt[axis],p.axes[axis]);}p.evidence[j].modifiedAt=new Date().toISOString();};
  update(i,kind);for(const {j,k} of related)update(j,k);pendingStart=null;
}
function drawGuides(){
  if(isPie(p))return;
  const a=assist(),e=p.evidence?.[selected],selectedPt=e?.[selectedHandle]||e?.pixel;
  let pt=drag!==null||tool==='select'&&selectedPt?selectedPt:hover||selectedPt;if(!pt&&tool==='point'){try{if(a.lockX||a.lockCategory)pt=constrainAdd({x:p.axes.x.p1,y:p.axes.y.p1});}catch{}}if(!pt)return;
  if(hover&&drag===null)try{if(isArea(p)&&areaTool())pt=areaPoint(hover);else if(tool==='point')pt=constrainAdd(hover);}catch{}
  const baseX=p.axes.y.point1?.x??p.axes.x.p1,baseY=p.axes.x.point1?.y??p.axes.y.p1;
  const target=isArea(p)&&areaTool()?areaTargetIndex():hover&&tool==='point'&&drag===null?-1:selected;
  let values={};try{values=measureAt(pt,target>=0?target:null);}catch{}
  projectionInfo={point:{...pt},baseX,baseY,values};
  if(a.projections&&Object.keys(values).length){ctx.save();ctx.strokeStyle='#ed8b32';ctx.fillStyle='#9f5414';ctx.lineWidth=1/zoom;ctx.setLineDash([5/zoom,4/zoom]);ctx.beginPath();ctx.moveTo(baseX,pt.y);ctx.lineTo(pt.x,pt.y);ctx.lineTo(pt.x,baseY);ctx.stroke();ctx.setLineDash([]);ctx.font=`${11/zoom}px monospace`;const format=v=>typeof v==='number'?Number(v.toPrecision(6)):String(v??'');const x=isBox(p)?(horizontal()?values.value:values.category):bar()?(horizontal()?values.value:values.category):values[categoryField(p)],y=isBox(p)?(horizontal()?values.category:values.value):bar()?(horizontal()?values.category:values.value):values.y;
  const text=(s,x,y)=>{const w=ctx.measureText(s).width;ctx.fillStyle='#fffef3';ctx.fillRect(Math.max(0,x-3/zoom),Math.max(0,y-12/zoom),w+6/zoom,16/zoom);ctx.fillStyle='#9f5414';ctx.fillText(s,Math.max(0,Math.min(x,image.width-w)),Math.max(12/zoom,Math.min(y,image.height-3/zoom)));};
  text('X: '+format(x),pt.x+4/zoom,Math.min(image.height-4/zoom,baseY+18/zoom));text('Y: '+format(y),Math.max(2/zoom,baseX+5/zoom),pt.y-6/zoom);ctx.restore();}
  const fixed=(!categorical()&&a.lockX)||categorical()&&a.lockCategory;if(fixed&&tool==='point'||isArea(p)&&areaTool()&&target>=0){let guide;try{guide=isArea(p)?areaPoint(pt):constrainAdd(pt);}catch{}if(guide){ctx.save();ctx.strokeStyle='#008b7e';ctx.lineWidth=1.5/zoom;ctx.setLineDash([3/zoom,3/zoom]);ctx.beginPath();if(horizontal()){ctx.moveTo(0,guide.y);ctx.lineTo(image.width,guide.y);}else{ctx.moveTo(guide.x,0);ctx.lineTo(guide.x,image.height);}ctx.stroke();ctx.restore();}}
  const lens=$('magnifier');lens.hidden=!a.magnify||!hover;if(!lens.hidden){const lc=$('lens').getContext('2d');lc.clearRect(0,0,140,140);lc.fillStyle='white';lc.fillRect(0,0,140,140);lc.imageSmoothingEnabled=false;lc.drawImage(image,pt.x-14,pt.y-14,28,28,0,0,140,140);lc.strokeStyle='#f05c35';lc.lineWidth=1;lc.beginPath();lc.moveTo(58,70);lc.lineTo(82,70);lc.moveTo(70,58);lc.lineTo(70,82);lc.stroke();}
}
$('errorOrder').onchange=()=>{assist().errorOrder=$('errorOrder').value;syncErrorTarget();refresh();};$('advancedFields').onchange=table;
$('sequence').onchange=()=>{assist().sequence=$('sequence').value;refresh();};
for(const id of ['projections','magnify','lockX','lockCategory'])$(id).onchange=()=>{assist()[id]=$(id).checked;refresh();};
$('fixedX').onchange=()=>{const a=assist();a.fixedXValue=$('fixedX').value===''?null:Number($('fixedX').value);a.fixedXPixel=null;a.lockX=true;refresh();};
$('dragAxis').onchange=()=>{assist().dragAxis=$('dragAxis').value;refresh();};
for(const id of ['activeSeries','activeCategory'])$(id).onchange=()=>{const a=assist();a[id==='activeSeries'?'series':'category']=$(id).value;pendingStart=null;if(isBox(p)){selected=targetIndex(a);selectedHandle=boxHandle(a.boxField);hover=null;}refresh();};
$('nextTarget').onclick=()=>{if(!nextTarget())toast('所有类别和系列均已标注，可点击进度格复查');refresh();};
$('targetGrid').onclick=e=>{const button=e.target.closest('[data-target]');if(!button)return;const t=targetPairs()[+button.dataset.target],a=assist();a.series=t.series;a.category=t.category;pendingStart=null;const i=targetIndex(t);if(i>=0){selected=i;selectedHandle=isBox(p)?boxHandle(a.boxField):'pixel';hover=null;}$('hint').textContent=i>=0?'该目标已标注：拖动高亮标记或编辑表格修正。':'点击原图标注当前目标';refresh();};
$('pickX').onclick=()=>setTool('lock-x');$('pickCategory').onclick=()=>setTool('anchor');
$('unlockPoint').onclick=()=>{if(selected<0)return;change(()=>{delete p.evidence[selected].fixedX;});toast('选中点已解除 X 约束，可自由拖动');};
$('canvasWrap').addEventListener('scroll',()=>{if(hover)draw();});

function pendingAreaIndex(){
  const series=assist().series;
  return p.rows.findLastIndex((r,i)=>{
    const e=p.evidence?.[i];
    return identity(r)===series&&finite(r.y)&&!finite(r.baseline)&&
      (e?.pixel||finite(e?.xPixel)||e?.fixedX);
  });
}
function areaTool(){return ['point','area-upper','area-baseline'].includes(tool);}
function areaTargetIndex(){
  if(tool!=='point')return selected;
  return isNominalArea(p)?targetIndex(assist()):pendingAreaIndex();
}
function areaPoint(raw){
  const i=areaTargetIndex(),r=p.rows[i];
  if(!r&&tool==='point')return constrainAdd(raw);
  if(isNominalArea(p)&&r){
    const e=p.evidence?.[i],a=assist();
    const anchor=a.categoryPixels[JSON.stringify([categoryIdentity(r)])];
    const x=e?.pixel?.x??e?.baselinePixel?.x??anchor;
    return finite(x)?bounded({x,y:raw.y}):tool==='point'?constrainAdd(raw):bounded(raw);
  }
  if(!r||!finite(r.x))throw Error('请先选中有 X 数值的记录');
  const e=p.evidence?.[i];
  let x=e?.xPixel??e?.fixedX?.pixel??e?.pixel?.x??e?.baselinePixel?.x;
  if(!finite(x)){
    if(!p.axes.x.calibrated)throw Error('请先校准 X 轴以定位该记录');
    x=valueToPixel(r.x,p.axes.x);
    if(x<0||x>image.width)throw Error('该记录的 X 位于原图范围外');
  }
  return bounded({x,y:raw.y});
}
function addAreaRow(data,evidence){
  const {series,category}=assist();
  if(isNominalArea(p)){
    if(!category)throw Error('请先填写类别并选择当前类别');
    data={...data,category:categoryName(p,category),_categoryKey:category};
  }
  selected=p.rows.length;
  p.rows.push({...data,series:seriesName(p,series),_seriesKey:series});
  p.evidence??=[];
  p.evidence[selected]=evidence;
  selectedHandle='pixel';
}
function measureArea(raw){
  const nominal=isNominalArea(p),i=areaTargetIndex(),row=p.rows[i];
  if(nominal&&tool==='point'){
    if(!assist().category)throw Error('请先填写类别并选择当前类别');
    if(areaComplete(row))throw Error('当前类别和系列已完成。请选择下一目标，或重取选中记录的边界');
  }
  const pt=areaPoint(raw);
  if(tool==='point'&&i<0){
    const a=assist(),data=measureAt(pt);
    change(()=>addAreaRow({...data,baseline:null},{
      pixel:pt,...(nominal?{}:a.lockX?{fixedX:{value:a.fixedXValue,pixel:pt.x}}:{xPixel:pt.x}),
      role:'observation',source:'pixel_measurement',createdAt:new Date().toISOString()
    }));
    return;
  }
  if(!p.axes.y.calibrated)throw Error('请先校准 Y 轴的两个刻度');
  const handle=tool==='area-upper'||tool==='point'&&nominal&&!finite(row.y)?'pixel':'baselinePixel';
  change(()=>{
    p.evidence??=[];
    const e=p.evidence[i]??={};
    editAreaHandle(i,handle,pt);
    e.role='observation';e.source='pixel_measurement';
    selected=i;selectedHandle=handle;
    if(nominal&&tool==='point'&&areaComplete(row)&&assist().sequence!=='manual')nextTarget();
  });
}
function editAreaHandle(i,handle,pt){
  const r=p.rows[i],e=p.evidence[i];
  if(!p.axes.y.calibrated)throw Error('请先校准 Y 轴的两个刻度');
  const y=areaValueAt(pt.y,p.axes.y);
  if(!isNominalArea(p)&&handle==='pixel'&&e.pixel&&pt.x!==e.pixel.x){
    if(!p.axes.x.calibrated)throw Error('请先校准 X 轴的两个刻度');
    r.x=areaValueAt(pt.x,p.axes.x);
    e.xPixel=pt.x;
    if(e.baselinePixel)e.baselinePixel.x=pt.x;
  }
  r[handle==='pixel'?'y':'baseline']=y;
  e[handle]=pt;e.modifiedAt=new Date().toISOString();
}
function recalculateArea(){
  for(const [i,r] of p.rows.entries()){
    const e=p.evidence?.[i];
    if(!e)continue;
    if(!isNominalArea(p)&&p.axes.x.calibrated&&finite(e.xPixel))r.x=areaValueAt(e.xPixel,p.axes.x);
    if(p.axes.y.calibrated){
      if(e.pixel)r.y=areaValueAt(e.pixel.y,p.axes.y);
      if(e.baselinePixel)r.baseline=areaValueAt(e.baselinePixel.y,p.axes.y);
    }
  }
}
function editAreaCell(i,key,raw){
  change(()=>{
    p.rows[i][key]=raw===''?null:Number(raw);
    p.evidence??=[];
    const e=p.evidence[i]??={};
    if(key==='x'){
      for(const field of ['pixel','baselinePixel','xPixel','fixedX'])delete e[field];
    }else delete e[key==='y'?'pixel':'baselinePixel'];
    e.role='transcribed';e.source='manual_edit';
  });
}

// Statistical charts share the canvas, calibration, history, evidence and project lifecycle.
function syncStatForm(){
  const pie=isPie(p),box=isBox(p),stat=isStat(p);
  $('pieFields').hidden=!pie;$('valueMode').value=p.valueMode||'percent';$('valueTitle').value=p.valueTitle??'';$('donut').checked=!!p.donut;
  $('valueFormatLabel').hidden=!box;$('valueFormat').value=p.valueFormat??'';
  for(const id of ['xTitle','yTitle'])$(id).parentElement.hidden=pie;
  if(stat){$('seriesSection').hidden=true;$('activeSeries').closest('label').hidden=true;}
  $('legend').parentElement.hidden=stat;$('categoryLabel').hidden=pie||!categorical();
  $('activeCategoryLabel').hidden=pie||!categorical();$('boxFieldLabel').hidden=!box;
  if(stat)$('connect').parentElement.hidden=true;$('calibrationPanel').hidden=pie;
  document.querySelector('.assist-panel').hidden=pie;
  document.querySelectorAll('[data-tool]').forEach(b=>b.hidden=pie&&b.dataset.tool!=='select'||stat&&['lower','upper'].includes(b.dataset.tool));
  if(stat)$('tableNote').textContent=pie?'数值按原图录入，不自动归一化。使用 ↑ / ↓ 调整类别顺序；GT 不保存像素与环形外观。' : 'lower ≤ q1 ≤ median ≤ q3 ≤ upper；只校准数值轴。自动测量保留两位小数，人工录入及 GT 导入保留原精度。不按 1.5×IQR 重算。异常值可逐个编辑、添加或删除。';
}
function boxHandle(field){const a=assist();return field==='outliers'?`outlier${a.outlierTarget}Pixel`:field+'Pixel';}
function boxHandleField(key){return key.startsWith('outlier')?'outliers':key.replace(/Pixel$/,'');}
function handleKeys(i){return isArea(p)?['pixel','baselinePixel']:isBox(p)?Object.keys(p.evidence?.[i]||{}).filter(k=>/^(lower|q1|median|q3|upper|outlier\d+)Pixel$/.test(k)&&p.evidence[i][k]):['pixel','startPixel','lowerPixel','upperPixel'];}
function syncBoxTarget(){
  if(!isBox(p)){$('outlierTargetLabel').hidden=true;return;}
  const a=assist(),i=targetIndex(a),r=p.rows[i];$('boxField').value=a.boxField;
  $('outlierTargetLabel').hidden=a.boxField!=='outliers';
  options($('outlierTarget'),[['new','＋ 连续新增'],...(r?.outliers||[]).map((v,j)=>[String(j),`${j+1}: ${v??'待填写'}`])],a.outlierTarget);
  if($('outlierTarget').value!==String(a.outlierTarget))a.outlierTarget='new';
}
function emptyBox(category){return {category,...Object.fromEntries(BOX_FIELDS.map(k=>[k,null])),outliers:[]};}
function nextCategory(){let n=p.rows.length+1;while(p.rows.some(r=>r.category===`Category ${n}`))n++;return `Category ${n}`;}
function measureBox(pt){
  const a=assist();if(!a.category)throw Error('请先填写类别并选择当前类别');
  let i=targetIndex(a);if(i<0){i=p.rows.length;p.rows.push({...emptyBox(categoryName(p,a.category)),_categoryKey:a.category,_seriesKey:a.series,series:seriesName(p,a.series)});p.evidence??=[];p.evidence.push({});}
  const r=p.rows[i],e=p.evidence[i]??={},f=a.boxField,v=boxValueAt(pt,p);
  let key;
  if(f==='outliers'){
    const n=a.outlierTarget==='new'?r.outliers.length:+a.outlierTarget;r.outliers[n]=v;key=`outlier${n}Pixel`;
  }else{r[f]=v;key=f+'Pixel';}
  e[key]=pt;e.role=$('role').value;e.source='pixel_measurement';e.modifiedAt=new Date().toISOString();selected=i;selectedHandle=key;
  if(f!=='outliers'){
    const at=BOX_FIELDS.indexOf(f);if(at<4)a.boxField=BOX_FIELDS[at+1];else {a.boxField='lower';nextTarget();}
  }
}
function outlierCells(r,i){return (r.outliers||[]).map((v,j)=>`<div class="series-row"><input type="number" step="any" data-i="${i}" data-key="outliers" data-outlier="${j}" aria-label="第${i+1}行 异常值${j+1}" value="${esc(v)}"><button class="small" data-delete-outlier="${j}" data-index="${i}" title="删除异常值">×</button></div>`).join('')+`<button class="small" data-add-outlier="${i}">＋ 异常值</button>`;}
function editStatCell(input){
  const {i,key,outlier}=input.dataset,raw=input.value;
  change(()=>{
    const r=p.rows[i];p.evidence??=[];const e=p.evidence[i]??={};
    if(key==='category'){
      renameObject(p,'category',r._categoryKey,raw);
    }else if(key==='outliers'){
      r.outliers[+outlier]=raw===''?null:Number(raw);delete e[`outlier${outlier}Pixel`];
    }else{r[key]=raw===''?null:Number(raw);delete e[key+'Pixel'];}
    e.role='transcribed';e.source='manual_edit';
  },{form:true});
}
$('valueMode').onchange=()=>change(()=>{p.valueMode=$('valueMode').value;p.valueTitle=p.valueMode==='percent'?'Share (%)':'Value';},{form:true});
for(const id of ['valueTitle','donut','valueFormat'])$(id).onchange=()=>change(()=>p[id]=id==='donut'?$(id).checked:$(id).value,{form:true});
$('boxField').onchange=()=>{assist().boxField=$('boxField').value;selected=targetIndex(assist());selectedHandle=boxHandle(assist().boxField);hover=null;refresh();};
$('outlierTarget').onchange=()=>{assist().outlierTarget=$('outlierTarget').value;selected=targetIndex(assist());selectedHandle=boxHandle('outliers');hover=null;refresh();};
$('tableBody').addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||!isStat(p))return;
  const i=+(b.dataset.index??b.dataset.addOutlier);
  if(b.dataset.move!==undefined){const j=i+Number(b.dataset.move);if(j<0||j>=p.rows.length)return;change(()=>{[p.rows[i],p.rows[j]]=[p.rows[j],p.rows[i]];p.evidence??=[];[p.evidence[i],p.evidence[j]]=[p.evidence[j],p.evidence[i]];selected=j;p.categoryObjects=[...p.rows.map(r=>p.categoryObjects.find(c=>c.key===r._categoryKey)),...p.categoryObjects.filter(c=>!p.rows.some(r=>r._categoryKey===c.key))];p.categories=p.categoryObjects.map(c=>c.name);},{form:true});}
  if(b.dataset.addOutlier!==undefined)change(()=>{p.rows[i].outliers.push(null);selected=i;assist().category=p.rows[i]._categoryKey;assist().boxField='outliers';assist().outlierTarget=String(p.rows[i].outliers.length-1);},{form:true});
  if(b.dataset.deleteOutlier!==undefined)change(()=>{
    const n=+b.dataset.deleteOutlier,r=p.rows[i],e=p.evidence?.[i];r.outliers.splice(n,1);
    if(e){for(let j=n;j<=r.outliers.length;j++){delete e[`outlier${j}Pixel`];if(e[`outlier${j+1}Pixel`])e[`outlier${j}Pixel`]=e[`outlier${j+1}Pixel`];}}
    assist().category=r._categoryKey;assist().outlierTarget='new';selected=i;selectedHandle=boxHandle('outliers');
  });
});

function pointPixel(r,e){if(e?.pixel)return e.pixel;return null;}
function draw(){projectionInfo=null;if(!image){canvas.width=0;canvas.height=0;return;}const dpr=window.devicePixelRatio||1;canvas.width=Math.round(image.width*zoom*dpr);canvas.height=Math.round(image.height*zoom*dpr);canvas.style.width=image.width*zoom+'px';canvas.style.height=image.height*zoom+'px';ctx.setTransform(zoom*dpr,0,0,zoom*dpr,0,0);ctx.drawImage(image,0,0);$('zoomText').textContent=Math.round(zoom*100)+'%';if(!$('overlay').checked){drawGuides();return;}
const mark=(pt,color,text,ring=false)=>{if(!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y))return;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5/zoom;ctx.beginPath();ctx.arc(pt.x,pt.y,(ring?7:4)/zoom,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(pt.x-8/zoom,pt.y);ctx.lineTo(pt.x+8/zoom,pt.y);ctx.moveTo(pt.x,pt.y-8/zoom);ctx.lineTo(pt.x,pt.y+8/zoom);ctx.stroke();ctx.font=`${11/zoom}px monospace`;ctx.fillText(text,pt.x+9/zoom,pt.y-7/zoom);};
if($('connect').checked&&p.kind.startsWith('line'))for(const s of p.series){const pts=p.rows.map((r,i)=>({r,e:p.evidence?.[i]})).filter(v=>identity(v.r)===s.key&&v.e?.pixel).sort((a,b)=>(a.r.path_order??0)-(b.r.path_order??0));ctx.beginPath();pts.forEach((v,i)=>{const q=v.e.pixel;ctx[i?'lineTo':'moveTo'](q.x,q.y)});ctx.strokeStyle=s.color||'#06a77d';ctx.lineWidth=1.5/zoom;ctx.stroke();}
p.rows.forEach((r,i)=>{const e=p.evidence?.[i];if(isBox(p)){for(const k of handleKeys(i))mark(e[k],i===selected&&k===selectedHandle?'#007bea':'#e85b35',`${i+1}:${boxHandleField(k)==='outliers'?'o'+(+k.match(/\d+/)[0]+1):boxHandleField(k)}`,i===selected&&k===selectedHandle);return;}const color=p.series.find(s=>s.key===identity(r))?.color||'#e85b35';mark(pointPixel(r,e),color,isArea(p)?`${i+1}:上界`:String(i+1),i===selected&&(!isArea(p)||selectedHandle==='pixel'));if(isArea(p)&&e?.baselinePixel)mark(e.baselinePixel,color,`${i+1}:下界`,i===selected&&selectedHandle==='baselinePixel');
if(e?.startPixel){mark(e.startPixel,color,'s');ctx.beginPath();ctx.moveTo(e.startPixel.x,e.startPixel.y);ctx.lineTo(e.pixel.x,e.pixel.y);ctx.stroke();}for(const k of ['lower','upper'])if(e?.[k+'Pixel'])mark(e[k+'Pixel'],color,k==='lower'?'−':'+');});
drawGuides();if(pendingStart)mark(pendingStart,'#ffae00','起点');for(const a of isNominalArea(p)?['y']:['x','y'])for(const n of [1,2]){const pt=p.axes[a]['point'+n];if(pt)mark(pt,'#007bea',a.toUpperCase()+n);} }
function setTool(t){if((isBox(p)||isNominalArea(p))&&!requiredAxes(p).includes(calTarget[0]))calTarget=valueAxis(p)+'1';if(isPie(p)&&t!=='select'||t.startsWith('area-')&&!isArea(p))t='select';tool=t;pendingStart=null;hover=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));$('calibrationPanel').open=t==='calibrate'||$('calibrationPanel').open;const hints={'area-upper':'选中数据行后，在同一 X 处点击新的上界。','area-baseline':'选中数据行后，在同一 X 处点击新的下界。',select:'点击已有标记或选择表格字段后拖动、方向键微调。重合点优先编辑已选字段；Shift 拖动限制方向。',point:isArea(p)?(p.kind==='area_stack'?'选择当前层，在同一 X 依次点该层的累计上界和实际下界。':'在同一 X 依次取上界和下界。下界也可在表格中输入。'):isStack(p)?(horizontal()?'横向堆叠：从左到右依次点击起点、各交界点、终点。':'纵向堆叠：从下到上依次点击起点、各交界点、终点。')+'同一堆叠自动复用交界点；系列按此方向排列。':'点击原图取点，近已有标记可直接拖动；Alt 点击强制新增。类别和系列自动推进，进度格可随时跳转。',calibrate:'选择下方 X1 / X2 / Y1 / Y2，点击原图刻度，再填写真实数值。',lower:'先选中记录，然后点击误差区间下限。',upper:'先选中记录，然后点击误差区间上限。'};$('hint').textContent=isPie(p)?'Pie 使用表格人工录入原始数值；↑ / ↓ 调整类别顺序。':isBox(p)&&t==='point'?'点击只测量当前项，五数统计量自动推进；近邻和重合点均可连续标注。选择任意项可重测，outliers 可连续新增；编辑请切换「选择 / 拖动」。':hints[t]|| (t==='lock-x'?'先填写已知 X 数值，再点击原图对应 X 刻度；然后沿竖直线寻找 Y。':'点击当前类别在原图中的刻度或柱中心位置，之后只测数值。');axisForm();syncAssist();draw();}
function coords(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*image.width/rect.width,y:(event.clientY-rect.top)*image.height/rect.height};}
function calibrated(skipX=false){const axes=requiredAxes(p);for(const a of axes){if(a==='x'&&skipX)continue;if(!p.axes[a].calibrated)throw Error('请先校准 '+a.toUpperCase()+' 轴的两个刻度');pixelToValue(p.axes[a].p1,p.axes[a]);}}
function measureAt(pt,i=null){
  if(isNominalArea(p)){
    calibrated();
    return {category:i===null?categoryName(p,assist().category):p.rows[i].category,y:areaValueAt(pt.y,p.axes.y)};
  }
  if(isArea(p)){
    const a=assist(),fixed=a.lockX&&finite(a.fixedXValue);
    calibrated(i!==null||fixed);
    const x=i!==null?p.rows[i].x:fixed?a.fixedXValue:areaValueAt(pt.x,p.axes.x);
    return {x,y:areaValueAt(pt.y,p.axes.y)};
  }
  const a=assist(),e=i===null?null:p.evidence?.[i],fixed=i===null?(!categorical()&&a.lockX?{value:a.fixedXValue}:null):e?.fixedX;calibrated(!!fixed&&Number.isFinite(fixed.value));if(isBox(p))return{category:i===null?categoryName(p,a.category):p.rows[i].category,value:boxValueAt(pt,p)};if(bar())return{category:i===null?categoryName(p,a.category):p.rows[i].category,value:pixelToValue(horizontal()?pt.x:pt.y,p.axes[horizontal()?'x':'y'])};return{x:p.xType==='ordinal'?(i===null?categoryName(p,a.category):p.rows[i].x):fixed&&Number.isFinite(fixed.value)?fixed.value:pixelToValue(pt.x,p.axes.x),y:pixelToValue(pt.y,p.axes.y)};}
function applyPixel(i,pt){const r=p.rows[i],e=p.evidence[i],data=measureAt(pt,i);if(bar()){r.value=data.value;if(isStack(p)){r.end=data.value;r.value=r.end-r.start;}}else{if(p.xType!=='ordinal')r.x=data.x;r.y=data.y;}e.pixel=pt;if(bar())for(const key of ['lowerPixel','upperPixel'])if(e[key])e[key][horizontal()?'y':'x']=pt[horizontal()?'y':'x'];e.modifiedAt=new Date().toISOString();}
function recalculate(){if(isArea(p)){recalculateArea();return;}if(isBox(p)){for(let i=0;i<p.rows.length;i++)for(const k of handleKeys(i))editHandle(i,k,p.evidence[i][k]);return;}for(let i=0;i<p.rows.length;i++){const e=p.evidence?.[i];if(!e?.pixel)continue;applyPixel(i,e.pixel);if(e.startPixel){p.rows[i].start=pixelToValue(e.startPixel[horizontal()?'x':'y'],p.axes[horizontal()?'x':'y']);p.rows[i].value=p.rows[i].end-p.rows[i].start;}for(const k of ['lower','upper'])if(e[k+'Pixel'])p.rows[i][k]=pixelToValue(horizontal()?e[k+'Pixel'].x:e[k+'Pixel'].y,p.axes[horizontal()?'x':'y']);}}
canvas.addEventListener('pointerdown',e=>{if(!image)return;canvas.focus({preventScroll:true});const raw=coords(e);try{
if(tool==='lock-x'){
  const a=assist();
  if(!finite(a.fixedXValue)||isArea(p)&&finite(a.fixedXPixel)){
    if(!p.axes.x.calibrated)throw Error('请先在固定 X 输入框填写标签的真实数值');
    a.fixedXValue=isArea(p)?areaValueAt(raw.x,p.axes.x):pixelToValue(raw.x,p.axes.x);
  }
  a.fixedXPixel=raw.x;a.lockX=true;setTool('point');hover=raw;refresh();toast('X 已固定，沿竖直参考线寻找 Y');return;
}
if(tool==='anchor'){const a=assist();a.categoryPixels[anchorKey()]=horizontal()?raw.y:raw.x;a.lockCategory=true;setTool('point');hover=raw;refresh();toast('当前位置已固定，可直接测数值');return;}
if(tool==='calibrate'){const a=calTarget[0],n=calTarget[1];change(()=>{p.axes[a]['p'+n]=a==='x'?raw.x:raw.y;p.axes[a]['point'+n]=raw;p.axes[a].calibrated=!!(p.axes[a].point1&&p.axes[a].point2);if(p.axes[a].calibrated)recalculate();},{form:true});toast(`已取 ${calTarget.toUpperCase()}，请填写真实刻度值`);return;}
if(isArea(p)&&areaTool()){measureArea(raw);return;}
if(tool==='point'&&hasErrors(p)&&!isStack(p)){measureError(raw);return;}
if((tool==='select'||tool==='point'&&!isBox(p)&&!(isStack(p)&&targetIndex(assist())<0))&&(!e.altKey||isArea(p))){let best=null,d=10/zoom;const chosen=p.evidence?.[selected]?.[selectedHandle];if(tool==='select'&&chosen&&Math.hypot(raw.x-chosen.x,raw.y-chosen.y)<d)best={i:selected,kind:selectedHandle};if(!best)p.evidence?.forEach((v,i)=>{for(const kind of handleKeys(i)){if(!v?.[kind])continue;const dist=Math.hypot(raw.x-v[kind].x,raw.y-v[kind].y);if(dist<d){best={i,kind};d=dist;}}});if(best){selected=best.i;selectedHandle=best.kind;if(isBox(p)){assist().category=p.rows[selected]._categoryKey;assist().boxField=boxHandleField(best.kind);assist().outlierTarget=assist().boxField==='outliers'?best.kind.match(/\d+/)[0]:'new';}drag={...best,checkpointed:false};dragOrigin={...p.evidence[selected][selectedHandle]};try{canvas.setPointerCapture(e.pointerId);}catch{}table();syncAssist();draw();return;}if(tool==='select'){selected=-1;selectedHandle='pixel';table();syncAssist();draw();return;}}
if(tool==='lower'||tool==='upper'){calibrated();if(selected<0)throw Error('请先选中一条数据记录');if(!bar())throw Error('当前规范只在柱图中导出误差区间');change(()=>{const axis=horizontal()?'x':'y';p.rows[selected][tool]=pixelToValue(raw[axis],p.axes[axis]);p.evidence[selected]??={role:'transcribed'};p.evidence[selected][tool+'Pixel']=raw;selectedHandle=tool+'Pixel';});return;}
if(tool==='point'&&isBox(p)){const pt=constrainAdd(raw);calibrated();change(()=>measureBox(pt));return;}
if(tool==='point'){const a=assist();if(categorical()&&a.sequence!=='manual'&&targetIndex(a)>=0){selected=targetIndex(a);selectedHandle='pixel';hover=null;refresh();throw Error('当前目标已经标注；可拖动修改，或选择下一个待标目标');}const pt=constrainAdd(raw),data=measureAt(pt);if(categorical()&&!a.category)throw Error('请先填写类别并选择当前类别');if(isStack(p)&&!pendingStart){const previous=p.rows.findIndex(r=>categoryIdentity(r)===a.category&&identity(r)===p.series[p.series.findIndex(s=>s.key===a.series)-1]?.key);if(previous>=0&&p.evidence?.[previous]?.pixel)pendingStart={...p.evidence[previous].pixel};}if(isStack(p)&&!pendingStart){pendingStart=pt;draw();toast('起点已取，请依次点击各段交界点和最终终点');return;}change(()=>{const row={...data,series:seriesName(p,a.series),_seriesKey:a.series,...(categorical()?{_categoryKey:a.category}:{})};if(p.kind.startsWith('line'))row.path_order=p.rows.filter(r=>identity(r)===identity(row)).length;const ev={pixel:pt,role:$('role').value,source:'pixel_measurement',createdAt:new Date().toISOString()};if(a.lockX&&!categorical())ev.fixedX={value:a.fixedXValue,pixel:pt.x};else if(a.lockCategory&&categorical()){if(horizontal())ev.fixedY={pixel:pt.y};else ev.fixedX={pixel:pt.x};}if(pendingStart){row.start=pixelToValue(pendingStart[horizontal()?'x':'y'],p.axes[horizontal()?'x':'y']);row.end=data.value;row.value=row.end-row.start;ev.startPixel={...pendingStart};pendingStart=null;}p.rows.push(row);p.evidence??=[];p.evidence.push(ev);selected=p.rows.length-1;selectedHandle='pixel';if(categorical()&&a.sequence!=='manual'){const previousCategory=a.category;const advanced=nextTarget();if(isStack(p)&&advanced&&a.category===previousCategory)pendingStart={...pt};}});}}
catch(err){toast(err.message);}});
canvas.addEventListener('pointermove',e=>{if(!image)return;const pt=coords(e);hover=pt;let val='';try{const area=isArea(p)&&areaTool(),i=area?areaTargetIndex():-1;const v=measureAt(area?areaPoint(pt):tool==='point'?constrainAdd(pt):pt,i>=0?i:null);val=isBox(p)?` · ${v.category} / ${assist().boxField}: ${v.value.toFixed(2)}`:bar()?` · ${v.category}: ${v.value.toPrecision(6)}`:` · X ${typeof v.x==='number'?Number(v.x.toPrecision(6)):v.x??v.category} / Y ${Number(v.y.toPrecision(6))}`;}catch{}$('cursorInfo').textContent=`原图 px: ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}${val}`;if(drag!==null){try{const next=constrainDrag(pt,drag.i,drag.kind,e.shiftKey),old=p.evidence[drag.i][drag.kind];if(next.x!==old.x||next.y!==old.y){if(!drag.checkpointed){checkpoint();drag.checkpointed=true;}editHandle(drag.i,drag.kind,next);dirty();table();}}catch(err){toast(err.message);}}draw();});
function endDrag(){if(drag!==null){drag=null;dragOrigin=null;refresh();}}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
canvas.addEventListener('pointerleave',()=>{if(drag===null){hover=null;$('magnifier').hidden=true;draw();}});

$('tableBody').addEventListener('click',e=>{if(isStat(p)&&e.target.closest('button'))return;const row=e.target.closest('[data-row]');if(row){selected=+row.dataset.row;
if(isNominalArea(p)){const a=assist();a.category=categoryIdentity(p.rows[selected]);a.series=identity(p.rows[selected]);}
if(isBox(p)){assist().category=p.rows[selected]._categoryKey;const k=e.target.dataset.key;if(BOX_FIELDS.includes(k))assist().boxField=k;if(k==='outliers'){assist().boxField='outliers';assist().outlierTarget=e.target.dataset.outlier;}selectedHandle=boxHandle(assist().boxField);}else{const key=e.target.dataset.key;selectedHandle=key==='start'?'startPixel':['lower','upper','baseline'].includes(key)?key+'Pixel':'pixel';}syncAssist();document.querySelectorAll('#tableBody tr').forEach((r,i)=>r.classList.toggle('selected',i===selected));draw();}});
$('tableBody').addEventListener('change',e=>{const {i,key,object}=e.target.dataset;if(i===undefined)return;if(isStat(p)&&key){editStatCell(e.target);return;}if(isArea(p)&&key){editAreaCell(+i,key,e.target.value);return;}change(()=>{if(object){const ref=object==='series'?'_seriesKey':'_categoryKey',field=object==='series'?'series':categoryField(p);if(isNominalArea(p)){
  const row=p.rows[i],target={category:object==='category'?e.target.value:row._categoryKey,series:object==='series'?e.target.value:row._seriesKey};
  if(row[ref]===e.target.value)return;
  if(targetIndex(target)>=0){e.target.value=row[ref];throw Error('该类别和系列已有面积边界记录');}
  if(object==='category'&&p.evidence?.[i]){
    delete p.evidence[i].pixel;
    delete p.evidence[i].baselinePixel;
  }
}
p.rows[i][ref]=e.target.value;p.rows[i][field]=object==='series'?seriesName(p,e.target.value):categoryName(p,e.target.value);return;}const raw=e.target.value;const numeric=!(key==='category'||key==='series'||key==='x'&&categorical());if(raw===''&&['lower','upper','start','end','stack_order','path_order'].includes(key))delete p.rows[i][key];else p.rows[i][key]=numeric?(raw===''?null:Number(raw)):raw;if(isStack(p)){const r=p.rows[i];if(['start','end'].includes(key)&&Number.isFinite(r.start)&&Number.isFinite(r.end))r.value=r.end-r.start;else if(key==='value'&&Number.isFinite(r.start)&&Number.isFinite(r.value))r.end=r.start+r.value;}p.evidence??=[];p.evidence[i]??={};p.evidence[i].role='transcribed';p.evidence[i].source='manual_edit';delete p.evidence[i].pixel;delete p.evidence[i].startPixel;delete p.evidence[i].lowerPixel;delete p.evidence[i].upperPixel;});});
for(const key of ['title','xTitle','yTitle','notes'])$(key).addEventListener('change',()=>change(()=>p[key]=$(key).value,{form:true}));
$('xType').onchange=()=>{
  const next=$('xType').value;
  if(!isArea(p)){change(()=>p.xType=next,{form:true});return;}
  change(()=>{switchAreaMode(p,next);selected=-1;},{form:true});
  setTool('select');
};
$('legend').onchange=()=>change(()=>p.legend=$('legend').checked,{form:true});$('reviewed').onchange=()=>{p.reviewed=$('reviewed').checked;p.reviewedAt=p.reviewed?new Date().toISOString():null;refresh();};
$('kind').onchange=()=>{const kind=$('kind').value;if(hasRows(p)&&!confirm('切换类型会清空当前数据记录。建议先保存工程。继续？')){syncTypes();return;}change(()=>{const old=p;p=fresh(kind,isArea(old)?old.xType:undefined);for(const k of ['title','xTitle','yTitle','notes'])p[k]=old[k];selected=-1;},{form:true});setTool('select');};
$('family').onchange=()=>{const kind=Object.keys(labels).find(k=>familyOf(k)===$('family').value);options($('kind'),Object.entries(labels).filter(([k])=>familyOf(k)===familyOf(kind)),kind);$('kind').onchange();};
function applyBulkNames(kind,inputId){
  const text=$(inputId).value,names=parseObjectNames(text),label=kind==='series'?'系列':'类别位置';
  if(!names.length){toast('请至少输入一个名称');return;}
  if(kind==='series'&&p.kind.endsWith('_1')&&names.length>1){toast('单系列类型只允许一个系列，请先选择多系列图表');return;}
  const list=kind==='series'?p.series:p.categoryObjects,removed=new Set(list.slice(names.length).map(o=>o.key));
  const ref=kind==='series'?'_seriesKey':'_categoryKey',rows=p.rows.filter(r=>removed.has(r[ref])).length;
  if(removed.size&&!confirm('将删除末尾 '+removed.size+' 个'+label+'及其 '+rows+' 条记录。继续？'))return;
  let applied=false;change(()=>{applyObjectNames(p,kind,text);selected=-1;pendingStart=null;applied=true;},{form:true});
  if(applied)toast('已按行应用 '+names.length+' 个'+label+'名称');
}
$('applySeriesNames').onclick=()=>applyBulkNames('series','seriesNames');
$('applyCategoryNames').onclick=()=>applyBulkNames('category','categories');
$('seriesList').onchange=e=>{const {series,prop}=e.target.dataset;if(series===undefined)return;change(()=>{const obj=p.series[series];if(prop==='name')renameObject(p,'series',obj.key,e.target.value);else obj[prop]=e.target.value;},{form:true});};
$('seriesList').onclick=e=>{const d=e.target.dataset;if(d.moveSeries!==undefined){change(()=>moveSeries(p,+d.moveSeries,Number(d.delta)),{form:true});return;}if(d.removeSeries===undefined)return;const obj=p.series[d.removeSeries];if(p.rows.some(r=>identity(r)===obj.key)&&!confirm('删除该系列及其全部记录？'))return;change(()=>{removeObject(p,'series',obj.key);selected=-1;},{form:true});};
$('addSeries').onclick=()=>{if(p.kind.endsWith('_1')){toast('单系列类型只允许一个系列，请先选择多系列图表');return;}change(()=>{
  let n=p.series.length+1;
  if(isArea(p))while(p.series.some(s=>s.name==='Series '+n))n++;
  addObject(p,'series','Series '+n);
},{form:true});};
$('axisFields').onclick=e=>{if(e.target.dataset.tick){calTarget=e.target.dataset.tick;setTool('calibrate');}};
$('axisFields').onchange=e=>{const {axis,field}=e.target.dataset;if(!axis)return;try{change(()=>{if(field!=='type'&&e.target.value==='')throw Error('刻度值不能为空');p.axes[axis][field]=field==='type'?e.target.value:Number(e.target.value);if(field==='p1'||field==='p2'){const n=field.slice(1);p.axes[axis]['point'+n]=axis==='x'?{x:p.axes[axis][field],y:p.axes.y.p1}:{x:p.axes.x.p1,y:p.axes[axis][field]};}p.axes[axis].calibrated=!!(p.axes[axis].point1&&p.axes[axis].point2)&&p.axes[axis].p1!==p.axes[axis].p2&&p.axes[axis].v1!==p.axes[axis].v2;recalculate();},{form:true});}catch(err){toast(err.message);syncForm();}};
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('addRow').onclick=()=>{if(isArea(p)){
  const nominal=isNominalArea(p);
  if(nominal&&(targetIndex(assist())>=0||!assist().category)){
    toast(assist().category?'该类别和系列已有记录，请选择其他目标':'请先填写类别并选择当前类别');
    return;
  }
  change(()=>addAreaRow({...(nominal?{}:{x:null}),y:null,baseline:null},{role:'transcribed',source:'manual_entry'}));
  document.querySelector(`[data-i="${selected}"][data-key="${nominal?'y':'x'}"]`)?.focus();
  return;
}if(isStat(p)){change(()=>{const a=assist(),c=isBox(p)&&a.category&&targetIndex(a)<0?p.categoryObjects.find(c=>c.key===a.category):addObject(p,'category',nextCategory());p.rows.push({...isPie(p)?{category:c.name,value:null}:emptyBox(c.name),_categoryKey:c.key,_seriesKey:a.series,series:seriesName(p,a.series)});p.evidence??=[];p.evidence.push({role:'transcribed',source:'manual_entry'});selected=p.rows.length-1;a.category=c.key;selectedHandle=isBox(p)?boxHandle('lower'):'pixel';},{form:true});return;}if(categorical()&&assist().sequence!=='manual'&&targetIndex(assist())>=0){toast('当前目标已标注，请选择其他目标或切换手动模式');return;}change(()=>{const row=bar()?{category:categoryName(p,assist().category)||'A',value:0,series:seriesName(p,assist().series),_categoryKey:assist().category,_seriesKey:assist().series}:{x:p.xType==='ordinal'?categoryName(p,assist().category)||'A':0,y:0,series:seriesName(p,assist().series),_seriesKey:assist().series,...(categorical()?{_categoryKey:assist().category}:{})};if(isStack(p)){row.start=0;row.end=0;}if(p.kind.startsWith('line'))row.path_order=p.rows.length;p.rows.push(row);p.evidence??=[];p.evidence.push({role:$('role').value,source:'manual_entry'});selected=p.rows.length-1;selectedHandle='pixel';if(categorical()&&assist().sequence!=='manual')nextTarget();});const field=document.querySelector('[data-i="'+selected+'"][data-key="'+(bar()?'value':'y')+'"]');field?.focus();field?.select();};
$('deleteRow').onclick=()=>{if(selected<0)return;change(()=>{p.rows.splice(selected,1);p.evidence?.splice(selected,1);selected=-1;});};
$('undo').onclick=()=>{if(!history.length)return;future.push(clone(p));p=history.pop();selected=-1;pendingStart=null;refresh(true);};$('redo').onclick=()=>{if(!future.length)return;history.push(clone(p));p=future.pop();selected=-1;pendingStart=null;refresh(true);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focusMode){e.preventDefault();exitFocus();return;}if(e.target.matches?.('input,textarea,select,[contenteditable=true]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}if(e.key==='Escape'){if(focusMode){exitFocus();return;}pendingStart=null;setTool('select');}if((!isBox(p)&&!isArea(p)||tool==='select')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selected>=0&&p.evidence?.[selected]?.[selectedHandle]){e.preventDefault();const step=e.altKey?.1:e.shiftKey?10:1;const pt={...p.evidence[selected][selectedHandle]||p.evidence[selected].pixel};pt.x+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);pt.y+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);change(()=>editHandle(selected,selectedHandle,constrainDrag(pt,selected,selectedHandle)));}});
function setZoom(z){zoom=Math.max(.08,Math.min(8,z));draw();}function fit(){if(image)setZoom(Math.min(($('canvasWrap').clientWidth-20)/image.width,($('canvasWrap').clientHeight-20)/image.height,1));}
$('zoomIn').onclick=()=>setZoom(zoom*1.3);$('zoomOut').onclick=()=>setZoom(zoom/1.3);$('fit').onclick=fit;$('overlay').onchange=draw;$('connect').onchange=draw;
function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
async function loadImage(data){const version=++imageLoadVersion;return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{if(version!==imageLoadVersion){resolve();return;}image=img;imageData=data;$('empty').style.display='none';fit();resolve();};img.onerror=()=>reject(Error('无法读取图像'));img.src=data;});}
function visibleQueue(){return queue.filter(q=>(q.projectId??null)===currentProjectId);}
function projectName(){return projects.find(q=>q.id===currentProjectId)?.name||'无项目';}
function queueUI(){const items=visibleQueue().map(q=>q.id===activeId?{...q,project:p}:q);$('queue').innerHTML=items.map(q=>`<button class="${q.id===activeId?'active':''}" data-queue="${esc(q.id)}" title="${esc(q.name)}">${q.project.reviewed?'✓ ':hasRows(q.project)?'◐ ':'○ '}${esc(q.name)}</button>`).join('');options($('projectSelect'),[["",'无项目'],...projects.map(q=>[q.id,q.name])],currentProjectId||'');options($('moveProject'),[["",'无项目'],...projects.map(q=>[q.id,q.name])],currentProjectId||'');$('moveProjectLabel').hidden=!activeId;$('queueSummary').textContent=projectName()+' · '+items.length+' 张图 / '+items.filter(q=>q.project.reviewed).length+' 张已核对';$('renameProject').disabled=!currentProjectId;$('deleteProject').disabled=!currentProjectId;$('removeImage').disabled=!activeId;}
function stash(){let q=queue.find(q=>q.id===activeId);if(!q&&(imageData||hasRows(p))){activeId=crypto.randomUUID();q={id:activeId,projectId:currentProjectId,name:fileName||'未命名图表',image:imageData,project:clone(p)};queue.push(q);}if(q){q.project=clone(p);q.image=imageData;}}
function resetCurrent(){imageLoadVersion++;activationVersion++;p=fresh(p.kind+(hasErrors(p)&&!isStack(p)?'_error':''),p.xType);image=null;imageData=null;fileName='';activeId=null;selected=-1;hover=null;pendingStart=null;drag=null;history=[];future=[];$('empty').style.display='flex';$('fileName').textContent='从一张图开始';$('magnifier').hidden=true;$('cursorInfo').textContent='原始像素坐标';setTool('select');refresh(true);queueUI();}
function decodeImage(data){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('无法读取图像'));img.src=data;});}
// Decode before replacing live state; failed or superseded selections must not damage annotations.
async function activate(id){const version=++activationVersion;stash();const q=queue.find(q=>q.id===id);if(!q)throw Error('图像不存在');const nextImage=q.image?await decodeImage(q.image):null;if(version!==activationVersion||!queue.includes(q))return;stash();imageLoadVersion++;activeId=id;currentProjectId=q.projectId??null;p=ensureIdentities(clone(q.project));fileName=q.name;image=nextImage;imageData=q.image||null;hover=null;pendingStart=null;drag=null;$('fileName').textContent=fileName;history=[];future=[];selected=-1;$('empty').style.display=image?'none':'flex';if(image)fit();refresh(true);queueUI();setTool('select');}
async function selectProject(id){stash();const destination=id||null,first=queue.find(q=>(q.projectId??null)===destination);if(first)await activate(first.id);else{currentProjectId=destination;resetCurrent();}}
async function importImages(files){stash();const supported=[...files].filter(f=>/^image\/(png|jpeg|webp)$/.test(f.type)||/\.(png|jpe?g|webp)$/i.test(f.name)),ordered=supported.sort((a,b)=>(a.webkitRelativePath||a.relativePath||a.name).localeCompare(b.webkitRelativePath||b.relativePath||b.name,'zh-CN',{numeric:true}));let first=null,failed=0;const destination=currentProjectId,kind=p.kind+(hasErrors(p)&&!isStack(p)?'_error':''),xType=p.xType;for(const f of ordered){try{const data=await readFile(f);await new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=reject;im.src=data;});const id=crypto.randomUUID();queue.push({id,projectId:destination,name:f.webkitRelativePath||f.relativePath||f.name,image:data,project:fresh(kind,xType)});first??=id;}catch{failed++;}}if(first&&destination===currentProjectId)await activate(first);queueUI();toast('已导入 '+(ordered.length-failed)+' 张图'+(failed?'；'+failed+' 张无法读取':'')+'；跳过 '+(files.length-supported.length)+' 个非支持文件');}
for(const id of ['imageInput','folderInput'])$(id).onchange=async e=>{try{await importImages([...e.target.files]);}catch(err){toast(err.message);}finally{e.target.value='';}};
$('projectSelect').onchange=()=>selectProject($('projectSelect').value).catch(e=>toast(e.message));
$('newProject').onclick=async()=>{const name=prompt('新标注项目名称');if(!name?.trim())return;const id=crypto.randomUUID();projects.push({id,name:name.trim()});await selectProject(id);};
$('renameProject').onclick=()=>{const q=projects.find(q=>q.id===currentProjectId);if(!q)return;const name=prompt('项目新名称',q.name);if(name?.trim()){q.name=name.trim();queueUI();refresh();}};
$('deleteProject').onclick=async()=>{const q=projects.find(q=>q.id===currentProjectId);if(!q||!confirm('删除项目“'+q.name+'”？其中的图像和标注将移到“无项目”，不会删除。'))return;stash();queue.filter(q=>q.projectId===currentProjectId).forEach(q=>q.projectId=null);projects=projects.filter(q=>q.id!==currentProjectId);await selectProject(null);};
$('moveProject').onchange=async()=>{stash();const q=queue.find(q=>q.id===activeId);if(q){q.projectId=$('moveProject').value||null;await selectProject(q.projectId);}};
$('removeImage').onclick=async()=>{if(!activeId||!confirm('移除当前图像和标注？请确认已保存工程备份。'))return;queue=queue.filter(q=>q.id!==activeId);activeId=null;imageData=null;p.rows=[];const next=visibleQueue()[0];if(next)await activate(next.id);else resetCurrent();};
$('queue').onclick=async e=>{const button=e.target.closest('[data-queue]');if(button)try{await activate(button.dataset.queue);}catch(err){toast(err.message);}};
function downloadBlob(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function download(name,object){downloadBlob(name,new Blob([JSON.stringify(object,null,2)],{type:'application/json'}));}
function bundle(){stash();return{format:'chart-studio-project',version:2,savedAt:new Date().toISOString(),projects:clone(projects),currentProjectId,activeId,queue:clone(queue),current:{project:clone(p),image:imageData,name:fileName}};}
$('saveProject').onclick=()=>{download('chart-studio-workspace.project.json',bundle());toast('工作区已备份：包含全部项目、原图、标注和校准记录');};
$('exportGT').onclick=async()=>{await render();const errors=validate(p).filter(i=>i.severity==='error');if(errors.length||!renderOk||!lastSpec){toast('请先修正质量检查错误并确认渲染成功');return;}if(!p.reviewed){toast('请先核对原图和数值来源，并勾选右侧确认');return;}const spec=clone(lastSpec);if($('withSchema').checked)spec.$schema='https://vega.github.io/schema/vega-lite/v6.json';download(safeExportName(fileName||p.kind).split('/').at(-1),spec);toast('已导出精简 GT；像素与来源请另存工程');};
$('batchExport').onclick=async()=>{stash();const items=visibleQueue();if(!items.length){toast('当前项目还没有图像');return;}const report=[],entries=[],names=new Set();for(const q of items){let reason='',spec;try{if(!q.project.reviewed)throw Error('尚未核对');spec=makeSpec(q.project);window.vega.parse(window.vegaLite.compile(spec).spec);}catch(e){reason=e.message;}let name=safeExportName(q.name);for(let n=2;names.has(name);n++)name=safeExportName(q.name).replace(/\.gt\.json$/,'-'+n+'.gt.json');if(!reason){names.add(name);if($('withSchema').checked)spec.$schema='https://vega.github.io/schema/vega-lite/v6.json';entries.push({name:'gt/'+name,text:JSON.stringify(spec,null,2)});}report.push({image:q.name,id:q.id,status:reason?'skipped':'exported',file:reason?null:'gt/'+name,reason:reason||null});}entries.push({name:'export-report.json',text:JSON.stringify({project:projectName(),exported:entries.length,skipped:report.filter(q=>q.status==='skipped').length,images:report},null,2)});downloadBlob(projectName().replace(/[<>:"/\\|?*]/g,'_')+'.gt.zip',new Blob([zipBytes(entries)],{type:'application/zip'}));toast('批量导出 '+(entries.length-1)+' 张；跳过 '+report.filter(q=>q.status==='skipped').length+' 张（原因见 ZIP 内清单）');queueUI();};
$('copyGT').onclick=async()=>{if(!lastSpec){toast('暂无有效 GT');return;}try{await navigator.clipboard.writeText(JSON.stringify(lastSpec,null,2));toast('JSON 已复制');}catch{toast('无法访问剪贴板，请使用导出 GT');}};
$('openProject').onclick=()=>$('projectInput').click();$('importSpec').onclick=()=>$('specInput').click();
async function restore(data){if(data.format!=='chart-studio-project'||![1,2].includes(data.version)||!data.current?.project||!Array.isArray(data.queue))throw Error('不是受支持的 Chart Studio 工程');const all=[data.current.project,...data.queue.map(q=>q.project)];for(const item of all){if(!labels[item.kind]||!Array.isArray(item.rows)||!item.axes?.x||!item.axes?.y||!Array.isArray(item.series))throw Error('工程结构不完整');}const nextProjects=data.version===2?data.projects||[]:[];if(!Array.isArray(nextProjects)||nextProjects.some(q=>!q.id||typeof q.name!=='string')||new Set(nextProjects.map(q=>q.id)).size!==nextProjects.length)throw Error('项目列表无效');if(new Set(data.queue.map(q=>q.id)).size!==data.queue.length||data.queue.some(q=>typeof q.id!=='string'))throw Error('图像列表 ID 无效');const projectIds=new Set(nextProjects.map(q=>q.id));const active=data.queue.find(q=>q.id===data.activeId);if(data.activeId&&!active)throw Error('当前图像 ID 不存在');if(data.version===2&&active&&(active.projectId??null)!==(data.currentProjectId||null))throw Error('当前图像与所选项目不一致');if(data.version===2&&(data.currentProjectId&&!projectIds.has(data.currentProjectId)||data.queue.some(q=>q.projectId&&!projectIds.has(q.projectId))))throw Error('图像所属项目不存在');if(data.current.image)await new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=()=>reject(Error('工程原图无法读取'));im.src=data.current.image;});activationVersion++;queue=clone(data.queue);for(const q of queue){ensureIdentities(q.project);restoreAreaMeasurementPrecision(q.project);}projects=clone(nextProjects);currentProjectId=data.version===2?data.currentProjectId||null:null;activeId=data.activeId;p=ensureIdentities(clone(data.current.project));restoreAreaMeasurementPrecision(p);p.errorBars=hasErrors(p);imageData=data.current.image;fileName=data.current.name||'';image=null;hover=null;pendingStart=null;drag=null;history=[];future=[];selected=-1;if(imageData)await loadImage(imageData);else{$('empty').style.display='flex';$('magnifier').hidden=true;draw();}$('fileName').textContent=fileName||'未命名工程';queueUI();refresh(true);setTool('select');}
$('projectInput').onchange=async e=>{try{await restore(JSON.parse(await e.target.files[0].text()));toast('工程已恢复');}catch(err){toast('打开失败：'+err.message);}e.target.value='';};
$('specInput').onchange=async e=>{try{const next=importSpec(JSON.parse(await e.target.files[0].text()));next.errorBars=hasErrors(next);change(()=>{keepOtherAreaMode(p,next);p={...next,evidence:next.rows.map(()=>({role:'transcribed',source:'imported_gt'})),reviewed:false};for(const a of Object.values(p.axes))a.calibrated=false;selected=-1;},{form:true});setTool('select');toast('GT 已导入；像素证据需重新标注');}catch(err){toast('导入失败：'+err.message);}e.target.value='';};
function db(){return new Promise((resolve,reject)=>{const r=indexedDB.open('chart-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function saveDraft(){try{const database=await db();const tx=database.transaction('drafts','readwrite');tx.objectStore('drafts').put(bundle(),'workspace');tx.oncomplete=()=>{$('saveState').textContent='已保存到当前浏览器 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});database.close();};tx.onerror=()=>{$('saveState').textContent='草稿保存失败，请导出工程';database.close();};}catch{$('saveState').textContent='本地存储不可用，请导出工程';}}
async function restoreDraft(){try{const database=await db();const req=database.transaction('drafts').objectStore('drafts').get('workspace');req.onsuccess=async()=>{database.close();if(req.result)try{await restore(req.result);toast('已恢复本浏览器上次草稿');}catch(err){toast('旧草稿无法恢复：'+err.message);}};}catch{}}
$('help').onclick=()=>$('helpDialog').showModal();
$('demo').onclick=async()=>{stash();activeId=null;imageData=null;p=fresh('scatter_1');p.title='Calibration sample';p.xTitle='Time (s)';p.yTitle='Response';p.rows=[];p.axes.x={p1:80,p2:560,v1:0,v2:10,type:'linear',calibrated:true,point1:{x:80,y:400},point2:{x:560,y:400}};p.axes.y={p1:400,p2:50,v1:0,v2:100,type:'linear',calibrated:true,point1:{x:80,y:400},point2:{x:80,y:50}};
const c=document.createElement('canvas');c.width=640;c.height=460;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,640,460);g.fillStyle='#243344';g.font='18px sans-serif';g.fillText(p.title,225,25);g.strokeStyle='#415565';g.lineWidth=1;g.beginPath();g.moveTo(80,50);g.lineTo(80,400);g.lineTo(560,400);g.stroke();g.font='12px sans-serif';for(let n=0;n<=10;n+=2){const x=80+48*n;g.fillText(String(n),x-4,422);}for(let n=0;n<=100;n+=20){g.fillText(String(n),44,404-n*3.5);}g.fillText('Time (s)',280,448);g.save();g.translate(20,250);g.rotate(-Math.PI/2);g.fillText('Response',0,0);g.restore();g.fillStyle='#008b7e';for(const [x,y]of[[1,16],[2,30],[3,25],[4,48],[5,52],[6,65],[7,61],[8,80],[9,88]]){g.beginPath();g.arc(80+x*48,400-y*3.5,4,0,Math.PI*2);g.fill();}fileName='calibration-sample.png';const id=crypto.randomUUID();queue.push({id,projectId:currentProjectId,name:fileName,image:c.toDataURL(),project:clone(p)});await activate(id);setTool('point');toast('示例已校准：点击绿色散点，检查表格和重绘');};
async function enterFocus(){if(focusMode)return;focusZoom=zoom;focusMode=true;document.body.classList.add('focus-mode');$('focusToggle').textContent='退出全屏 · Esc';try{if(document.querySelector('.workspace').requestFullscreen)await document.querySelector('.workspace').requestFullscreen();}catch{/* CSS focus view works if native fullscreen is unavailable. */}requestAnimationFrame(fit);}
function exitFocus(){if(!focusMode)return;focusMode=false;document.body.classList.remove('focus-mode');$('focusToggle').textContent='全屏标注 ⛶';if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});requestAnimationFrame(()=>setZoom(focusZoom));}
$('focusReview').onclick=()=>{exitFocus();requestAnimationFrame(()=>document.querySelector('.review').scrollIntoView({behavior:'smooth'}));};$('focusToggle').onclick=()=>focusMode?exitFocus():enterFocus();document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&focusMode)exitFocus();});window.addEventListener('resize',()=>{if(focusMode)fit();});
window.addEventListener('error',e=>toast(e.message));syncForm();table();render();restoreDraft();
// Read-only diagnostic snapshot for reproducible browser checks.
window.chartStudio={snapshot:()=>clone({projects,currentProjectId,queue,focusMode,project:p,selected,tool,selectedHandle,projectionInfo,renderOk,lastSpec,imageSize:image?{width:image.width,height:image.height}:null}),get bundle(){return bundle();}};
