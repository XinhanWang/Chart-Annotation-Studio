/** Compact-v4 semantic GT. Image geometry and review evidence stay in project files. */
const KINDS = ['barh_1','barh_n','barv_1','barv_n','barv_stack','line_1','line_n','scatter_1','scatter_n'];
const copy = value => JSON.parse(JSON.stringify(value));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const present = n => n !== undefined && n !== null && n !== '';
const unique = values => [...new Set(values)];
const isBar = p => p.kind.startsWith('bar');
const isHorizontal = p => p.kind.startsWith('barh');
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
  const field=isBar(p)?'category':'x',categorical=isBar(p)||p.xType==='ordinal';
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
function renameObject(p,kind,key,name){ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects,obj=list.find(o=>o.key===key);if(!obj)throw Error('对象不存在');obj.name=name;const field=kind==='series'?'series':isBar(p)?'category':'x',ref=kind==='series'?'_seriesKey':'_categoryKey';for(const r of p.rows)if(r[ref]===key)r[field]=name;p.categories=p.categoryObjects.map(c=>c.name);}
function moveObject(p,kind,key,delta){ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects,i=list.findIndex(o=>o.key===key),j=i+delta;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];p.categories=p.categoryObjects.map(c=>c.name);}
function addObject(p,kind,name){ensureIdentities(p);const obj={key:newKey(kind),name,...(kind==='series'?{color:'#e8590c'}:{})};(kind==='series'?p.series:p.categoryObjects).push(obj);p.categories=p.categoryObjects.map(c=>c.name);return obj;}
function removeObject(p,kind,key){ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects;if(kind==='series'&&list.length===1)throw Error('至少保留一个系列');const ref=kind==='series'?'_seriesKey':'_categoryKey',keep=p.rows.map((r,i)=>r[ref]===key?-1:i).filter(i=>i>=0);p.rows=keep.map(i=>p.rows[i]);if(p.evidence)p.evidence=keep.map(i=>p.evidence[i]);list.splice(list.findIndex(o=>o.key===key),1);p.categories=p.categoryObjects.map(c=>c.name);}
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
  if(p.kind==='barv_stack')for(const r of [...source].sort((a,b)=>(a.stack_order??series.indexOf(identity(a)))-(b.stack_order??series.indexOf(identity(b)))||a.__input-b.__input)) {
    const key=JSON.stringify([categoryIdentity(r),r.value<0]);
    const start=present(r.start)?r.start:(totals.get(key)||0);
    const end=present(r.end)?r.end:start+r.value;
    r.__mid=(start+end)/2;totals.set(key,end);
  }
  const compare=(a,b)=>{
    const ac=categorical?(categories.indexOf(categoryIdentity(a))):sx*a.x;
    const bc=categorical?(categories.indexOf(categoryIdentity(b))):sx*b.x;
    if(ac!==bc)return ac-bc;
    if(p.kind==='barv_stack')return sy*(a.__mid-b.__mid)||a.__input-b.__input;
    if(p.kind.startsWith('scatter'))return sy*(a.y-b.y)||a.__input-b.__input;
    return (series.indexOf(identity(a)))-(series.indexOf(identity(b)))||a.__input-b.__input;
  };
  source.sort(compare);
  // Visual table order must not change a nonmonotonic line's original adjacency.
  if(p.kind.startsWith('line')&&!source.every(r=>present(r.path_order))) {
    const paths=new Map();
    for(const r of source){const key=identity(r);if(!paths.has(key))paths.set(key,[]);paths.get(key).push(r.__input);}
    const needs=[...paths.values()].some(a=>!a.every((v,i)=>!i||v>a[i-1])&&!a.every((v,i)=>!i||v<a[i-1]));
    if(needs)for(const r of source)r.path_order=r.__input;
  }
  for(const r of source){delete r.__input;delete r.__mid;}
  return source;
}

function defaultProject(kind='scatter_1') {
  if (!KINDS.includes(kind.replace(/_error$/,'')) || kind.endsWith('_error')&&!['barh_1','barh_n','barv_1','barv_n'].includes(kind.slice(0,-6))) throw Error('未知图表类型');
  const errorBars=kind.endsWith('_error');if(errorBars)kind=kind.slice(0,-6);
  const multi=kind.endsWith('_n')||kind==='barv_stack';
  const series=[{name:'Series 1',color:'#4263eb'},...(multi?[{name:'Series 2',color:'#e8590c'}]:[])];
  const categories=['A','B','C'];
  return ensureIdentities({kind,title:'',xTitle:'',yTitle:'',xType:'quantitative',legend:multi,errorBars,
    rows:series.flatMap((s,j)=>categories.map((category,i)=>isBar({kind})?
      {category,value:20+i*15+j*10,series:s.name,...(kind==='barv_stack'?{stack_order:j}:{})}:
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
function valueToPixel(value,axis) {
  if(!finite(value)) throw Error('数值必须为有限数字');
  const {f}=axisTransform(axis);
  if(axis.type==='log'&&value<=0) throw Error('对数轴数值必须大于零');
  return axis.p1+(f(value)-f(axis.v1))/(f(axis.v2)-f(axis.v1))*(axis.p2-axis.p1);
}

function validate(p) {
  try{p=ensureIdentities(copy(p));}catch(e){return [{severity:'error',message:e.message}];}
  const out=[];
  const issue=(severity,message)=>out.push({severity,message});
  if(!p || !KINDS.includes(p.kind)) return [{severity:'error',message:'未知图表类型'}];
  if(!Array.isArray(p.rows)||!p.rows.length) return [{severity:'error',message:'至少需要一行观测数据'}];
  if(p.rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return [{severity:'error',message:'每一行必须为观测对象'}];
  const bar=isBar(p), stack=p.kind==='barv_stack', line=p.kind.startsWith('line');
  for(const key of ['title','xTitle','yTitle'])if(present(p[key])&&!(typeof p[key]==='string'||Array.isArray(p[key])&&p[key].length&&p[key].every(v=>typeof v==='string')))issue('error',`${key} 需要文字或非空文字数组`);
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
  for(const axis of requiredAxes(p)) {if(p.axes?.[axis]?.calibrated){try{axisTransform(p.axes?.[axis]);}catch(e){issue('error',`${axis.toUpperCase()} 轴：${e.message}`);}}}
  if(stack&&fields.includes('start')&&fields.includes('stack_order')) issue('error','堆叠端点和 stack_order 二选一');
  if(bar&&fields.includes('lower')&&p.rows.some(r=>finite(r.lower)&&finite(r.upper)&&(r.value<r.lower||r.value>r.upper))) issue('warning','部分数值位于误差区间外，请核对区间是否为绝对上下界');
  if(line&&!fields.includes('path_order')) {
    const last=new Map();let nonmonotonic=false;
    for(const r of p.rows){const x=p.xType==='ordinal'?p.categoryObjects.map(c=>c.key).indexOf(categoryIdentity(r)):r.x;const s=identity(r);if(last.has(s)&&x<=last.get(s))nonmonotonic=true;last.set(s,x);}
    if(nonmonotonic) issue('warning','折线路径包含重复或逆序 x，将按输入行顺序连接；也可填写 path_order');
  }
  return out;
}

function makeSpec(p) {
  const errors=validate(p).filter(x=>x.severity==='error');
  if(errors.length) throw Error(errors.map(x=>x.message).join('\n'));
  const bar=isBar(p),stack=p.kind==='barv_stack',horizontal=isHorizontal(p),line=p.kind.startsWith('line');
  p=ensureIdentities(copy(p));
  const ordered=orderedRows(p),categoryField=bar?'category':'x';
  const seriesKeys=unique(ordered.map(identity)),categoryKeys=unique(ordered.map(categoryIdentity));
  const multi=seriesKeys.length>1,withSeries=p.legend!==false||multi;
  const repeatedSeries=unique(seriesKeys.map(k=>seriesName(p,k))).length<seriesKeys.length;
  const repeatedCategory=(bar||p.xType==='ordinal')&&unique(categoryKeys.map(k=>categoryName(p,k))).length<categoryKeys.length;
  const categoryID=bar?'category_id':'x_id';
  const optional=['lower','upper','start','end','path_order','stack_order'].filter(k=>ordered.every(r=>present(r[k])));
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
  if(withSeries)enc.color={field:rows[0].series_id?'series_id':'series',type:'nominal',sort:null};
  if(['barh_n','barv_n'].includes(p.kind))enc[cat+'Offset']={...enc.color};
  if(stack) {
    if(optional.includes('start')) {enc[val].field='end';enc[val].stack=null;enc[val+'2']={field:'start'};}
    else {enc[val].stack='zero';enc.order={field:'stack_order',type:'quantitative'};}
  }
  let mark={type:bar?'bar':line?'line':'point'};
  if(line&&unique(p.rows.map(identity)).some(id=>p.rows.filter(r=>identity(r)===id).length===1))mark.point=true;
  if(line&&optional.includes('path_order'))enc.order={field:'path_order',type:'quantitative'};
  else if(line&&validate(p).some(i=>i.message.includes('按输入行顺序'))) mark.order=false;
  const out={};
  if(present(p.title))out.title=copy(p.title);
  out.data={values:rows};
  if(bar&&optional.includes('lower')) {
    out.encoding=enc;
    out.layer=[{mark:{type:'bar'}},{mark:{type:'errorbar'},encoding:{[val]:{field:'lower',type:'quantitative',...(stack?{stack:null}:{})},[val+'2']:{field:'upper'}}}];
  } else {out.mark=mark;out.encoding=enc;}
  return out;
}

function importSpec(input) {
  const s=copy(input);
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('GT 必须为 JSON 对象');
  if(!s.data||!Array.isArray(s.data.values)||!s.data.values.length)throw Error('只支持包含 data.values 的非空内联 Vega-Lite 图表');
  if(s.transform||s.concat||s.hconcat||s.vconcat||s.facet||s.repeat)throw Error('当前九类工具不支持变换或组合图表导入');
  if(s.usermeta?.semantic)throw Error('请导入合成数据的精简 GT，而不是包含 plot_* 布局字段的完整渲染 spec');
  if(s.layer&&(!Array.isArray(s.layer)||s.layer.some(l=>l.transform||l.data||l.layer||l.resolve)))throw Error('不支持带独立数据、变换或嵌套结构的图层');
  const primary=s.layer?.find(l=>['bar','line','point'].includes(typeof l.mark==='string'?l.mark:l.mark?.type));
  const enc={...(s.encoding||{}),...(primary?.encoding||{})};
  const mark=primary?.mark??s.mark;
  const type=typeof mark==='string'?mark:mark?.type;
  if(!['bar','line','point'].includes(type)||!enc.x||!enc.y)throw Error('仅支持柱、折线、散点图的 x/y 编码');
  if(typeof mark==='object'&&Object.keys(mark).some(k=>!['type','order','point'].includes(k)))throw Error('导入包含额外标记属性，请先转换为精简 GT');
  if(Object.keys(enc).some(k=>!['x','y','x2','y2','color','xOffset','yOffset','order'].includes(k)))throw Error('导入包含当前九类工具尚不支持的视觉编码');
  for(const def of Object.values(enc)) {
    if(def.condition||def.aggregate||def.bin||def.timeUnit||def.datum!==undefined||def.value!==undefined||def.sort!=null)throw Error('导入包含条件、聚合、分箱、常数或显式排序编码，不进行有损转换');
    if(def.axis?.labelExpr||def.legend?.labelExpr)throw Error('请使用当前规范的 category_id / x_id / series_id 身份字段，不导入旧版标签表达式');
  }
  const horizontal=type==='bar'&&['nominal','ordinal'].includes(enc.y.type);
  const val=horizontal?'x':'y',cat=horizontal?'y':'x';
  const seriesField=enc.color?.field;
  const ids=unique(s.data.values.map(r=>seriesField?r[seriesField]:'Series 1'));
  const stacked=type==='bar'&&(present(enc[val].stack)&&enc[val].stack!==null||enc[val+'2']||enc.order?.field==='stack_order');
  if(stacked&&horizontal)throw Error('当前只支持纵向堆叠图');
  if(enc[val].stack&&!['zero'].includes(enc[val].stack))throw Error('当前规范仅支持 zero 堆叠；百分比图需直接标注图中归一化数值');
  const kind=type==='bar'?(stacked?'barv_stack':`bar${horizontal?'h':'v'}_${ids.length>1||enc[cat+'Offset']?'n':'1'}`):`${type==='line'?'line':'scatter'}_${ids.length>1?'n':'1'}`;
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
  // Compact-v4 omits display reversal; its observation table still follows screen order.
  // Recover a descending reading direction from that table for lossless re-export.
  if(type!=='bar'&&p.xType==='quantitative'&&!enc.x.scale?.reverse) {
    const xs=unique(p.rows.map(r=>r.x));
    if(xs.length>1&&xs.every((v,i)=>!i||v<xs[i-1]))p.axes.x.reverse=true;
  }
  if(type==='point'&&!enc.y.scale?.reverse) {
    const tie=p.rows.findIndex((r,i)=>i>0&&r.x===p.rows[i-1].x&&r.y!==p.rows[i-1].y);
    if(tie>0)p.axes.y.reverse=p.rows[tie].y>p.rows[tie-1].y;
  }
  if(stacked&&p.rows.length>1&&!enc.y.scale?.reverse) {
    const totals=new Map(),mids=new Map();
    for(const r of [...p.rows].sort((a,b)=>(a.stack_order??0)-(b.stack_order??0))) {
      const key=JSON.stringify([categoryIdentity(r),r.value<0]);
      const start=present(r.start)?r.start:(totals.get(key)||0),end=present(r.end)?r.end:start+r.value;
      mids.set(r,(start+end)/2);totals.set(key,end);
    }
    const r0=p.rows[0],r1=p.rows.find(r=>categoryIdentity(r)===categoryIdentity(r0)&&identity(r)!==identity(r0));
    if(r1)p.axes.y.reverse=mids.get(r1)>mids.get(r0);
  }
  return p;
}

function requiredAxes(p){return isBar(p)?[isHorizontal(p)?'x':'y']:p.xType==='ordinal'?['y']:['x','y'];}
function hasErrors(p){return !!p.errorBars||isBar(p)&&p.rows.some(r=>present(r.lower)||present(r.upper));}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// ZIP stored entries with UTF-8 names: a single download, no runtime dependencies.
function zipBytes(entries){const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;
for(const entry of entries){const name=encoder.encode(entry.name),data=encoder.encode(entry.text),crc=crc32(data);if(name.length>65535||data.length>0xffffffff)throw Error('ZIP 条目过大');const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);parts.push(local,data);directory.push(central);offset+=local.length+data.length;}
if(entries.length>65535||offset>0xffffffff)throw Error('ZIP 超过容量限制，请拆分项目');const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);const out=new Uint8Array(offset+size+22);let at=0;for(const b of [...parts,...directory,end]){out.set(b,at);at+=b.length;}return out;}
function safeExportName(name){return String(name||'chart').replace(/\\/g,'/').split('/').filter(v=>v&&v!=='.'&&v!=='..').map(v=>v.replace(/[<>:"|?*\u0000-\u001f]/g,'_')).join('/').replace(/\.[^/.]+$/,'')+'.gt.json';}

const $=id=>document.getElementById(id), clone=x=>structuredClone(x);
const labels={barh_1:'单系列横向柱图',barh_n:'分组横向柱图',barv_1:'单系列纵向柱图',barv_n:'分组纵向柱图',barv_stack:'堆叠纵向柱图',line_1:'单系列折线图',line_n:'多系列折线图',scatter_1:'单系列散点图',scatter_n:'多系列散点图'};
for(const kind of ['barh_1','barh_n','barv_1','barv_n'])labels[kind+'_error']=labels[kind]+' · 误差棒';
let projects=[],currentProjectId=null,focusMode=false,focusZoom=1,imageLoadVersion=0,activationVersion=0;
let hover=null,selectedHandle='pixel',dragOrigin=null,projectionInfo=null;
let p=defaultProject('scatter_1'),image=null,imageData=null,fileName='',tool='select',selected=-1,zoom=1,calTarget='x1',pendingStart=null,drag=null,history=[],future=[],queue=[],activeId=null,renderTimer,saveTimer,renderOk=false,lastSpec=null;
const canvas=$('canvas'),ctx=canvas.getContext('2d');
const bar=()=>p.kind.startsWith('bar'), horizontal=()=>p.kind.startsWith('barh'), categorical=()=>bar()||p.xType==='ordinal';
function fresh(kind){const q=defaultProject(kind);q.rows=[];q.evidence=[];q.reviewed=false;for(const a of Object.values(q.axes))a.calibrated=false;return q;}
p=fresh('scatter_1');
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500);}
function checkpoint(){history.push(clone(p));if(history.length>80)history.shift();future=[];}
function dirty(){p.reviewed=false;$('reviewed').checked=false;}
function change(fn,{form=false}={}){const old=clone(p);checkpoint();try{fn();}catch(e){p=old;history.pop();toast(e.message);return;}dirty();refresh(form);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function options(el,values,chosen){el.innerHTML=values.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');if(values.some(([v])=>String(v)===String(chosen)))el.value=chosen;}
const familyOf=kind=>kind.startsWith('bar')?'bar':kind.startsWith('line')?'line':'scatter';
function syncTypes(){const family=familyOf(p.kind);$('family').value=family;options($('kind'),Object.entries(labels).filter(([k])=>familyOf(k)===family),p.kind+(hasErrors(p)&&p.kind!=='barv_stack'?'_error':''));}
syncTypes();
function syncForm(){ensureIdentities(p);syncTypes();for(const key of ['title','xTitle','yTitle','xType','notes'])$(key).value=p[key]??'';$('legend').checked=p.legend;$('reviewed').checked=!!p.reviewed;syncCategoryList();$('xTypeLabel').hidden=!p.kind.startsWith('line');$('addSeries').hidden=p.kind.endsWith('_1');$('activeSeries').closest('label').hidden=p.kind.endsWith('_1');$('seriesSection').hidden=p.kind.endsWith('_1')&&!p.legend;$('roleLabel').hidden=!p.kind.startsWith('line');$('connect').closest('label').hidden=!p.kind.startsWith('line');$('tableNote').textContent=bar()?(hasErrors(p)?'下限 / 上限是绝对数值界限，不是误差长度。':p.kind==='barv_stack'?'段起点 / 段终点是实际边界数值。':'每条记录对应一个柱子。'):p.kind.startsWith('line')?'默认按取点顺序连接；复杂路径可展开高级字段调整顺序。':'每条记录对应一个可见散点。';$('categoryLabel').hidden=!categorical();$('activeCategoryLabel').hidden=!categorical();
const active=$('activeSeries').value;options($('activeSeries'),p.series.map((s,i)=>[s.key,s.name+'（'+(i+1)+'）']),active);options($('activeCategory'),p.categoryObjects.map((c,i)=>[c.key,c.name+'（'+(i+1)+'）']),$('activeCategory').value);
$('seriesList').innerHTML=p.series.map((s,i)=>`<div class="series-row"><input type="color" aria-label="系列颜色" value="${esc(s.color||'#008b7e')}" data-series="${i}" data-prop="color"><input aria-label="系列名称" value="${esc(s.name)}" data-series="${i}" data-prop="name"><button data-move-series="${i}" data-delta="-1" title="上移">↑</button><button data-move-series="${i}" data-delta="1" title="下移">↓</button><button data-remove-series="${i}" title="删除系列">×</button></div>`).join('');
axisForm();syncAssist();}
function axisForm(){ const required=requiredAxes(p);$('categoryAxisNote').hidden=required.length===2;$('categoryAxisNote').textContent=required.length===1?(required[0]==='x'?'Y':'X')+' 轴是类别轴，无需数值标定；在类别顺序中填写标签即可。':'';$('axisFields').innerHTML=required.map(a=>`<div class="axis-group"><h4>${a.toUpperCase()} 轴 <small>${p.axes[a].calibrated?'已校准':'待校准'}</small></h4><label>坐标类型<select data-axis="${a}" data-field="type"><option value="linear" ${p.axes[a].type!=='log'?'selected':''}>线性</option><option value="log" ${p.axes[a].type==='log'?'selected':''}>对数</option></select></label>${[1,2].map(n=>`<div class="tick-row"><button data-tick="${a}${n}" class="${tool==='calibrate'&&calTarget===a+n?'active':''}">${a.toUpperCase()}${n} 取刻度</button><label>原图像素<input type="number" step="any" data-axis="${a}" data-field="p${n}" value="${p.axes[a]['p'+n]}"></label><label>真实数值<input type="number" step="any" data-axis="${a}" data-field="v${n}" value="${p.axes[a]['v'+n]}"></label></div>`).join('')}</div>`).join('');$('calibrationStatus').textContent=required.every(a=>p.axes[a].calibrated)?'所需数值轴已校准':'先取两个刻度再测量';}
function columns(){const series=p.kind.endsWith('_1')?[]:['series'];return bar()?['category','value',...series,...(p.kind==='barv_stack'?['start','end']:[]),...(hasErrors(p)?['lower','upper']:[])]:['x','y',...series,...(p.kind.startsWith('line')&&$('advancedFields').checked?['path_order']:[])];}
const columnNames={category:'类别',value:'数值',series:'系列',x:'X',y:'Y',start:'段起点',end:'段终点',stack_order:'堆叠顺序',path_order:'路径顺序',lower:'下限',upper:'上限'};
function table(){const cols=columns();$('tableHead').innerHTML='<tr><th># / 来源</th>'+cols.map(k=>`<th>${columnNames[k]}</th>`).join('')+'</tr>';
$('tableBody').innerHTML=p.rows.map((r,i)=>`<tr class="${i===selected?'selected':''}" data-row="${i}"><td>${i+1} ${p.evidence?.[i]?.pixel?'⌖':'✎'}</td>${cols.map(k=>{
const kind=k==='series'?'series':k==='category'||k==='x'&&categorical()?'category':null;
if(kind){const list=kind==='series'?p.series:p.categoryObjects,ref=kind==='series'?'_seriesKey':'_categoryKey';return `<td><select aria-label="第${i+1}行 ${columnNames[k]}" data-i="${i}" data-object="${kind}">${list.map((o,j)=>`<option value="${esc(o.key)}" ${r[ref]===o.key?'selected':''}>${esc(o.name)}（${j+1}）</option>`).join('')}</select></td>`;}
return `<td><input aria-label="第${i+1}行 ${columnNames[k]}" data-i="${i}" data-key="${k}" value="${esc(r[k])}" type="number" step="any"></td>`;
}).join('')}</tr>`).join('');$('countBadge').textContent=`${p.rows.length} 条记录`;$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function syncCategoryList(){
  $('categories').hidden=true;let list=$('categoryObjects');if(!list){list=document.createElement('div');list.id='categoryObjects';$('categories').after(list);}
  list.innerHTML=p.categoryObjects.map((c,i)=>`<div class="series-row"><input aria-label="类别位置 ${i+1} 名称" data-category="${esc(c.key)}" value="${esc(c.name)}"><button data-move-category="${esc(c.key)}" data-delta="-1" title="上移">↑</button><button data-move-category="${esc(c.key)}" data-delta="1" title="下移">↓</button><button data-remove-category="${esc(c.key)}" title="删除类别及记录">×</button></div>`).join('')+'<button type="button" id="addCategory">＋ 添加类别位置</button>';
  list.onchange=e=>{if(e.target.dataset.category)change(()=>renameObject(p,'category',e.target.dataset.category,e.target.value),{form:true});};
  list.onclick=e=>{const d=e.target.dataset;if(e.target.id==='addCategory')change(()=>addObject(p,'category','新类别'),{form:true});else if(d.moveCategory)change(()=>moveObject(p,'category',d.moveCategory,Number(d.delta)),{form:true});else if(d.removeCategory){if(p.rows.some(r=>r._categoryKey===d.removeCategory)&&!confirm('删除该类别位置及其全部记录？'))return;change(()=>{removeObject(p,'category',d.removeCategory);selected=-1;},{form:true});}};
}
function refresh(form=false){ensureIdentities(p);queueUI();if(form)syncForm();table();syncAssist();draw();clearTimeout(renderTimer);renderTimer=setTimeout(render,130);clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,450);}
let renderVersion=0;
async function render(){const version=++renderVersion;renderOk=false;let issues=validate(p);if(p.rows.length===0)issues=[{severity:'warning',message:'添加数据记录后生成 GT。'}];$('issues').innerHTML=issues.length?issues.map(i=>`<li class="${i.severity}">${esc(i.message)}</li>`).join(''):'<li class="ok">数据结构检查通过。请继续核对原图与科学数值。</li>';$('validationBadge').textContent=issues.filter(i=>i.severity==='error').length+' 个错误';
try{const gt=makeSpec(p);$('jsonPreview').textContent=JSON.stringify(gt,null,2);if(!window.vegaEmbed)throw Error('本地 Vega 渲染组件未加载');const spec={...renderSpec(gt),width:230,height:210};for(const a of ['x','y']){if(spec.encoding[a])spec.encoding[a].title=p[a+'Title']||null;}if(spec.encoding.color){spec.encoding.color.legend=p.legend?{...(spec.encoding.color.legend||{}),title:null}:null;const keys=unique(orderedRows(p).map(identity));spec.encoding.color.scale={domain:unique(gt.data.values.map(r=>r.series_id??r.series)),range:keys.map(k=>p.series.find(s=>s.key===k)?.color||'#008b7e')};}const holder=document.createElement('div');const result=await window.vegaEmbed(holder,spec,{actions:false,renderer:'svg'});result.view.finalize();if(version!==renderVersion)return;$('preview').replaceChildren(holder);lastSpec=gt;renderOk=true;$('renderState').textContent='Vega-Lite v6 · 语义渲染成功';}catch(e){if(version!==renderVersion)return;lastSpec=null;$('jsonPreview').textContent='请先修正数据结构。';$('preview').replaceChildren();$('renderState').textContent=p.rows.length?'无法渲染：'+e.message:'添加记录后显示语义重绘';}}
function assist(){
  ensureIdentities(p);p.assist??={};const a=p.assist;
  a.sequence??=bar()?'category':'series';a.errorOrder??='per-bar';a.projections??=true;a.magnify??=true;a.dragAxis??='free';a.categoryPixels??={};
  if(!p.series.some(s=>s.key===a.series))a.series=p.series.find(s=>s.name===a.series)?.key??p.series[0]?.key??'';
  if(!p.categoryObjects.some(c=>c.key===a.category))a.category=p.categoryObjects.find(c=>c.name===a.category)?.key??p.categoryObjects[0]?.key??'';
  return a;
}
function targetPairs(){const a=assist(),cats=p.categoryObjects.map(c=>c.key),series=p.series.map(s=>s.key);return a.sequence==='series'?series.flatMap(series=>cats.map(category=>({series,category}))):cats.flatMap(category=>series.map(series=>({series,category})));}
function targetIndex(t){return p.rows.findIndex(r=>identity(r)===t.series&&categoryIdentity(r)===t.category);}
function nextTarget(){const a=assist(),pairs=targetPairs(),at=pairs.findIndex(t=>t.series===a.series&&t.category===a.category);for(let offset=1;offset<=pairs.length;offset++){const t=pairs[(Math.max(at,0)+offset)%pairs.length];if(targetIndex(t)<0){a.series=t.series;a.category=t.category;syncAssist();return true;}}syncAssist();return false;}
function errorTask(){if(!hasErrors(p)||p.kind==='barv_stack')return null;const a=assist(),pairs=targetPairs(),fields=['value','upper','lower'];const missing=t=>{const i=targetIndex(t);return i<0||!finite(p.rows[i][t.field]);};if(!pairs.length)return {category:'',series:a.series,field:'value'};if(a.errorOrder==='passes')return fields.flatMap(field=>pairs.map(t=>({...t,field}))).find(missing)||null;const current={category:a.category,series:a.series},own=fields.map(field=>({...current,field})).find(missing);return own||pairs.flatMap(t=>fields.map(field=>({...t,field}))).find(missing)||null;}
function syncErrorTarget(){const t=errorTask();if(t){assist().series=t.series;assist().category=t.category;}return t;}
function errorComplete(t){const i=targetIndex(t);return i>=0&&['value','lower','upper'].every(k=>finite(p.rows[i][k]));}
function measureError(raw){const t=syncErrorTarget();if(!t){toast('误差棒全部标注完成；选择 / 拖动可复查');return;}calibrated();if(!t.category)throw Error('请先填写类别');const i=targetIndex(t),axis=horizontal()?'x':'y';const pt=t.field==='value'?constrainAdd(raw):{...raw,...(p.evidence?.[i]?.pixel?{[horizontal()?'y':'x']:p.evidence[i].pixel[horizontal()?'y':'x']}:{})};const value=pixelToValue(pt[axis],p.axes[axis]);change(()=>{let index=i;if(t.field==='value'&&i<0){p.rows.push({category:categoryName(p,t.category),series:seriesName(p,t.series),_categoryKey:t.category,_seriesKey:t.series,value});p.evidence??=[];p.evidence.push({role:'observation',source:'pixel_measurement',createdAt:new Date().toISOString()});index=p.rows.length-1;}p.rows[index][t.field]=value;p.evidence??=[];p.evidence[index]??={role:'observation',source:'pixel_measurement'};const key=t.field==='value'?'pixel':t.field+'Pixel';p.evidence[index][key]=pt;if(t.field==='value'&&assist().lockCategory){if(horizontal())p.evidence[index].fixedY={pixel:pt.y};else p.evidence[index].fixedX={pixel:pt.x};}selected=index;selectedHandle=key;syncErrorTarget();});}
function anchorKey(){const a=assist();return JSON.stringify(p.kind==='barv_n'||p.kind==='barh_n'?[a.category,a.series]:[a.category]);}
function syncAssist(){
  const a=assist(),task=syncErrorTarget();$('errorOrderLabel').hidden=!hasErrors(p)||p.kind==='barv_stack';$('errorOrder').value=a.errorOrder;for(const k of ['lower','upper'])document.querySelector('[data-tool='+k+']').hidden=!hasErrors(p);$('advancedFieldsLabel').hidden=!p.kind.startsWith('line');$('activeSeries').value=a.series;$('activeCategory').value=a.category;
  $('sequence').value=a.sequence;$('sequenceLabel').hidden=!categorical();$('nextTarget').hidden=!categorical();$('numericLock').hidden=categorical();$('categoryLock').hidden=!categorical();
  for(const [id,key]of [['projections','projections'],['magnify','magnify'],['lockX','lockX'],['lockCategory','lockCategory']])$(id).checked=!!a[key];
  if(document.activeElement!==$('fixedX'))$('fixedX').value=a.fixedXValue??'';$('dragAxis').value=a.dragAxis;
  const pairs=categorical()?targetPairs():[],done=pairs.filter(t=>hasErrors(p)?errorComplete(t):targetIndex(t)>=0).length;
  $('targetHint').textContent=categorical()?`当前目标：${categoryName(p,a.category)||'请先填写类别'} · ${seriesName(p,a.series)}`:`当前系列：${seriesName(p,a.series)}${a.lockX?' · 固定 X = '+(a.fixedXValue??'待填写'):''}`;
  if(hasErrors(p)&&p.kind!=='barv_stack')$('targetHint').textContent=task?'下一点：'+categoryName(p,task.category)+' · '+seriesName(p,task.series)+' · '+({value:'柱子数值端点',upper:'误差上界（较大值）',lower:'误差下界（较小值）'}[task.field]):'误差棒取点完成，可选择标记复查';$('targetTop').textContent=$('targetHint').textContent; $('targetProgress').textContent=pairs.length?`${done} / ${pairs.length} 已标注`:'';
  $('targetGrid').hidden=!categorical();$('targetGrid').innerHTML=pairs.map((t,i)=>`<button class="target-cell ${(hasErrors(p)?errorComplete(t):targetIndex(t)>=0)?'done':''} ${t.series===a.series&&t.category===a.category?'current':''}" data-target="${i}" title="${esc(categoryName(p,t.category)+' · '+seriesName(p,t.series))}">${(hasErrors(p)?errorComplete(t):targetIndex(t)>=0)?'✓ ':''}${esc(categoryName(p,t.category))} <small>${esc(seriesName(p,t.series))}</small></button>`).join('');
  const anchor=a.categoryPixels[anchorKey()];$('anchorStatus').textContent=Number.isFinite(anchor)?`已定位 ${anchor.toFixed(1)} px`:'尚未定位';
  $('unlockPoint').disabled=selected<0||!p.evidence?.[selected]?.fixedX;
  $('magnifier').hidden=!image||!a.magnify||!hover;document.querySelector('.lens-dock').hidden=!a.magnify;document.querySelector('.image-stage').classList.toggle('no-lens',!a.magnify);
}
function constrainAdd(pt){const a=assist(),out={...pt};if(categorical()&&a.lockCategory){const pixel=a.categoryPixels[anchorKey()];if(!Number.isFinite(pixel))throw Error('请先定位当前类别刻度（分组柱需定位当前系列的柱中心）');out[horizontal()?'y':'x']=pixel;}
  if(!categorical()&&a.lockX){if(!Number.isFinite(a.fixedXValue))throw Error('请先填写固定 X 的真实数值');if(p.axes.x.type==='log'&&a.fixedXValue<=0)throw Error('对数 X 数值必须大于零');if(Number.isFinite(a.fixedXPixel))out.x=a.fixedXPixel;else{if(!p.axes.x.calibrated)throw Error('请在原图定位 X 刻度，或先校准 X 轴');out.x=valueToPixel(a.fixedXValue,p.axes.x);}}
  return bounded(out);
}
function bounded(pt){return{x:Math.max(0,Math.min(image.width,pt.x)),y:Math.max(0,Math.min(image.height,pt.y))};}
function constrainDrag(pt,i,kind='pixel',shift=false){const out=bounded(pt),e=p.evidence[i],old=e[kind]||e.pixel,a=assist();if(kind==='pixel'&&e.fixedX)out.x=old.x;if(kind==='pixel'&&e.fixedY)out.y=old.y;if(kind==='lowerPixel'||kind==='upperPixel')out[horizontal()?'y':'x']=(e.pixel||old)[horizontal()?'y':'x'];
  if(kind==='startPixel'&&e.fixedX)out.x=old.x;
  if(a.dragAxis==='y')out.x=old.x;if(a.dragAxis==='x')out.y=old.y;
  if(shift&&dragOrigin){if(Math.abs(out.x-dragOrigin.x)>=Math.abs(out.y-dragOrigin.y))out.y=dragOrigin.y;else out.x=dragOrigin.x;}return out;
}
function editHandle(i,kind,pt){if(kind==='pixel')applyPixel(i,pt);else if(kind==='startPixel'){p.evidence[i].startPixel=pt;p.rows[i].start=pixelToValue(pt.y,p.axes.y);p.rows[i].value=p.rows[i].end-p.rows[i].start;}else{const key=kind==='lowerPixel'?'lower':'upper',axis=horizontal()?'x':'y';p.evidence[i][kind]=pt;p.rows[i][key]=pixelToValue(pt[axis],p.axes[axis]);}p.evidence[i].modifiedAt=new Date().toISOString();}
function drawGuides(){
  const a=assist(),e=p.evidence?.[selected],selectedPt=e?.[selectedHandle]||e?.pixel;
  let pt=drag!==null||tool==='select'&&selectedPt?selectedPt:hover||selectedPt;if(!pt&&tool==='point'){try{if(a.lockX||a.lockCategory)pt=constrainAdd({x:p.axes.x.p1,y:p.axes.y.p1});}catch{}}if(!pt)return;
  if(hover&&tool==='point'&&drag===null)try{pt=constrainAdd(hover);}catch{}
  const baseX=p.axes.y.point1?.x??p.axes.x.p1,baseY=p.axes.x.point1?.y??p.axes.y.p1;
  let values={};try{values=measureAt(pt,hover&&tool==='point'&&drag===null?null:selected>=0?selected:null);}catch{}
  projectionInfo={point:{...pt},baseX,baseY,values};
  if(a.projections&&Object.keys(values).length){ctx.save();ctx.strokeStyle='#ed8b32';ctx.fillStyle='#9f5414';ctx.lineWidth=1/zoom;ctx.setLineDash([5/zoom,4/zoom]);ctx.beginPath();ctx.moveTo(baseX,pt.y);ctx.lineTo(pt.x,pt.y);ctx.lineTo(pt.x,baseY);ctx.stroke();ctx.setLineDash([]);ctx.font=`${11/zoom}px monospace`;const format=v=>typeof v==='number'?Number(v.toPrecision(6)):String(v??'');const x=bar()?(horizontal()?values.value:values.category):values.x,y=bar()?(horizontal()?values.category:values.value):values.y;
  const text=(s,x,y)=>{const w=ctx.measureText(s).width;ctx.fillStyle='#fffef3';ctx.fillRect(Math.max(0,x-3/zoom),Math.max(0,y-12/zoom),w+6/zoom,16/zoom);ctx.fillStyle='#9f5414';ctx.fillText(s,Math.max(0,Math.min(x,image.width-w)),Math.max(12/zoom,Math.min(y,image.height-3/zoom)));};
  text('X: '+format(x),pt.x+4/zoom,Math.min(image.height-4/zoom,baseY+18/zoom));text('Y: '+format(y),Math.max(2/zoom,baseX+5/zoom),pt.y-6/zoom);ctx.restore();}
  const fixed=(!categorical()&&a.lockX)||categorical()&&a.lockCategory;if(fixed&&tool==='point'){let guide;try{guide=constrainAdd(pt);}catch{}if(guide){ctx.save();ctx.strokeStyle='#008b7e';ctx.lineWidth=1.5/zoom;ctx.setLineDash([3/zoom,3/zoom]);ctx.beginPath();if(horizontal()){ctx.moveTo(0,guide.y);ctx.lineTo(image.width,guide.y);}else{ctx.moveTo(guide.x,0);ctx.lineTo(guide.x,image.height);}ctx.stroke();ctx.restore();}}
  const lens=$('magnifier');lens.hidden=!a.magnify||!hover;if(!lens.hidden){const lc=$('lens').getContext('2d');lc.clearRect(0,0,140,140);lc.fillStyle='white';lc.fillRect(0,0,140,140);lc.imageSmoothingEnabled=false;lc.drawImage(image,pt.x-14,pt.y-14,28,28,0,0,140,140);lc.strokeStyle='#f05c35';lc.lineWidth=1;lc.beginPath();lc.moveTo(58,70);lc.lineTo(82,70);lc.moveTo(70,58);lc.lineTo(70,82);lc.stroke();}
}
$('errorOrder').onchange=()=>{assist().errorOrder=$('errorOrder').value;syncErrorTarget();refresh();};$('advancedFields').onchange=table;
$('sequence').onchange=()=>{assist().sequence=$('sequence').value;refresh();};
for(const id of ['projections','magnify','lockX','lockCategory'])$(id).onchange=()=>{assist()[id]=$(id).checked;refresh();};
$('fixedX').onchange=()=>{const a=assist();a.fixedXValue=$('fixedX').value===''?null:Number($('fixedX').value);a.fixedXPixel=null;a.lockX=true;refresh();};
$('dragAxis').onchange=()=>{assist().dragAxis=$('dragAxis').value;refresh();};
for(const id of ['activeSeries','activeCategory'])$(id).onchange=()=>{const a=assist();a[id==='activeSeries'?'series':'category']=$(id).value;pendingStart=null;refresh();};
$('nextTarget').onclick=()=>{if(!nextTarget())toast('所有类别和系列均已标注，可点击进度格复查');refresh();};
$('targetGrid').onclick=e=>{const button=e.target.closest('[data-target]');if(!button)return;const t=targetPairs()[+button.dataset.target],a=assist();a.series=t.series;a.category=t.category;pendingStart=null;const i=targetIndex(t);if(i>=0){selected=i;selectedHandle='pixel';hover=null;}$('hint').textContent=i>=0?'该目标已标注：拖动高亮标记或编辑表格修正。':'点击原图标注当前目标';refresh();};
$('pickX').onclick=()=>setTool('lock-x');$('pickCategory').onclick=()=>setTool('anchor');
$('unlockPoint').onclick=()=>{if(selected<0)return;change(()=>{delete p.evidence[selected].fixedX;});toast('选中点已解除 X 约束，可自由拖动');};
$('canvasWrap').addEventListener('scroll',()=>{if(hover)draw();});

function pointPixel(r,e){if(e?.pixel)return e.pixel;return null;}
function draw(){projectionInfo=null;if(!image){canvas.width=0;canvas.height=0;return;}const dpr=window.devicePixelRatio||1;canvas.width=Math.round(image.width*zoom*dpr);canvas.height=Math.round(image.height*zoom*dpr);canvas.style.width=image.width*zoom+'px';canvas.style.height=image.height*zoom+'px';ctx.setTransform(zoom*dpr,0,0,zoom*dpr,0,0);ctx.drawImage(image,0,0);$('zoomText').textContent=Math.round(zoom*100)+'%';if(!$('overlay').checked){drawGuides();return;}
const mark=(pt,color,text,ring=false)=>{if(!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y))return;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5/zoom;ctx.beginPath();ctx.arc(pt.x,pt.y,(ring?7:4)/zoom,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(pt.x-8/zoom,pt.y);ctx.lineTo(pt.x+8/zoom,pt.y);ctx.moveTo(pt.x,pt.y-8/zoom);ctx.lineTo(pt.x,pt.y+8/zoom);ctx.stroke();ctx.font=`${11/zoom}px monospace`;ctx.fillText(text,pt.x+9/zoom,pt.y-7/zoom);};
if($('connect').checked&&p.kind.startsWith('line'))for(const s of p.series){const pts=p.rows.map((r,i)=>({r,e:p.evidence?.[i]})).filter(v=>identity(v.r)===s.key&&v.e?.pixel).sort((a,b)=>(a.r.path_order??0)-(b.r.path_order??0));ctx.beginPath();pts.forEach((v,i)=>{const q=v.e.pixel;ctx[i?'lineTo':'moveTo'](q.x,q.y)});ctx.strokeStyle=s.color||'#06a77d';ctx.lineWidth=1.5/zoom;ctx.stroke();}
p.rows.forEach((r,i)=>{const e=p.evidence?.[i],color=p.series.find(s=>s.key===identity(r))?.color||'#e85b35';mark(pointPixel(r,e),color,String(i+1),i===selected);if(e?.startPixel){mark(e.startPixel,color,'s');ctx.beginPath();ctx.moveTo(e.startPixel.x,e.startPixel.y);ctx.lineTo(e.pixel.x,e.pixel.y);ctx.stroke();}for(const k of ['lower','upper'])if(e?.[k+'Pixel'])mark(e[k+'Pixel'],color,k==='lower'?'−':'+');});
drawGuides();if(pendingStart)mark(pendingStart,'#ffae00','起点');for(const a of ['x','y'])for(const n of [1,2]){const pt=p.axes[a]['point'+n];if(pt)mark(pt,'#007bea',a.toUpperCase()+n);} }
function setTool(t){tool=t;pendingStart=null;hover=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));$('calibrationPanel').open=t==='calibrate'||$('calibrationPanel').open;const hints={select:'拖动标记修正位置；方向键微调。Shift 拖动限制方向，投影线帮助核对 X / Y。',point:p.kind==='barv_stack'?'堆叠测量：先点击当前段起点，再点击段终点。类别和系列使用下方选择。':'点击原图取点，近已有标记可直接拖动；Alt 点击强制新增。类别和系列自动推进，进度格可随时跳转。',calibrate:'选择下方 X1 / X2 / Y1 / Y2，点击原图刻度，再填写真实数值。',lower:'先选中记录，然后点击误差区间下限。',upper:'先选中记录，然后点击误差区间上限。'};$('hint').textContent=hints[t]|| (t==='lock-x'?'先填写已知 X 数值，再点击原图对应 X 刻度；然后沿竖直线寻找 Y。':'点击当前类别在原图中的刻度或柱中心位置，之后只测数值。');axisForm();syncAssist();draw();}
function coords(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*image.width/rect.width,y:(event.clientY-rect.top)*image.height/rect.height};}
function calibrated(skipX=false){const axes=bar()?[horizontal()?'x':'y']:p.xType==='ordinal'?['y']:['x','y'];for(const a of axes){if(a==='x'&&skipX)continue;if(!p.axes[a].calibrated)throw Error('请先校准 '+a.toUpperCase()+' 轴的两个刻度');pixelToValue(p.axes[a].p1,p.axes[a]);}}
function measureAt(pt,i=null){const a=assist(),e=i===null?null:p.evidence?.[i],fixed=i===null?(!categorical()&&a.lockX?{value:a.fixedXValue}:null):e?.fixedX;calibrated(!!fixed&&Number.isFinite(fixed.value));if(bar())return{category:i===null?categoryName(p,a.category):p.rows[i].category,value:pixelToValue(horizontal()?pt.x:pt.y,p.axes[horizontal()?'x':'y'])};return{x:p.xType==='ordinal'?(i===null?categoryName(p,a.category):p.rows[i].x):fixed&&Number.isFinite(fixed.value)?fixed.value:pixelToValue(pt.x,p.axes.x),y:pixelToValue(pt.y,p.axes.y)};}
function applyPixel(i,pt){const r=p.rows[i],e=p.evidence[i],data=measureAt(pt,i);if(bar()){r.value=data.value;if(p.kind==='barv_stack'){r.end=data.value;r.value=r.end-r.start;}}else{if(p.xType!=='ordinal')r.x=data.x;r.y=data.y;}e.pixel=pt;if(bar())for(const key of ['lowerPixel','upperPixel'])if(e[key])e[key][horizontal()?'y':'x']=pt[horizontal()?'y':'x'];e.modifiedAt=new Date().toISOString();}
function recalculate(){for(let i=0;i<p.rows.length;i++){const e=p.evidence?.[i];if(!e?.pixel)continue;applyPixel(i,e.pixel);if(e.startPixel){p.rows[i].start=pixelToValue(e.startPixel.y,p.axes.y);p.rows[i].value=p.rows[i].end-p.rows[i].start;}for(const k of ['lower','upper'])if(e[k+'Pixel'])p.rows[i][k]=pixelToValue(horizontal()?e[k+'Pixel'].x:e[k+'Pixel'].y,p.axes[horizontal()?'x':'y']);}}
canvas.addEventListener('pointerdown',e=>{if(!image)return;canvas.focus({preventScroll:true});const raw=coords(e);try{
if(tool==='lock-x'){const a=assist();if(!Number.isFinite(a.fixedXValue)){if(!p.axes.x.calibrated)throw Error('请先在固定 X 输入框填写标签的真实数值');a.fixedXValue=pixelToValue(raw.x,p.axes.x);}a.fixedXPixel=raw.x;a.lockX=true;setTool('point');hover=raw;refresh();toast('X 已固定，沿竖直参考线寻找 Y');return;}
if(tool==='anchor'){const a=assist();a.categoryPixels[anchorKey()]=horizontal()?raw.y:raw.x;a.lockCategory=true;setTool('point');hover=raw;refresh();toast('当前位置已固定，可直接测数值');return;}
if(tool==='calibrate'){const a=calTarget[0],n=calTarget[1];change(()=>{p.axes[a]['p'+n]=a==='x'?raw.x:raw.y;p.axes[a]['point'+n]=raw;p.axes[a].calibrated=!!(p.axes[a].point1&&p.axes[a].point2);if(p.axes[a].calibrated)recalculate();},{form:true});toast(`已取 ${calTarget.toUpperCase()}，请填写真实刻度值`);return;}
if(tool==='point'&&hasErrors(p)&&p.kind!=='barv_stack'){measureError(raw);return;}
if((tool==='select'||tool==='point'&&!(p.kind==='barv_stack'&&targetIndex(assist())<0))&&!e.altKey){let best=null,d=10/zoom;p.evidence?.forEach((v,i)=>{for(const kind of ['pixel','startPixel','lowerPixel','upperPixel']){if(!v?.[kind])continue;const dist=Math.hypot(raw.x-v[kind].x,raw.y-v[kind].y);if(dist<d){best={i,kind};d=dist;}}});if(best){selected=best.i;selectedHandle=best.kind;drag={...best,checkpointed:false};dragOrigin={...p.evidence[selected][selectedHandle]};try{canvas.setPointerCapture(e.pointerId);}catch{}table();syncAssist();draw();return;}if(tool==='select'){selected=-1;selectedHandle='pixel';table();syncAssist();draw();return;}}
if(tool==='lower'||tool==='upper'){calibrated();if(selected<0)throw Error('请先选中一条数据记录');if(!bar())throw Error('当前规范只在柱图中导出误差区间');change(()=>{const axis=horizontal()?'x':'y';p.rows[selected][tool]=pixelToValue(raw[axis],p.axes[axis]);p.evidence[selected]??={role:'transcribed'};p.evidence[selected][tool+'Pixel']=raw;selectedHandle=tool+'Pixel';});return;}
if(tool==='point'){const a=assist();if(categorical()&&a.sequence!=='manual'&&targetIndex(a)>=0){selected=targetIndex(a);selectedHandle='pixel';hover=null;refresh();throw Error('当前目标已经标注；可拖动修改，或选择下一个待标目标');}const pt=constrainAdd(raw),data=measureAt(pt);if(categorical()&&!a.category)throw Error('请先填写类别并选择当前类别');if(p.kind==='barv_stack'&&!pendingStart){pendingStart=pt;draw();toast('段起点已取，请点击该段终点');return;}change(()=>{const row={...data,series:seriesName(p,a.series),_seriesKey:a.series,...(categorical()?{_categoryKey:a.category}:{})};if(p.kind.startsWith('line'))row.path_order=p.rows.filter(r=>identity(r)===identity(row)).length;const ev={pixel:pt,role:$('role').value,source:'pixel_measurement',createdAt:new Date().toISOString()};if(a.lockX&&!categorical())ev.fixedX={value:a.fixedXValue,pixel:pt.x};else if(a.lockCategory&&categorical()){if(horizontal())ev.fixedY={pixel:pt.y};else ev.fixedX={pixel:pt.x};}if(pendingStart){row.start=pixelToValue(pendingStart.y,p.axes.y);row.end=data.value;row.value=row.end-row.start;ev.startPixel=pendingStart;pendingStart=null;}p.rows.push(row);p.evidence??=[];p.evidence.push(ev);selected=p.rows.length-1;selectedHandle='pixel';if(categorical()&&a.sequence!=='manual')nextTarget();});}}
catch(err){toast(err.message);}});
canvas.addEventListener('pointermove',e=>{if(!image)return;const pt=coords(e);hover=pt;let val='';try{const v=measureAt(tool==='point'?constrainAdd(pt):pt);val=bar()?` · ${v.category}: ${v.value.toPrecision(6)}`:` · X ${typeof v.x==='number'?Number(v.x.toPrecision(6)):v.x} / Y ${Number(v.y.toPrecision(6))}`;}catch{}$('cursorInfo').textContent=`原图 px: ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}${val}`;if(drag!==null){try{const next=constrainDrag(pt,drag.i,drag.kind,e.shiftKey),old=p.evidence[drag.i][drag.kind];if(next.x!==old.x||next.y!==old.y){if(!drag.checkpointed){checkpoint();drag.checkpointed=true;}editHandle(drag.i,drag.kind,next);dirty();table();}}catch(err){toast(err.message);}}draw();});
function endDrag(){if(drag!==null){drag=null;dragOrigin=null;refresh();}}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
canvas.addEventListener('pointerleave',()=>{if(drag===null){hover=null;$('magnifier').hidden=true;draw();}});

$('tableBody').addEventListener('click',e=>{const row=e.target.closest('[data-row]');if(row){selected=+row.dataset.row;selectedHandle='pixel';syncAssist();document.querySelectorAll('#tableBody tr').forEach((r,i)=>r.classList.toggle('selected',i===selected));draw();}});
$('tableBody').addEventListener('change',e=>{const {i,key,object}=e.target.dataset;if(i===undefined)return;change(()=>{if(object){const ref=object==='series'?'_seriesKey':'_categoryKey',field=object==='series'?'series':bar()?'category':'x';p.rows[i][ref]=e.target.value;p.rows[i][field]=object==='series'?seriesName(p,e.target.value):categoryName(p,e.target.value);return;}const raw=e.target.value;const numeric=!(key==='category'||key==='series'||key==='x'&&categorical());if(raw===''&&['lower','upper','start','end','stack_order','path_order'].includes(key))delete p.rows[i][key];else p.rows[i][key]=numeric?(raw===''?null:Number(raw)):raw;if(p.kind==='barv_stack'){const r=p.rows[i];if(['start','end'].includes(key)&&Number.isFinite(r.start)&&Number.isFinite(r.end))r.value=r.end-r.start;else if(key==='value'&&Number.isFinite(r.start)&&Number.isFinite(r.value))r.end=r.start+r.value;}p.evidence??=[];p.evidence[i]??={};p.evidence[i].role='transcribed';p.evidence[i].source='manual_edit';delete p.evidence[i].pixel;delete p.evidence[i].startPixel;delete p.evidence[i].lowerPixel;delete p.evidence[i].upperPixel;});});
for(const key of ['title','xTitle','yTitle','notes','xType'])$(key).addEventListener('change',()=>change(()=>p[key]=$(key).value,{form:true}));
$('legend').onchange=()=>change(()=>p.legend=$('legend').checked,{form:true});$('reviewed').onchange=()=>{p.reviewed=$('reviewed').checked;p.reviewedAt=p.reviewed?new Date().toISOString():null;refresh();};
$('kind').onchange=()=>{const kind=$('kind').value;if(p.rows.length&&!confirm('切换类型会清空当前数据记录。建议先保存工程。继续？')){syncTypes();return;}change(()=>{const old=p;p=fresh(kind);for(const k of ['title','xTitle','yTitle','notes'])p[k]=old[k];selected=-1;},{form:true});setTool('select');};
$('family').onchange=()=>{const kind=Object.keys(labels).find(k=>familyOf(k)===$('family').value);options($('kind'),Object.entries(labels).filter(([k])=>familyOf(k)===familyOf(kind)),kind);$('kind').onchange();};
$('categories').onchange=()=>{}; // Legacy bulk textarea replaced by stable object-bound controls.
$('seriesList').onchange=e=>{const {series,prop}=e.target.dataset;if(series===undefined)return;change(()=>{const obj=p.series[series];if(prop==='name')renameObject(p,'series',obj.key,e.target.value);else obj[prop]=e.target.value;},{form:true});};
$('seriesList').onclick=e=>{const d=e.target.dataset;if(d.moveSeries!==undefined){change(()=>moveObject(p,'series',p.series[d.moveSeries].key,Number(d.delta)),{form:true});return;}if(d.removeSeries===undefined)return;const obj=p.series[d.removeSeries];if(p.rows.some(r=>identity(r)===obj.key)&&!confirm('删除该系列及其全部记录？'))return;change(()=>{removeObject(p,'series',obj.key);selected=-1;},{form:true});};
$('addSeries').onclick=()=>{if(p.kind.endsWith('_1')){toast('单系列类型只允许一个系列，请先选择多系列图表');return;}change(()=>addObject(p,'series','Series '+(p.series.length+1)),{form:true});};
$('axisFields').onclick=e=>{if(e.target.dataset.tick){calTarget=e.target.dataset.tick;setTool('calibrate');}};
$('axisFields').onchange=e=>{const {axis,field}=e.target.dataset;if(!axis)return;try{change(()=>{if(field!=='type'&&e.target.value==='')throw Error('刻度值不能为空');p.axes[axis][field]=field==='type'?e.target.value:Number(e.target.value);if(field==='p1'||field==='p2'){const n=field.slice(1);p.axes[axis]['point'+n]=axis==='x'?{x:p.axes[axis][field],y:p.axes.y.p1}:{x:p.axes.x.p1,y:p.axes[axis][field]};}p.axes[axis].calibrated=!!(p.axes[axis].point1&&p.axes[axis].point2)&&p.axes[axis].p1!==p.axes[axis].p2&&p.axes[axis].v1!==p.axes[axis].v2;recalculate();},{form:true});}catch(err){toast(err.message);syncForm();}};
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('addRow').onclick=()=>{if(categorical()&&assist().sequence!=='manual'&&targetIndex(assist())>=0){toast('当前目标已标注，请选择其他目标或切换手动模式');return;}change(()=>{const row=bar()?{category:categoryName(p,assist().category)||'A',value:0,series:seriesName(p,assist().series),_categoryKey:assist().category,_seriesKey:assist().series}:{x:p.xType==='ordinal'?categoryName(p,assist().category)||'A':0,y:0,series:seriesName(p,assist().series),_seriesKey:assist().series,...(categorical()?{_categoryKey:assist().category}:{})};if(p.kind==='barv_stack'){row.start=0;row.end=0;}if(p.kind.startsWith('line'))row.path_order=p.rows.length;p.rows.push(row);p.evidence??=[];p.evidence.push({role:$('role').value,source:'manual_entry'});selected=p.rows.length-1;selectedHandle='pixel';if(categorical()&&assist().sequence!=='manual')nextTarget();});const field=document.querySelector('[data-i="'+selected+'"][data-key="'+(bar()?'value':'y')+'"]');field?.focus();field?.select();};
$('deleteRow').onclick=()=>{if(selected<0)return;change(()=>{p.rows.splice(selected,1);p.evidence?.splice(selected,1);selected=-1;});};
$('undo').onclick=()=>{if(!history.length)return;future.push(clone(p));p=history.pop();selected=-1;refresh(true);};$('redo').onclick=()=>{if(!future.length)return;history.push(clone(p));p=future.pop();selected=-1;refresh(true);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focusMode){e.preventDefault();exitFocus();return;}if(e.target.matches?.('input,textarea,select,[contenteditable=true]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}if(e.key==='Escape'){if(focusMode){exitFocus();return;}pendingStart=null;setTool('select');}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selected>=0&&p.evidence?.[selected]?.pixel){e.preventDefault();const step=e.altKey?.1:e.shiftKey?10:1;const pt={...p.evidence[selected][selectedHandle]||p.evidence[selected].pixel};pt.x+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);pt.y+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);change(()=>editHandle(selected,selectedHandle,constrainDrag(pt,selected,selectedHandle)));}});
function setZoom(z){zoom=Math.max(.08,Math.min(8,z));draw();}function fit(){if(image)setZoom(Math.min(($('canvasWrap').clientWidth-20)/image.width,($('canvasWrap').clientHeight-20)/image.height,1));}
$('zoomIn').onclick=()=>setZoom(zoom*1.3);$('zoomOut').onclick=()=>setZoom(zoom/1.3);$('fit').onclick=fit;$('overlay').onchange=draw;$('connect').onchange=draw;
function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
async function loadImage(data){const version=++imageLoadVersion;return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{if(version!==imageLoadVersion){resolve();return;}image=img;imageData=data;$('empty').style.display='none';fit();resolve();};img.onerror=()=>reject(Error('无法读取图像'));img.src=data;});}
function visibleQueue(){return queue.filter(q=>(q.projectId??null)===currentProjectId);}
function projectName(){return projects.find(q=>q.id===currentProjectId)?.name||'无项目';}
function queueUI(){const items=visibleQueue().map(q=>q.id===activeId?{...q,project:p}:q);$('queue').innerHTML=items.map(q=>`<button class="${q.id===activeId?'active':''}" data-queue="${esc(q.id)}" title="${esc(q.name)}">${q.project.reviewed?'✓ ':q.project.rows.length?'◐ ':'○ '}${esc(q.name)}</button>`).join('');options($('projectSelect'),[["",'无项目'],...projects.map(q=>[q.id,q.name])],currentProjectId||'');options($('moveProject'),[["",'无项目'],...projects.map(q=>[q.id,q.name])],currentProjectId||'');$('moveProjectLabel').hidden=!activeId;$('queueSummary').textContent=projectName()+' · '+items.length+' 张图 / '+items.filter(q=>q.project.reviewed).length+' 张已核对';$('renameProject').disabled=!currentProjectId;$('deleteProject').disabled=!currentProjectId;$('removeImage').disabled=!activeId;}
function stash(){let q=queue.find(q=>q.id===activeId);if(!q&&(imageData||p.rows.length)){activeId=crypto.randomUUID();q={id:activeId,projectId:currentProjectId,name:fileName||'未命名图表',image:imageData,project:clone(p)};queue.push(q);}if(q){q.project=clone(p);q.image=imageData;}}
function resetCurrent(){imageLoadVersion++;activationVersion++;p=fresh(p.kind+(hasErrors(p)&&p.kind!=='barv_stack'?'_error':''));image=null;imageData=null;fileName='';activeId=null;selected=-1;hover=null;pendingStart=null;drag=null;history=[];future=[];$('empty').style.display='flex';$('fileName').textContent='从一张图开始';$('magnifier').hidden=true;$('cursorInfo').textContent='原始像素坐标';setTool('select');refresh(true);queueUI();}
function decodeImage(data){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('无法读取图像'));img.src=data;});}
// Decode before replacing live state; failed or superseded selections must not damage annotations.
async function activate(id){const version=++activationVersion;stash();const q=queue.find(q=>q.id===id);if(!q)throw Error('图像不存在');const nextImage=q.image?await decodeImage(q.image):null;if(version!==activationVersion||!queue.includes(q))return;stash();imageLoadVersion++;activeId=id;currentProjectId=q.projectId??null;p=ensureIdentities(clone(q.project));fileName=q.name;image=nextImage;imageData=q.image||null;hover=null;pendingStart=null;drag=null;$('fileName').textContent=fileName;history=[];future=[];selected=-1;$('empty').style.display=image?'none':'flex';if(image)fit();refresh(true);queueUI();setTool('select');}
async function selectProject(id){stash();const destination=id||null,first=queue.find(q=>(q.projectId??null)===destination);if(first)await activate(first.id);else{currentProjectId=destination;resetCurrent();}}
async function importImages(files){stash();const supported=[...files].filter(f=>/^image\/(png|jpeg|webp)$/.test(f.type)||/\.(png|jpe?g|webp)$/i.test(f.name)),ordered=supported.sort((a,b)=>(a.webkitRelativePath||a.relativePath||a.name).localeCompare(b.webkitRelativePath||b.relativePath||b.name,'zh-CN',{numeric:true}));let first=null,failed=0;const destination=currentProjectId,kind=p.kind+(hasErrors(p)&&p.kind!=='barv_stack'?'_error':'');for(const f of ordered){try{const data=await readFile(f);await new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=reject;im.src=data;});const id=crypto.randomUUID();queue.push({id,projectId:destination,name:f.webkitRelativePath||f.relativePath||f.name,image:data,project:fresh(kind)});first??=id;}catch{failed++;}}if(first&&destination===currentProjectId)await activate(first);queueUI();toast('已导入 '+(ordered.length-failed)+' 张图'+(failed?'；'+failed+' 张无法读取':'')+'；跳过 '+(files.length-supported.length)+' 个非支持文件');}
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
async function restore(data){if(data.format!=='chart-studio-project'||![1,2].includes(data.version)||!data.current?.project||!Array.isArray(data.queue))throw Error('不是受支持的 Chart Studio 工程');const all=[data.current.project,...data.queue.map(q=>q.project)];for(const item of all){if(!labels[item.kind]||!Array.isArray(item.rows)||!item.axes?.x||!item.axes?.y||!Array.isArray(item.series))throw Error('工程结构不完整');}const nextProjects=data.version===2?data.projects||[]:[];if(!Array.isArray(nextProjects)||nextProjects.some(q=>!q.id||typeof q.name!=='string')||new Set(nextProjects.map(q=>q.id)).size!==nextProjects.length)throw Error('项目列表无效');if(new Set(data.queue.map(q=>q.id)).size!==data.queue.length||data.queue.some(q=>typeof q.id!=='string'))throw Error('图像列表 ID 无效');const projectIds=new Set(nextProjects.map(q=>q.id));const active=data.queue.find(q=>q.id===data.activeId);if(data.activeId&&!active)throw Error('当前图像 ID 不存在');if(data.version===2&&active&&(active.projectId??null)!==(data.currentProjectId||null))throw Error('当前图像与所选项目不一致');if(data.version===2&&(data.currentProjectId&&!projectIds.has(data.currentProjectId)||data.queue.some(q=>q.projectId&&!projectIds.has(q.projectId))))throw Error('图像所属项目不存在');if(data.current.image)await new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=()=>reject(Error('工程原图无法读取'));im.src=data.current.image;});activationVersion++;queue=clone(data.queue);for(const q of queue)ensureIdentities(q.project);projects=clone(nextProjects);currentProjectId=data.version===2?data.currentProjectId||null:null;activeId=data.activeId;p=ensureIdentities(clone(data.current.project));p.errorBars=hasErrors(p);imageData=data.current.image;fileName=data.current.name||'';image=null;hover=null;pendingStart=null;drag=null;history=[];future=[];selected=-1;if(imageData)await loadImage(imageData);else{$('empty').style.display='flex';$('magnifier').hidden=true;draw();}$('fileName').textContent=fileName||'未命名工程';queueUI();refresh(true);setTool('select');}
$('projectInput').onchange=async e=>{try{await restore(JSON.parse(await e.target.files[0].text()));toast('工程已恢复');}catch(err){toast('打开失败：'+err.message);}e.target.value='';};
$('specInput').onchange=async e=>{try{const next=importSpec(JSON.parse(await e.target.files[0].text()));next.errorBars=hasErrors(next);change(()=>{p={...next,evidence:next.rows.map(()=>({role:'transcribed',source:'imported_gt'})),reviewed:false};for(const a of Object.values(p.axes))a.calibrated=false;selected=-1;},{form:true});toast('GT 已导入；像素证据需重新标注');}catch(err){toast('导入失败：'+err.message);}e.target.value='';};
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
