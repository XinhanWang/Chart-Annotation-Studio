/** Compact-v4 semantic GT. Image geometry and review evidence stay in project files. */
const HISTOGRAM_KINDS = ['histogram_v_1','histogram_h_1','histogram_v_n','histogram_h_n','histogram_v_stack','histogram_h_stack'];
const HEATMAP_KINDS = ['heatmap_dd','heatmap_cc','heatmap_dc','heatmap_cd'];
const PERCENT_STACK_KINDS = ['barv_stack_percent','barh_stack_percent'];
const KINDS = ['barh_1','barh_n','barv_1','barv_n','barv_stack','barh_stack',...PERCENT_STACK_KINDS,'line_1','line_n','scatter_1','scatter_n','pie','boxplot_v','boxplot_h','area_1','area_n','area_stack','barline_n',...HISTOGRAM_KINDS,...HEATMAP_KINDS];
const copy = value => JSON.parse(JSON.stringify(value));
const finite = n => typeof n === 'number' && Number.isFinite(n);
const present = n => n !== undefined && n !== null && n !== '';
const unique = values => [...new Set(values)];
const isComposite = p => p.kind==='barline_n';
const compositeRole = (p,key) => p.series.find(s=>s.key===key)?.role;
const measurementAxis = (p,key) => isComposite(p)&&p.dualYAxis&&compositeRole(p,key)==='line'?'r':valueAxis(p);
const isBar = p => p.kind.startsWith('bar');
const isPercentStack = p => PERCENT_STACK_KINDS.includes(p.kind);
const usesPercentBarLength = (p,category) => p.percentStackBarCategories?.[category]===true;
const usesPercentStackRatio = (p,category) => p.percentStackRatioCategories?.[category]===true;
const isStack = p => ['barv_stack','barh_stack'].includes(p.kind)||isPercentStack(p);
const isHorizontal = p => p.kind.startsWith('barh')||p.kind==='boxplot_h'||p.kind.startsWith('histogram_h_');
const isPie = p => p.kind==='pie';
const isBox = p => p.kind.startsWith('boxplot_');
const isStat = p => isPie(p)||isBox(p);
const isArea = p => p.kind.startsWith('area_');
const isLine = p => p.kind.startsWith('line_');
const nominalType = type => type==='nominal'||type==='ordinal';
const lineCategoryAxis = p => isLine(p)?(nominalType(p.yType)?'y':nominalType(p.xType)?'x':null):null;
const isHeatmap = p => HEATMAP_KINDS.includes(p?.kind);
const isHistogram = p => p.kind.startsWith('histogram_');
const isHistogramStack = p => isHistogram(p)&&p.kind.endsWith('_stack');
const hasLayerOrder = p => p.kind==='area_stack'||isHistogramStack(p)||isPercentStack(p);
const isNominalArea = p => isArea(p)&&p.xType==='nominal';
const categoryField = p => isBar(p)||isStat(p)||isNominalArea(p)?'category':lineCategoryAxis(p)??'x';
const stackRank = (series,index) => series?.stackOrder??index;
const BOX_FIELDS = ['lower','q1','median','q3','upper'];
const valueAxis = p => isHorizontal(p)?'x':'y';
const validPercent = value => finite(value)&&value>=0;

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
const categoryIdentity=r=>r._categoryKey??r.category_id??r.x_id??r.y_id??r.category_instance??r.x_instance??r.y_instance??r.category??r.x;
const ROW_FIELDS=['category','category_id','value','x','x_id','y','y_id','lower','upper','path_order','stack_order','start','end','series','series_id'];
const orderRow=r=>Object.fromEntries(ROW_FIELDS.filter(k=>k in r).map(k=>[k,r[k]]));
const categoryName=(p,key)=>p.categoryObjects?.find(c=>c.key===key)?.name??key;
const seriesName=(p,key)=>p.series?.find(c=>c.key===key)?.name??key;
function ensureIdentities(p){
  if(isHeatmap(p))return p;
  const field=categoryField(p),categorical=field==='category'||lineCategoryAxis(p)||p.xType==='ordinal';
  p.series??=[];
  for(const s of p.series){s.key??=newKey('series');if(isComposite(p))s.role??='bar';}
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
    for(const k of ['category_id','x_id','y_id','series_id','category_instance','x_instance','y_instance','series_instance'])delete r[k];
  }
  p.categories=p.categoryObjects.map(c=>c.name);
  if(isPercentStack(p))migratePercentStackSettings(p);
  return p;
}
function migratePercentStackSettings(p){
  if(p.percentStackRatio===true){
    const categories=p.percentStackRatioCategories??={};
    for(const category of p.categoryObjects)categories[category.key]??=true;
  }
  if(p.percentStackMode==='bar'){
    const categories=p.percentStackBarCategories??={};
    for(const category of p.categoryObjects)categories[category.key]??=true;
  }
  delete p.percentStackRatio;
  delete p.percentStackMode;
}
function renameObject(p,kind,key,name){ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects,obj=list.find(o=>o.key===key);if(!obj)throw Error('对象不存在');obj.name=name;const field=kind==='series'?'series':categoryField(p),ref=kind==='series'?'_seriesKey':'_categoryKey';for(const r of p.rows)if(r[ref]===key)r[field]=name;p.categories=p.categoryObjects.map(c=>c.name);}
function moveObject(p,kind,key,delta){ensureIdentities(p);const list=kind==='series'?p.series:p.categoryObjects,i=list.findIndex(o=>o.key===key),j=i+delta;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];p.categories=p.categoryObjects.map(c=>c.name);}
function moveSeries(p,index,delta){
  const series=p.series[index],other=p.series[index+delta];
  if(!other)return;
  if(hasLayerOrder(p)){
    [series.stackOrder,other.stackOrder]=[stackRank(other,index+delta),stackRank(series,index)];
  }
  moveObject(p,'series',series.key,delta);
}
function newObject(p,kind,name){
  const obj={key:newKey(kind),name};
  if(kind==='series'){
    obj.color=nextSeriesColor(p.series);
    if(hasLayerOrder(p))obj.stackOrder=stackRank(p.series.at(-1),p.series.length-1)+1;
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
function applyPieCategoryNames(p,text){
  const objects=new Map(p.categoryObjects.map(category=>[category.key,category]));
  p.categoryObjects=p.rows.map(row=>objects.get(row._categoryKey));
  applyObjectNames(p,'category',text);
  p.evidence??=[];
  for(const category of p.categoryObjects.slice(p.rows.length)){
    p.evidence[p.rows.length]={role:'transcribed',source:'manual_entry'};
    p.rows.push({category:category.name,_categoryKey:category.key,value:null});
  }
  if(p.pieMeasurement?.targets){
    const validKeys=new Set(p.categoryObjects.map(category=>category.key));
    p.pieMeasurement.targets=p.pieMeasurement.targets.map(key=>key&&!validKeys.has(key)?'':key);
  }
}
function renderSpec(gt,p){
  if(markType(gt.mark)==='rect')return renderHeatmapSpec(gt,p);
  const out=copy(gt),rows=allTableRows(out);
  if(markType(out.mark)==='arc'&&out.encoding.theta.format!==undefined){
    const {format,...theta}=out.encoding.theta;
    out.encoding.theta=theta;
    out.encoding.tooltip={...theta,format};
  }
  if(p&&isBox(p)){
    const whisker=out.layer[0].encoding[valueAxis(p)];
    whisker.title??=null;
    if(isPercentFormat(whisker.axis)&&whisker.scale?.type!=='log'){
      whisker.scale={zero:false,...whisker.scale};
    }
  }
  function view(node){for(const [channel,d] of Object.entries(node.encoding||{})){
    const field=d.field,label={category_id:'category',x_id:'x',y_id:'y',series_id:'series'}[field];
    if(label&&['x','y','color'].includes(channel)){
      const mapping=Object.fromEntries(rows.map(r=>[r[field],r[label]]));
      const property=channel==='color'?'legend':'axis';
      if(d[property]!==null)d[property]={...(d[property]||{}),labelExpr:JSON.stringify(mapping)+'[datum.value]'};
    }
  }for(const child of node.layer||[])view(child);}
  view(out);return out;
}

// p.categories is an explicit screen order: left-to-right, or top-to-bottom for horizontal bars.
function orderedRows(p,compositeLine=false) {
  if(isStat(p))return copy(p.rows);
  ensureIdentities(p);
  const source=p.rows.map((r,i)=>({...r,__input:i}));
  const lineCategory=lineCategoryAxis(p),categorical=isBar(p)||lineCategory||p.xType==='ordinal';
  const categories=p.categoryObjects.map(c=>c.key);
  const series=p.series.map(s=>s.key);
  if(isPercentStack(p)){
    const rank=new Map(p.series.map((s,i)=>[s.key,stackRank(s,i)]));
    return source.sort((a,b)=>categories.indexOf(categoryIdentity(a))-categories.indexOf(categoryIdentity(b))||
      rank.get(identity(a))-rank.get(identity(b))).map(({__input,...row})=>row);
  }
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
    const last=new Map();let special=false;
    for(const r of source){
      const id=identity(r),position=lineCategory?categories.indexOf(categoryIdentity(r)):sx*r.x;
      if(last.has(id)&&(position<last.get(id)||lineCategory&&!compositeLine&&position===last.get(id)))special=true;
      last.set(id,position);
    }
    const keepRanks=lineCategory&&!compositeLine&&explicit&&[...paths.values()].every(rows=>rows.every((r,i)=>!i||rows[i-1].path_order<r.path_order));
    const counts=new Map();for(const r of source){if(special&&keepRanks)continue;delete r.path_order;if(special){const id=identity(r),i=counts.get(id)||0;r.path_order=i;counts.set(id,i+1);}}
  } else source.sort(compare);
  for(const r of source){delete r.__input;delete r.__mid;}
  return source;
}

function defaultProject(kind='scatter_1') {
  if (!KINDS.includes(kind.replace(/_error$/,'')) || kind.endsWith('_error')&&!['barh_1','barh_n','barv_1','barv_n'].includes(kind.slice(0,-6))) throw Error('未知图表类型');
  const errorBars=kind.endsWith('_error');if(errorBars)kind=kind.slice(0,-6);
  const multi=kind.endsWith('_n')||isStack({kind})||hasLayerOrder({kind});
  const series=[{name:'Series 1',color:'#4263eb'},...(multi?[{name:'Series 2',color:'#e8590c'}]:[])];
  if(kind==='barline_n')series.forEach((s,i)=>s.role=i?'line':'bar');
  if(hasLayerOrder({kind}))series.forEach((s,i)=>s.stackOrder=i);
  const histogram=isHistogram({kind}),categories=isPie({kind})||isArea({kind})||histogram?[]:['A','B','C'];
  const axes={x:{p1:80,p2:560,v1:0,v2:10,type:'linear',reverse:false,calibrated:false},y:{p1:400,p2:50,v1:0,v2:100,type:'linear',reverse:false,calibrated:false}};
  if(isHeatmap({kind})){
    for(const axis of Object.values(axes))axis.p1=axis.p2=axis.v1=axis.v2=null;
    return {kind,precisionVersion:1,title:'',xTitle:'',yTitle:'',heatmapTitle:'',axes,rows:[],series:[],legend:false,errorBars:false,
      categories:[],categoryObjects:[],heatmap:{x:[],y:[],pixels:{x:[null],y:[null]},colorPoints:[]}};
  }
  if(histogram)for(const axis of Object.values(axes))axis.p1=axis.p2=axis.v1=axis.v2=null;
  if(kind==='barline_n')axes.r={...axes.y};
  const percent=isPercentStack({kind}),axis=valueAxis({kind});
  if(percent)Object.assign(axes[axis],{p1:null,p2:null,v1:null,v2:null});
  return ensureIdentities({kind,precisionVersion:1,title:'',xTitle:'',yTitle:'',xType:kind==='barline_n'?'ordinal':'quantitative',...(isLine({kind})?{yType:'quantitative'}:{}),legend:multi,errorBars,...(kind==='barline_n'?{dualYAxis:false,rightYTitle:''}:{}),...(isPie({kind})?{valueMode:'percent',valueTitle:'',donut:false}:{}),
    rows:isStat({kind})?[]:series.flatMap((s,j)=>categories.map((category,i)=>isBar({kind})?
      {category,value:20+i*15+j*10,series:s.name,...(isStack({kind})?{stack_order:j}:{})}:
      {x:i*4+1,y:20+i*15+j*10,series:s.name})),
    axes,categories,series});
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
function decimalParts(value){
  const [mantissa,exponent='0']=String(Math.abs(value)).split('e');
  const [integer,fraction='']=mantissa.split('.');
  return {digits:(integer+fraction).replace(/^0+(?=\d)/,''),exponent:Number(exponent)-fraction.length};
}
function roundDecimal(value,exponent){
  if(!finite(value)||value===0)return value;
  const parts=decimalParts(value),drop=exponent-parts.exponent;
  if(drop<=0)return value;
  const cut=parts.digits.length-drop;
  if(cut<0)return 0;
  let units=BigInt(parts.digits.slice(0,cut)||'0');
  if(parts.digits[cut]>='5')units++;
  const result=Number((value<0?'-':'')+units+'e'+exponent);
  return finite(result)?result:value;
}
function measuredNumber(value,uncertainty=0,digits=4,allowZero=false){
  if(!finite(value)||!value)return value===0?0:value;
  const parts=decimalParts(value);
  const significant=parts.exponent+parts.digits.length-digits;
  const resolution=uncertainty>0&&finite(uncertainty)?Math.floor(Math.log10(uncertainty)):-Infinity;
  const rounded=roundDecimal(value,Math.max(significant,resolution));
  return (rounded||allowZero)?rounded:roundDecimal(value,significant)||value;
}
function axisUncertainty(value,axis){
  const span=Math.abs(axis.p2-axis.p1);
  if(axis.type==='log')return Math.abs(value)*Math.expm1(Math.abs(Math.log(axis.v2)-Math.log(axis.v1))/span);
  return Math.abs(axis.v2-axis.v1)/span;
}
function measuredAxisValue(pixel,axis){
  const value=pixelToValue(pixel,axis);
  if(pixel===axis.p1)return axis.v1;
  if(pixel===axis.p2)return axis.v2;
  return measuredNumber(value,axisUncertainty(value,axis),4,axis.type!=='log');
}
function decimalDifference(end,start){
  if(!finite(end)||!finite(start))return end-start;
  const a=decimalParts(end),b=decimalParts(start),exponent=Math.min(a.exponent,b.exponent);
  const integer=(part,value)=>(value<0?-1n:1n)*BigInt(part.digits)*10n**BigInt(part.exponent-exponent);
  return Number((integer(a,end)-integer(b,start))+'e'+exponent);
}
function boxValueAt(pt,p) {
  const axis=valueAxis(p);
  return measuredAxisValue(pt[axis],p.axes[axis]);
}
const areaValueAt=measuredAxisValue;
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
  const issues=percentLabelIssues(p);
  return [...validateModel(issues.length?p:projectWithFractionLabels(p)),...issues];
}
function validateModel(p) {
  if(isHeatmap(p))return validateHeatmap(p);
  try{p=ensureIdentities(copy(p));}catch(e){return [{severity:'error',message:e.message}];}
  const out=[];
  const issue=(severity,message)=>out.push({severity,message});
  if(!p || !KINDS.includes(p.kind)) return [{severity:'error',message:'未知图表类型'}];
  if(!Array.isArray(p.rows)||!p.rows.length) return [{severity:'error',message:'至少需要一行观测数据'}];
  if(p.rows.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return [{severity:'error',message:'每一行必须为观测对象'}];
  if(isComposite(p))return validateComposite(p);
  if(isStat(p))return validateStat(p);
  const bar=isBar(p), stack=isStack(p), percent=isPercentStack(p), line=isLine(p), lineCategory=lineCategoryAxis(p);
  if(line&&nominalType(p.xType)&&nominalType(p.yType))issue('error','折线图至少需要一个连续数值轴');
  for(const key of ['title','xTitle','yTitle'])if(present(p[key])&&!(typeof p[key]==='string'||Array.isArray(p[key])&&p[key].length&&p[key].every(v=>typeof v==='string')))issue('error',`${key} 需要文字或非空文字数组`);
  if(isArea(p)){validateArea(p,issue);validateAxes(p,issue);return out;}
  if(isHistogram(p)){validateHistogram(p,issue);return out;}
  const fields=unique(p.rows.flatMap(r=>Object.keys(r).filter(k=>present(r[k]))));
  for(const name of ['lower','upper','start','end','path_order','stack_order']) {
    if(percent&&['start','end','stack_order'].includes(name))continue;
    if(p.rows.some(r=>present(r[name])) && !p.rows.every(r=>present(r[name]))) issue('error',`${name} 需要覆盖每一行，不能部分缺失`);
  }
  if(p.rows.some(r=>present(r.lower)!==present(r.upper))) issue('error','误差区间需要同时填写 lower 和 upper');
  if(!percent&&p.rows.some(r=>present(r.start)!==present(r.end))) issue('error','堆叠端点需要同时填写 start 和 end');
  if(percent)validatePercentStack(p,issue);
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
    const discrete=lineCategory??(p.xType==='ordinal'?'x':null);
    for(const f of bar?['value']:['x','y'].filter(axis=>axis!==discrete)) if(!finite(r[f])) issue('error',prefix+f+' 必须是有限数字');
    for(const f of ['lower','upper','start','end','path_order','stack_order']) if(present(r[f])&&!finite(r[f])) issue('error',prefix+f+' 必须是有限数字');
    if(bar&&!present(r.category)) issue('error',prefix+'缺少类别');
    if(!bar&&discrete&&!present(r[discrete])) issue('error',prefix+'缺少 '+discrete+' 类别');
    if(lineCategory&&typeof r[lineCategory]!=='string'&&!(p.xType==='ordinal'&&finite(r[lineCategory])))issue('error',prefix+lineCategory+' 类别必须为文本');
    if(present(r.lower)&&finite(r.lower)&&finite(r.upper)&&r.lower>r.upper) issue('error',prefix+'lower 不能大于 upper');
    if(!percent&&finite(r.start)&&finite(r.end)&&finite(r.value)&&Math.abs((r.end-r.start)-r.value)>1e-8*Math.max(1,Math.abs(r.value))) issue('error',prefix+'堆叠段 value 必须等于 end − start');
    for(const channel of ['x','y']) {
      const quantitative=bar?(isHorizontal(p)?channel==='x':channel==='y'):channel!==discrete;
      const field=bar?'value':channel;
      if(!percent&&quantitative&&p.axes?.[channel]?.type==='log'&&(!(r[field]>0)||['lower','upper','start','end'].some(k=>present(r[k])&&r[k]<=0))) issue('error',prefix+'对数轴数值及区间必须大于零');
    }
    for(const [key,value] of Object.entries(r)) if(typeof value==='number'&&!Number.isFinite(value)) issue('error',prefix+key+' 不能为 NaN 或 Infinity');
  });
  if(p.errorBars&&(!bar||p.rows.some(r=>!finite(r.lower)||!finite(r.upper))))issue('error','误差棒柱图需为每条记录填写数值下界和上界');
  validateAxes(p,issue);
  if(bar&&fields.includes('lower')&&p.rows.some(r=>finite(r.lower)&&finite(r.upper)&&(r.value<r.lower||r.value>r.upper))) issue('warning','部分数值位于误差区间外，请核对区间是否为绝对上下界');
  if(line&&!fields.includes('path_order')) {
    const last=new Map();let nonmonotonic=false;
    for(const r of p.rows){const position=lineCategory?p.categoryObjects.findIndex(c=>c.key===categoryIdentity(r)):r.x;const s=identity(r);if(last.has(s)&&position<last.get(s))nonmonotonic=true;last.set(s,position);}
    if(nonmonotonic) issue('warning',`折线路径包含 ${(lineCategory??'x').toUpperCase()} 回退，导出时自动生成 path_order`);
  }
  return out;
}

function validatePercentStack(p,issue){
  if(p.errorBars||p.rows.some(r=>present(r.lower)||present(r.upper)))issue('error','百分比堆叠 GT 仅支持柱段');
  const ranks=p.series.map((s,i)=>stackRank(s,i));
  if(ranks.some(rank=>!Number.isSafeInteger(rank)||rank<0)||new Set(ranks).size!==ranks.length)
    issue('error','各系列必须使用不同的非负整数堆叠顺序');
  const segments=new Set(),totals=new Map();
  p.rows.forEach((r,i)=>{
    const category=categoryIdentity(r),segment=JSON.stringify([category,identity(r)]);
    if(segments.has(segment))issue('error',`第 ${i+1} 行：同一类别和系列已有柱段记录`);
    segments.add(segment);
    if(finite(r.value)&&r.value<0)issue('error',`第 ${i+1} 行：段占比不能为负数`);
    if(r.value>100)issue('warning',`第 ${i+1} 行：段占比大于 100，请核对原图或校准刻度`);
    if(present(r.height)&&!validPercent(r.height))issue('error',`第 ${i+1} 行：系列高度必须为有限的非负数`);
    const total=totals.get(category)??0;
    totals.set(category,finite(r.value)?total+r.value:NaN);
  });
  const offTotal=[...totals.values()].filter(total=>finite(total)&&Math.abs(total-100)>1e-8).length;
  if(offTotal)issue('warning',`有 ${offTotal} 个类别的占比合计偏离 100%，请核对原图和标注范围`);
  if(Object.keys(p.percentStackRatioCategories??{}).length){
    const {groups}=percentStackRatioData(p);
    for(const [category,group] of groups){
      if(!usesPercentStackRatio(p,category)||!group.automatic)continue;
      if(!group.complete){
        const action=group.height===null?'暂无法自动计算该类别的比值':'暂无法计算这些柱段的比值';
        issue('warning',`类别「${categoryName(p,category)}」有柱段缺少有效端点，${action}`);
      }else if(!validPercentStackRatioTotal(group)){
        issue('warning',`类别「${categoryName(p,category)}」端点差值合计无效或为 0，暂无法自动计算比值`);
      }
    }
  }
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
  if(isComposite(p))return {series:'每个系列选择柱或线。柱按组内从左到右；折线按首次可见顺序。',category:'共享类别轴从左到右填写；同名位置保持独立。',records:'先标柱、再沿折线路径标点。双 Y 轴时柱用左轴，线用右轴，分别校准。'};
  const stack=isStack(p),horizontal=isHorizontal(p),bar=isBar(p),line=p.kind.startsWith('line');
  let series,category,records;
  if(isArea(p))return {
    series:p.kind==='area_stack'?'系列按底层到顶层填写，用 ↑ / ↓ 调整堆叠顺序。':'填写原图的系列名称。',
    category:'类别按原图从左到右填写，一行一个类别。',
    records:isNominalArea(p)?'选择类别和系列，在同一类别位置依次取上界和下界。GT 按类别位置从左到右排列。':'在同一 X 依次取上界和下界。'
  };
  if(isPie(p))return {series:'',category:'按原图扇区顺序填写，每行一个类别。',records:'按原图扇区顺序录入类别与数值，可用表格行首箭头调整。'};
  if(isBox(p))return {series:'',category:horizontal?'类别按原图从上到下填写，一行一个类别。':'类别按原图从左到右填写，一行一个类别。',records:'校准数值轴后，依次测量下须、Q1、中位数、Q3、上须；异常值可连续取点。'};
  if(stack){series=horizontal?'图例 / 系列按柱段从左到右填写，一行一个系列；不要照图例框的排版顺序。':'图例 / 系列按柱段从下到上填写，一行一个系列；不要照图例框的排版顺序。';category=horizontal?'类别按原图从上到下填写，一行一个类别。':'类别按原图从左到右填写，一行一个类别。';records=horizontal?'每组从左到右：起点 → 各段交界点 → 终点。':'每组从下到上：起点 → 各段交界点 → 终点。';records+='N 段点 N+1 次，每个新类别重新点起点。';}
  else if(bar){series=p.kind.endsWith('_n')?(horizontal?'系列按每组柱子从上到下填写。':'系列按每组柱子从左到右填写。'):'单系列仅填写原图中可读的图例名称；无图例时不填系列名。';category=horizontal?'类别按原图从上到下填写，一行一个类别。':'类别按原图从左到右填写，一行一个类别。';records='GT 先按类别，再按组内柱子的可见顺序记录；误差上下界随对应柱子保存。';}
  else {
    const axis=lineCategoryAxis(p);
    series='系列按从左到右扫描原图时首次出现的顺序填写；同一位置按从上到下区分。';
    category=axis?`离散 ${axis.toUpperCase()} 类别按原图${axis==='y'?'从上到下':'从左到右'}填写，一行一个位置。`:'连续数值轴无需填写类别列表。';
    records=axis?'选择类别后只测连续轴。沿各系列的真实路径取点；跳过没有观测的类别。回退或重复位置使用 path_order。':line?
      '每条线沿真实路径取点；GT 保留路径顺序，仅同一条线发生画面 X 回退时自动输出 path_order。重复 X 不算回退。':
      '点击和表格录入顺序不限；训练 GT 自动按画面从左到右、同一 X 从上到下排序。';
  }
  if(isPercentStack(p))records+=' 原图有标注时直接录入百分数。可为对应类别开启比值计算，并记录整柱高度。';
  if(p.legend===false&&!p.kind.endsWith('_1'))series+=' 原图无可读图例时，按上述顺序使用 Series 1、Series 2 等，不推测名称。';
  return {series,category,records};
}

// Canonical output order is shared by preview, JSON and ZIP exports.
function orderEncoding(enc) {
  const priority=['x','y','xOffset','yOffset','x2','y2','theta','theta2','radius','radius2','longitude','longitude2','latitude','latitude2','color'];
  const keys=priority.filter(k=>Object.hasOwn(enc,k));
  return Object.fromEntries([...keys,...Object.keys(enc).filter(k=>!keys.includes(k))].map(k=>[k,enc[k]]));
}

function allTableRows(spec){
  return spec.usermeta?.table_export?.tables?.flatMap(({path})=>path.slice(1).split('/').reduce((v,k)=>v[k],spec))??spec.data.values;
}
function tableMetadata(p,s){
  if(isBox(p))return [{id:'box_plot_summaries',path:'/data/values'},{id:'outliers',path:'/layer/3/data/values'}];
  if(isComposite(p))return [{id:'bars',path:'/data/values'},{id:'lines',path:'/layer/'+(s.layer.length-1)+'/data/values'}];
  return [{id:'data',path:'/data/values'}];
}
function percentLabels(p,key){
  if(key==='theta')return p.valueMode==='percent';
  return p.percentLabels?.[key]===true;
}
const DEFAULT_PERCENT_FORMAT='.4~p';
const LEGACY_PIE_SHARE_TITLE='Share (%)';
function pieMetricTitle(title){
  if(typeof title==='string'&&['',LEGACY_PIE_SHARE_TITLE,'Value'].includes(title.trim()))return '';
  return title??'';
}
const isPercentFormat=def=>(def?.formatType??'number')==='number'&&typeof def?.format==='string'&&
  /^(?:(?:.)?[<>=^])?[+\-( ]?[$#]?0?\d*,?(?:\.\d+)?~?[%p]$/.test(def.format);
const isCurrencyFormat=axis=>(axis?.formatType??'number')==='number'&&
  typeof axis?.format==='string'&&axis.format.includes('$');
const boxAxisFormat=axis=>isPercentFormat(axis)||isCurrencyFormat(axis)?axis.format:undefined;
const boxValueChannel=encoding=>['nominal','ordinal'].includes(encoding?.y?.type)?'x':'y';
function sharedAxisGuide(spec,channel,chart){
  const axes=[spec,...spec.layer].map(layer=>layer?.encoding?.[channel]?.axis).filter(axis=>present(axis?.format));
  if(!axes.length)return;
  const {format}=axes[0],formatType=axes[0].formatType??'number';
  const conflict=axes.find(axis=>axis.format!==format||(axis.formatType??'number')!==formatType);
  if(conflict)throw Error(`${chart}数值轴格式冲突：${format} (${formatType}) 与 ${conflict.format} (${conflict.formatType??'number'})。请核对原图后统一各层的格式。`);
  return axes[0];
}
function checkBoxAxisFormats(spec){
  const layers=spec?.layer;
  if(!Array.isArray(layers))return;
  const marks=layers.map(layer=>markType(layer?.mark));
  if(!['rule','bar','tick','point'].every(mark=>marks.includes(mark)))return;
  const v=boxValueChannel(spec.encoding);
  const whisker=layers[marks.indexOf('rule')].encoding?.[v];
  const guide=sharedAxisGuide(spec,v,'箱线图');
  if(guide&&whisker&&!present(whisker.axis?.format)){
    whisker.axis={...whisker.axis,format:guide.format,formatType:guide.formatType??'number'};
  }
}
function errorBarAxisGuide(spec){
  if(!Array.isArray(spec?.layer)||spec.layer.length!==2)return;
  const bar=spec.layer.find(layer=>markType(layer?.mark)==='bar');
  const interval=spec.layer.find(layer=>['errorbar','rule'].includes(markType(layer?.mark)));
  if(!bar||!interval)return;
  const y=bar.encoding?.y??spec.encoding?.y;
  const channel=['nominal','ordinal'].includes(y?.type)?'x':'y';
  const lower=interval.encoding?.[channel];
  if(lower?.field&&lower.type===undefined)lower.type='quantitative';
  return sharedAxisGuide(spec,channel,'误差棒柱图');
}
const percentDigits=value=>finite(value)?decimalParts(value).digits.replace(/0+$/,'').length:0;
// Process each physical data source once per field, including secondary axis endpoints.
function shiftDecimal(value,places){const [digits,exponent]=String(value).split('e');return Number(digits+'e'+(Number(exponent||0)+places));}
function rememberPieFraction(row,fraction){
  // Some parsed fractions cannot round-trip through a floating-point percentage.
  if(shiftDecimal(row.value,-2)!==fraction)row._pieFraction=fraction;
}
function canConfirmPieFractions(p){
  return p.pieFractionImport&&p.valueMode==='absolute'&&p.rows.length>0&&
    p.rows.every(r=>finite(r.value)&&r.value>=0&&r.value<=1)&&p.rows.some(r=>r.value>0);
}
function confirmPieFractions(p){
  if(!canConfirmPieFractions(p))return;
  for(const row of p.rows){
    const fraction=row.value;
    row.value=shiftDecimal(fraction,2);
    rememberPieFraction(row,fraction);
  }
  p.valueMode='percent';
  delete p.pieFractionImport;
}
function mapPercentScales(spec,project,reading){
  const flags={},guides={},fields=new Map(),formatTargets=[],digits={},losses=new Map();
  const guideOwner=reading?null:isBox(project)?spec.layer[0]:isBar(project)&&spec.layer?spec:null;
  function scan(node,right=false){
    for(const ch of ['x','y','theta','color']){
      const def=node.encoding?.[ch],guide=ch==='theta'?def:ch==='color'?def?.legend:def?.axis;
      if(def?.type==='quantitative'&&isPercentFormat(guide)){
        const key=right&&ch==='y'?'r':ch,format=guide.format;
        flags[key]=true;
        const saved=guides[key]??={format};
        if(Array.isArray(def.scale?.domain)&&def.scale.domain.every(finite))saved.domain=copy(def.scale.domain);
        if(Array.isArray(guide?.values)&&guide.values.every(finite))saved.values=copy(guide.values);
      }
    }
    for(const layer of node.layer||[])scan(layer,right||!!node.resolve?.scale?.y&&markType(layer.mark)==='line');
  }
  if(reading)scan(spec);
  function walk(node,parentEncoding,inheritedData,right=false){
    const data=node.data?.values??inheritedData,enc={...parentEncoding,...node.encoding};
    if(!Array.isArray(data))return;
    if(!fields.has(data))fields.set(data,new Set());
    for(const ch of ['x','y','color','theta']){
      const key=right&&ch==='y'?'r':ch,def=enc[ch];
      if(def?.type!=='quantitative')continue;
      const guide=ch==='color'?'legend':ch==='theta'?null:'axis';
      const active=reading?flags[key]:percentLabels(project,key);
      if(!active)continue;
      flags[key]=true;
      for(const f of [def.field,enc[ch+'2']?.field])if(f){
        fields.get(data).add(f);
        if(!reading)for(const row of data)digits[key]=Math.max(digits[key]??0,percentDigits(row[f]));
      }
      if(def.field==='end'&&enc[ch+'2']?.field==='start')fields.get(data).add('value');
      // Legacy compact boxplots flatten outlier arrays in the point layer.
      if(reading)for(const t of node.transform??[]){
        const index=(t.as??t.flatten??[]).indexOf(def.field);
        if(index>=0&&t.flatten?.[index])fields.get(data).add(t.flatten[index]);
      }
      if(!reading&&(!guideOwner||node===guideOwner)&&node.encoding?.[ch]&&(!guide||def[guide]!==null)){
        formatTargets.push({def,guide,key});
      }
    }
    for(const l of node.layer||[])walk(l,enc,data,right||!!node.resolve?.scale?.y&&markType(l.mark)==='line');
  }
  walk(spec,{},null);
  const restoredGuides=new Set();
  for(const {def,guide,key} of formatTargets){
    const saved=project.percentGuides?.[key];
    const places=Math.max(4,digits[key]??0,saved?.digits??0);
    const format=saved?.format??'.'+places+'~p';
    if(guide)def[guide]={...def[guide],format};
    else def.format=format;
    if(!saved||restoredGuides.has(key))continue;
    if(saved.domain)def.scale={...def.scale,domain:copy(saved.domain)};
    if(saved.values&&guide)def[guide].values=copy(saved.values);
    restoredGuides.add(key);
  }
  const convert=value=>{
    if(!finite(value))return value;
    const result=shiftDecimal(value,reading?2:-2);
    if(!finite(result))throw Error('百分比数值超出支持范围');
    return result;
  };
  for(const [rows,keys] of fields)for(const row of rows)for(const k of keys){
    if(!Object.hasOwn(row,k))continue;
    const original=row[k];
    row[k]=Array.isArray(original)?original.map(convert):convert(original);
    if(reading && (Array.isArray(original)?original.some((v,i)=>finite(v)&&shiftDecimal(row[k][i],-2)!==v):
        finite(original)&&shiftDecimal(row[k],-2)!==original)){
      if(!losses.has(rows))losses.set(rows,[]);
      losses.get(rows).push({row,key:k,original,displayed:row[k]});
    }
  }
  if(reading){
    function clean(node){
      for(const def of Object.values(node.encoding||{}))for(const guide of ['axis','legend',null]){
        const obj=guide?def[guide]:def;
        if(isPercentFormat(obj)){delete obj.format;if(guide&&!Object.keys(obj).length)delete def[guide];}
      }
      (node.layer||[]).forEach(clean);
    }
    clean(spec);
  }
  return {flags,guides,losses};
}
function percentTables(node,path=''){
  return [
    ...(Array.isArray(node.data?.values)?[[path,node.data.values]]:[]),
    ...(node.layer??[]).flatMap((layer,i)=>percentTables(layer,path+'/'+i))
  ];
}
const percentRowKey=row=>JSON.stringify(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)));
function rememberNormalizedPercentTables(project,displayedSpec,originalSpec){
  // Match stored fractions after normalizing historical field names and table layouts.
  const source=new Map(percentTables(originalSpec));
  const exact=[];
  for(const [path,rows] of percentTables(displayedSpec)){
    const originalRows=source.get(path);
    rows.forEach((row,index)=>{
      for(const [key,displayed] of Object.entries(row)){
        const original=originalRows[index][key];
        if(finite(displayed)&&shiftDecimal(displayed,-2)!==original){
          exact.push({path,index,signature:percentRowKey(row),key,original,displayed});
        }
      }
    });
  }
  if(exact.length)project.percentExact=exact;
}
function rememberPercentTables(project,converted,losses){
  if(!losses.size||isPie(project))return;
  const canonical=new Map(percentTables(baseSpec(project)));
  const exact=[];
  for(const [path,rows] of percentTables(converted)){
    if(!losses.has(rows)||!canonical.has(path))continue;
    const positions=new Map();
    canonical.get(path).forEach((row,index)=>{
      const key=percentRowKey(row);
      if(!positions.has(key))positions.set(key,[]);
      positions.get(key).push(index);
    });
    for(const {row,key,original,displayed} of losses.get(rows)){
      const signature=percentRowKey(row),candidates=positions.get(signature);
      if(!candidates?.length)continue;
      const duplicates=rows.filter(other=>percentRowKey(other)===signature);
      const index=candidates[duplicates.indexOf(row)];
      if(index!==undefined)exact.push({path,index,signature,key,original,displayed});
    }
  }
  if(exact.length)project.percentExact=exact;
}
function makeSpec(p){
  const issues=percentLabelIssues(p);
  if(issues.length)throw Error(issues[0].message);
  const spec=baseSpec(projectWithFractionLabels(p));
  spec.usermeta={...spec.usermeta,table_export:{tables:tableMetadata(p,spec)}};
  const tables=new Map(percentTables(spec));
  const retained=(p.percentExact??[]).filter(saved=>{
    const row=tables.get(saved.path)?.[saved.index];
    return row&&percentRowKey(row)===saved.signature;
  });
  mapPercentScales(spec,p,false);
  for(const saved of retained){
    const row=tables.get(saved.path)[saved.index];
    if(JSON.stringify(row[saved.key])!==JSON.stringify(saved.displayed))row[saved.key]=copy(saved.original);
  }
  if(isPie(p)&&p.valueMode==='percent')spec.data.values.forEach((row,i)=>{
    const {_pieFraction,value}=p.rows[i];
    if(finite(_pieFraction)&&shiftDecimal(_pieFraction,2)===value)row.value=_pieFraction;
  });
  return spec;
}
function importSpec(input,preferredKind){
  const spec=copy(input);
  const pie=markType(spec?.mark)==='arc',theta=spec?.encoding?.theta;
  const semantic=spec?.usermeta?.semantic,mode=semantic?.options?.value_mode;
  const knownPieMode=pie&&semantic?.kind==='pie'&&['percent','absolute'].includes(mode);
  const unformatted=theta?.format===undefined;
  if(knownPieMode){
    if(theta&&unformatted&&mode==='percent')theta.format=DEFAULT_PERCENT_FORMAT;
    delete spec.usermeta.semantic;
  }
  if(!pie)checkBoxAxisFormats(spec);
  const errorGuide=errorBarAxisGuide(spec);
  const errorCurrency=isCurrencyFormat(errorGuide)&&!isPercentFormat(errorGuide)?errorGuide.format:undefined;
  const {flags,guides,losses}=mapPercentScales(spec,null,true);
  const tables=spec.usermeta?.table_export?.tables;
  if(Array.isArray(tables)&&!spec.usermeta.semantic)delete spec.usermeta.table_export;
  if(spec.usermeta&&!Object.keys(spec.usermeta).length)delete spec.usermeta;
  const p=baseImport(spec,preferredKind,flags);
  p.percentLabels=flags;
  if(isBar(p)&&errorCurrency)p.valueFormat=errorCurrency;
  if(Object.keys(guides).length)p.percentGuides=guides;
  if(isPie(p)){
    p.valueMode=flags.theta?'percent':'absolute';
    if(flags.theta)p.rows.forEach((row,i)=>rememberPieFraction(row,input.data.values[i][theta.field]));
    else if(unformatted&&!knownPieMode){
      p.pieFractionImport=true;
      const historicalShareTitle=typeof theta?.title==='string'&&theta.title.trim()===LEGACY_PIE_SHARE_TITLE;
      if(!canConfirmPieFractions(p)&&!historicalShareTitle)delete p.pieFractionImport;
    }
  }
  if(isPercentStack(p)&&!flags[valueAxis(p)])p.percentLabels[valueAxis(p)]=false;
  if(isBox(p)&&losses.size)rememberNormalizedPercentTables(p,makeStatSpec(p),makeStatSpec(importStatSpec(input)));
  else if(isBar(p)&&errorGuide&&losses.size){
    rememberNormalizedPercentTables(p,baseSpec(p),baseSpec(baseImport(input,preferredKind,flags)));
  }
  else rememberPercentTables(p,spec,losses);
  return p;
}

function baseSpec(p) {
  if(isComposite(p))return makeCompositeSpec(p);
  const errors=validate(p).filter(x=>x.severity==='error');
  if(errors.length) throw Error(errors.map(x=>x.message).join('\n'));
  if(isHeatmap(p))return makeHeatmapSpec(p);
  if(isStat(p))return makeStatSpec(p);
  if(isArea(p))return makeAreaSpec(ensureIdentities(copy(p)));
  if(isHistogram(p))return makeHistogramSpec(ensureIdentities(copy(p)));
  const bar=isBar(p),stack=isStack(p),percent=isPercentStack(p),horizontal=isHorizontal(p),line=p.kind.startsWith('line');
  p=ensureIdentities(copy(p));
  const ordered=orderedRows(p),lineCategory=lineCategoryAxis(p),categoryField=bar?'category':lineCategory??'x';
  const seriesKeys=unique(ordered.map(identity)),categoryKeys=unique(ordered.map(categoryIdentity));
  const multi=seriesKeys.length>1,withSeries=percent||p.legend!==false||multi;
  const repeatedSeries=unique(seriesKeys.map(k=>seriesName(p,k))).length<seriesKeys.length;
  const categoryLabel=key=>lineCategory?String(categoryName(p,key)):categoryName(p,key);
  const repeatedCategory=(bar||lineCategory||p.xType==='ordinal')&&unique(categoryKeys.map(categoryLabel)).length<categoryKeys.length;
  const categoryID=categoryField+'_id',prefix=bar?'C':categoryField.toUpperCase();
  const observedCategories=p.categoryObjects.filter(c=>categoryKeys.includes(c.key));
  const standardID=new RegExp('^'+prefix+'[1-9][0-9]*$');
  const useImportedIDs=lineCategory&&observedCategories.every(c=>standardID.test(c.legacy));
  const lineIds=new Map(observedCategories.map((c,i)=>[c.key,useImportedIDs?c.legacy:prefix+(i+1)]));
  const categoryKey=k=>lineCategory?lineIds.get(k):prefix+(categoryKeys.indexOf(k)+1);
  const endpoints=stack&&!percent&&p.stackEndpointMode==='explicit'&&stackNeedsEndpoints(p);
  const optional=percent?[]:['lower','upper','start','end','path_order','stack_order'].filter(k=>ordered.every(r=>present(r[k]))&&(!stack||(['start','end'].includes(k)?endpoints:k==='stack_order'?!endpoints:true)));
  const stackKeys=p.series.map(s=>s.key);
  const ranks=percent?new Map(p.series.map((s,i)=>[s.key,stackRank(s,i)])):null;
  const rows=ordered.map(r=>{
    const out=bar?{category:r.category,value:r.value}:{x:r.x,y:r.y};
    if(lineCategory)out[lineCategory]=categoryLabel(categoryIdentity(r));
    if(repeatedCategory)out[categoryID]=categoryKey(categoryIdentity(r));
    for(const k of optional)out[k]=r[k];
    if(percent)out.stack_order=ranks.get(identity(r));
    else if(stack&&!optional.includes('start')&&!optional.includes('stack_order'))out.stack_order=stackKeys.indexOf(identity(r));
    if(withSeries){out.series=p.legend===false?'Series '+(seriesKeys.indexOf(identity(r))+1):r.series;if(repeatedSeries&&p.legend!==false)out.series_id='S'+(seriesKeys.indexOf(identity(r))+1);}
    return orderRow(out);
  });
  const axis=(channel,field,type)=>{
    const out={field,type};
    const title=channel==='x'?p.xTitle:p.yTitle;
    if(present(title)&&(!percent||typeof title!=='string'||title.trim()))out.title=copy(title);
    if(type==='quantitative') {if(!percent&&p.axes[channel].type==='log')out.scale={type:'log'};}
    else out.sort=null;
    return out;
  };
  const cat=horizontal?'y':'x',val=horizontal?'x':'y';
  const enc=bar?{[cat]:axis(cat,repeatedCategory?'category_id':'category','nominal'),[val]:axis(val,'value','quantitative')}:
    Object.fromEntries(['x','y'].map(ch=>[ch,axis(ch,repeatedCategory&&ch===categoryField?categoryID:ch,
      ch===lineCategory?'nominal':ch==='x'&&p.xType==='ordinal'?'ordinal':'quantitative')]));
  if(line)for(const ch of lineCategory?requiredAxes(p):['x']){
    const scale=p.axes[ch];
    const calibratedReverse=scale.calibrated&&(scale.v2-scale.v1)/(scale.p2-scale.p1)*(ch==='x'?1:-1)<0;
    const reverse=lineCategory&&scale.calibrated?calibratedReverse:scale.reverse||calibratedReverse;
    if(reverse)enc[ch].scale={...enc[ch].scale,reverse:true};
  }
  if(lineCategory&&optional.includes('path_order'))enc[lineCategory].sort=observedCategories
    .map(c=>repeatedCategory?categoryKey(c.key):categoryLabel(c.key));
  if(withSeries)enc.color={field:rows[0].series_id?'series_id':'series',type:'nominal',sort:null};
  if(['barh_n','barv_n'].includes(p.kind))enc[cat+'Offset']={...enc.color};
  if(stack) {
    if(optional.includes('start')) {enc[val].field='end';enc[val].stack=null;enc[val+'2']={field:'start'};}
    else {enc[val].stack='zero';enc.order={field:'stack_order',type:'quantitative'};}
  }
  let mark={type:bar?'bar':line?'line':'point'};
  if(line&&unique(p.rows.map(identity)).some(id=>p.rows.filter(r=>identity(r)===id).length===1))mark.point=true;
  if(line&&optional.includes('path_order'))enc.order={field:'path_order',type:'quantitative'};
  else if(line&&!lineCategory){const last=new Map();if(ordered.some(r=>{const id=identity(r),x=r.x;const same=last.has(id)&&x<=last.get(id);last.set(id,x);return same;}))mark.order=false;}
  const out={};
  if(present(p.title))out.title=copy(p.title);
  out.data={values:rows};
  if(bar&&optional.includes('lower')) {
    if(isCurrencyFormat({format:p.valueFormat}))enc[val].axis={format:p.valueFormat};
    out.encoding=orderEncoding(enc);
    out.layer=[{mark:{type:'bar'}},{mark:{type:'errorbar'},encoding:orderEncoding({[val]:{field:'lower',type:'quantitative',...(stack?{stack:null}:{})},[val+'2']:{field:'upper'}})}];
  } else {out.mark=mark;out.encoding=orderEncoding(enc);}
  return out;
}

function baseImport(input,preferredKind,percentAxes={}) {
  if(input?.data?.values?.some?.(r=>r&&Object.hasOwn(r,'series_role')))return importCompositeSpec(input);
  const s=copy(input);
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('GT 必须为 JSON 对象');
  if(!s.data||!Array.isArray(s.data.values)||!s.data.values.length)throw Error('只支持包含 data.values 的非空内联 Vega-Lite 图表');
  if(markType(s.mark)==='rect')return importHeatmapSpec(s);
  if(markType(s.mark)==='area')return importAreaSpec(s);
  if(markType(s.mark)==='bar'&&isHistogramSpec(s))return importHistogramSpec(s);
  if(markType(s.mark)==='arc'||Array.isArray(s.layer)&&s.layer.some(l=>markType(l.mark)==='tick'))return importStatSpec(s);
  if(s.transform||s.concat||s.hconcat||s.vconcat||s.facet||s.repeat)throw Error('当前工具不支持变换或组合图表导入');
  if(s.usermeta?.semantic)throw Error('请导入合成数据的精简 GT，而不是包含 plot_* 布局字段的完整渲染 spec');
  if(s.layer&&(!Array.isArray(s.layer)||s.layer.some(l=>l.transform||l.data||l.layer||l.resolve)))throw Error('不支持带独立数据、变换或嵌套结构的图层');
  const primary=s.layer?.find(l=>['bar','line','point'].includes(typeof l.mark==='string'?l.mark:l.mark?.type));
  const enc={...(s.encoding||{}),...(primary?.encoding||{})};
  const mark=primary?.mark??s.mark;
  const type=typeof mark==='string'?mark:mark?.type;
  if(!['bar','line','point'].includes(type)||!enc.x||!enc.y)throw Error('仅支持柱、折线、散点图的 x/y 编码');
  const lineCategory=type==='line'?(nominalType(enc.x.type)?'x':enc.y.type==='nominal'?'y':null):null;
  if(type==='line'&&(['x','y'].some(ch=>ch!==lineCategory&&enc[ch].type!=='quantitative'))){
    throw Error('折线图支持双数值轴，或一个 Nominal 类别轴与一个 Quantitative 数值轴');
  }
  if(typeof mark==='object'&&Object.keys(mark).some(k=>!['type','order','point'].includes(k)&&!(k==='orient'&&lineCategory)))throw Error('导入包含额外标记属性，请先转换为精简 GT');
  if(lineCategory&&mark?.orient&&mark.orient!==(lineCategory==='y'?'horizontal':'vertical')&&!enc.order&&mark.order!==false){
    throw Error('折线方向与类别轴的默认路径不一致，请用 path_order 明确路径后导入');
  }
  if(type==='line'&&enc.order&&(enc.order.field!=='path_order'||enc.order.type!=='quantitative'))throw Error('折线顺序只绑定 path_order');
  if(Object.keys(enc).some(k=>!['x','y','x2','y2','color','xOffset','yOffset','order'].includes(k)))throw Error('导入包含当前十类工具尚不支持的视觉编码');
  for(const [channel,def] of Object.entries(enc)) {
    const lineDomain=channel===lineCategory&&Array.isArray(def.sort);
    if(lineDomain&&(new Set(def.sort).size!==def.sort.length||def.sort.length!==unique(s.data.values.map(r=>r[def.field])).length||s.data.values.some(r=>!def.sort.includes(r[def.field]))))throw Error('折线显式类别顺序必须恰好覆盖观测位置');
    if(def.condition||def.aggregate||def.bin||def.timeUnit||def.datum!==undefined||def.value!==undefined||def.sort!=null&&!lineDomain)throw Error('导入包含条件、聚合、分箱、常数或不支持的排序编码，不进行有损转换');
    if(def.axis?.labelExpr||def.legend?.labelExpr)throw Error('请使用当前规范的 category_id / x_id / series_id 身份字段，不导入旧版标签表达式');
  }
  const horizontal=type==='bar'&&['nominal','ordinal'].includes(enc.y.type);
  const val=horizontal?'x':'y',cat=horizontal?'y':'x';
  const seriesField=enc.color?.field;
  const ids=unique(s.data.values.map(r=>seriesField?r[seriesField]:'Series 1'));
  const stacked=type==='bar'&&(present(enc[val].stack)&&enc[val].stack!==null||enc[val+'2']||enc.order?.field==='stack_order');

  if(enc[val].stack&&!['zero'].includes(enc[val].stack))throw Error('当前规范仅支持 zero 堆叠；百分比图需直接标注图中归一化数值');
  const prefix=horizontal?'barh':'barv',percentKind=prefix+'_stack_percent';
  // A scientific title alone says nothing about the scale used by the ticks.
  const formattedPercent=preferredKind!==prefix+'_stack'&&percentAxes[val]&&
    !s.data.values.some(row=>finite(row?.value)&&row.value<0);
  const percent=type==='bar'&&!s.layer&&!enc[val+'2']&&!enc[cat+'Offset']&&
    enc[val].field==='value'&&enc[val].type==='quantitative'&&enc[val].stack==='zero'&&
    ['category','category_id','category_instance'].includes(enc[cat].field)&&
    ['series','series_id','series_instance'].includes(seriesField)&&
    enc.order?.field==='stack_order'&&enc.order.type==='quantitative'&&
    (preferredKind===percentKind||formattedPercent);
  const kind=type==='bar'?(stacked?(percent?percentKind:prefix+'_stack'):`${prefix}_${ids.length>1||enc[cat+'Offset']?'n':'1'}`):`${type==='line'?'line':'scatter'}_${ids.length>1?'n':'1'}`;
  const p=defaultProject(kind);
  p.title=typeof s.title==='object'&&!Array.isArray(s.title)?s.title.text??'':s.title??'';
  p.xTitle=enc.x.title??enc.x.axis?.title??'';p.yTitle=enc.y.title??enc.y.axis?.title??'';
  p.xType=enc.x.type==='quantitative'?'quantitative':type==='line'?'nominal':'ordinal';
  if(type==='line')p.yType=lineCategory==='y'?'nominal':'quantitative';
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
  if(errorLayer){
    const root=s.encoding?.[val],interval=errorLayer.encoding[val];
    p[val+'Title']=root?.axis?.title??root?.title??enc[val].axis?.title??enc[val].title??interval.axis?.title??interval.title??'';
  }
  p.rows=s.data.values.map(r=>{
    if(percent&&(!r||!present(r[seriesField])))throw Error('百分比堆叠记录缺少系列');
    const row=type==='bar'?{category:r[enc[cat].field],value:r[enc[val].field]}:{x:r[enc.x.field],y:r[enc.y.field]};
    row.series=seriesField?(r.series??r[seriesField]):'Series 1';
    for(const k of ['category_id','x_id','y_id','series_id','category_instance','x_instance','y_instance','series_instance','path_order','stack_order','start','end','lower','upper'])if(present(r[k]))row[k]=r[k];
    const field=type==='bar'?'category':lineCategory??'x';
    if([field+'_instance',field+'_id'].includes(enc[type==='bar'?cat:field].field))row[field]=r[field];
    if(lineCategory==='x'&&enc.x.type==='ordinal'&&finite(row.x))row.x=String(row.x);
    if(stacked&&enc[val+'2']) {row.start=r[enc[val+'2'].field];row.end=r[enc[val].field];row.value=r.value??row.end-row.start;}
    if(errorLayer) {row.lower=r[errorLayer.encoding?.[val]?.field];row.upper=r[errorLayer.encoding?.[val+'2']?.field];}
    return row;
  });
  p.categories=unique(p.rows.map(r=>r[type==='bar'?'category':lineCategory??'x']));delete p.categoryObjects;ensureIdentities(p);
  if(percent){
    const ranks=new Map();
    for(const row of p.rows){
      const key=identity(row),rank=row.stack_order;
      if(!Number.isSafeInteger(rank)||rank<0||ranks.has(key)&&ranks.get(key)!==rank)
        throw Error('同一系列的 stack_order 必须为一致的非负整数');
      ranks.set(key,rank);
      delete row.stack_order;
    }
    for(const series of p.series)series.stackOrder=ranks.get(series.key);
    p.series.sort((a,b)=>a.stackOrder-b.stackOrder);
    const errors=validate(p).filter(issue=>issue.severity==='error');
    if(errors.length)throw Error(errors.map(issue=>issue.message).join('\n'));
  }
  if(lineCategory){
    const def=enc[lineCategory];
    if(Array.isArray(def.sort)){
      const refs=new Map(s.data.values.map((r,i)=>[r[def.field],p.rows[i]._categoryKey]));
      const ranks=new Map(def.sort.map((value,i)=>[refs.get(value),i]));
      p.categoryObjects.sort((a,b)=>ranks.get(a.key)-ranks.get(b.key));p.categories=p.categoryObjects.map(c=>c.name);
    }
    if(!enc.order&&mark?.order!==false&&!p.rows.some(row=>present(row.path_order))){
      const ranks=new Map(p.categoryObjects.map((c,i)=>[c.key,i]));
      p.rows.sort((a,b)=>ranks.get(a._categoryKey)-ranks.get(b._categoryKey));
    }
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

function measurePieSectors(center,boundaries){
  if(!boundaries.length)return [];
  const turn=2*Math.PI,epsilon=1e-10;
  const angle=point=>{
    const dx=point?.x-center?.x,dy=point?.y-center?.y;
    if(!finite(dx)||!finite(dy)||(!dx&&!dy))throw Error('请点击与圆心分开的扇区分界点');
    // In image coordinates positive Y points down, so atan2 increases clockwise.
    return Math.atan2(dy,dx);
  };
  const start=angle(boundaries[0]),offsets=[0];
  for(const point of boundaries.slice(1)){
    const difference=angle(point)-start;
    const offset=difference<0?difference+turn:difference;
    if(offset<=offsets.at(-1)+epsilon||offset>=turn-epsilon){
      throw Error('请从第一条分界线起沿顺时针点一圈，每条分界线只点一次');
    }
    offsets.push(offset);
  }
  const shortestRay=Math.min(...boundaries.map(point=>Math.hypot(point.x-center.x,point.y-center.y)));
  const uncertainty=100*Math.atan2(2,shortestRay)/turn;
  const totalUnits=100*10**-Math.max(-2,Math.floor(Math.log10(uncertainty)));
  const sectors=offsets.map((offset,i)=>{
    const span=(offsets[i+1]??turn)-offset;
    const quota=span/turn*totalUnits,units=Math.floor(quota);
    return {degrees:span*180/Math.PI,units,remainder:quota-units,index:i};
  });
  const missing=totalUnits-sectors.reduce((sum,sector)=>sum+sector.units,0);
  const byRemainder=[...sectors].sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  for(const sector of byRemainder.slice(0,missing))sector.units++;
  return sectors.map(({degrees,units})=>({degrees,value:units/(totalUnits/100)}));
}

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
// Histogram GT stores observed bins and statistic values directly.
const HISTOGRAM_FIELDS=['bin_start','bin_end','value'];
const HISTOGRAM_BOUNDARIES=['bin_start','bin_end'];
const HISTOGRAM_BOUNDARY_HANDLES=['bin_startPixel','bin_endPixel'];
const histogramBinAxis=p=>isHorizontal(p)?'y':'x';
const histogramFieldAxis=(p,field)=>field==='value'?valueAxis(p):histogramBinAxis(p);
const histogramHandles=(p,field)=>field==='value'&&isHistogramStack(p)?
  ['valueStartPixel','valueEndPixel']:[field+'Pixel'];
const histogramHasEvidence=(p,field,e)=>histogramHandles(p,field).some(k=>e?.[k]);
const validHistogramRank=rank=>Number.isSafeInteger(rank)&&rank>=0;
const isHistogramSpec=s=>['x','y'].some(k=>{
  const def=s.encoding?.[k];
  return def?.bin==='binned'||def?.type==='quantitative'&&def.field==='bin_start'&&
    s.encoding?.[k+'2']?.field==='bin_end';
});

function validateHistogram(p,issue){
  const multi=!p.kind.endsWith('_1'),stacked=isHistogramStack(p);
  const names=p.series.map(s=>s.name),ranks=p.series.map(s=>s.stackOrder);
  if(multi&&(names.length<(stacked?1:2)||names.some(name=>typeof name!=='string'||!name.trim())||
      new Set(names).size!==names.length)){
    issue('error',stacked?'堆叠图须使用非空且唯一的系列名称':'多系列直方图至少需要两个非空且唯一的系列名称');
  }
  if(!multi&&names.length!==1)issue('error','单系列直方图只允许一个系列');
  if(stacked&&(ranks.some(rank=>!validHistogramRank(rank))||new Set(ranks).size!==ranks.length)){
    issue('error','各系列的 stack_order 必须是不同的非负整数');
  }
  const bySeries=new Map(p.series.map(s=>[s.key,[]])),uncalibrated=new Set();
  const binKeys=new Set(p.histogramBins?.map(bin=>bin.key)),observations=new Set();
  for(const [i,row] of p.rows.entries()){
    const prefix=`第 ${i+1} 行：`;
    const assigned=!stacked||!p.histogramBins||binKeys.has(row._histogramBin);
    if(stacked&&p.histogramBins){
      if(!assigned)issue('error',prefix+'请选择所属分箱');
      else{
        const observation=JSON.stringify([row._histogramBin,identity(row)]);
        if(observations.has(observation))issue('error',prefix+'同一分箱内不能重复记录同一系列');
        observations.add(observation);
      }
    }
    for(const field of HISTOGRAM_FIELDS){
      if(!assigned&&field!=='value')continue;
      if(!finite(row[field]))issue('error',prefix+field+' 必须是有限数字');
      const axis=histogramFieldAxis(p,field);
      if((!row._histogramBin||field==='value')&&!p.axes[axis].calibrated&&histogramHasEvidence(p,field,p.evidence?.[i])){
        uncalibrated.add(axis);
      }
    }
    if(finite(row.bin_start)&&finite(row.bin_end)&&row.bin_end<=row.bin_start){
      issue('error',prefix+'bin_end 必须大于 bin_start');
    }
    if(stacked&&finite(row.value)&&row.value<0)issue('error',prefix+'堆叠段 value 不能为负数');
    bySeries.get(identity(row)).push(row);
  }
  if(stacked){
    const binAxis=histogramBinAxis(p),used=new Set(p.rows.map(row=>row._histogramBin));
    if(!p.axes[binAxis].calibrated&&p.histogramBins?.some(bin=>used.has(bin.key)&&
        ['bin_start','bin_end'].some(field=>histogramHasEvidence(p,field,bin.evidence))))uncalibrated.add(binAxis);
    if(histogramBinsOverlap(p.rows,true)||histogramBinsOverlap(p.histogramBins??[])){
      issue('error','堆叠分箱边界不一致或有重叠');
    }
  }
  for(const axis of uncalibrated)issue('error',`${axis.toUpperCase()} 轴上的测量记录需要重新校准或手动填写`);
  for(const {key,name} of p.series){
    const rows=bySeries.get(key);
    if(multi&&!stacked&&!rows.length)issue('error',`系列「${name}」缺少分箱记录`);
    if(histogramBinsOverlap(rows)){
      issue('error',`系列「${name}」的分箱边界有重叠或重复记录`);
    }
  }
  validateAxes(p,issue);
}

const completeHistogramBin=bin=>finite(bin?.bin_start)&&finite(bin.bin_end)&&bin.bin_end>bin.bin_start;
const sameHistogramBin=(a,b)=>a.bin_start===b.bin_start&&a.bin_end===b.bin_end;
function newHistogramBin({bin_start=null,bin_end=null}={}){
  return {key:newKey('histogram-bin'),bin_start,bin_end,evidence:{}};
}

function restoreHistogramBins(p){
  if(!isHistogramStack(p))return p;
  const bins=p.histogramBins??=[],created=new Map();
  const boundsKey=bin=>JSON.stringify([bin.bin_start??null,bin.bin_end??null]);
  const known=new Map(bins.map(bin=>[boundsKey(bin),bin]));
  const byKey=new Map(bins.map(bin=>[bin.key,bin]));
  for(const [i,row] of p.rows.entries()){
    if(row._histogramBin){
      const bin=byKey.get(row._histogramBin);
      if(bin)Object.assign(row,{bin_start:bin.bin_start,bin_end:bin.bin_end});
      continue;
    }
    if(!HISTOGRAM_BOUNDARIES.some(field=>present(row[field])))continue;
    const hash=boundsKey(row);
    let bin=known.get(hash);
    if(!bin){
      bin=newHistogramBin(row);
      bins.push(bin);
      known.set(hash,bin);
      created.set(bin,[]);
    }
    row._histogramBin=bin.key;
    created.get(bin)?.push(p.evidence?.[i]);
  }
  const axis=histogramBinAxis(p);
  for(const [bin,records] of created){
    for(const handle of HISTOGRAM_BOUNDARY_HANDLES){
      const point=records[0]?.[handle];
      if(point&&records.every(record=>record?.[handle]?.[axis]===point[axis]))bin.evidence[handle]=point;
    }
  }
  if(created.size===bins.length)bins.sort((a,b)=>a.bin_start-b.bin_start);
  const run=p.histogramRun;
  if(run?.stacked&&!run.phase){
    run.phase=run.step<run.count?'bounds':'segment';
    if(run.phase==='bounds')run.series=[];
    if(run.phase==='segment'){
      run.step-=run.count;
      for(const key of ['pending','skipped']){
        run[key]=Object.fromEntries(Object.entries(run[key]).map(([step,value])=>[Number(step)-run.count,value]));
      }
    }
  }
  return p;
}

function histogramBinsOverlap(bins,shared=false){
  const ordered=bins.filter(completeHistogramBin).sort((a,b)=>a.bin_start-b.bin_start||a.bin_end-b.bin_end);
  return ordered.some((bin,i)=>i>0&&bin.bin_start<ordered[i-1].bin_end&&
    !(shared&&sameHistogramBin(bin,ordered[i-1])));
}

function histogramEncoding(p){
  const bin=histogramBinAxis(p),value=valueAxis(p),stacked=isHistogramStack(p),multi=!p.kind.endsWith('_1');
  const axis=(channel,field)=>{
    const title=p[channel+'Title'];
    return {field,type:'quantitative',...(field==='bin_start'?{bin:'binned'}:{}),
      ...(present(title)||title===null?{title:copy(title)}:{})};
  };
  return {
    [bin]:axis(bin,'bin_start'),[bin+'2']:{field:'bin_end'},
    [value]:{...axis(value,'value'),...(multi?{stack:stacked?'zero':null}:{})},
    ...(multi?{color:{field:'series',type:'nominal',sort:null}}:{}),
    ...(stacked?{order:{field:'stack_order',type:'quantitative'}}:{})
  };
}

function makeHistogramSpec(p){
  const ranks=new Map(p.series.map(s=>[s.key,s.stackOrder]));
  const values=p.rows.map(r=>({bin_start:r.bin_start,bin_end:r.bin_end,value:r.value,
    ...(isHistogramStack(p)?{stack_order:ranks.get(identity(r))}:{}),
    ...(!p.kind.endsWith('_1')?{series:r.series}:{})}));
  return {...(present(p.title)?{title:copy(p.title)}:{}),data:{values},mark:{type:'bar'},encoding:histogramEncoding(p)};
}

function importHistogramSpec(s){
  const matchesKeys=(record,keys)=>record&&typeof record==='object'&&!Array.isArray(record)&&
    Object.keys(record).length===keys.length&&keys.every(key=>Object.hasOwn(record,key));
  if(Object.keys(s).some(k=>!['title','data','mark','encoding','$schema'].includes(k))||
      !matchesKeys(s.data,['values'])||!matchesKeys(s.mark,['type'])){
    throw Error('直方图 GT 仅支持预分箱的单个 bar 标记和内联分箱数据');
  }
  const enc=s.encoding,bin=enc.x?.field==='bin_start'?'x':'y',value=bin==='x'?'y':'x';
  const stacked=enc[value]?.stack==='zero',multi=Object.hasOwn(enc,'color');
  const p=defaultProject('histogram_'+(bin==='x'?'v':'h')+(stacked?'_stack':multi?'_n':'_1'));
  p.title=s.title??'';
  p.xTitle=Object.hasOwn(enc.x??{},'title')?enc.x.title:'';
  p.yTitle=Object.hasOwn(enc.y??{},'title')?enc.y.title:'';
  const expected=histogramEncoding(p);
  if(!matchesKeys(enc,Object.keys(expected))||Object.entries(expected).some(([channel,def])=>
    !matchesKeys(enc[channel],Object.keys(def))||Object.keys(def).some(k=>k!=='title'&&enc[channel][k]!==def[k]))){
    throw Error('直方图 GT 编码不符合 bin_start / bin_end / value 规范');
  }
  const fields=[...HISTOGRAM_FIELDS,...(multi?['series']:[]),...(stacked?['stack_order']:[])],byName=new Map();
  p.series=[];
  p.rows=s.data.values.map((row,i)=>{
    if(!matchesKeys(row,fields)||multi&&(typeof row.series!=='string'||!row.series.trim())){
      throw Error(`第 ${i+1} 行：直方图字段应为 ${fields.join('、')}`);
    }
    const name=multi?row.series:'Series 1';
    if(!byName.has(name)){
      const series=addObject(p,'series',name);
      if(stacked)series.stackOrder=row.stack_order;
      byName.set(name,series);
    }
    const series=byName.get(name);
    if(stacked&&(!validHistogramRank(row.stack_order)||row.stack_order!==series.stackOrder)){
      throw Error(`第 ${i+1} 行：同一系列的 stack_order 必须是相同的非负整数`);
    }
    const {bin_start,bin_end,value}=row;
    return {bin_start,bin_end,value,series:name,_seriesKey:series.key};
  });
  if(stacked)p.series.sort((a,b)=>a.stackOrder-b.stackOrder);
  const errors=validate(p).filter(i=>i.severity==='error');
  if(errors.length)throw Error(errors.map(i=>i.message).join('\n'));
  return restoreHistogramBins(p);
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
  const fields=isPie(p)?['category','value']:['category',...BOX_FIELDS];
  const spec={data:{values:p.rows.map(r=>Object.fromEntries(fields.map(k=>[k,copy(r[k])])) )}};
  if(present(p.title))spec.title=copy(p.title);
  if(isPie(p)){
    const metricTitle=pieMetricTitle(p.valueTitle);
    spec.mark={type:'arc'};
    spec.encoding={theta:{field:'value',type:'quantitative',...(present(metricTitle)?{title:copy(metricTitle)}:{})},
      color:{field:'category',type:'nominal',...(present(p.pieColorTitle)?{title:copy(p.pieColorTitle)}:{})}};
  }else{
    const v=valueAxis(p),c=v==='x'?'y':'x',title=p[v+'Title'];
    const format=boxAxisFormat({format:p.valueFormat});
    const position={field:'lower',type:'quantitative',...(present(title)?{title:copy(title)}:{}),...(format?{axis:{format}}:{})};
    if(p.axes[v].type==='log')position.scale={type:'log'};
    spec.encoding={[c]:{field:'category',type:'nominal',sort:null,...(present(p[c+'Title'])?{title:copy(p[c+'Title'])}:{})}};
    spec.layer=[
      {mark:{type:'rule'},encoding:{[v]:position,[v+'2']:{field:'upper'}}},
      {mark:{type:'bar'},encoding:{[v]:{field:'q1',type:'quantitative'},[v+'2']:{field:'q3'}}},
      {mark:{type:'tick'},encoding:{[v]:{field:'median',type:'quantitative'}}},
      {data:{values:p.rows.flatMap(r=>r.outliers.map(value=>({category:r.category,value})))},mark:{type:'point'},encoding:{[v]:{field:'value',type:'quantitative'}}}
    ];
  }
  return spec;
}
function importStatSpec(s){
  if(s.transform||s.concat||s.hconcat||s.vconcat||s.facet||s.repeat||s.usermeta?.semantic)throw Error('请使用内联数据的 Pie / 预计算 Box Plot Compact GT');
  const pie=markType(s.mark)==='arc',layers=s.layer||[],enc=s.encoding||{};
  const v=boxValueChannel(enc),horizontal=v==='x',c=horizontal?'y':'x';
  const p=defaultProject(pie?'pie':horizontal?'boxplot_h':'boxplot_v');
  const title=d=>d?.title??d?.axis?.title??'';
  const checkDef=d=>{if(!d||typeof d.field!=='string'||d.aggregate||d.bin||d.timeUnit||d.condition||d.datum!==undefined||d.value!==undefined||d.sort!=null)throw Error('只支持无统计变换和显式排序的字段映射');};
  let mapping;
  if(pie){
    if(s.layer||!enc.theta||!enc.color||Object.keys(enc).some(k=>!['theta','color'].includes(k)))throw Error('Pie 需要 theta 数值和 color 类别映射');
    checkDef(enc.theta);checkDef(enc.color);
    if(enc.theta.type!=='quantitative'||!['nominal','ordinal'].includes(enc.color.type))throw Error('Pie 字段类型不正确');
    mapping={category:enc.color.field,value:enc.theta.field};
    p.valueTitle=pieMetricTitle(title(enc.theta));p.valueMode='absolute';p.donut=!!s.mark?.innerRadius;
    if(present(enc.color.title))p.pieColorTitle=copy(enc.color.title);
  }else if(layers.some(l=>markType(l.mark)==='point'&&Array.isArray(l.data?.values))){
    if(layers.some(l=>l.transform||l.layer)||layers.some(l=>l.data&&markType(l.mark)!=='point'))throw Error('独立离群点表必须直接绑定到点层');
    const points=layers.filter(l=>markType(l.mark)==='point'),rules=layers.filter(l=>markType(l.mark)==='rule'),
      bars=layers.filter(l=>markType(l.mark)==='bar'),ticks=layers.filter(l=>markType(l.mark)==='tick');
    if(points.length!==1||bars.length!==1||!rules.length||!ticks.length||layers.length!==points.length+bars.length+rules.length+ticks.length)throw Error('箱线图缺少明确的五数统计或离群点映射');
    const limits=bars[0].encoding,q1=limits[v]?.field,q3=limits[v+'2']?.field;
    const ends=rules.map(l=>[l.encoding[v]?.field,l.encoding[v+'2']?.field]);
    const lower=ends.length===1?ends[0][0]:ends.find(pair=>pair[1]===q1)?.[0];
    const upper=ends.length===1?ends[0][1]:ends.find(pair=>pair[0]===q3)?.[1];
    const medians=ticks.map(l=>l.encoding[v]?.field).filter(field=>field!==lower&&field!==upper);
    if(medians.length!==1)throw Error('箱线图中位数映射不明确');
    mapping={category:enc[c]?.field,lower,q1,median:medians[0],q3,upper};
    const layer=points[0],pointCategory=(layer.encoding[c]??enc[c]).field,pointValue=layer.encoding[v].field;
    const groups=new Map(s.data.values.map(r=>[r[mapping.category],[]]));
    for(const observation of layer.data.values){
      if(!groups.has(observation[pointCategory])||!finite(observation[pointValue]))throw Error('离群点类别或数值无效');
      groups.get(observation[pointCategory]).push(observation[pointValue]);
    }
    const pos=rules[0].encoding[v];
    p[v+'Title']=pos.axis?.title??title(pos);p[c+'Title']=title(enc[c]);p.valueFormat=boxAxisFormat(pos.axis)??'';
    p.axes[v].type=pos.scale?.type??'linear';
    p.rows=s.data.values.map(r=>({...Object.fromEntries(Object.entries(mapping).map(([k,f])=>[k,r[f]])),outliers:groups.get(r[mapping.category])}));
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
    mapping.outliers=flat.flatten[0];p[v+'Title']=pos.axis?.title??title(pos);p[c+'Title']=title(enc[c]);p.valueFormat=boxAxisFormat(pos.axis)??'';
    const scale=pos.scale;
    if(scale?.type&&!['linear','log'].includes(scale.type))throw Error('仅支持线性和对数数值轴');
    p.axes[v].type=scale?.type??'linear';if(p.axes[v].type==='log')p.axes[v].v1=1;
  }
  if(Object.values(mapping).some(k=>typeof k!=='string'))throw Error('统计字段映射不完整');
  p.title=typeof s.title==='object'&&!Array.isArray(s.title)?s.title.text??'':s.title??'';
  if(!p.rows.length)p.rows=s.data.values.map(r=>Object.fromEntries(Object.entries(mapping).map(([k,f])=>[k,copy(r[f]===undefined?null:r[f])])));
  p.categories=p.rows.map(r=>r.category);delete p.categoryObjects;ensureIdentities(p);
  const errors=validate(p).filter(i=>i.severity==='error');if(errors.length)throw Error(errors.map(i=>i.message).join('\n'));
  return p;
}

// Composite projects share the same category/series objects, evidence and editors.
// Each role delegates scientific validation and path ordering to an existing chart.
function compositePart(p,role){
  const part=copy(p);part.series=part.series.filter(s=>s.role===role);
  const keys=new Set(part.series.map(s=>s.key));
  part.rows=part.rows.filter(r=>keys.has(identity(r)));
  part.kind=role==='bar'?(part.series.length>1?'barv_n':'barv_1'):(part.series.length>1?'line_n':'line_1');
  part.errorBars=role==='bar'&&!!p.errorBars;part.xType='ordinal';
  if(role==='line'){
    part.rows=part.rows.map(r=>{const row={...r,x:r.category,y:r.value};delete row.category;delete row.value;return row;});
    if(p.dualYAxis){part.axes.y=copy(p.axes.r);part.yTitle=p.rightYTitle;}
  }
  return part;
}
function validateComposite(p){
  const issues=[],error=message=>issues.push({severity:'error',message});
  if(typeof p.dualYAxis!=='boolean')error('请选择共享或独立 Y 轴');
  if(p.dualYAxis&&!p.axes?.r){error('双 Y 轴缺少右轴校准配置');return issues;}
  if(p.rightYTitle!==undefined&&typeof p.rightYTitle!=='string'&&!(Array.isArray(p.rightYTitle)&&p.rightYTitle.every(v=>typeof v==='string')))error('右轴标题需要文字');
  for(const axis of requiredAxes(p))if(!['linear','log'].includes(p.axes?.[axis]?.type))error('复合数值轴只支持线性或对数');
  if(p.series.some(s=>!['bar','line'].includes(s.role)))error('每个系列必须选择柱或线');
  for(const role of ['bar','line']){
    const part=compositePart(p,role);
    if(!part.series.length){error('复合图至少需要一个'+(role==='bar'?'柱':'折线')+'系列');continue;}
    if(!part.rows.length){error((role==='bar'?'柱':'折线')+'系列至少需要一条记录');continue;}
    for(const issue of validate(part))issues.push({...issue,message:(role==='bar'?'柱：':'折线：')+issue.message});
  }
  for(const row of p.rows){
    const role=compositeRole(p,identity(row));
    if(role==='line'&&['lower','upper','start','end','stack_order'].some(k=>present(row[k])))error('折线记录不能包含柱误差或堆叠字段');
    if(role==='bar'&&present(row.path_order))error('柱记录不能包含折线路径顺序');
  }
  return issues;
}
function makeCompositeSpec(input){
  const p=ensureIdentities(copy(input)),errors=validateComposite(p).filter(i=>i.severity==='error');
  if(errors.length)throw Error(errors.map(i=>i.message).join('\n'));
  const categories=p.categoryObjects.filter(c=>p.rows.some(r=>categoryIdentity(r)===c.key));
  const parts=Object.fromEntries(['bar','line'].map(role=>[role,compositePart(p,role)]));
  const ordered={bar:orderedRows(parts.bar),line:orderedRows(parts.line,true)};
  const seriesKeys=unique([...ordered.bar,...ordered.line].map(identity));
  const duplicateCategory=unique(categories.map(c=>c.name)).length!==categories.length;
  const duplicateSeries=p.legend&&unique(seriesKeys.map(k=>seriesName(p,k))).length!==seriesKeys.length;
  const categoryID=key=>'C'+(categories.findIndex(c=>c.key===key)+1);
  const seriesLabel=key=>p.legend?seriesName(p,key):'Series '+(seriesKeys.indexOf(key)+1);
  const seriesID=key=>'S'+(seriesKeys.indexOf(key)+1);
  const rows=['bar','line'].flatMap(role=>ordered[role].map(r=>{
    const row={category:categoryName(p,categoryIdentity(r)),...(duplicateCategory?{category_id:categoryID(categoryIdentity(r))}:{}),value:role==='bar'?r.value:r.y};
    for(const key of role==='bar'?['lower','upper']:['path_order'])if(present(r[key]))row[key]=r[key];
    row.series_role=role;row.series=seriesLabel(identity(r));if(duplicateSeries)row.series_id=seriesID(identity(r));return row;
  }));
  const field=duplicateSeries?'series_id':'series';
  const x={field:duplicateCategory?'category_id':'category',type:'nominal',sort:null,...(present(p.xTitle)?{title:copy(p.xTitle)}:{})};
  const y=(axis,title)=>{const calibration=p.axes[axis],reverse=!!calibration.reverse||calibration.calibrated&&(calibration.v2-calibration.v1)/(calibration.p2-calibration.p1)>0;return {field:'value',type:'quantitative',...(present(title)?{title:copy(title)}:{}),...(calibration.type==='log'||reverse?{scale:{...(calibration.type==='log'?{type:'log'}:{}),...(reverse?{reverse:true}:{})}}:{})};};
  const color={field,type:'nominal',sort:null,...(!p.legend?{legend:null}:{})};
  const barKeys=seriesKeys.filter(key=>compositeRole(p,key)==='bar');
  const offset=barKeys.length>1?{field,type:'nominal',sort:null,scale:{domain:barKeys.map(key=>duplicateSeries?seriesID(key):seriesLabel(key))}}:null;
  const barRows=rows.filter(r=>r.series_role==='bar'),lineRows=rows.filter(r=>r.series_role==='line');
  const bars=[{mark:{type:'bar'},...(offset?{encoding:{xOffset:copy(offset)}}:{})}];
  if(rows.some(r=>r.series_role==='bar'&&present(r.lower)))bars.push({mark:{type:'errorbar'},encoding:orderEncoding({y:{field:'lower',type:'quantitative'},y2:{field:'upper'},...(offset?{xOffset:copy(offset)}:{})})});
  const lineGT=baseSpec(parts.line),lineMark=copy(lineGT.mark);
  const line={data:{values:lineRows},mark:lineMark};
  const overrides={};if(p.dualYAxis)overrides.y={...y('r',p.rightYTitle),scale:{...y('r',p.rightYTitle).scale,type:p.axes.r.type}};
  if(JSON.stringify(unique(rows.map(r=>r.category_id??r.category)))!==JSON.stringify(categories.map(c=>duplicateCategory?categoryID(c.key):c.name)))x.sort=categories.map(c=>duplicateCategory?categoryID(c.key):c.name);
  if(rows.some(r=>r.series_role==='line'&&present(r.path_order))){overrides.order={field:'path_order',type:'quantitative'};x.sort=categories.map(c=>duplicateCategory?categoryID(c.key):c.name);}
  if(Object.keys(overrides).length)line.encoding=orderEncoding(overrides);
  const out={...(present(p.title)?{title:copy(p.title)}:{}),data:{values:barRows},encoding:{x,y:y('y',p.yTitle),color}};
  if(p.dualYAxis){out.layer=[{layer:bars},line];out.resolve={scale:{y:'independent'}};}
  else out.layer=[...bars,line];
  return out;
}
function importCompositeSpec(input){
  const s=copy(input),allowed=new Set(['$schema','title','data','encoding','layer','resolve']);
  if(Object.keys(s).some(k=>!allowed.has(k))||!Array.isArray(s.data?.values)||!s.data.values.length||!Array.isArray(s.layer))throw Error('仅支持内联柱线复合精简 GT');
  const enc=s.encoding||{},lineNode=s.layer.find(l=>markType(l.mark)==='line');
  const separate=Array.isArray(lineNode?.data?.values);
  const rows=separate?[...s.data.values,...lineNode.data.values]:s.data.values;
  if(separate&&(s.data.values.some(r=>r.series_role!=='bar')||lineNode.data.values.some(r=>r.series_role!=='line')))throw Error('柱线层与数据角色不符');
  if(!['category','category_id','category_instance'].includes(enc.x?.field)||!['nominal','ordinal'].includes(enc.x?.type)||enc.y?.field!=='value'||enc.y?.type!=='quantitative'||!['series','series_id','series_instance'].includes(enc.color?.field))throw Error('复合图必须映射 category/value 和 series');
  if(Object.keys(enc).some(k=>!['x','y','color'].includes(k)))throw Error('复合图含不支持的共享编码');
  const dual=!!s.resolve;
  if(dual&&JSON.stringify(s.resolve)!==JSON.stringify({scale:{y:'independent'}}))throw Error('仅支持独立 Y 轴');
  const bars=[],lines=[];
  function visit(node,inheritedRole){
    if(Object.keys(node).some(k=>!['transform','layer','mark','encoding',...(separate&&node===lineNode?['data']:[])].includes(k)))throw Error('复合图层包含未知配置');
    let role=separate?(node===lineNode?'line':'bar'):inheritedRole;
    if(separate&&node.transform)throw Error('独立柱线表不能包含 transform');
    if(node.transform){const f=node.transform;if(f.length!==1||f[0].filter?.field!=='series_role'||!['bar','line'].includes(f[0].filter.equal)||Object.keys(f[0]).length!==1||Object.keys(f[0].filter).length!==2)throw Error('复合图只接受明确的 series_role 筛选');role=f[0].filter.equal;}
    if(node.layer){if(role!=='bar'||node.mark||node.encoding||!Array.isArray(node.layer))throw Error('仅柱和误差棒可共用嵌套轴');for(const child of node.layer)visit(child,role);return;}
    const type=markType(node.mark);if(role==='bar'&&['bar','rule','errorbar'].includes(type))bars.push(node);else if(role==='line'&&type==='line')lines.push(node);else throw Error('图层角色与标记不匹配');
    if(typeof node.mark==='object'&&Object.keys(node.mark).some(k=>!['type','point','order'].includes(k)))throw Error('请导入精简标记');
    const encoding=node.encoding||{},keys=Object.keys(encoding);
    if(keys.some(k=>!(role==='line'?['y','order']:type==='bar'?['xOffset']:['xOffset','y','y2']).includes(k)))throw Error('图层编码无法无损导入');
    if(type==='line'&&encoding.y&&encoding.y.field!=='value'||['rule','errorbar'].includes(type)&&(encoding.y?.field!=='lower'||encoding.y2?.field!=='upper'))throw Error('复合图数值映射不匹配');
  }
  for(const layer of s.layer)visit(layer);
  if(lines.length!==1||bars.filter(l=>markType(l.mark)==='bar').length!==1||bars.length>2)throw Error('需要一个柱层、一个折线层及可选误差层');
  const barLayer=bars.find(l=>markType(l.mark)==='bar');
  for(const def of [enc.x,enc.y,enc.color,...bars.flatMap(l=>Object.values(l.encoding||{})),...Object.values(lines[0].encoding||{})]){
    if(!def||Object.keys(def).some(k=>!['field','type','title','sort','scale','legend','axis'].includes(k))||def.axis?.labelExpr||def.legend?.labelExpr)throw Error('复合图包含不支持的编码属性');
    if(def.scale?.type&&!['linear','log'].includes(def.scale.type)||def.scale&&Object.keys(def.scale).some(k=>!['type','domain','reverse'].includes(k)))throw Error('复合图只支持线性和对数尺度');
    if(def.scale?.domain&&!bars.some(layer=>layer.encoding?.xOffset===def))throw Error('数值域不属于精简 GT');
  }
  if(enc.y.sort!=null||enc.color.sort!=null)throw Error('不支持值轴或系列排序');
  const seriesField=enc.color.field;
  const barIDs=unique(rows.filter(r=>r.series_role==='bar').map(r=>r[seriesField]));
  if(barIDs.length>1&&!barLayer.encoding?.xOffset)throw Error('多柱系列需明确分组 offset，不将重叠柱猜成分组');
  for(const layer of bars){
    const offset=layer.encoding?.xOffset;
    if(offset&&(offset.field!==seriesField||offset.type!=='nominal'||offset.sort!=null||offset.scale?.domain&&(offset.scale.domain.length!==barIDs.length||barIDs.some((key,i)=>offset.scale.domain[i]!==key))))throw Error('柱分组必须与系列身份一致');
  }
  const lineEncoding=lines[0].encoding||{};
  if(lineEncoding.order&&(lineEncoding.order.field!=='path_order'||lineEncoding.order.type!=='quantitative'))throw Error('折线顺序只绑定 path_order');
  if(lineEncoding.y&&!dual)throw Error('共享轴不接受单独的折线值轴覆盖');
  if(dual&&(s.layer.length!==2||!s.layer[0].layer||s.layer[1]!==lines[0]))throw Error('双轴需要柱与误差层共用左轴，折线独立右轴');
  const p=defaultProject('barline_n');p.rows=[];p.series=[];delete p.categoryObjects;p.categories=[];
  p.title=typeof s.title==='object'&&!Array.isArray(s.title)?s.title.text??'':s.title??'';
  p.xTitle=enc.x.title??'';p.yTitle=enc.y.title??'';p.rightYTitle=lines[0].encoding?.y?.title??p.yTitle;p.dualYAxis=dual;p.legend=enc.color.legend!==null;
  p.axes.y.type=enc.y.scale?.type??'linear';p.axes.y.reverse=!!enc.y.scale?.reverse;p.axes.r.reverse=!!lines[0].encoding?.y?.scale?.reverse;p.axes.r.type=lines[0].encoding?.y?.scale?.type??(dual?'linear':p.axes.y.type);
  const fields=new Set(['category','category_id','category_instance','value','lower','upper','path_order','series_role','series','series_id','series_instance']);
  const series=new Map();
  for(const r of rows){
    if(!r||Object.keys(r).some(k=>!fields.has(k))||!['bar','line'].includes(r.series_role))throw Error('复合图包含未知科学字段或角色');
    const key=r[enc.color.field];if(!present(key))throw Error('系列身份缺失');
    if(series.has(key)&&series.get(key).role!==r.series_role)throw Error('同一系列不能同时为柱和线');
    if(!series.has(key))series.set(key,{name:r.series??key,role:r.series_role,color:SERIES_COLORS[series.size%SERIES_COLORS.length]});
    p.rows.push({...r});
  }
  p.series=[...series.values()];ensureIdentities(p);
  // Identity restoration may rebuild series objects; role belongs to the stable object.
  for(const obj of p.series){const row=p.rows.find(r=>identity(r)===obj.key);obj.role=row.series_role;}
  if(Array.isArray(enc.x.sort)){
    const keys=enc.x.sort;if(keys.length!==p.categoryObjects.length||new Set(keys).size!==keys.length)throw Error('类别顺序必须覆盖所有位置');
    const lookup=new Map(rows.map((r,i)=>[r[enc.x.field],categoryIdentity(p.rows[i])]));
    if(keys.some(k=>!lookup.has(k)))throw Error('类别顺序包含未知位置');p.categoryObjects.sort((a,b)=>keys.indexOf([...lookup].find(([,v])=>v===a.key)?.[0])-keys.indexOf([...lookup].find(([,v])=>v===b.key)?.[0]));
  }else if(enc.x.sort!=null)throw Error('不支持复合类别排序');
  for(const row of p.rows)delete row.series_role;
  p.errorBars=bars.some(l=>['rule','errorbar'].includes(markType(l.mark)));
  const errors=validate(p).filter(i=>i.severity==='error');if(errors.length)throw Error(errors.map(i=>i.message).join('\n'));return p;
}

function requiredAxes(p){if(isHeatmap(p))return heatmapAxes.filter(axis=>heatmapContinuous(p,axis));if(isComposite(p))return p.dualYAxis?['y','r']:['y'];if(isLine(p))return ['x','y'].filter(axis=>axis!==lineCategoryAxis(p));return isPie(p)?[]:isHistogram(p)?['x','y']:isBar(p)||isBox(p)?[valueAxis(p)]:isNominalArea(p)||!isArea(p)&&p.xType==='ordinal'?['y']:['x','y'];}

function percentStackCalibration(project,category){
  const axis=valueAxis(project);
  // Reading older projects still uses their recorded calibration until the category is measured again.
  if(usesPercentBarLength(project,category)){
    const bounds=project.percentStackBars?.[category],p1=bounds?.start?.[axis],p2=bounds?.end?.[axis];
    if(finite(p1)&&finite(p2)&&(axis==='x'?p2>p1:p2<p1))return {p1,p2,v1:0,v2:100,type:'linear'};
  }
  const calibration=project.axes[axis];
  return calibration.calibrated?calibration:null;
}

function percentStackMeasurement(project,row,evidence,numericAxis=false){
  const axis=valueAxis(project),calibration=numericAxis?project.axes[axis]:percentStackCalibration(project,categoryIdentity(row));
  const coordinate=(field,pixel)=>{
    if(!pixel)return row[field];
    if(!calibration||numericAxis&&!calibration.calibrated||!finite(pixel[axis]))return null;
    try{return pixelToValue(pixel[axis],calibration);}catch{return null;}
  };
  const start=coordinate('start',evidence?.startPixel),end=coordinate('end',evidence?.pixel);
  const uncertainty=(finite(start)&&evidence?.startPixel?axisUncertainty(start,calibration):0)+
    (finite(end)&&evidence?.pixel?axisUncertainty(end,calibration):0);
  return {start,end,difference:finite(start)&&finite(end)?Math.abs(decimalDifference(end,start)):null,uncertainty};
}

const positiveHeight=value=>finite(value)&&value>0;
const percentStackHeightSelected=(project,category)=>project.percentStackCategoryHeights?.[category]?.selected===true;
const firstPercentStackHeightCategory=project=>project.categoryObjects.find(c=>percentStackHeightSelected(project,c.key))?.key;
function percentStackHeightSource(project,category,first){
  if(!percentStackHeightSelected(project,category))return null;
  return project.percentStackSharedHeight?first:category;
}
function percentStackHeightFromPoints(project,start,end){
  const axis=valueAxis(project),calibration=project.axes[axis];
  if(!calibration.calibrated||!finite(start?.[axis])||!finite(end?.[axis]))return null;
  try{
    const height=Math.abs(pixelToValue(end[axis],calibration)-pixelToValue(start[axis],calibration));
    return positiveHeight(height)?height:null;
  }catch{return null;}
}
function recordedPercentStackHeight(project,category){
  const record=project.percentStackCategoryHeights?.[category];
  if(positiveHeight(record?.value))return record.value;
  return percentStackHeightFromPoints(project,record?.startPixel,record?.endPixel);
}
function percentStackRatioData(project){
  const groups=new Map(),first=firstPercentStackHeightCategory(project);
  const segments=project.rows.map((row,i)=>{
    const category=categoryIdentity(row),evidence=project.evidence?.[i];
    const {difference,uncertainty}=percentStackMeasurement(project,row,evidence);
    if(!groups.has(category)){
      const source=percentStackHeightSource(project,category,first);
      const height=source===null?null:recordedPercentStackHeight(project,source);
      groups.set(category,{height,total:0,complete:true,automatic:false});
    }
    const group=groups.get(category);
    // Older projects can contain a height for an individual segment.
    const segment=group.height===null?(present(row.height)?row.height:difference):
      usesPercentBarLength(project,category)?percentStackMeasurement(project,row,evidence,true).difference:difference;
    if(validPercent(segment))group.total+=segment;
    else group.complete=false;
    if(!evidence?.valueOverride)group.automatic=true;
    return {segment,uncertainty};
  });
  return {segments,groups};
}

const validPercentStackRatioTotal=group=>group.height!==null||group.complete&&positiveHeight(group.total);
function syncPercentStackRatios(project){
  if(project.precisionVersion!==1)return;
  const {segments,groups}=percentStackRatioData(project);
  for(const [i,row] of project.rows.entries()){
    const {segment,uncertainty}=segments[i],category=categoryIdentity(row);
    row.difference=finite(row.start)&&finite(row.end)?Math.abs(decimalDifference(row.end,row.start)):null;
    if(!usesPercentStackRatio(project,category)||project.evidence?.[i]?.valueOverride)continue;
    const group=groups.get(category);
    row.value=validPercent(segment)&&validPercentStackRatioTotal(group)?
      measuredNumber(segment/(group.height??group.total)*100,uncertainty/(group.height??group.total)*100):null;
  }
}
function hasRows(p){
  return p.rows.length>0||isArea(p)&&Object.values(p.areaModes??{}).some(mode=>mode.rows.length>0)||
    isLine(p)&&Object.values(p.lineModes??{}).some(mode=>mode.rows.length>0)||
    isPercentStack(p)&&Object.values(p.percentStackCategoryHeights??{}).some(record=>positiveHeight(record?.value)||record?.startPixel&&record.endPixel)||
    isHistogram(p)&&!!(p.histogramRun||p.histogramBins?.length)||
    isHeatmap(p)&&!!(p.heatmap.x.length||p.heatmap.y.length||p.heatmap.colorPoints.length);
}
const AREA_MODE_FIELDS=['rows','evidence','categoryObjects','series','axes','assist','title','xTitle','yTitle',
  'percentLabels','percentGuides','percentExact'];
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
const LINE_MODE_FIELDS=[...AREA_MODE_FIELDS,'legend'];
const lineMode=p=>lineCategoryAxis(p)??'quantitative';
const lineModeData=p=>Object.fromEntries(LINE_MODE_FIELDS.map(key=>[key,p[key]]));
function switchLineMode(p,next){
  const current=lineMode(p);
  if(current===next)return;
  p.lineModes??={};
  const active=p.lineModes[next]??{rows:[],evidence:[],categoryObjects:[],series:copy(p.series),
    axes:defaultProject(p.kind).axes,title:p.title,xTitle:p.xTitle,yTitle:p.yTitle,legend:p.legend};
  p.lineModes[current]=lineModeData(p);
  delete p.lineModes[next];
  for(const key of LINE_MODE_FIELDS)p[key]=active[key];
  p.xType=next==='x'?'nominal':'quantitative';
  p.yType=next==='y'?'nominal':'quantitative';
  ensureIdentities(p);
}
function keepOtherLineModes(p,next){
  if(!isLine(next)||next.kind!==p.kind)return;
  next.lineModes={...p.lineModes};
  if(lineMode(p)!==lineMode(next))next.lineModes[lineMode(p)]=lineModeData(p);
  delete next.lineModes[lineMode(next)];
}
function appendLinePathRank(p,row){
  if(!p.rows.every(r=>finite(r.path_order)))return;
  const last=p.rows.reduce((rank,r)=>identity(r)===identity(row)?Math.max(rank,r.path_order):rank,-1);
  row.path_order=last+1;
}
function hasErrors(p){return !!p.errorBars||isBar(p)&&p.rows.some(r=>present(r.lower)||present(r.upper));}
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
// ZIP stored entries with UTF-8 names: a single download, no runtime dependencies.
function zipBytes(entries){const encoder=new TextEncoder(),parts=[],directory=[];let offset=0;
for(const entry of entries){const name=encoder.encode(entry.name),data=encoder.encode(entry.text),crc=crc32(data);if(name.length>65535||data.length>0xffffffff)throw Error('ZIP 条目过大');const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);local.set(name,30);const central=new Uint8Array(46+name.length),c=new DataView(central.buffer);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x0800,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46);parts.push(local,data);directory.push(central);offset+=local.length+data.length;}
if(entries.length>65535||offset>0xffffffff)throw Error('ZIP 超过容量限制，请拆分项目');const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);const out=new Uint8Array(offset+size+22);let at=0;for(const b of [...parts,...directory,end]){out.set(b,at);at+=b.length;}return out;}
function safeExportName(name){return String(name||'chart').replace(/\\/g,'/').split('/').filter(v=>v&&v!=='.'&&v!=='..').map(v=>v.replace(/[<>:"|?*\u0000-\u001f]/g,'_')).join('/').replace(/\.[^/.]+$/,'')+'.gt.json';}

// Heatmap coordinates belong to grid bands. A cell stores two stable keys and a value.
const heatmapAxes=['x','y'];
const heatmapContinuous=(p,axis)=>p.kind==='heatmap_cc'||p.kind==='heatmap_'+(axis==='x'?'cd':'dc');
const heatmapCellKey=(x,y)=>JSON.stringify([x,y]);
const heatmapId=(axis,index)=>axis.toUpperCase()+(index+1);
const heatmapTitle=value=>typeof value==='string'||Array.isArray(value)&&value.length>0&&value.every(v=>typeof v==='string');
const heatmapLabel=value=>typeof value==='string'&&value.trim()!==''||finite(value);
const heatmapValueToken=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

function checkHeatmapSize(x,y) {
  if(![x,y].every(n=>Number.isInteger(n)&&n>=0&&n<=1000)||x*y>10000)
    throw Error('热力图每轴最多 1000 个位置，网格最多 10000 格');
}

function heatmapIdIndex(id,axis) {
  if(typeof id!=='string'||!new RegExp('^'+axis.toUpperCase()+'[1-9][0-9]*$').test(id))
    throw Error('热力图需要按视觉位置编号的 '+axis+'_id，如 '+heatmapId(axis,0));
  const index=Number(id.slice(1))-1;
  checkHeatmapSize(index+1,1);
  return index;
}

function newHeatmapBand(p,axis) {
  return {key:newKey(axis),...(heatmapContinuous(p,axis)?{start:null,end:null,fromPixels:true}:{label:''})};
}

function heatmapPixelBoundaries(p,axis) {
  const pixels=[...p.heatmap.pixels[axis]];
  let previous=-1;
  for(let i=0;i<pixels.length;i++){
    if(!finite(pixels[i]))continue;
    if(previous>=0&&pixels[i]>pixels[previous]){
      const step=(pixels[i]-pixels[previous])/(i-previous);
      for(let j=previous+1;j<i;j++)pixels[j]=pixels[previous]+step*(j-previous);
    }
    previous=i;
  }
  return pixels;
}

function heatmapAxisCalibration(p,axis) {
  const calibration=p.axes[axis];
  const pixels=p.heatmap.pixels[axis],p1=pixels[0],p2=pixels.at(-1);
  return !finite(calibration.p1)&&!finite(calibration.p2)&&finite(p1)&&finite(p2)&&p1<p2?
    {...calibration,p1,p2}:calibration;
}

function validHeatmapCalibration(calibration) {
  try{axisTransform(calibration);return true;}
  catch{return false;}
}

function heatmapIntervals(p,axis) {
  const calibration=heatmapAxisCalibration(p,axis),pixels=heatmapPixelBoundaries(p,axis);
  const values=validHeatmapCalibration(calibration)?
    pixels.map(pixel=>!finite(pixel)?null:p.precisionVersion===1?measuredAxisValue(pixel,calibration):Number(pixelToValue(pixel,calibration).toFixed(2))):[];
  return p.heatmap[axis].map((band,i)=>{
    if(!band.fromPixels)return [band.start,band.end];
    const start=values[i],end=values[i+1];
    return finite(start)&&finite(end)&&pixels[i]<pixels[i+1]?[Math.min(start,end),Math.max(start,end)]:[null,null];
  });
}

function heatmapRecords(p) {
  return new Map(p.rows.map((row,i)=>[heatmapCellKey(row._xKey,row._yKey),{row,evidence:p.evidence?.[i],index:i}]));
}

function checkHeatmapProject(p) {
  const h=p.heatmap;
  if(!h||!heatmapAxes.every(a=>Array.isArray(h[a])&&Array.isArray(h.pixels?.[a])&&h.pixels[a].length===h[a].length+1)||
      !Array.isArray(h.colorPoints)||!Array.isArray(p.rows))throw Error('热力图工程结构不完整');
  checkHeatmapSize(h.x.length,h.y.length);
  const ids={};
  for(const axis of heatmapAxes){
    ids[axis]=new Set(h[axis].map(b=>b?.key));
    if(ids[axis].size!==h[axis].length||[...ids[axis]].some(k=>typeof k!=='string'||!k))
      throw Error('热力图行列对象身份无效或重复');
    if(h.pixels[axis].some(v=>v!==null&&(!finite(v)||v<0)))throw Error('热力图像素边界无效');
  }
  if(h.colorPoints.length>64||h.colorPoints.some(q=>!finite(q?.x)||!finite(q.y)||q.value!==null&&!finite(q.value)))
    throw Error('热力图色标校准点无效');
  if(p.evidence!==undefined&&(!Array.isArray(p.evidence)||p.evidence.length!==p.rows.length))
    throw Error('热力图像素证据与单元格记录不一致');
  if(p.rows.some(r=>!ids.x.has(r?._xKey)||!ids.y.has(r?._yKey))||heatmapRecords(p).size!==p.rows.length)
    throw Error('热力图单元格引用无效或重复');
  return p;
}

function validateHeatmap(p) {
  const out=[];
  const issue=(severity,message)=>out.push({severity,message});
  try{checkHeatmapProject(p);}catch(e){return [{severity:'error',message:e.message}];}
  for(const title of ['title','xTitle','yTitle','heatmapTitle'])
    if(present(p[title])&&!heatmapTitle(p[title]))issue('error',title+' 需要文字或非空文字数组');
  const rows=p.rows.filter(r=>Object.hasOwn(r,'value'));
  if(!rows.length)issue('error','至少录入一个热力图数值或显式缺测（null）');
  if(rows.some(r=>r.value!==null&&!finite(r.value)))issue('error','热力图格值必须是有限数字或 null');
  for(const axis of heatmapAxes){
    const name=axis.toUpperCase(),used=new Set(rows.map(r=>r['_'+axis+'Key']));
    let previous, direction=0, incomplete=0, collapsed=0, unordered=false, overlap=false;
    const bands=p.heatmap[axis],continuous=heatmapContinuous(p,axis);
    const intervals=continuous?heatmapIntervals(p,axis):[];
    for(const [i,band] of bands.entries()){
      if(!used.has(band.key))continue;
      if(!continuous){
        if(!heatmapLabel(band.label))incomplete++;
        continue;
      }
      const interval=intervals[i];
      if(band.fromPixels&&finite(interval[0])&&interval[0]===interval[1]){collapsed++;continue;}
      if(!interval.every(finite)||interval[0]>=interval[1]){incomplete++;continue;}
      if(previous){
        const step=Math.sign(interval[0]-previous[0]);
        const tolerance=Math.max(...interval.map(Math.abs),...previous.map(Math.abs))*Number.EPSILON*8;
        if(step===0||(step>0?previous[1]-interval[0]:interval[1]-previous[0])>tolerance)overlap=true;
        if(direction&&step!==direction)unordered=true;
        direction=step;
      }
      previous=interval;
    }
    if(incomplete)issue('error',name+' 轴有 '+incomplete+(heatmapContinuous(p,axis)?' 个已使用区间缺少有效的起止值（起点须小于终点）':' 个已使用位置未填写原始标签'));
    if(collapsed)issue('error',name+' 轴有 '+collapsed+' 个自动区间在当前图像精度下起止值相同，请手填更高精度的起止值');
    if(overlap||unordered)issue('error',name+' 轴区间不能重叠，须按视觉方向递增或递减排列');
    if(rows.length&&used.size<bands.length)issue('warning',name+' 轴有整行或整列没有 GT 记录；可将其中一格标为缺测以保留该位置的标签或区间');
    const pixels=p.heatmap.pixels[axis].filter(finite);
    if(pixels.some((v,i)=>i>0&&v<=pixels[i-1]))issue('warning',name+' 轴像素边界须从左到右或从上到下排列');
  }
  const unconfirmed=p.evidence?.filter(e=>e?.source==='heatmap_color'&&e.warning&&!e.accepted).length??0;
  if(unconfirmed)issue('warning',unconfirmed+' 格色标估值待核对，未采用的估值不会进入 GT');
  const signature=JSON.stringify(p.heatmap.colorPoints);
  if(p.evidence?.some(e=>e?.source==='heatmap_color'&&e.calibration!==signature))
    issue('warning','色标校准已改动，请复核现有估值或重新测量');
  validateAxes(p,issue);
  return out;
}

function makeHeatmapSpec(p) {
  const records=heatmapRecords(p),values=[];
  const coordinates=axis=>heatmapContinuous(p,axis)?heatmapIntervals(p,axis):p.heatmap[axis].map(band=>[band.label]);
  const x=coordinates('x'),y=coordinates('y');
  for(const [j,yBand] of p.heatmap.y.entries())for(const [i,xBand] of p.heatmap.x.entries()){
    const record=records.get(heatmapCellKey(xBand.key,yBand.key))?.row;
    if(!record||!Object.hasOwn(record,'value'))continue;
    values.push({
      x:x[i][0],x_id:heatmapId('x',i),...(x[i].length===2?{x2:x[i][1]}:{}),
      y:y[j][0],y_id:heatmapId('y',j),...(y[j].length===2?{y2:y[j][1]}:{}),value:record.value
    });
  }
  const encoding={};
  for(const axis of heatmapAxes){
    const continuous=heatmapContinuous(p,axis),title=p[axis+'Title'];
    encoding[axis]=continuous?{field:axis,type:'quantitative'}:{field:axis+'_id',type:'ordinal',sort:null};
    if(present(title))encoding[axis].title=copy(title);
    if(continuous)encoding[axis+'2']={field:axis+'2'};
  }
  encoding.color={field:'value',type:'quantitative'};
  if(present(p.heatmapTitle))encoding.color.title=copy(p.heatmapTitle);
  return {...(present(p.title)?{title:copy(p.title)}:{}),data:{values},mark:{type:'rect'},encoding};
}

function importHeatmapSpec(s) {
  if(['transform','layer','concat','hconcat','vconcat','facet','repeat','resolve'].some(k=>Object.hasOwn(s,k)))
    throw Error('热力图 GT 需要单图层内联数据和直接字段编码');
  const enc=s.encoding??{},channels=['x','x2','y','y2','color'];
  for(const [channel,def] of Object.entries(enc)){
    if(!def||typeof def!=='object'||Array.isArray(def)||['condition','aggregate','bin','timeUnit','datum'].some(k=>Object.hasOwn(def,k))||
        (channels.includes(channel)?Object.hasOwn(def,'value'):!Object.hasOwn(def,'value')))
      throw Error('热力图仅支持直接的 X、Y、区间边界和数值颜色编码');
  }
  const mode=heatmapAxes.map(axis=>{
    const primary=enc[axis],secondary=enc[axis+'2'];
    if(primary?.field===axis&&primary.type==='quantitative'&&secondary?.field===axis+'2')return 'c';
    if(primary?.field===axis+'_id'&&['ordinal','nominal'].includes(primary.type)&&!secondary)return 'd';
    throw Error(axis.toUpperCase()+' 轴需要 '+axis+'_id 离散编码，或 '+axis+' / '+axis+'2 连续区间编码');
  }).join('');
  if(enc.color?.field!=='value'||enc.color.type!=='quantitative')throw Error('热力图需要以 value 编码定量颜色');
  const p=defaultProject('heatmap_'+mode);
  const titleText=title=>Array.isArray(title)||typeof title!=='object'?title??'':title?.text??'';
  p.title=titleText(s.title);
  p.xTitle=titleText(enc.x.title??enc.x.axis?.title);
  p.yTitle=titleText(enc.y.title??enc.y.axis?.title);
  p.heatmapTitle=titleText(enc.color.title??enc.color.legend?.title);
  const locations=new Map();
  const rows=s.data.values.map(row=>{
    if(!row||typeof row!=='object'||Array.isArray(row)||!Object.hasOwn(row,'value'))
      throw Error('热力图 GT 的每条观测需要 value（缺测为 null）');
    return {row,positions:heatmapAxes.map(a=>heatmapIdIndex(row[a+'_id'],a))};
  });
  const sizes=heatmapAxes.map((_,i)=>rows.reduce((max,r)=>Math.max(max,r.positions[i]+1),0));
  checkHeatmapSize(...sizes);
  for(const [i,axis] of heatmapAxes.entries()){
    p.heatmap[axis]=Array.from({length:sizes[i]},()=>newHeatmapBand(p,axis));
    p.heatmap.pixels[axis]=Array(sizes[i]+1).fill(null);
  }
  p.rows=rows.map(({row,positions})=>{
    const refs={};
    for(const [i,axis] of heatmapAxes.entries()){
      const band=p.heatmap[axis][positions[i]],continuous=heatmapContinuous(p,axis);
      const coordinates=continuous?[row[axis],row[axis+'2']]:[row[axis]];
      if(continuous?!coordinates.every(finite)||coordinates[0]>=coordinates[1]:!heatmapLabel(coordinates[0]))
        throw Error('热力图原始标签或连续区间无效');
      if(locations.has(band.key)&&locations.get(band.key).some((v,j)=>v!==coordinates[j]))
        throw Error(row[axis+'_id']+' 对应的原始标签或区间不一致');
      locations.set(band.key,coordinates);
      if(continuous)[band.start,band.end,band.fromPixels]=[...coordinates,false];
      else band.label=coordinates[0];
      refs['_'+axis+'Key']=band.key;
    }
    return {...refs,value:row.value};
  });
  makeSpec(p);
  return p;
}

function renderHeatmapSpec(gt,p) {
  const out=copy(gt),{color,...position}=out.encoding,tooltips=[];
  const axisText=axis=>position[axis].title??axis.toUpperCase();
  const describe=(row,axis)=>axisText(axis)+' '+row[axis]+(position[axis+'2']?' – '+row[axis+'2']:'');
  const displayRows=out.data.values.map(row=>({...row}));
  for(const row of displayRows)
    row.__heatmapDescription=describe(row,'x')+'，'+describe(row,'y')+'，'+(row.value===null?'缺测':(color.title??'数值')+' '+row.value);
  const description={field:'__heatmapDescription',type:'nominal'};
  for(const axis of heatmapAxes){
    const enc=position[axis],id=axis+'_id';
    const byId=new Map(out.data.values.map(r=>[r[id],r]));
    const ids=[...byId.keys()].sort((a,b)=>heatmapIdIndex(a,axis)-heatmapIdIndex(b,axis));
    const title=enc.title??axis.toUpperCase();
    tooltips.push({field:axis,type:enc.field===id?'nominal':'quantitative',title});
    if(enc.field===id){
      const bands=p?.heatmap[axis], labels=Object.fromEntries(ids.map(key=>[key,String(byId.get(key)[axis])]));
      const count=bands?.length??heatmapIdIndex(ids.at(-1),axis)+1;
      if(bands)bands.forEach((band,i)=>{if(heatmapLabel(band.label))labels[heatmapId(axis,i)]=String(band.label);});
      enc.scale={domain:Array.from({length:count},(_,i)=>heatmapId(axis,i))};
      enc.axis={labelExpr:'('+JSON.stringify(labels)+'[datum.value] || "")',labelOverlap:false,labelLimit:0,
        description:title+' 轴，标签：'+enc.scale.domain.map(id=>labels[id]).filter(label=>label!==undefined).join('、')};
      enc.title??=null;
    }else{
      const first=byId.get(ids[0])[axis],last=byId.get(ids.at(-1))[axis];
      const reverse=ids.length>1&&(axis==='x'?last<first:last>first);
      const values=p?heatmapIntervals(p,axis).flat().filter(finite):[];
      enc.scale={zero:false,nice:false,reverse,...(values.length&&Math.min(...values)<Math.max(...values)?{domain:[Math.min(...values),Math.max(...values)]}:{})};
      tooltips.push({field:axis+'2',type:'quantitative',title:axis.toUpperCase()+' 结束'});
    }
  }
  color.title??='数值';
  const tooltip=[...tooltips,{field:'value',type:'quantitative',title:color.title}];
  delete out.mark;
  out.encoding=position;
  const missing={mark:{type:'rect'},data:{values:displayRows.filter(row=>row.value===null)},
    encoding:{color:{value:'#d8dee5'},tooltip:tooltips,description}};
  const measured={mark:{type:'rect'},data:{values:displayRows.filter(row=>row.value!==null)},encoding:{color,tooltip,description}};
  out.layer=[];
  if(out.data.values.some(row=>row.value===null))out.layer.push(missing);
  if(out.data.values.some(row=>row.value!==null))out.layer.push(measured);
  return out;
}

function printedPercent(raw){
  const text=String(raw).trim().replaceAll('−','-').replaceAll('％','%');
  const match=/^(\()?([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*%(\))?$/i.exec(text);
  if(!match||Boolean(match[1])!==Boolean(match[3])||match[1]&&/^[+-]/.test(match[2]))return null;
  const value=Number(match[2])*(match[1]?-1:1);
  return finite(value)?value:null;
}
function recordPercentScale(key,value){
  if(key==='theta')p.valueMode='percent';
  else if(key){
    (p.percentLabels??={})[key]=true;
    if(finite(value)){
      const guide=(p.percentGuides??={})[key]??={};
      guide.digits=Math.max(guide.digits??0,percentDigits(value));
      delete guide.format;
    }
  }
}
function recordTablePercent(row,field,key){
  if(key==='theta'){
    if(p.valueMode!=='percent'&&p.rows.some(other=>other!==row&&finite(other.value)))
      throw Error('请核对饼图其它数值并明确选择百分比模式');
    p.valueMode='percent';
  }
  if(key&&key!=='theta'&&!isPercentStack(p))(row._percentData??={})[field]=key;
  else if(row._percentData)delete row._percentData[field];
  if(key&&percentLabels(p,key)&&p.percentGuides?.[key])delete p.percentGuides[key].format;
}
function percentCells(p){
  if(!Array.isArray(p?.rows))return [];
  return [...p.rows,...(p.histogramBins??[])].flatMap(row=>Object.entries(row?._percentData??{}).map(([key,channel])=>{
    const [field,index]=key.split(':');
    return {row,field,index,channel,value:index===undefined?row[field]:row[field]?.[index]};
  }));
}
function percentLabelIssues(p){
  const conflicts=new Set();
  for(const {channel,value} of percentCells(p)){
    if(percentLabels(p,channel)||!finite(value)||value===0)continue;
    const axis=p.axes?.[channel],points=channel==='color'?p.heatmap?.colorPoints:[];
    const ends=channel==='color'?(points??[]).map(q=>q.value).filter(finite):
      axis?.calibrated?[axis.v1,axis.v2].filter(finite):[];
    if(ends.length<2)continue;
    const lo=Math.min(...ends),hi=Math.max(...ends),fraction=shiftDecimal(value,-2);
    const tolerance=Math.abs(hi-lo)*1e-9;
    const fits=x=>x>=lo-tolerance&&x<=hi+tolerance;
    if(!fits(fraction)||fits(value))conflicts.add(channel);
  }
  return [...conflicts].map(channel=>({severity:'error',
    message:channel.toUpperCase()+' 数值标签带 %，但当前刻度无法确认比例尺度，请核对原图刻度与标签后再导出'}));
}
function projectWithFractionLabels(p){
  if(!percentCells(p).length)return p;
  const result=copy(p);
  for(const {row,field,index,channel,value} of percentCells(result)){
    if(percentLabels(result,channel)||!finite(value))continue;
    if(index===undefined)row[field]=shiftDecimal(value,-2);
    else row[field][index]=shiftDecimal(value,-2);
  }
  for(const {row} of percentCells(result))delete row._percentData;
  return result;
}
function fieldScale(project,row,key){
  if(isPie(project))return key==='value'?'theta':null;
  if(isHistogram(project)&&['bin_start','bin_end'].includes(key))return isHorizontal(project)?'y':'x';
  if(key==='x'||key==='y')return key;
  if(['baseline','value','start','end','lower','upper','median','q1','q3','outliers'].includes(key))
    return measurementAxis(project,identity(row));
  return null;
}
function readHeatmapValue(raw) {
  const value=raw.trim().replaceAll('−','-');
  if(!value)return undefined;
  if(/^(?:null|na|n\/a|[-–—])$/i.test(value))return null;
  const percent=printedPercent(value);if(percent!==null)return percent;
  if(!heatmapValueToken.test(value)||!finite(Number(value)))throw Error('请输入有限数值、null 或留空');
  return Number(value);
}

function parseHeatmapMatrix(raw) {
  const lines=raw.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n');
  const separator=raw.includes('\t')?'\t':raw.includes(',')?',':/ +/;
  return lines.map((line,y)=> (typeof separator==='string'?line:line.trim()).split(separator).map((token,x)=>{
    try{return {value:readHeatmapValue(token),percent:printedPercent(token)!==null};}
    catch(e){throw Error('粘贴区域第 '+(y+1)+' 行、第 '+(x+1)+' 列：'+e.message);}
  }));
}

// Sample the image along the colorbar itself, so intermediate hues work across
// diverging and multihue ramps. Values are linear between adjacent anchors.
function heatmapColorDistance(a,b) {
  return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
}

function dominantHeatmapColor(read,points) {
  const pixels=new Map();
  for(const {x,y} of points){
    const point={x:Math.floor(x),y:Math.floor(y)};
    const key=heatmapCellKey(point.x,point.y);
    if(!pixels.has(key))pixels.set(key,{...point,rgb:read(point.x,point.y)});
  }
  const samples=[...pixels.values()].filter(q=>q.rgb);
  let cluster=[];
  for(const sample of samples){
    const near=samples.filter(q=>heatmapColorDistance(sample.rgb,q.rgb)<=18);
    if(near.length>cluster.length)cluster=near;
  }
  if(!cluster.length)return null;
  const rgb=[0,1,2].map(i=>cluster.map(q=>q.rgb[i]).sort((a,b)=>a-b)[Math.floor(cluster.length/2)]);
  const point=cluster.reduce((best,q)=>heatmapColorDistance(q.rgb,rgb)<heatmapColorDistance(best.rgb,rgb)?q:best);
  return {rgb,pixel:{x:point.x,y:point.y},agreement:cluster.length/pixels.size,samples:samples.length};
}

function heatmapColorRamp(points,read) {
  if(points.length<2||points.some(q=>!finite(q.value)))throw Error('请至少标注色标两端并填写每个校准点的数值');
  const [a,b]=points,axis=Math.abs(a.x-b.x)>=Math.abs(a.y-b.y)?'x':'y',cross=axis==='x'?'y':'x';
  const anchors=[...points].sort((a,b)=>a[axis]-b[axis]);
  const first=anchors[0],last=anchors.at(-1),length=last[axis]-first[axis],sign=Math.sign(last.value-first.value);
  if(length<4||Math.abs(last[cross]-first[cross])>length/2||!sign||
      anchors.some((p,i)=>i>0&&(p[axis]-anchors[i-1][axis]<1||Math.sign(p.value-anchors[i-1].value)!==sign)))
    throw Error('色标校准点须沿水平或垂直色带分布，数值按位置严格递增或递减');
  const steps=Math.min(512,Math.ceil(length)),ramp=[];
  let index=1;
  for(let i=0;i<=steps;i++){
    const t=i/steps,coordinate=first[axis]+t*length;
    while(index<anchors.length-1&&coordinate>anchors[index][axis])index++;
    const start=anchors[index-1],end=anchors[index];
    const fraction=(coordinate-start[axis])/(end[axis]-start[axis]);
    const value=start.value*(1-fraction)+end.value*fraction;
    const middle=first[cross]+t*(last[cross]-first[cross]);
    const sample=dominantHeatmapColor(read,[0,-1,1].map(offset=>({[axis]:coordinate,[cross]:middle+offset})));
    if(sample)ramp.push({t,value,...sample});
  }
  if(ramp.length<2||Math.max(...ramp.map(q=>heatmapColorDistance(q.rgb,ramp[0].rgb)))<12)
    throw Error('色标取样没有足够的颜色变化，请沿色带内部重新定位两端');
  return ramp;
}

function measureHeatmapColor(read,ramp,bounds,point) {
  const positions=[.12,.24,.37,.50,.63,.76,.88];
  const points=bounds?positions.flatMap(fy=>positions.map(fx=>({
    x:bounds.x[0]+fx*(bounds.x[1]-bounds.x[0]),y:bounds.y[0]+fy*(bounds.y[1]-bounds.y[0])
  }))):[-1,0,1].flatMap(dy=>[-1,0,1].map(dx=>({x:point.x+dx,y:point.y+dy})));
  const sample=dominantHeatmapColor(read,points);
  if(!sample)return {warning:'区域无可用像素',bounds,point};
  let best, distance=Infinity;
  for(let i=1;i<ramp.length;i++){
    const a=ramp[i-1],b=ramp[i],delta=b.rgb.map((v,j)=>v-a.rgb[j]);
    if(b.t-a.t>.05)continue;
    const dot=(a,b)=>a.reduce((sum,v,j)=>sum+v*b[j],0),length=dot(delta,delta);
    const t=length?Math.max(0,Math.min(1,dot(sample.rgb.map((v,j)=>v-a.rgb[j]),delta)/length)):.5;
    const d=heatmapColorDistance(sample.rgb,a.rgb.map((v,j)=>v+t*delta[j]));
    if(d<distance){
      distance=d;
      best={t:a.t+t*(b.t-a.t),value:a.value*(1-t)+b.value*t,pixel:t<.5?a.pixel:b.pixel,
        uncertainty:Math.abs(b.value-a.value)};
    }
  }
  if(!best)return {warning:'色标上缺少连续可用像素',...sample,bounds,point};
  const ambiguous=ramp.some(q=>Math.abs(q.t-best.t)>.08&&heatmapColorDistance(sample.rgb,q.rgb)<=distance+6);
  const warning=distance>36?'格内颜色偏离色标':sample.agreement<.60?'格内颜色不一致':ambiguous?'相似颜色对应多个色标位置':'';
  return {value:measuredNumber(best.value,best.uncertainty),...sample,bounds,point,distance,legendPixel:best.pixel,warning};
}

function heatmapPixelRanges(p,axis) {
  const picked=p.heatmap.pixels[axis],pixels=heatmapPixelBoundaries(p,axis);
  const calibration=heatmapAxisCalibration(p,axis);
  const projectIntervals=heatmapContinuous(p,axis)&&validHeatmapCalibration(calibration);
  return p.heatmap[axis].map((band,i)=>{
    let range=pixels.slice(i,i+2);
    if(projectIntervals&&!band.fromPixels&&finite(band.start)&&finite(band.end)&&
        (!finite(picked[i])||!finite(picked[i+1]))){
      try{
        const projected=[valueToPixel(band.start,calibration),valueToPixel(band.end,calibration)].sort((a,b)=>a-b);
        const combined=projected.map((pixel,j)=>picked[i+j]??pixel);
        if(combined.every(finite)&&combined[0]<combined[1])range=combined;
      }catch{/* The table remains editable while the numeric calibration is incomplete. */}
    }
    return range.every(finite)&&range[0]<range[1]?range:null;
  });
}

const $=id=>document.getElementById(id), clone=x=>structuredClone(x);
const labels={
  heatmap_dd:'离散 × 离散',heatmap_cc:'连续 × 连续',heatmap_dc:'离散 X × 连续 Y',heatmap_cd:'连续 X × 离散 Y',
  barline_n:'柱线复合图 / 共用类别轴',barh_1:'单系列横向柱图',barh_n:'分组横向柱图',barv_1:'单系列纵向柱图',barv_n:'分组纵向柱图',barv_stack:'堆叠纵向柱图',barh_stack:'堆叠横向柱图',barv_stack_percent:'纵向百分比堆叠',barh_stack_percent:'横向百分比堆叠',line_1:'单系列折线图',line_n:'多系列折线图',scatter_1:'单系列散点图',scatter_n:'多系列散点图',area_1:'Single-series Area / 单系列',area_n:'Multi-series Area / 多系列',area_stack:'Stacked Area / 堆叠',pie:'Pie / 饼图（含环形）',boxplot_v:'Box Plot Vertical / 纵向',boxplot_h:'Box Plot Horizontal / 横向',
  histogram_v_1:'单系列纵向直方图',histogram_h_1:'单系列横向直方图',
  histogram_v_n:'重叠纵向直方图',histogram_h_n:'重叠横向直方图',
  histogram_v_stack:'堆叠纵向直方图',histogram_h_stack:'堆叠横向直方图'};
for(const kind of ['barh_1','barh_n','barv_1','barv_n'])labels[kind+'_error']=labels[kind]+' · 误差棒';
let projects=[],currentProjectId=null,focusMode=false,focusZoom=1,imageLoadVersion=0,activationVersion=0;
let hover=null,selectedHandle='pixel',dragOrigin=null,projectionInfo=null;
let p=defaultProject('scatter_1'),image=null,imageData=null,fileName='',tool='select',selected=-1,zoom=1,calTarget='x1',pendingStart=null,drag=null,history=[],future=[],queue=[],activeId=null,renderTimer,saveTimer,renderOk=false,lastSpec=null;
const canvas=$('canvas'),ctx=canvas.getContext('2d');
const bar=()=>p.kind.startsWith('bar'), horizontal=()=>isHorizontal(p), categorical=()=>!isPie(p)&&(bar()||isBox(p)||isNominalArea(p)||lineCategoryAxis(p)||!isHistogram(p)&&p.xType==='ordinal');
const categoryPixelAxis=()=>lineCategoryAxis(p)??(horizontal()?'y':'x');
function fresh(kind,xType,yType){
  const q=defaultProject(kind);
  if(isArea(q)&&xType==='nominal')q.xType=xType;
  if(isLine(q)){q.xType=nominalType(xType)?'nominal':'quantitative';q.yType=nominalType(yType)?'nominal':'quantitative';}
  q.rows=[];q.evidence=[];q.reviewed=false;for(const a of Object.values(q.axes))a.calibrated=false;return q;
}
p=fresh('scatter_1');
function toast(message){$('toast').textContent=message;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4500);}
function checkpoint(){history.push(clone(p));if(history.length>80)history.shift();future=[];}
function dirty(){p.reviewed=false;$('reviewed').checked=false;}
function change(fn,{form=false,keepTable=false}={}){const old=clone(p);checkpoint();try{fn();}catch(e){p=old;history.pop();toast(e.message);return;}dirty();refresh(form,keepTable);}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function options(el,values,chosen){el.innerHTML=values.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('');if(values.some(([v])=>String(v)===String(chosen)))el.value=chosen;}
const familyOf=kind=>isHeatmap({kind})?'heatmap':kind==='barline_n'?'composite':kind==='pie'?'pie':kind.startsWith('boxplot')?'boxplot':kind.startsWith('bar')?'bar':kind.startsWith('line')?'line':kind.startsWith('area_')?'area':isHistogram({kind})?'histogram':'scatter';
function syncTypes(){const family=familyOf(p.kind);$('family').value=family;options($('kind'),Object.entries(labels).filter(([k])=>familyOf(k)===family),p.kind+(hasErrors(p)&&!isStack(p)&&!isComposite(p)?'_error':''));}
syncTypes();
let heatmapCapture=null;
const heatmapImages=new WeakMap();
const heatmapAxisName=axis=>axis==='x'?'列':'行';
const displayHeatmapBoundary=(band,value)=>value;

function heatmapBandLabels(axis) {
  const bands=p.heatmap[axis];
  if(!heatmapContinuous(p,axis))return bands.map(band=>String(band.label??''));
  return heatmapIntervals(p,axis).map(([start,end],i)=>finite(start)&&finite(end)?
    displayHeatmapBoundary(bands[i],start)+' – '+displayHeatmapBoundary(bands[i],end):'');
}

function heatmapCell(index) {
  const {x,y}=p.heatmap, column=index%x.length, row=Math.floor(index/x.length);
  return index>=0&&x[column]&&y[row]?{column,row,x:x[column].key,y:y[row].key}:null;
}

function heatmapCellInput(index) {
  return $('tableBody').querySelector('[data-heatmap-cell="'+index+'"]');
}

function heatmapCellRecord(cell) {
  const index=p.rows.findIndex(r=>r._xKey===cell.x&&r._yKey===cell.y);
  return {row:p.rows[index],evidence:p.evidence?.[index]};
}

function heatmapCellDisplay(row,evidence) {
  if(row?.value===null)return 'null';
  if(evidence?.source==='heatmap_color'&&(!evidence.warning||evidence.accepted)&&finite(row?.value))
    return String(row.value);
  return row?.value??'';
}

function updateHeatmapCellInput(input,row,evidence) {
  input.value=heatmapCellDisplay(row,evidence);
  const omitted=evidence?.source==='heatmap_omitted';
  input.placeholder=omitted?'跳过':'';
  input.toggleAttribute('data-heatmap-missing',row?.value===null||omitted);
  input.toggleAttribute('data-heatmap-warning',!!(evidence?.warning&&!evidence.accepted));
  input.title=evidence?.source==='heatmap_color'?
    (evidence.warning&&!evidence.accepted?evidence.warning:'色标估值'):omitted?'结构空格':row?.value===null?'显式缺测':'';
}

function syncHeatmapTable() {
  const {x,y}=p.heatmap, records=heatmapRecords(p);
  const columns=heatmapBandLabels('x').map(esc),rows=heatmapBandLabels('y').map(esc);
  $('tableHead').innerHTML='<tr><th scope="col">行 / 列</th>'+columns.map((label,i)=>'<th scope="col"><small>'+heatmapId('x',i)+'</small>'+label+'</th>').join('')+'</tr>';
  $('tableBody').innerHTML=y.map((yBand,j)=>'<tr><th scope="row"><small>'+heatmapId('y',j)+'</small>'+rows[j]+'</th>'+
    x.map((xBand,i)=>{
      const {row,evidence}=records.get(heatmapCellKey(xBand.key,yBand.key))??{};
      const pending=evidence?.warning&&!evidence.accepted,omitted=evidence?.source==='heatmap_omitted';
      return '<td><input type="text" inputmode="decimal" data-heatmap-cell="'+(j*x.length+i)+'"'+
        ' aria-label="第 '+(j+1)+' 行第 '+(i+1)+' 列 '+rows[j]+' '+columns[i]+'"'+
        (row?.value===null||omitted?' data-heatmap-missing':'')+(pending?' data-heatmap-warning':'')+
        (omitted?' placeholder="跳过"':'')+
        ' title="'+esc(pending?evidence.warning:evidence?.source==='heatmap_color'?'色标估值':omitted?'结构空格':row?.value===null?'显式缺测':'')+'" value="'+
        esc(heatmapCellDisplay(row,evidence))+'"></td>';
    }).join('')+'</tr>').join('');
  syncHeatmapSelection();
  syncHistoryControls();
}

function syncHeatmapSelection() {
  const cell=heatmapCell(selected),total=p.heatmap.x.length*p.heatmap.y.length;
  const current=$('tableBody').querySelector('[data-heatmap-active]'),input=heatmapCellInput(selected);
  current?.removeAttribute('data-heatmap-active');
  input?.parentElement.setAttribute('data-heatmap-active','');
  const {row,evidence}=cell?heatmapCellRecord(cell):{};
  const estimate=evidence?.source==='heatmap_color'?evidence:null;
  const pending=estimate?.warning&&!estimate.accepted;
  const recorded=p.rows.filter(r=>Object.hasOwn(r,'value')).length;
  $('countBadge').textContent=recorded+' / '+total+' 格已记录';
  $('heatmapSelection').textContent=cell?
    '第 '+(cell.row+1)+' 行、第 '+(cell.column+1)+' 列'+(pending?' · '+estimate.warning+(finite(estimate.value)?' · 建议值 '+estimate.value:''):estimate?' · 色标估值':'')+
    (row?.value===null?' · 缺测':evidence?.source==='heatmap_omitted'?' · 跳过批量测量':''):'点击单元格选中。';
  $('targetTop').textContent=cell?'第 '+(cell.row+1)+' 行 · 第 '+(cell.column+1)+' 列':'';
  $('heatmapMissing').disabled=$('heatmapOmit').disabled=!cell;
  $('heatmapClearCell').disabled=!row;
  $('heatmapMeasureCell').disabled=!cell||!image;
  $('heatmapAcceptEstimate').hidden=!pending||!finite(estimate.value)||estimate.calibration!==JSON.stringify(p.heatmap.colorPoints);
}

function syncHeatmapBoundaryOptions() {
  const axis=$('heatmapBoundaryAxis').value, el=$('heatmapBoundaryIndex');
  const indices=p.heatmap[axis].length?Array.from({length:p.heatmap[axis].length+1},(_,i)=>[
    i, (i===0?'起边':i===p.heatmap[axis].length?'末边':i+' / '+(i+1))+
      (finite(p.heatmap.pixels[axis][i])?' · '+p.heatmap.pixels[axis][i].toFixed(1)+' px':'')
  ]):[];
  options(el,indices,el.value);
  $('heatmapBoundary').disabled=!image||!indices.length;
}

function syncHeatmapForm() {
  const heatmap=isHeatmap(p);
  for(const id of ['heatmapTitleLabel','heatmapStructure','heatmapMeasurement','heatmapCellControls'])$(id).hidden=!heatmap;
  $('heatmapCalibrationNote').hidden=!heatmap||!requiredAxes(p).length;
  for(const id of ['addRow','deleteRow'])$(id).hidden=heatmap;
  $('dataTable').classList.toggle('heatmap-matrix',heatmap);
  document.querySelector('[data-tool="heatmap-measure"]').hidden=!heatmap;
  if(!heatmap)return;
  const {x,y,pixels,colorPoints}=p.heatmap;
  $('heatmapTitle').value=p.heatmapTitle??'';
  $('seriesSection').hidden=$('legend').parentElement.hidden=$('activeSeries').parentElement.hidden=true;
  document.querySelector('.assist-panel').hidden=true;
  document.querySelector('[data-tool="point"]').hidden=true;
  document.querySelector('[data-tool="calibrate"]').hidden=$('calibrationPanel').hidden=!requiredAxes(p).length;
  $('orderGuide').textContent='列按左到右、行按上到下。标签可以重名。';
  $('tableNote').textContent='方向键切换相邻格，Enter 前进到下一格。留空省略该格，null 表示显式缺测。自动测量依图像分辨率保留有效数字。';
  $('heatmapRows').value=y.length||'';
  $('heatmapColumns').value=x.length||'';
  $('heatmapAxes').innerHTML=heatmapAxes.map(axis=>{
    const bands=p.heatmap[axis], continuous=heatmapContinuous(p,axis), name=heatmapAxisName(axis);
    const intervals=continuous?heatmapIntervals(p,axis):[];
    const bandRows=bands.map((band,i)=>{
      const attrs=' data-hm-axis="'+axis+'" data-hm-index="'+i+'"';
      const input=(field,label,value)=>'<input'+attrs+' data-hm-field="'+field+'" aria-label="'+label+'" '+
        (continuous?'type="number" step="any" placeholder="'+(field==='start'?'起点':'终点')+'"':'type="text" placeholder="原始标签"')+' value="'+esc(value)+'">';
      const [start,end]=intervals[i]??[];
      const button=(action,text,title,disabled=false)=>'<button class="small"'+attrs+' data-hm-action="'+action+'" title="'+title+'" aria-label="'+title+'" '+(disabled?'disabled':'')+'>'+text+'</button>';
      return '<div class="heatmap-band"><span>'+heatmapId(axis,i)+'</span>'+
        (continuous?input('start',name+(i+1)+' 起点',displayHeatmapBoundary(band,start))+
          input('end',name+(i+1)+' 终点',displayHeatmapBoundary(band,end))+
          button('pixels','↺','使用校准后的像素边界',band.fromPixels):input('label',name+(i+1)+' 标签',band.label))+
        button('previous','↑','前移'+name,i===0)+button('next','↓','后移'+name,i===bands.length-1)+button('delete','×','删除'+name)+'</div>';
    }).join('');
    const action=(value,text)=>'<button class="small" data-hm-axis="'+axis+'" data-hm-action="'+value+'">'+text+'</button>';
    const bulk=continuous?'': '<details><summary>批量输入'+name+'标签</summary><label>一行一个标签<textarea rows="3" data-hm-names="'+axis+'">'+
      esc(bands.map(b=>b.label).join('\n'))+'</textarea></label>'+action('names','应用'+name+'标签')+'</details>';
    return '<section><div class="section-head"><h3>'+axis.toUpperCase()+' · '+name+(continuous?'区间':'标签')+'</h3><div>'+
      action('add','＋ 添加'+name)+(continuous?action('ascending','递增')+action('descending','递减'):action('ascending','按标签排序'))+
      '</div></div>'+bulk+'<div class="heatmap-bands">'+bandRows+'</div></section>';
  }).join('');
  syncHeatmapBoundaryOptions();
  syncHeatmapGridStatus();
  $('heatmapCorners').disabled=!image||!x.length||!y.length;
  $('heatmapClearGrid').disabled=!Object.values(pixels).some(axis=>axis.some(finite));
  $('heatmapColorPoint').disabled=!image;
  document.querySelector('[data-tool="heatmap-measure"]').disabled=!image;
  $('heatmapColorPoints').innerHTML=colorPoints.map((q,i)=>'<div class="heatmap-band"><span>点 '+(i+1)+' · '+q.x.toFixed(1)+', '+q.y.toFixed(1)+' px</span>'+
    '<input type="text" inputmode="decimal" data-hm-color="'+i+'" aria-label="校准点 '+(i+1)+' 数值" value="'+esc(q.value)+'">'+
    '<button class="small" data-hm-retake="'+i+'" '+(image?'':'disabled')+'>重取</button>'+
    '<button class="small" data-hm-remove-color="'+i+'">删除</button></div>').join('');
}

function syncHeatmapGridStatus() {
  const [columns,rows]=heatmapAxes.map(axis=>heatmapPixelRanges(p,axis).filter(Boolean).length);
  $('heatmapGridStatus').textContent='已定位 '+columns+' / '+p.heatmap.x.length+' 列、'+rows+' / '+p.heatmap.y.length+
    ' 行。定位两角后自动等分。不等宽时请点取共享边界。'+
    (requiredAxes(p).length?'连续轴校准后，自动按网格边界计算各区间的起止值。':'');
  $('heatmapMeasureBatch').disabled=!image||!columns||!rows;
}

function editHeatmapRecords(updates) {
  const records=heatmapRecords(p);
  for(const {x,y,value,evidence,percent} of updates){
    const key=heatmapCellKey(x,y);
    if(value===undefined&&!evidence)records.delete(key);
    else records.set(key,{row:{_xKey:x,_yKey:y,...(value===undefined?{}:{value}),
      ...(percent?{_percentData:{value:'color'}}:{})},evidence});
  }
  const entries=[...records.values()];
  p.rows=entries.map(e=>e.row);
  p.evidence=entries.map(e=>e.evidence??null);
}

function manualHeatmapRecord(cell,value,evidence=heatmapCellRecord(cell).evidence) {
  const measurement=evidence?.source==='heatmap_color'?evidence:evidence?.measurement;
  return {...cell,value,evidence:value===undefined?undefined:{
    source:'manual_entry',role:'transcribed',...(measurement?{measurement}:{})
  }};
}

function editHeatmapValue(index,raw) {
  const cell=heatmapCell(index),{row,evidence}=heatmapCellRecord(cell);
  selected=index;
  if(String(heatmapCellDisplay(row,evidence))===raw)return true;
  let value;
  try{value=readHeatmapValue(raw);}
  catch(e){updateHeatmapCellInput(heatmapCellInput(index),row,evidence);toast(e.message);return false;}
  change(()=>editHeatmapRecords([{...manualHeatmapRecord(cell,value),percent:printedPercent(raw)!==null}]),{keepTable:true});
  const result=heatmapCellRecord(cell);
  updateHeatmapCellInput(heatmapCellInput(index),result.row,result.evidence);
  return true;
}

function selectHeatmapCell(index,focus=false) {
  selected=index;
  syncHeatmapSelection();
  if(focus)heatmapCellInput(index)?.focus();
  draw();
}

function advanceHeatmapCell(focus=false) {
  const next=selected+1;
  if(heatmapCell(next))selectHeatmapCell(next,focus);
}

const heatmapArrowSteps={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
function moveHeatmapSelection(index,key,focus=false) {
  const cell=heatmapCell(index);
  if(!cell)return;
  const [dy,dx]=heatmapArrowSteps[key],row=cell.row+dy,column=cell.column+dx;
  const {x,y}=p.heatmap;
  if(row>=0&&row<y.length&&column>=0&&column<x.length)selectHeatmapCell(row*x.length+column,focus);
}

function keepHeatmapBands(axis,bands) {
  const keys=new Set(bands.map(b=>b.key)),ref='_'+axis+'Key',old=p.heatmap[axis];
  if(heatmapContinuous(p,axis)){
    const oldIndex=new Map(old.map((b,i)=>[b.key,i]));
    const intervals=heatmapIntervals(p,axis);
    bands.forEach(band=>{
      const index=oldIndex.get(band.key);
      if(index===undefined||!band.fromPixels)return;
      const [start,end]=intervals[index];
      if(finite(start)&&finite(end)&&start<end)Object.assign(band,{start,end,fromPixels:false});
    });
  }
  p.heatmap[axis]=bands;
  if(heatmapContinuous(p,axis)||bands.length!==old.length)p.heatmap.pixels[axis]=Array(bands.length+1).fill(null);
  p.evidence=p.rows.flatMap((r,i)=>keys.has(r[ref])?[p.evidence?.[i]??null]:[]);
  p.rows=p.rows.filter(r=>keys.has(r[ref]));
  selected=-1;
  if(tool==='heatmap-boundary'||tool==='heatmap-corners')setTool('select');
}

function canRemoveHeatmapBands(axis,bands) {
  const removed=new Set(bands.map(b=>b.key));
  return !p.rows.some(r=>removed.has(r['_'+axis+'Key']))||confirm('删除这些'+heatmapAxisName(axis)+'及其记录和证据？');
}

function resizeHeatmap(x,y) {
  checkHeatmapSize(x,y);
  const sizes={x,y};
  if(heatmapAxes.some(axis=>!canRemoveHeatmapBands(axis,p.heatmap[axis].slice(sizes[axis]))))return;
  change(()=>{
    for(const axis of heatmapAxes){
      const old=p.heatmap[axis],size=sizes[axis];
      if(old.length===size)continue;
      const bands=Array.from({length:size},(_,i)=>old[i]??newHeatmapBand(p,axis));
      keepHeatmapBands(axis,bands);
    }
  },{form:true});
}

function reshapeHeatmapAxis(axis,action,index) {
  const old=p.heatmap[axis],bands=[...old],name=heatmapAxisName(axis);
  if(action==='pixels'){
    change(()=>old[index].fromPixels=true,{form:true});
    return;
  }
  let names;
  if(action==='names'){
    names=parseObjectNames($('heatmapAxes').querySelector('[data-hm-names="'+axis+'"]').value);
    if(!names.length)throw Error('请至少输入一个'+name+'标签');
    if(!canRemoveHeatmapBands(axis,bands.slice(names.length)))return;
    bands.length=names.length;
  }else if(action==='add')bands.push(newHeatmapBand(p,axis));
  else if(action==='delete'){
    if(!canRemoveHeatmapBands(axis,[bands[index]]))return;
    bands.splice(index,1);
  }else if(action==='ascending'||action==='descending'){
    if(heatmapContinuous(p,axis)){
      const intervals=heatmapIntervals(p,axis);
      const anchors=new Map(bands.map((b,i)=>[b.key,intervals[i][0]]));
      if([...anchors.values()].some(v=>!finite(v)))throw Error('请先填写所有区间起点');
      const sign=action==='ascending'?1:-1;
      bands.sort((a,b)=>sign*(anchors.get(a.key)-anchors.get(b.key)));
    }else bands.sort((a,b)=>String(a.label).localeCompare(String(b.label),undefined,{numeric:true}));
  }else{
    const next=index+(action==='previous'?-1:1);
    [bands[index],bands[next]]=[bands[next],bands[index]];
  }
  checkHeatmapSize(bands.length,p.heatmap[axis==='x'?'y':'x'].length);
  change(()=>{
    if(names)names.forEach((label,i)=>{bands[i]??=newHeatmapBand(p,axis);bands[i].label=label;});
    if(bands.length!==old.length||bands.some((b,i)=>b!==old[i]))keepHeatmapBands(axis,bands);
  },{form:true});
}

function pasteHeatmap(raw,start=selected) {
  if(!raw.trim()&&!raw.includes('\t')&&!raw.includes(','))return;
  const matrix=parseHeatmapMatrix(raw),cell=heatmapCell(start);
  const row=cell?.row??0,column=cell?.column??0,{x,y}=p.heatmap;
  const width=Math.max(x.length,column+Math.max(...matrix.map(r=>r.length)));
  const height=Math.max(y.length,row+matrix.length);
  checkHeatmapSize(width,height);
  change(()=>{
    for(const [axis,size] of [['x',width],['y',height]])if(p.heatmap[axis].length<size)
      keepHeatmapBands(axis,Array.from({length:size},(_,i)=>p.heatmap[axis][i]??newHeatmapBand(p,axis)));
    const records=heatmapRecords(p);
    const updates=matrix.flatMap((line,j)=>line.map(({value,percent},i)=>{
      const cell=heatmapCell((row+j)*width+column+i);
      return {...manualHeatmapRecord(cell,value,records.get(heatmapCellKey(cell.x,cell.y))?.evidence??null),percent};
    }));
    editHeatmapRecords(updates);
    selected=row*width+column;
  },{form:true});
  toast('已应用 '+matrix.length+' 行矩阵数据');
}

function heatmapReadPixel() {
  let sample=heatmapImages.get(image);
  if(!sample){
    const original=document.createElement('canvas');
    original.width=image.width;original.height=image.height;
    sample=original.getContext('2d',{willReadFrequently:true});
    sample.drawImage(image,0,0);
    heatmapImages.set(image,sample);
  }
  return (x,y)=>{
    if(x<0||y<0||x>=sample.canvas.width||y>=sample.canvas.height)return null;
    const [r,g,b,a]=sample.getImageData(x,y,1,1).data;
    return a>=224?[r,g,b]:null;
  };
}

function heatmapGeometry() {
  return Object.fromEntries(heatmapAxes.map(axis=>[axis,heatmapPixelRanges(p,axis)]));
}

function heatmapBounds(geometry,cell) {
  const x=geometry.x[cell.column],y=geometry.y[cell.row];
  return x&&y?{x,y}:null;
}

function heatmapMeasure({batch=false,point}={}) {
  if(!image)throw Error('请先添加原图');
  const geometry=heatmapGeometry(),read=heatmapReadPixel(),calibration=JSON.stringify(p.heatmap.colorPoints);
  const ramp=heatmapColorRamp(p.heatmap.colorPoints,read);
  const targets=batch?Array.from({length:p.heatmap.x.length*p.heatmap.y.length},(_,i)=>heatmapCell(i)):[heatmapCell(selected)];
  if(!targets[0])throw Error('请先选中一个单元格');
  const records=heatmapRecords(p),updates=[];
  let skipped=0,ambiguous=0;
  for(const cell of targets){
    const {row,evidence}=records.get(heatmapCellKey(cell.x,cell.y))??{};
    if(batch&&(row&&Object.hasOwn(row,'value')||evidence?.source==='heatmap_omitted'))continue;
    const bounds=heatmapBounds(geometry,cell);
    if(!bounds&&!point){skipped++;continue;}
    const result=measureHeatmapColor(read,ramp,bounds,point);
    if(result.warning)ambiguous++;
    updates.push({...cell,value:result.warning?row?.value:result.value,evidence:{
      ...result,source:'heatmap_color',role:'color_estimate',calibration,measuredAt:new Date().toISOString()
    }});
  }
  if(!updates.length)throw Error(skipped?'请先定位待测单元格的原图边界':'没有待测空格');
  change(()=>editHeatmapRecords(updates));
  if(!batch&&ambiguous===0)advanceHeatmapCell();
  $('heatmapMeasurementStatus').textContent='已估算 '+(updates.length-ambiguous)+' 格'+(ambiguous?'；'+ambiguous+' 格待核对':'')+(skipped?'；'+skipped+' 格缺少边界':'');
}

function startHeatmapCapture(type,data={}) {
  if(!image)throw Error('请先添加原图');
  heatmapCapture=data;
  $('heatmapMeasurementStatus').textContent='';
  setTool(type);
}

function handleHeatmapPointer(raw) {
  const pt=bounded(raw);
  if(tool==='heatmap-corners'){
    const first=heatmapCapture?.first;
    if(!first){
      heatmapCapture={first:pt};
      $('hint').textContent='点击网格的另一个对角。';
      draw();
      return;
    }
    if(heatmapAxes.some(axis=>Math.abs(first[axis]-pt[axis])<1))throw Error('两个角须形成有宽度和高度的区域');
    change(()=>{
      p.precisionVersion=1;
      for(const axis of heatmapAxes){
        const bounds=p.heatmap.pixels[axis];
        bounds.fill(null);
        bounds[0]=Math.min(first[axis],pt[axis]);bounds[bounds.length-1]=Math.max(first[axis],pt[axis]);
      }
    },{form:true});
    if(p.heatmap[$('heatmapBoundaryAxis').value].length>1)$('heatmapBoundaryIndex').value='1';
    if(requiredAxes(p).some(axis=>!validHeatmapCalibration(heatmapAxisCalibration(p,axis))))$('calibrationPanel').open=true;
    setTool('select');
    return;
  }
  if(tool==='heatmap-boundary'){
    const {axis,index}=heatmapCapture;
    const bounds=p.heatmap.pixels[axis],previous=bounds.slice(0,index).filter(finite).at(-1),next=bounds.slice(index+1).find(finite);
    if(finite(previous)&&previous>=pt[axis]||finite(next)&&next<=pt[axis])
      throw Error('共享边界须按从左到右或从上到下排列');
    change(()=>{p.precisionVersion=1;bounds[index]=pt[axis];},{form:true});
    const last=bounds.length-1;
    if(index===last||index+1===last&&finite(bounds[last]))setTool('select');
    else{
      heatmapCapture.index++;
      $('heatmapBoundaryIndex').value=heatmapCapture.index;
      $('hint').textContent='继续点击 '+axis.toUpperCase()+' 轴 '+$('heatmapBoundaryIndex').selectedOptions[0].textContent+'。';
    }
    return;
  }
  if(tool==='heatmap-color'){
    const index=heatmapCapture.index??p.heatmap.colorPoints.length;
    if(index>=64)throw Error('色标最多支持 64 个校准点');
    change(()=>{p.heatmap.colorPoints[index]={...pt,value:p.heatmap.colorPoints[index]?.value??null};},{form:true});
    setTool('select');
    $('heatmapColorPoints').querySelector('[data-hm-color="'+index+'"]').focus();
    return;
  }
  const geometry=heatmapGeometry();
  const band=axis=>geometry[axis].findIndex(range=>range&&pt[axis]>=range[0]&&pt[axis]<range[1]);
  const column=band('x'),row=band('y');
  if(column>=0&&row>=0)selectHeatmapCell(row*p.heatmap.x.length+column);
  else if(tool==='select')return;
  else if(!heatmapCell(selected)||heatmapBounds(geometry,heatmapCell(selected)))throw Error('请点击已定位的格子，或选中一个尚未定位的格子再局部取色');
  if(tool==='heatmap-measure')heatmapMeasure({point:pt});
}

function drawHeatmap(mark) {
  const geometry=heatmapGeometry(),x=geometry.x.filter(Boolean).flat(),y=geometry.y.filter(Boolean).flat();
  if(x.length&&y.length){
    ctx.strokeStyle='#172f39';
    ctx.lineWidth=1/zoom;
    ctx.setLineDash([3/zoom,3/zoom]);
    ctx.beginPath();
    const left=Math.min(...x),right=Math.max(...x),top=Math.min(...y),bottom=Math.max(...y);
    for(const v of unique(x)){ctx.moveTo(v,top);ctx.lineTo(v,bottom);}
    for(const v of unique(y)){ctx.moveTo(left,v);ctx.lineTo(right,v);}
    ctx.stroke();
    ctx.setLineDash([]);
    const cell=heatmapCell(selected),bounds=cell&&heatmapBounds(geometry,cell);
    if(bounds){
      ctx.strokeStyle='#00dfe5';ctx.lineWidth=2/zoom;
      ctx.strokeRect(bounds.x[0],bounds.y[0],bounds.x[1]-bounds.x[0],bounds.y[1]-bounds.y[0]);
    }
  }
  if(heatmapCapture?.first)mark(heatmapCapture.first,'#007bea','网格第一角');
  p.heatmap.colorPoints.forEach((q,i)=>mark(q,'#e85b35','色标 '+(i+1)));
  const cell=heatmapCell(selected),evidence=cell&&heatmapCellRecord(cell).evidence;
  if(evidence?.source==='heatmap_color'&&evidence.pixel)mark(evidence.pixel,'#00b2bb','采样');
  for(const axis of requiredAxes(p))for(const n of [1,2])
    if(p.axes[axis]['point'+n])mark(p.axes[axis]['point'+n],'#007bea',axis.toUpperCase()+n);
}

function heatmapAction(fn) {
  try{fn();}catch(e){toast(e.message);}
}

$('heatmapResize').onclick=()=>heatmapAction(()=>{
  const x=Number($('heatmapColumns').value),y=Number($('heatmapRows').value);
  if(!x||!y)throw Error('请输入至少一行和一列');
  resizeHeatmap(x,y);
});
$('heatmapAxes').onclick=e=>{
  const {hmAxis,hmIndex,hmAction}=e.target.dataset;
  if(hmAction)heatmapAction(()=>reshapeHeatmapAxis(hmAxis,hmAction,Number(hmIndex)));
};
$('heatmapAxes').onchange=e=>{
  const {hmAxis,hmIndex,hmField}=e.target.dataset;
  if(!hmField)return;
  const band=p.heatmap[hmAxis][hmIndex],input=e.target;
  change(()=>{
    if(hmField==='label')band.label=input.value;
    else{
      const [start,end]=heatmapIntervals(p,hmAxis)[Number(hmIndex)];
      Object.assign(band,{start,end,fromPixels:false,[hmField]:input.value===''?null:input.valueAsNumber});
    }
  });
  if(hmField!=='label'){
    const fields='[data-hm-axis="'+hmAxis+'"][data-hm-index="'+hmIndex+'"]';
    const group=$('heatmapAxes');
    for(const edge of ['start','end'])group.querySelector(fields+'[data-hm-field="'+edge+'"]').value=band[edge]??'';
    group.querySelector(fields+'[data-hm-action="pixels"]').disabled=false;
    syncHeatmapGridStatus();
  }
};
$('heatmapBoundaryAxis').onchange=syncHeatmapBoundaryOptions;
$('heatmapCorners').onclick=()=>heatmapAction(()=>startHeatmapCapture('heatmap-corners'));
$('heatmapBoundary').onclick=()=>heatmapAction(()=>startHeatmapCapture('heatmap-boundary',{
  axis:$('heatmapBoundaryAxis').value,index:Number($('heatmapBoundaryIndex').value)
}));
$('heatmapClearGrid').onclick=()=>change(()=>{
  for(const axis of heatmapAxes)p.heatmap.pixels[axis].fill(null);
},{form:true});
$('heatmapColorPoint').onclick=()=>heatmapAction(()=>startHeatmapCapture('heatmap-color'));
$('heatmapColorPoints').onclick=e=>{
  const {hmRetake,hmRemoveColor}=e.target.dataset;
  if(hmRetake!==undefined)heatmapAction(()=>startHeatmapCapture('heatmap-color',{index:Number(hmRetake)}));
  if(hmRemoveColor!==undefined)change(()=>p.heatmap.colorPoints.splice(Number(hmRemoveColor),1),{form:true});
};
$('heatmapColorPoints').onchange=e=>{
  const {hmColor}=e.target.dataset;
  if(hmColor!==undefined)change(()=>{
    const value=e.target.value.trim(),percent=printedPercent(value);
    if(value&&!finite(percent??Number(value)))throw Error('色标刻度需要有限数值');
    if(percent!==null)recordPercentScale('color',percent);
    p.heatmap.colorPoints[hmColor].value=value?percent??Number(value):null;
  });
};
$('heatmapMeasureCell').onclick=()=>heatmapAction(()=>heatmapMeasure());
$('heatmapMeasureBatch').onclick=()=>heatmapAction(()=>heatmapMeasure({batch:true}));
$('heatmapMissing').onclick=()=>{
  change(()=>editHeatmapRecords([manualHeatmapRecord(heatmapCell(selected),null)]));
  advanceHeatmapCell();
};
$('heatmapOmit').onclick=()=>{
  change(()=>editHeatmapRecords([{...heatmapCell(selected),evidence:{source:'heatmap_omitted',role:'structure'}}]));
  advanceHeatmapCell();
};
$('heatmapClearCell').onclick=()=>change(()=>editHeatmapRecords([manualHeatmapRecord(heatmapCell(selected),undefined)]));
$('heatmapAcceptEstimate').onclick=()=>{
  const cell=heatmapCell(selected),{evidence}=heatmapCellRecord(cell);
  change(()=>editHeatmapRecords([{...cell,value:evidence.value,evidence:{...evidence,accepted:true}}]));
  advanceHeatmapCell();
};
$('heatmapApplyPaste').onclick=()=>heatmapAction(()=>pasteHeatmap($('heatmapPaste').value));
$('tableBody').addEventListener('focusin',e=>{
  if(e.target.dataset.heatmapCell!==undefined)selectHeatmapCell(Number(e.target.dataset.heatmapCell));
});
$('tableBody').addEventListener('change',e=>{
  if(e.target.dataset.heatmapCell!==undefined)editHeatmapValue(Number(e.target.dataset.heatmapCell),e.target.value);
});
$('tableBody').addEventListener('keydown',e=>{
  const index=e.target.dataset.heatmapCell;
  if(index===undefined||e.isComposing||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey)return;
  const arrow=Object.hasOwn(heatmapArrowSteps,e.key);
  if(!arrow&&e.key!=='Enter')return;
  e.preventDefault();
  if(!editHeatmapValue(Number(index),e.target.value))return;
  if(arrow)moveHeatmapSelection(Number(index),e.key,true);
  else advanceHeatmapCell(true);
});
canvas.addEventListener('keydown',e=>{
  if(!isHeatmap(p)||tool!=='select'||selected<0||!Object.hasOwn(heatmapArrowSteps,e.key))return;
  e.preventDefault();
  moveHeatmapSelection(selected,e.key);
});
$('tableBody').addEventListener('paste',e=>{
  const index=e.target.dataset.heatmapCell,raw=e.clipboardData?.getData('text/plain');
  if(index===undefined||!raw||!/[\r\n\t,]/.test(raw))return;
  e.preventDefault();
  heatmapAction(()=>pasteHeatmap(raw,Number(index)));
});

function syncForm(){ensureIdentities(p);syncTypes();$('seriesNames').value=p.series.map(s=>s.name).join('\n');for(const key of ['title','xTitle','yTitle','notes'])$(key).value=p[key]??'';$('legend').checked=p.legend;$('reviewed').checked=!!p.reviewed;syncCategoryList();$('xTypeLabel').hidden=!isArea(p)&&!isLine(p);
const axisTypes=[['quantitative','Quantitative / 连续数值'],['nominal','Nominal / 类别']];
options($('xType'),axisTypes,nominalType(p.xType)?'nominal':'quantitative');
$('yTypeLabel').hidden=$('lineModeNote').hidden=!isLine(p);
if(isLine(p))options($('yType'),axisTypes,nominalType(p.yType)?'nominal':'quantitative');
$('areaModeNote').hidden=!isArea(p);$('addSeries').hidden=p.kind.endsWith('_1');$('activeSeries').closest('label').hidden=p.kind.endsWith('_1');$('seriesSection').hidden=p.kind.endsWith('_1')&&!p.legend;$('roleLabel').hidden=!p.kind.startsWith('line');$('connect').closest('label').hidden=!p.kind.startsWith('line');$('tableNote').textContent=bar()?(hasErrors(p)?'下限 / 上限是绝对数值界限，不是误差长度。':isStack(p)?'数据记录保留段起点 / 段终点供测量核对；普通堆叠的精简 GT / 导出 GT 统一使用 value、stack_order，不导出这些中间端点。':'每条记录对应一个柱子。'):p.kind.startsWith('line')?'默认按取点顺序连接；复杂路径可展开高级字段调整顺序。':'每条记录对应一个可见散点。';$('categoryLabel').hidden=!categorical();$('activeCategoryLabel').hidden=!categorical();const order=annotationOrder(p);$('orderGuide').textContent=order.records;$('seriesOrderNote').textContent=order.series;$('categoryOrderNote').textContent=order.category;
const active=$('activeSeries').value;options($('activeSeries'),p.series.map((s,i)=>[s.key,s.name+'（'+(i+1)+'）']),active);options($('activeCategory'),p.categoryObjects.map((c,i)=>[c.key,c.name+'（'+(i+1)+'）']),$('activeCategory').value);
$('seriesList').innerHTML=p.series.map((s,i)=>`<div class="series-row"><input type="color" aria-label="系列颜色" value="${esc(s.color||'#008b7e')}" data-series="${i}" data-prop="color"><input aria-label="系列名称" value="${esc(s.name)}" data-series="${i}" data-prop="name">${isComposite(p)?`<select aria-label="系列角色" data-series="${i}" data-prop="role"><option value="bar" ${s.role==='bar'?'selected':''}>柱</option><option value="line" ${s.role==='line'?'selected':''}>线</option></select>`:''}<button data-move-series="${i}" data-delta="-1" title="上移">↑</button><button data-move-series="${i}" data-delta="1" title="下移">↓</button><button data-remove-series="${i}" title="删除系列">×</button></div>`).join('');
syncStatForm();syncCompositeForm();syncHeatmapForm();syncPercentStackRatioCategories();
if(isHistogram(p)){
  $('legend').parentElement.hidden=p.kind.endsWith('_1');
  $('seriesSection').hidden=p.kind.endsWith('_1');
  $('orderGuide').textContent='按原图或可靠数据源逐箱填写边界和统计值，并保留轴标题及单位。';
  $('tableNote').textContent=isHistogramStack(p)?
    '为每条记录选择分箱和系列。选中记录后可单独取点测量该段的统计值。':
    '每行对应一个分箱和系列。可直接录入或编辑。像素测量依图像分辨率保留有效数字，人工数值保留录入精度。';
  $('seriesOrderNote').textContent=isHistogramStack(p)?
    (horizontal()?'按从左到右排列系列。':'按从底到顶排列系列。')+'用 ↑ / ↓ 调整全局堆叠顺序。':
    '填写原图中唯一的系列名称。各系列可以使用不同的分箱边界。';
}
if(isArea(p)){
  $('legend').parentElement.hidden=true;
  $('seriesSection').hidden=p.kind==='area_1';
  $('tableNote').textContent=p.kind==='area_stack'?'每层记录累计上界 y 和实际下界 baseline；贡献值 = y − baseline。堆叠顺序在系列列表中调整。':'每个 X 记录实际的上界 y 和下界 baseline，包括固定或非零基线。';
}
if(!isHeatmap(p)&&tool.startsWith('heatmap-')||isHeatmap(p)&&!['select','calibrate'].includes(tool)&&!tool.startsWith('heatmap-')||
    isHeatmap(p)&&tool==='calibrate'&&!requiredAxes(p).length||!isArea(p)&&tool.startsWith('area-')||
    tool==='pie-angle'&&(!isPie(p)||p.valueMode!=='percent'||!image))setTool('select');
else{axisForm();syncAssist();}}
function syncCompositeForm(){
  const composite=isComposite(p);$('compositeFields').hidden=!composite;if(!composite)return;
  $('dualYAxis').checked=!!p.dualYAxis;$('rightYTitle').value=p.rightYTitle||'';$('rightYTitleLabel').hidden=!p.dualYAxis;$('compositeErrors').checked=!!p.errorBars;
  $('connect').closest('label').hidden=false;$('tableNote').textContent='类别轴共用；每条记录的数值按系列角色对应柱端点或折线点。误差界限只属于柱，路径顺序只属于线。';
  if(!requiredAxes(p).includes(calTarget[0]))calTarget='y1';
}
$('dualYAxis').onchange=()=>change(()=>{p.dualYAxis=$('dualYAxis').checked;recalculate();},{form:true});
$('rightYTitle').onchange=()=>change(()=>p.rightYTitle=$('rightYTitle').value,{form:true});
$('compositeErrors').onchange=()=>change(()=>{if(!$('compositeErrors').checked&&p.rows.some(r=>present(r.lower)||present(r.upper)))throw Error('请先清除已有误差上下界再关闭误差棒');p.errorBars=$('compositeErrors').checked;},{form:true});
function axisForm(){
  const required=requiredAxes(p);
  if(isLine(p)&&!required.includes(calTarget[0]))calTarget=required[0]+'1';
  $('categoryAxisNote').hidden=required.length===2;
  $('categoryAxisNote').textContent=required.length===1?
    (required[0]==='x'?'Y':'X')+' 轴是类别轴，无需数值标定；在类别顺序中填写标签即可。':'';
  $('axisFields').innerHTML=required.map(a=>{
    const axis=p.axes[a],effective=isHeatmap(p)?heatmapAxisCalibration(p,a):axis;
    const ticks=[1,2].map(n=>{
      const pixel=axis['p'+n],gridPixel=effective['p'+n];
      const placeholder=!finite(pixel)&&finite(gridPixel)?` placeholder="网格边界 ${gridPixel.toFixed(1)}"`:'';
      return `<div class="tick-row"><button data-tick="${a}${n}" class="${tool==='calibrate'&&calTarget===a+n?'active':''}">${isComposite(p)?a==='r'?'右Y':'左Y':a.toUpperCase()}${n} 取刻度</button><label>原图像素<input type="number" step="any" data-axis="${a}" data-field="p${n}" value="${pixel??''}"${placeholder}></label><label>真实数值<input type="text" inputmode="decimal" data-axis="${a}" data-field="v${n}" value="${axis['v'+n]??''}"></label></div>`;
    }).join('');
    return `<div class="axis-group"><label><input type="checkbox" data-percent-scale="${a}" ${percentLabels(p,a)?'checked':''}> 原图数字带 %（25% 录入 25）</label><h4>${isComposite(p)?a==='r'?'右 Y（折线）':'左 Y（柱）':a.toUpperCase()} 轴 <small data-axis-status="${a}"></small></h4><label>坐标类型<select data-axis="${a}" data-field="type"><option value="linear" ${axis.type!=='log'?'selected':''}>线性</option><option value="log" ${axis.type==='log'?'selected':''}>对数</option></select></label>${ticks}</div>`;
  }).join('');
  if(isHeatmap(p))$('axisFields').insertAdjacentHTML('beforeend',`<label><input type="checkbox" data-percent-scale="color" ${percentLabels(p,'color')?'checked':''}> 色标数字带 %（25% 录入 25）</label>`);
  syncCalibrationStatus();
}
function updateHeatmapCalibration(axis){
  p.precisionVersion=1;
  p.axes[axis].calibrated=validHeatmapCalibration(p.axes[axis]);
}
function syncCalibrationStatus(){
  const required=requiredAxes(p);
  const calibrated=required.filter(axis=>isHeatmap(p)?
    validHeatmapCalibration(heatmapAxisCalibration(p,axis)):p.axes[axis].calibrated);
  for(const axis of required)document.querySelector('[data-axis-status="'+axis+'"]').textContent=calibrated.includes(axis)?'已校准':'待校准';
  $('calibrationStatus').textContent=calibrated.length===required.length?'所需数值轴已校准':'先取两个刻度再测量';
}
function columns(){if(isComposite(p))return ['category','value','series',...(hasErrors(p)?['lower','upper']:[]),...($('advancedFields').checked?['path_order']:[])];if(isPie(p))return ['category','value'];if(isBox(p))return ['category',...BOX_FIELDS,'outliers'];const series=p.kind.endsWith('_1')?[]:['series'];if(isArea(p))return [categoryField(p),'y','baseline',...series,...(p.kind==='area_stack'?['stack_order']:[])];if(isHistogramStack(p))return ['histogram_bin','value','series','stack_order'];if(isHistogram(p))return [...HISTOGRAM_FIELDS,...series];return bar()?['category','value',...series,...(isStack(p)?['start','end']:[]),...(isPercentStack(p)?['difference','stack_order']:[]),...(hasErrors(p)?['lower','upper']:[])]:['x','y',...series,...(p.kind.startsWith('line')&&$('advancedFields').checked?['path_order']:[])];}
const columnNames={category:'类别',histogram_bin:'所属分箱',bin_start:'分箱起始 bin_start',bin_end:'分箱结束 bin_end',value:'数值',series:'系列',x:'X',y:'Y',baseline:'下界 baseline',start:'段起点',end:'段终点',difference:'端点差值',stack_order:'堆叠顺序',path_order:'路径顺序',lower:'下限',upper:'上限',q1:'Q1',median:'中位数',q3:'Q3',outliers:'异常值'};
function table(){if(isHeatmap(p)){syncHeatmapTable();return;}const cols=columns();$('tableHead').innerHTML='<tr><th># / 来源</th>'+cols.map(k=>`<th>${isArea(p)&&k==='y'?'上界 Y':isHistogram(p)&&k==='value'?'统计值 value':isPercentStack(p)&&k==='value'?'占比 (%)':columnNames[k]}</th>`).join('')+'</tr>';
$('tableBody').innerHTML=p.rows.map((r,i)=>`<tr class="${i===selected?'selected':''}" data-row="${i}"><td>${isStat(p)?`<button class="small" data-move="-1" data-index="${i}" title="上移类别">↑</button><button class="small" data-move="1" data-index="${i}" title="下移类别">↓</button> `:''}${i+1} ${isHistogram(p)?'<span data-row-source>'+rowSource(i)+'</span>':p.evidence?.[i]?.pixel&&!(isPercentStack(p)&&p.evidence[i].valueOverride)?'⌖':'✎'}</td>${cols.map(k=>{
if(isComposite(p)&&(['lower','upper'].includes(k)&&compositeRole(p,identity(r))==='line'||k==='path_order'&&compositeRole(p,identity(r))==='bar'))return '<td>—</td>';
if(isBox(p)&&k==='outliers')return `<td>${outlierCells(r,i)}</td>`;if(isPie(p)&&k==='category')return `<td><input aria-label="第${i+1}行 类别" data-i="${i}" data-key="category" value="${esc(r.category)}"></td>`;
if(k==='difference')return `<td data-i="${i}" data-key="difference">${finite(r.difference)?r.difference:'—'}</td>`;
if(hasLayerOrder(p)&&k==='stack_order'){const index=p.series.findIndex(s=>s.key===identity(r));return `<td>${stackRank(p.series[index],index)}</td>`;}
if(k==='histogram_bin')return `<td><select aria-label="第${i+1}行 所属分箱" data-i="${i}" data-row-bin>
  <option value="">选择分箱</option>${(p.histogramBins??[]).map((bin,j)=>
    `<option value="${esc(bin.key)}"${r._histogramBin===bin.key?' selected':''}>第 ${j+1} 箱</option>`).join('')}</select></td>`;
const kind=k==='series'?'series':categorical()&&k===categoryField(p)?'category':null;
if(kind){const list=kind==='series'?p.series:p.categoryObjects,ref=kind==='series'?'_seriesKey':'_categoryKey';return `<td><select aria-label="第${i+1}行 ${columnNames[k]}" data-i="${i}" data-object="${kind}">${list.map((o,j)=>`<option value="${esc(o.key)}" ${r[ref]===o.key?'selected':''}>${esc(o.name)}（${j+1}）</option>`).join('')}</select></td>`;}
return `<td><input aria-label="第${i+1}行 ${columnNames[k]}" data-i="${i}" data-key="${k}"
  value="${esc(r[k])}" type="text" inputmode="decimal"></td>`;
}).join('')}</tr>`).join('');$('countBadge').textContent=`${p.rows.length} 条记录`;syncHistoryControls();}
function syncHistoryControls(){$('undo').disabled=!history.length;$('redo').disabled=!future.length;}
function rowSource(i){return histogramHandleKeys(p).some(k=>p.evidence?.[i]?.[k])?'⌖':'✎';}
function syncCategoryList(){
  const pie=isPie(p),list=$('categoryObjects');
  $('categories').value=(pie?p.rows.map(row=>row.category):p.categoryObjects.map(c=>c.name)).join('\n');
  $('categoryBulkLabel').textContent=pie?'批量输入类别名称':'批量输入对象名称';
  $('applyCategoryNames').textContent=pie?'应用类别名称':'应用对象名称';
  $('categoryBulkHint').textContent=pie?'按数据表顺序改名；多出的行新增待填数值的类别。减少行数会确认删除末尾记录。空行忽略，名称必须唯一。':
    '按当前位置顺序改名；多出的行新增对象，减少行数会确认删除末尾对象及记录。空行忽略，同名对象保持独立。';
  list.hidden=pie;
  if(pie)return;
  list.innerHTML=p.categoryObjects.map((c,i)=>`<div class="series-row"><input aria-label="类别位置 ${i+1} 名称" data-category="${esc(c.key)}" value="${esc(c.name)}"><button data-move-category="${esc(c.key)}" data-delta="-1" title="上移">↑</button><button data-move-category="${esc(c.key)}" data-delta="1" title="下移">↓</button><button data-remove-category="${esc(c.key)}" title="删除类别及记录">×</button></div>`).join('')+'<button type="button" id="addCategory">＋ 添加类别位置</button>';
  list.onchange=e=>{if(e.target.dataset.category)change(()=>renameObject(p,'category',e.target.dataset.category,e.target.value),{form:true});};
  list.onclick=e=>{const d=e.target.dataset;if(e.target.id==='addCategory')change(()=>addObject(p,'category','新类别'),{form:true});else if(d.moveCategory)change(()=>moveObject(p,'category',d.moveCategory,Number(d.delta)),{form:true});else if(d.removeCategory){if(p.rows.some(r=>r._categoryKey===d.removeCategory)&&!confirm('删除该类别位置及其全部记录？'))return;change(()=>{removeObject(p,'category',d.removeCategory);selected=-1;},{form:true});}};
}
function scheduleDraftSave(){clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,450);}
function refresh(form=false,keepTable=false){ensureIdentities(p);if(isPercentStack(p))syncPercentStackRatios(p);queueUI();if(form)syncForm();if(keepTable)syncHistoryControls();else table();syncAssist();syncPercentStackHeightPanel();draw();clearTimeout(renderTimer);renderTimer=setTimeout(render,130);scheduleDraftSave();}
let renderVersion=0;
async function render(){const version=++renderVersion;renderOk=false;let issues=validate(p);if(p.rows.length===0&&!isHeatmap(p))issues=[{severity:'warning',message:'添加数据记录后生成 GT。'}];$('issues').innerHTML=issues.length?issues.map(i=>`<li class="${i.severity}">${esc(i.message)}</li>`).join(''):'<li class="ok">数据结构检查通过。请继续核对原图与科学数值。</li>';$('validationBadge').textContent=issues.filter(i=>i.severity==='error').length+' 个错误';
try{const gt=makeSpec(p);$('jsonPreview').textContent=JSON.stringify(gt,null,2);if(!window.vegaEmbed)throw Error('本地 Vega 渲染组件未加载');const spec={...renderSpec(gt,p),width:230,height:210};for(const a of ['x','y']){if(!isHeatmap(p)&&!isStat(p)&&!isArea(p)&&!isHistogram(p)&&spec.encoding[a])spec.encoding[a].title=isPercentStack(p)?spec.encoding[a].title??null:p[a+'Title']||null;}if(!isHeatmap(p)&&!isStat(p)&&!isArea(p)&&!isHistogram(p)&&spec.encoding.color){spec.encoding.color.legend=p.legend?{...(spec.encoding.color.legend||{}),title:null}:null;const keys=unique((isComposite(p)?['bar','line'].flatMap(role=>orderedRows(compositePart(p,role))):orderedRows(p)).map(identity));spec.encoding.color.scale={domain:unique(allTableRows(gt).map(r=>r.series_id??r.series)),range:keys.map(k=>p.series.find(s=>s.key===k)?.color||'#008b7e')};}if(isHistogram(p))styleHistogramPreview(spec);if(isPie(p)&&p.donut)spec.mark={type:'arc',innerRadius:55};if(isBox(p)){const v=valueAxis(p);spec.layer[1].mark={type:'bar',size:26};spec.layer[2].mark={type:'tick',orient:horizontal()?'vertical':'horizontal',color:'#243344',size:26,thickness:2};if(p.axes[v].type==='log')for(const l of spec.layer)l.encoding[v].scale={type:'log'};}const holder=document.createElement('div');const result=await window.vegaEmbed(holder,spec,{actions:false,renderer:'svg'});result.view.finalize();if(version!==renderVersion)return;$('preview').replaceChildren(holder);globalThis.VegaLiteTableExport.exportTables(gt);lastSpec=gt;renderOk=true;$('renderState').textContent='Vega-Lite v6 · 语义渲染成功';}catch(e){if(version!==renderVersion)return;lastSpec=null;$('jsonPreview').textContent='请先修正数据结构。';$('preview').replaceChildren();$('renderState').textContent=p.rows.length?'无法渲染：'+e.message:'添加记录后显示语义重绘';}}
function assist(){
  ensureIdentities(p);p.assist??={};const a=p.assist;
  a.sequence??=bar()||isNominalArea(p)?'category':'series';if(isPercentStack(p)||isStack(p)&&a.sequence!=='manual')a.sequence='category';a.errorOrder??='per-bar';a.projections??=true;a.magnify??=true;a.dragAxis??='free';a.categoryPixels??={};if(isBox(p)){a.boxField??='lower';a.outlierTarget??='new';}
  if(lineCategoryAxis(p))a.lockCategory??=true;
  if(!p.series.some(s=>s.key===a.series))a.series=p.series.find(s=>s.name===a.series)?.key??p.series[0]?.key??'';
  if(!p.categoryObjects.some(c=>c.key===a.category))a.category=p.categoryObjects.find(c=>c.name===a.category)?.key??p.categoryObjects[0]?.key??'';
  return a;
}
function targetPairs(){const a=assist(),cats=p.categoryObjects.map(c=>c.key),series=p.series.map(s=>s.key);if(isBox(p))return cats.map(category=>({category,series:a.series}));return a.sequence==='series'?series.flatMap(series=>cats.map(category=>({series,category}))):cats.flatMap(category=>series.map(series=>({series,category})));}
function targetIndex(t){if(isBox(p))return p.rows.findIndex(r=>categoryIdentity(r)===t.category);return p.rows.findIndex(r=>identity(r)===t.series&&categoryIdentity(r)===t.category);}
const percentTargetKey=t=>JSON.stringify([t.category,t.series]);
const skippedPercentTarget=t=>isPercentStack(p)&&!!p.assist?.skippedPercentSegments?.[percentTargetKey(t)];
function clearPercentSkip(t){
  if(isPercentStack(p)&&p.assist?.skippedPercentSegments)delete p.assist.skippedPercentSegments[percentTargetKey(t)];
}
const percentEndpointLabel={start:'段起点',end:'段终点'};
function inheritedPercentStart(target){
  const series=p.series.map(s=>s.key),current=series.indexOf(target.series);
  let previous=-1,highest=-1;
  for(const [i,row] of p.rows.entries()){
    const rank=series.indexOf(identity(row));
    if(categoryIdentity(row)===target.category&&rank>highest&&rank<current){
      previous=i;highest=rank;
    }
  }
  const value=p.rows[previous]?.end;
  return finite(value)?{value,pixel:p.evidence?.[previous]?.pixel}:null;
}
function percentStackEndpoint(target){
  const choice=target.percentStackEndpoint;
  if(choice?.target===percentTargetKey(target)&&Object.hasOwn(percentEndpointLabel,choice.field))return choice.field;
  const row=p.rows[targetIndex(target)];
  return (finite(row?.start)||!finite(row?.end)&&inheritedPercentStart(target))?'end':'start';
}
function syncPercentStackRatioCategories(){
  const percentStack=isPercentStack(p);
  $('percentStackRatioControls').hidden=!percentStack;
  if(!percentStack)return;
  $('percentStackRatioCategories').innerHTML=p.categoryObjects.map((c,i)=>
    `<label class="target-cell check"><input type="checkbox" data-percent-ratio-category="${esc(c.key)}">
      ${esc(c.name)}（${i+1}）</label>`).join('');
}
let percentStackHeightCapture=null,percentStackHeightLayout='';
function syncPercentStackHeightPrompt(){
  const status=$('percentStackHeightStatus'),capture=percentStackHeightCapture;
  status.hidden=$('cancelPercentStackHeight').hidden=!capture;
  if(!capture)return;
  status.textContent=`「${categoryName(p,capture.category)}」在原图点击整柱${capture.start?'终点':'起点'}。`;
  $('hint').textContent=status.textContent;
  $('targetTop').textContent=`类别高度 · ${categoryName(p,capture.category)}`;
}
function syncPercentStackHeightPanel(){
  const panel=$('percentStackHeightControls');
  panel.hidden=!isPercentStack(p);
  if(panel.hidden)return;
  const first=firstPercentStackHeightCategory(p),categories=p.categoryObjects;
  if(percentStackHeightCapture&&
      percentStackHeightSource(p,percentStackHeightCapture.category,first)!==percentStackHeightCapture.category){
    setTool('select');
    return;
  }
  const list=$('percentStackHeightCategories');
  const layout=JSON.stringify(categories.map(c=>[c.key,c.name]));
  if(layout!==percentStackHeightLayout){
    percentStackHeightLayout=layout;
    list.innerHTML=categories.map((c,i)=>{
      const key=esc(c.key),name=esc(c.name)+'（'+(i+1)+'）';
      return `<div class="assist-controls">
        <label class="check"><input type="checkbox" data-height-selection="${key}"> ${name}</label>
        <input type="number" min="0" step="any" aria-label="${name}的类别高度" placeholder="可手填高度" data-height-value="${key}">
        <button type="button" class="small" aria-label="取点测量 ${name}" data-height-pick="${key}">原图取点</button>
        <small class="muted" data-height-source></small>
      </div>`;
    }).join('');
  }
  $('percentStackSharedHeight').checked=p.percentStackSharedHeight===true;
  $('selectAllPercentStackHeights').disabled=categories.every(c=>percentStackHeightSelected(p,c.key));
  $('clearPercentStackHeights').disabled=!first;
  for(const [i,row] of [...list.children].entries()){
    const key=categories[i].key,source=percentStackHeightSource(p,key,first);
    const check=row.querySelector('[data-height-selection]'),input=row.querySelector('[data-height-value]');
    const button=row.querySelector('[data-height-pick]'),note=row.querySelector('[data-height-source]');
    const record=p.percentStackCategoryHeights?.[source??key],height=recordedPercentStackHeight(p,source??key);
    const editable=source===key;
    check.checked=source!==null;
    input.disabled=!editable;
    const calibration=p.axes[valueAxis(p)];
    const value=height===null?'':positiveHeight(record?.value)?String(height):
      String(measuredNumber(height,2*axisUncertainty(height,calibration)));
    if(input.value!==value)input.value=value;
    button.disabled=!editable||!image;
    note.textContent=source&&source!==key?`沿用「${categoryName(p,source)}」`:record?.startPixel&&height!==null?'原图取点':'';
  }
  syncPercentStackHeightPrompt();
}
function syncPercentStackAssist(target){
  $('percentStackEndpoints').hidden=$('skipPercentStack').hidden=!isPercentStack(p);
  if(!isPercentStack(p))return;
  const checks=[...$('percentStackRatioCategories').querySelectorAll('[data-percent-ratio-category]')];
  for(const input of checks)input.checked=usesPercentStackRatio(p,input.dataset.percentRatioCategory);
  $('selectAllPercentRatios').disabled=checks.every(input=>input.checked);
  $('clearPercentRatios').disabled=checks.every(input=>!input.checked);
  $('tableNote').textContent='自动占比用段差值除以类别高度。类别高度留空时使用各段差值之和。手填占比优先。';
  const disabled=!target.category||!target.series,field=percentStackEndpoint(target);
  $('skipPercentStack').disabled=disabled||targetIndex(target)>=0||skippedPercentTarget(target);
  for(const button of $('percentStackEndpoints').querySelectorAll('[data-percent-endpoint]')){
    const active=button.dataset.percentEndpoint===field;
    button.disabled=disabled;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  if(disabled)return;
  $('targetHint').textContent+=' · 取'+percentEndpointLabel[field];
  if(tool==='point'){
    const row=p.rows[targetIndex(target)];
    const inherited=field==='end'&&!finite(row?.start)&&inheritedPercentStart(target);
    $('hint').textContent=(inherited?'起点沿用上一段终点（'+inherited.value+'）。':'')+'点击原图取'+percentEndpointLabel[field]+'。';
  }
}
function areaComplete(row){return finite(row?.y)&&finite(row?.baseline);}
function targetComplete(t){
  const row=p.rows[targetIndex(t)];
  if(isPercentStack(p))return row?validPercent(row.value)||usesPercentStackRatio(p,t.category)&&finite(row.difference):skippedPercentTarget(t);
  if(isNominalArea(p))return areaComplete(row);
  if(isBox(p))return !!row&&BOX_FIELDS.every(k=>finite(row[k]));
  return hasErrors(p)&&(!isComposite(p)||compositeRole(p,t.series)==='bar')?errorComplete(t):!!row;
}
function nextTarget(){const a=assist(),pairs=targetPairs(),at=pairs.findIndex(t=>t.series===a.series&&t.category===a.category);for(let offset=1;offset<=pairs.length;offset++){const t=pairs[(Math.max(at,0)+offset)%pairs.length];if(isPercentStack(p)?!targetComplete(t):targetIndex(t)<0||(isBox(p)||isNominalArea(p))&&!targetComplete(t)){if(isBox(p))a.boxField='lower';if(isPercentStack(p))delete a.percentStackEndpoint;a.series=t.series;a.category=t.category;syncAssist();return true;}}syncAssist();return false;}
function errorTask(){if(!hasErrors(p)||isStack(p))return null;const a=assist(),pairs=targetPairs();
  const fields=t=>isComposite(p)&&compositeRole(p,t.series)==='line'?['value']:['value','upper','lower'];
  const missing=t=>{const i=targetIndex(t);return i<0||!finite(p.rows[i][t.field]);};
  if(!pairs.length)return {category:'',series:a.series,field:'value'};
  if(a.errorOrder==='passes')return ['value','upper','lower'].flatMap(field=>pairs.filter(t=>fields(t).includes(field)).map(t=>({...t,field}))).find(missing)||null;
  const current={category:a.category,series:a.series},own=fields(current).map(field=>({...current,field})).find(missing);
  return own||pairs.flatMap(t=>fields(t).map(field=>({...t,field}))).find(missing)||null;
}
function syncErrorTarget(){const t=errorTask();if(t){assist().series=t.series;assist().category=t.category;}return t;}
function errorComplete(t){const i=targetIndex(t);return i>=0&&['value','lower','upper'].every(k=>finite(p.rows[i][k]));}
function measureError(raw){const t=syncErrorTarget();if(!t){toast('误差棒全部标注完成；选择 / 拖动可复查');return;}calibrated();if(!t.category)throw Error('请先填写类别');const i=targetIndex(t),axis=horizontal()?'x':'y';const pt=t.field==='value'?constrainAdd(raw):{...raw,...(p.evidence?.[i]?.pixel?{[horizontal()?'y':'x']:p.evidence[i].pixel[horizontal()?'y':'x']}:{})};const value=measuredAxisValue(pt[axis],p.axes[measurementAxis(p,t.series)]);change(()=>{let index=i;if(t.field==='value'&&i<0){p.rows.push({category:categoryName(p,t.category),series:seriesName(p,t.series),_categoryKey:t.category,_seriesKey:t.series,value});p.evidence??=[];p.evidence.push({role:'observation',source:'pixel_measurement',createdAt:new Date().toISOString()});index=p.rows.length-1;}p.rows[index][t.field]=value;p.evidence??=[];p.evidence[index]??={role:'observation',source:'pixel_measurement'};const key=t.field==='value'?'pixel':t.field+'Pixel';p.evidence[index][key]=pt;if(t.field==='value'&&assist().lockCategory){if(horizontal())p.evidence[index].fixedY={pixel:pt.y};else p.evidence[index].fixedX={pixel:pt.x};}selected=index;selectedHandle=key;syncErrorTarget();});}
function anchorKey(){if(isComposite(p)){const a=assist();return JSON.stringify([a.category,compositeRole(p,a.series)==='bar'?a.series:'line']);}const a=assist();return JSON.stringify(p.kind==='barv_n'||p.kind==='barh_n'?[a.category,a.series]:[a.category]);}
function syncAssist(){
  if(isHeatmap(p))syncHeatmapSelection();
  const a=assist(),task=syncErrorTarget();$('errorOrderLabel').hidden=!hasErrors(p)||isStack(p);$('errorOrder').value=a.errorOrder;for(const k of ['lower','upper'])document.querySelector('[data-tool='+k+']').hidden=!hasErrors(p);
  for(const k of ['area-upper','area-baseline']){
    const button=document.querySelector('[data-tool='+k+']');
    button.hidden=!isArea(p);button.disabled=!p.rows[selected]||!(isNominalArea(p)?present(p.rows[selected].category):finite(p.rows[selected].x));
  }$('advancedFieldsLabel').hidden=!p.kind.startsWith('line')&&!isComposite(p);$('activeSeries').value=a.series;$('activeCategory').value=a.category;
  $('sequence').value=a.sequence;$('sequenceLabel').hidden=!categorical()||isBox(p)||isPercentStack(p);$('nextTarget').hidden=!categorical();$('numericLock').hidden=categorical()||isPie(p)||isHistogram(p);$('unlockPoint').hidden=isHistogram(p);$('categoryLock').hidden=!categorical();
  for(const [id,key]of [['projections','projections'],['magnify','magnify'],['lockX','lockX'],['lockCategory','lockCategory']])$(id).checked=!!a[key];
  if(document.activeElement!==$('fixedX')){
    $('fixedX').value=isArea(p)&&(tool==='lock-x'||finite(a.fixedXPixel))?'':a.fixedXValue??'';
  }
  $('dragAxis').value=a.dragAxis;
  const pairs=categorical()?targetPairs():[],done=pairs.filter(targetComplete).length;
  $('targetHint').textContent=isPie(p)?'Pie：在数据表录入类别及原始数值':isBox(p)?`当前目标：${categoryName(p,a.category)||'请填写类别'} · ${a.boxField}`:categorical()?`当前目标：${categoryName(p,a.category)||'请先填写类别'} · ${seriesName(p,a.series)}`:`当前系列：${seriesName(p,a.series)}${a.lockX?' · 固定 X = '+(a.fixedXValue??'待填写'):''}`;
  syncPercentStackAssist(a);
  if(isArea(p)){
    if(tool==='point'){
      const row=p.rows[areaTargetIndex()];
      $('targetHint').textContent+=isNominalArea(p)&&areaComplete(row)?' · 边界已完成':
        finite(row?.y)?' · 取下界 baseline（同一 X）':' · 取上界 Y';
    }else if(tool==='area-upper'||tool==='area-baseline'){
      $('targetHint').textContent=p.rows[selected]?`第 ${selected+1} 行 · X = ${p.rows[selected][categoryField(p)]} · ${tool==='area-upper'?'重取上界':'重取下界'}`:'请先选中有 X 数值的记录';
    }
  }
  syncHistogramAssist();
  if(hasErrors(p)&&!isStack(p))$('targetHint').textContent=task?'下一点：'+categoryName(p,task.category)+' · '+seriesName(p,task.series)+' · '+({value:isComposite(p)&&compositeRole(p,task.series)==='line'?'折线点':'柱子数值端点',upper:'误差上界（较大值）',lower:'误差下界（较小值）'}[task.field]):'误差棒取点完成，可选择标记复查';if(isComposite(p))$('targetHint').textContent+=' · '+(compositeRole(p,a.series)==='line'?'折线':'柱')+' / '+(measurementAxis(p,a.series)==='r'?'右 Y':'左 Y');if(!isHeatmap(p))$('targetTop').textContent=$('targetHint').textContent; $('targetProgress').textContent=pairs.length?`${done} / ${pairs.length} 已标注`:'';
  syncHistogramWorkflow();
  $('targetGrid').hidden=!categorical();$('targetGrid').innerHTML=pairs.map((t,i)=>`<button class="target-cell ${targetComplete(t)?'done':''} ${t.series===a.series&&t.category===a.category?'current':''}" data-target="${i}" title="${esc(categoryName(p,t.category)+' · '+seriesName(p,t.series))}">${skippedPercentTarget(t)?'缺 ':targetComplete(t)?'✓ ':''}${esc(categoryName(p,t.category))} <small>${isBox(p)?BOX_FIELDS.filter(k=>finite(p.rows[targetIndex(t)]?.[k])).length+'/5':esc(seriesName(p,t.series))}</small></button>`).join('');
  const anchor=a.categoryPixels[anchorKey()];$('anchorStatus').textContent=Number.isFinite(anchor)?`已定位 ${anchor.toFixed(1)} px`:'尚未定位';
  $('unlockPoint').disabled=selected<0||!p.evidence?.[selected]?.fixedX;
  syncBoxTarget();syncPieAngles();$('magnifier').hidden=!image||!a.magnify||!hover;document.querySelector('.lens-dock').hidden=!a.magnify;document.querySelector('.image-stage').classList.toggle('no-lens',!a.magnify);
}
function constrainAdd(pt){const a=assist(),out={...pt};if(categorical()&&a.lockCategory){const pixel=a.categoryPixels[anchorKey()];if(finite(pixel))out[categoryPixelAxis()]=pixel;else if(!lineCategoryAxis(p))throw Error('请先定位当前类别刻度（分组柱需定位当前系列的柱中心）');}
  if(!categorical()&&a.lockX){if(!Number.isFinite(a.fixedXValue))throw Error('请先填写固定 X 的真实数值');if(p.axes.x.type==='log'&&a.fixedXValue<=0)throw Error('对数 X 数值必须大于零');if(Number.isFinite(a.fixedXPixel))out.x=a.fixedXPixel;else{if(!p.axes.x.calibrated)throw Error('请在原图定位 X 刻度，或先校准 X 轴');out.x=valueToPixel(a.fixedXValue,p.axes.x);}}
  return bounded(out);
}
function bounded(pt){return{x:Math.max(0,Math.min(image.width,pt.x)),y:Math.max(0,Math.min(image.height,pt.y))};}
function constrainDrag(pt,i,kind='pixel',shift=false){const out=bounded(pt),e=p.evidence[i],old=e[kind]||e.pixel,a=assist();if(kind==='pixel'&&e.fixedX)out.x=old.x;if(kind==='pixel'&&e.fixedY)out.y=old.y;if(isBar(p)&&(kind==='lowerPixel'||kind==='upperPixel'))out[horizontal()?'y':'x']=(e.pixel||old)[horizontal()?'y':'x'];
  const lineCategory=lineCategoryAxis(p);
  if(kind==='pixel'&&lineCategory)out[lineCategory]=old[lineCategory];
  if(kind==='baselinePixel'||kind==='pixel'&&isNominalArea(p)||kind==='startPixel'&&e.fixedX)out.x=old.x;
  if(a.dragAxis==='y')out.x=old.x;if(a.dragAxis==='x')out.y=old.y;
  if(shift&&dragOrigin){if(Math.abs(out.x-dragOrigin.x)>=Math.abs(out.y-dragOrigin.y))out.y=dragOrigin.y;else out.x=dragOrigin.x;}return out;
}
function editHandle(i,kind,pt){
  if(isHistogram(p)){applyHistogramMeasurement(i,histogramMeasurementUpdate(i,kind,pt));return;}
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
  if(isPercentStack(p)){
    requirePercentStackCalibration(p);
    useNumericPercentStack(categoryIdentity(p.rows[i]));
  }
  const old=p.evidence[i][kind],axis=horizontal()?'x':'y';
  const related=isStack(p)&&['pixel','startPixel'].includes(kind)&&old?p.rows.flatMap((r,j)=>j!==i&&categoryIdentity(r)===categoryIdentity(p.rows[i])?['pixel','startPixel'].filter(k=>{const q=p.evidence?.[j]?.[k];return q&&q.x===old.x&&q.y===old.y;}).map(k=>({j,k})):[]):[];
  const update=(j,k)=>{
    if(isPercentStack(p)){
      p.evidence[j][k]={...pt};
      updatePercentStackValue(p,p.rows[j],p.evidence[j]);
    }else if(k==='pixel')applyPixel(j,pt);else if(k==='startPixel'){p.evidence[j].startPixel={...pt};p.rows[j].start=measuredAxisValue(pt[axis],p.axes[axis]);p.rows[j].value=decimalDifference(p.rows[j].end,p.rows[j].start);}else{const key=k==='lowerPixel'?'lower':'upper';p.evidence[j][k]={...pt};p.rows[j][key]=measuredAxisValue(pt[axis],p.axes[measurementAxis(p,identity(p.rows[j]))]);}p.evidence[j].modifiedAt=new Date().toISOString();};
  update(i,kind);for(const {j,k} of related)update(j,k);pendingStart=null;
}
function drawMagnifier(pt,visible){
  $('magnifier').hidden=!visible;
  if(!visible)return;
  const lc=$('lens').getContext('2d');
  lc.clearRect(0,0,140,140);lc.fillStyle='white';lc.fillRect(0,0,140,140);
  lc.imageSmoothingEnabled=false;lc.drawImage(image,pt.x-14,pt.y-14,28,28,0,0,140,140);
  lc.strokeStyle='#f05c35';lc.lineWidth=1;lc.beginPath();lc.moveTo(58,70);lc.lineTo(82,70);lc.moveTo(70,58);lc.lineTo(70,82);lc.stroke();
}
function drawGuides(){
  if(isPie(p)||isHeatmap(p))return;
  const a=assist(),e=p.evidence?.[selected],selectedPt=e?.[selectedHandle]||e?.pixel;
  let pt=drag!==null||tool==='select'&&selectedPt?selectedPt:hover||selectedPt;if(!pt&&tool==='point'){try{if(a.lockX||a.lockCategory)pt=constrainAdd({x:p.axes.x.p1,y:p.axes.y.p1});}catch{}}if(!pt)return;
  if(hover&&drag===null)try{if(isArea(p)&&areaTool())pt=areaPoint(hover);else if(tool==='point'&&!isHistogram(p))pt=constrainAdd(hover);}catch{}
  const guideAxis=isComposite(p)?p.axes[measurementAxis(p,selected>=0&&tool==='select'?identity(p.rows[selected]):a.series)]:p.axes.y;
  const baseX=guideAxis.point1?.x??p.axes.x.p1,baseY=p.axes.x.point1?.y??p.axes.y.p1;
  const target=isArea(p)&&areaTool()?areaTargetIndex():hover&&tool==='point'&&drag===null?-1:selected;
  let values={};try{values=measureAt(pt,target>=0?target:null);}catch{}
  projectionInfo={point:{...pt},baseX,baseY,values};
  if(a.projections&&Object.keys(values).length){ctx.save();ctx.strokeStyle='#ed8b32';ctx.fillStyle='#9f5414';ctx.lineWidth=1/zoom;ctx.setLineDash([5/zoom,4/zoom]);ctx.beginPath();ctx.moveTo(baseX,pt.y);ctx.lineTo(pt.x,pt.y);ctx.lineTo(pt.x,baseY);ctx.stroke();ctx.setLineDash([]);ctx.font=`${11/zoom}px monospace`;const format=v=>String(v??'');const x=isBox(p)?(horizontal()?values.value:values.category):bar()?(horizontal()?values.value:values.category):values[isNominalArea(p)?'category':'x'],y=isBox(p)?(horizontal()?values.category:values.value):bar()?(horizontal()?values.category:values.value):values.y;
  const text=(s,x,y)=>{const w=ctx.measureText(s).width;ctx.fillStyle='#fffef3';ctx.fillRect(Math.max(0,x-3/zoom),Math.max(0,y-12/zoom),w+6/zoom,16/zoom);ctx.fillStyle='#9f5414';ctx.fillText(s,Math.max(0,Math.min(x,image.width-w)),Math.max(12/zoom,Math.min(y,image.height-3/zoom)));};
  text('X: '+format(x),pt.x+4/zoom,Math.min(image.height-4/zoom,baseY+18/zoom));text('Y: '+format(y),Math.max(2/zoom,baseX+5/zoom),pt.y-6/zoom);ctx.restore();}
  const fixed=(!categorical()&&a.lockX)||categorical()&&a.lockCategory;if(fixed&&tool==='point'||isArea(p)&&areaTool()&&target>=0){let guide;try{guide=isArea(p)?areaPoint(pt):constrainAdd(pt);}catch{}if(guide){ctx.save();ctx.strokeStyle='#008b7e';ctx.lineWidth=1.5/zoom;ctx.setLineDash([3/zoom,3/zoom]);ctx.beginPath();if(categorical()&&categoryPixelAxis()==='y'){ctx.moveTo(0,guide.y);ctx.lineTo(image.width,guide.y);}else{ctx.moveTo(guide.x,0);ctx.lineTo(guide.x,image.height);}ctx.stroke();ctx.restore();}}
  drawMagnifier(pt,a.magnify&&!!hover);
}
$('errorOrder').onchange=()=>{assist().errorOrder=$('errorOrder').value;syncErrorTarget();refresh();};$('advancedFields').onchange=table;
$('sequence').onchange=()=>{assist().sequence=$('sequence').value;refresh();};
for(const id of ['projections','magnify','lockX','lockCategory'])$(id).onchange=()=>{assist()[id]=$(id).checked;refresh();};
$('fixedX').onchange=()=>{const a=assist();a.fixedXValue=$('fixedX').value===''?null:Number($('fixedX').value);a.fixedXPixel=null;a.lockX=true;refresh();};
$('dragAxis').onchange=()=>{assist().dragAxis=$('dragAxis').value;refresh();};
for(const id of ['activeSeries','activeCategory'])$(id).onchange=()=>{const a=assist();a[id==='activeSeries'?'series':'category']=$(id).value;if(isPercentStack(p))delete a.percentStackEndpoint;pendingStart=null;if(id==='activeSeries'&&isHistogram(p)&&!isHistogramStack(p))selected=-1;if(isBox(p)){selected=targetIndex(a);selectedHandle=boxHandle(a.boxField);hover=null;}refresh();};
$('nextTarget').onclick=()=>{if(isPercentStack(p))delete assist().percentStackEndpoint;if(!nextTarget())toast('所有类别和系列均已标注，可点击进度格复查');refresh();};
$('skipPercentStack').onclick=()=>{
  const a=assist();
  change(()=>{
    (a.skippedPercentSegments??={})[percentTargetKey(a)]=true;
    delete a.percentStackEndpoint;
    nextTarget();
  });
};
$('percentStackEndpoints').onclick=e=>{
  const field=e.target.dataset.percentEndpoint;
  if(!field)return;
  const a=assist();
  a.percentStackEndpoint={target:percentTargetKey(a),field};
  selected=targetIndex(a);selectedHandle=field==='start'?'startPixel':'pixel';
  setTool('point');
  table();
};
function setPercentStackRatioCategories(keys,enabled){
  const changed=keys.filter(key=>usesPercentStackRatio(p,key)!==enabled);
  if(!changed.length)return;
  change(()=>{
    p.precisionVersion=1;
    const categories=p.percentStackRatioCategories??={};
    for(const key of changed){
      if(enabled)categories[key]=true;
      else delete categories[key];
    }
    if(!enabled)recalculatePercentStack(new Set(changed),true);
  });
}
$('percentStackRatioCategories').onchange=e=>{
  const key=e.target.dataset.percentRatioCategory;
  if(key)setPercentStackRatioCategories([key],e.target.checked);
};
$('selectAllPercentRatios').onclick=()=>setPercentStackRatioCategories(p.categoryObjects.map(c=>c.key),true);
$('clearPercentRatios').onclick=()=>setPercentStackRatioCategories(p.categoryObjects.map(c=>c.key),false);
function setPercentStackHeightSelection(keys,enabled){
  const changed=keys.filter(key=>percentStackHeightSelected(p,key)!==enabled);
  if(!changed.length)return;
  change(()=>{
    p.precisionVersion=1;
    const records=p.percentStackCategoryHeights??={};
    for(const key of changed)(records[key]??={}).selected=enabled;
  });
}
$('selectAllPercentStackHeights').onclick=()=>setPercentStackHeightSelection(p.categoryObjects.map(c=>c.key),true);
$('clearPercentStackHeights').onclick=()=>setPercentStackHeightSelection(p.categoryObjects.map(c=>c.key),false);
$('percentStackSharedHeight').onchange=e=>change(()=>{p.percentStackSharedHeight=e.target.checked;});
$('cancelPercentStackHeight').onclick=()=>setTool('select');
$('percentStackHeightCategories').onchange=e=>{
  const input=e.target,{heightSelection,heightValue}=input.dataset;
  if(heightSelection){setPercentStackHeightSelection([heightSelection],input.checked);return;}
  if(!heightValue||input.disabled)return;
  const value=input.value===''?null:Number(input.value);
  if(input.validity.badInput||value!==null&&!positiveHeight(value)){
    input.value='';
    syncPercentStackHeightPanel();
    toast('类别高度必须为有限的正数');
    return;
  }
  change(()=>{
    p.percentStackCategoryHeights[heightValue]=value===null?{selected:true}:{selected:true,value};
  });
};
$('percentStackHeightCategories').onclick=e=>{
  const category=e.target.dataset.heightPick;
  if(!category||!image)return;
  try{requirePercentStackCalibration(p);}catch(error){toast(error.message);return;}
  percentStackHeightCapture={category,start:null};
  setTool('percent-stack-height');
};
$('targetGrid').onclick=e=>{const button=e.target.closest('[data-target]');if(!button)return;const t=targetPairs()[+button.dataset.target],a=assist();a.series=t.series;a.category=t.category;if(isPercentStack(p))delete a.percentStackEndpoint;pendingStart=null;const i=targetIndex(t);if(i>=0){selected=i;selectedHandle=isBox(p)?boxHandle(a.boxField):'pixel';hover=null;}$('hint').textContent=i>=0?'该目标已标注：拖动高亮标记或编辑表格修正。':'点击原图标注当前目标';refresh();};
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
    r.x=areaValueAt(pt.x,p.axes.x);delete r._percentData?.x;
    e.xPixel=pt.x;
    if(e.baselinePixel)e.baselinePixel.x=pt.x;
  }
  const field=handle==='pixel'?'y':'baseline';
  r[field]=y;delete r._percentData?.[field];
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
function editAreaCell(i,key,raw,scale){
  change(()=>{
    recordTablePercent(p.rows[i],key,scale);
    p.rows[i][key]=raw===''?null:Number(raw);
    p.evidence??=[];
    const e=p.evidence[i]??={};
    if(key==='x'){
      for(const field of ['pixel','baselinePixel','xPixel','fixedX'])delete e[field];
    }else delete e[key==='y'?'pixel':'baselinePixel'];
    e.role='transcribed';e.source='manual_edit';
  });
}

// Histogram measurement uses the shared calibration and canvas with per-field evidence.
const histogramHandleLabels={
  bin_startPixel:'分箱起始边界',bin_endPixel:'分箱结束边界',valuePixel:'柱子的统计值端点',
  valueStartPixel:'堆叠段起点（靠近零端）',valueEndPixel:'堆叠段终点（远离零端）'
};
const histogramValueField=handle=>handle.startsWith('value')?'value':handle.replace(/Pixel$/,'');
const histogramHandleKeys=p=>HISTOGRAM_FIELDS.flatMap(field=>histogramHandles(p,field));

function styleHistogramPreview(spec){
  if(!spec.encoding.color)return;
  const domain=unique(spec.data.values.map(row=>row.series));
  spec.encoding.color.scale={domain,range:domain.map(name=>p.series.find(s=>s.name===name)?.color||'#008b7e')};
  spec.encoding.color.legend=p.legend?{title:null}:null;
  if(!isHistogramStack(p))spec.mark.opacity=.6;
}

function selectedHistogramBin(){
  if(!isHistogramStack(p)||selected>=0)return;
  return p.histogramBins?.find(bin=>bin.key===p.assist?.histogramBin);
}

function histogramManualHandles(){
  if(!isHistogramStack(p))return histogramHandleKeys(p);
  return selectedHistogramBin()?HISTOGRAM_BOUNDARY_HANDLES:histogramHandles(p,'value');
}

function syncHistogramAssist(){
  const active=isHistogram(p);
  $('histogramFieldLabel').hidden=!active;
  if(!active)return;
  const a=assist(),handles=histogramManualHandles(),row=p.rows[selected],bin=selectedHistogramBin();
  if(!handles.includes(a.histogramHandle))a.histogramHandle=handles[0];
  options($('histogramField'),handles.map(k=>[k,histogramHandleLabels[k]]),a.histogramHandle);
  $('histogramField').disabled=!row&&!bin;
  const item=histogramHandleLabels[a.histogramHandle];
  if(bin)$('targetHint').textContent=`第 ${p.histogramBins.indexOf(bin)+1} 箱 · ${item}`;
  else if(row)$('targetHint').textContent=`第 ${selected+1} 行${p.kind.endsWith('_1')?'':' · '+row.series} · ${item}`;
  else if(isHistogramStack(p))$('targetHint').textContent='选择分箱测量边界，或选择记录测量堆叠段';
  else $('targetHint').textContent=p.kind.endsWith('_n')?
    `当前系列：${seriesName(p,a.series)} · 可连续录入或逐条标定`:'添加或选中一条直方图记录，再选择测量项';
}

function appendHistogramRow(series,data={},evidence={role:'transcribed',source:'manual_entry'}){
  const index=p.rows.length;
  p.rows.push({bin_start:null,bin_end:null,value:null,series:seriesName(p,series),_seriesKey:series,...data});
  p.evidence??=[];
  p.evidence[index]=evidence;
  return index;
}

function addHistogramRow(){
  const a=assist(),bin=selectedHistogramBin();
  if(bin&&hasHistogramSegment(bin.key,a.series)){
    toast('该分箱和系列已有记录，请选择已有记录或切换系列');
    return;
  }
  change(()=>{
    if(isHistogramStack(p))p.histogramBins??=[];
    selected=appendHistogramRow(a.series,bin?{_histogramBin:bin.key}:{});
    if(bin)syncHistogramBoundaries();
    delete a.histogramBin;
    selectedHandle=a.histogramHandle=histogramManualHandles()[0];
  });
  document.querySelector(isHistogramStack(p)?`[data-i="${selected}"][data-row-bin]`:
    `[data-i="${selected}"][data-key="bin_start"]`)?.focus();
}

function histogramTickValue(axis,pixel){
  const calibration=p.axes[axis];
  if(!calibration.calibrated)throw Error('请先用两个真实刻度校准 '+axis.toUpperCase()+' 轴');
  const value=pixelToValue(pixel,calibration);
  if(!finite(value))throw Error('当前标定无法得到有限数值，请核对刻度或手动填写');
  return value;
}

function histogramMeasuredValue(field,evidence){
  const axis=histogramFieldAxis(p,field),handles=histogramHandles(p,field);
  if(!handles.every(handle=>evidence[handle]))return null;
  const [first,last]=handles.map(handle=>histogramTickValue(axis,evidence[handle][axis]));
  const value=last===undefined?first:last-first;
  if(!finite(value))throw Error('测得的差值超出数值范围，请核对刻度或手动填写');
  if(field==='value'&&isHistogramStack(p)&&value<0)throw Error('堆叠段高度不能为负数，请核对起点和终点');
  const calibration=p.axes[axis];
  if(last===undefined)return measuredAxisValue(evidence[handles[0]][axis],calibration);
  return measuredNumber(value,axisUncertainty(first,calibration)+axisUncertainty(last,calibration));
}

function histogramMeasurement(row,previous,handle,pt,inherited=false){
  const field=histogramValueField(handle),axis=histogramFieldAxis(p,field);
  if(finite(row?.[field])&&!inherited&&!histogramHasEvidence(p,field,previous)){
    throw Error('此值由手动录入或 GT 导入。清空该单元格后才可用像素测量填入');
  }
  histogramTickValue(axis,pt[axis]);
  const evidence={...previous,[handle]:pt,role:'observation',source:'pixel_measurement'};
  const value=histogramMeasuredValue(field,evidence);
  return {field,value,evidence};
}

function histogramMeasurementUpdate(i,handle,pt){
  const row=p.rows[i];
  if(isHistogramStack(p)&&histogramValueField(handle)!=='value'){
    throw Error('请在「堆叠共享分箱边界」中调整边界');
  }
  return histogramMeasurement(row,p.evidence?.[i],handle,pt,handle==='bin_startPixel'&&!!row._histogramPrevious);
}

function applyHistogramMeasurement(i,{field,value,evidence}){
  const row=p.rows[i];
  row[field]=value;
  if(field==='bin_start')delete row._histogramPrevious;
  p.evidence??=[];
  p.evidence[i]=evidence;
  if(field!=='value')syncHistogramBoundaries();
}

function measureHistogram(pt){
  if(activeHistogramRun())return measureHistogramRun(pt);
  const a=assist(),handle=a.histogramHandle,handles=histogramManualHandles(),bin=selectedHistogramBin();
  if(bin){
    const update=histogramMeasurement(bin,bin.evidence,handle,pt,handle==='bin_startPixel'&&bin.inheritStart);
    change(()=>{
      applyHistogramBinMeasurement(bin,update);
      selectedHandle=handle;
      a.histogramHandle=handles[handles.indexOf(handle)+1]??handle;
    });
    return;
  }
  if(!p.rows[selected])throw Error('请先添加或选中一条数据记录');
  const update=histogramMeasurementUpdate(selected,handle,pt);
  change(()=>{
    applyHistogramMeasurement(selected,update);
    selectedHandle=handle;
    a.histogramHandle=handles[handles.indexOf(handle)+1]??handle;
  });
}

function editHistogramCell(i,field,raw,scale){
  const row=p.rows[i],run=activeHistogramRun();
  const value=raw===''?null:Number(raw);
  const candidate={...row,[field]:value};
  const willAdvance=run&&!run.stacked&&histogramRunTarget(run).row===row&&
    completeHistogramBin(candidate)&&finite(candidate.value);
  change(()=>{
    recordTablePercent(row,field,scale);
    row[field]=value;
    if(field==='bin_start')delete row._histogramPrevious;
    p.evidence??=[];
    const evidence=p.evidence[i]??={};
    for(const handle of histogramHandles(p,field))delete evidence[handle];
    evidence.role='transcribed';evidence.source='manual_edit';
    if(field!=='value')syncHistogramBoundaries();
    if(run&&!run.stacked&&histogramRunTarget(run).row===row){
      run.handle=null;
      if(willAdvance)advanceHistogramRun(run);
    }
  },{keepTable:!willAdvance});
  if(!willAdvance){
    document.querySelector(`[data-row="${i}"] [data-row-source]`).textContent=rowSource(i);
    p.rows.forEach((item,index)=>{
      if(item._histogramPrevious)document.querySelector(`[data-i="${index}"][data-key="bin_start"]`).value=item.bin_start??'';
    });
  }
}

function updateHistogramCalibration(axis){
  const calibration=p.axes[axis];
  try{
    axisTransform(calibration);
    calibration.calibrated=true;
  }catch{
    calibration.calibrated=false;
    return;
  }
  for(const [i,row] of p.rows.entries()){
    const evidence=p.evidence?.[i];
    for(const field of HISTOGRAM_FIELDS){
      if(row._histogramBin&&field!=='value'||histogramFieldAxis(p,field)!==axis||
          !histogramHasEvidence(p,field,evidence))continue;
      try{row[field]=histogramMeasuredValue(field,evidence);}
      catch{row[field]=null;}
    }
  }
  if(axis===histogramBinAxis(p)){
    for(const bin of p.histogramBins??[]){
      for(const field of ['bin_start','bin_end']){
        if(!histogramHasEvidence(p,field,bin.evidence))continue;
        try{bin[field]=histogramMeasuredValue(field,bin.evidence);}
        catch{bin[field]=null;}
      }
    }
  }
  syncHistogramBoundaries();
}

// Guided histogram state belongs to the project so it survives undo and restore.
const histogramRunSize=run=>run.count*(run.phase==='segment'?run.series.length:1);
const histogramRunSeriesExist=run=>run.series.every(key=>p.series.some(series=>series.key===key));
function activeHistogramRun(){
  const run=isHistogram(p)?p.histogramRun:null;
  return run&&run.step<histogramRunSize(run)&&histogramRunSeriesExist(run)?run:null;
}

function histogramRunTarget(run){
  const binIndex=run.step%run.count;
  if(!run.stacked){
    const key=run.entries[binIndex],rowIndex=key?p.rows.findIndex(row=>row._histogramEntry===key):-1;
    return {phase:'row',binIndex,rowIndex,row:p.rows[rowIndex],series:run.series[0],handles:histogramHandleKeys(p)};
  }
  const bin=p.histogramBins[binIndex];
  if(run.phase==='bounds')return {phase:'bounds',binIndex,bin,handles:HISTOGRAM_BOUNDARY_HANDLES};
  const series=run.series[Math.floor(run.step/run.count)];
  const rowIndex=p.rows.findIndex(row=>row._histogramBin===bin.key&&identity(row)===series);
  return {phase:'segment',binIndex,bin,rowIndex,row:p.rows[rowIndex],series,handles:histogramHandles(p,'value')};
}

function histogramRunHandle(run,target){
  if(run.handle)return run.handle;
  if(target.phase==='segment'){
    const evidence=run.pending[run.step]??p.evidence?.[target.rowIndex];
    return finite(target.row?.value)||evidence?.valueStartPixel?'valueEndPixel':'valueStartPixel';
  }
  const item=target.row??target.bin;
  if(target.phase==='row'&&finite(item?.bin_start)&&!completeHistogramBin(item))return 'bin_endPixel';
  return target.handles.find(handle=>!finite(item?.[histogramValueField(handle)]))??target.handles.at(-1);
}

function selectHistogramRunTarget(){
  const run=activeHistogramRun();
  if(!run)return;
  const target=histogramRunTarget(run);
  delete assist().histogramBin;
  selected=target.rowIndex??-1;
  selectedHandle=histogramRunHandle(run,target);
  if(target.series)assist().series=target.series;
}

function syncHistogramBoundaries(){
  const entries=new Map(p.rows.filter(row=>row._histogramEntry).map(row=>[row._histogramEntry,row]));
  const bins=new Map();
  const copyBoundary=(target,field,source,origin)=>{
    target[field]=source[origin];
    recordTablePercent(target,field,source._percentData?.[origin]);
  };
  for(const [i,bin] of (p.histogramBins??[]).entries()){
    if(bin.inheritStart&&i>0)copyBoundary(bin,'bin_start',p.histogramBins[i-1],'bin_end');
    bins.set(bin.key,bin);
  }
  for(const row of p.rows){
    if(row._histogramPrevious){
      const previous=entries.get(row._histogramPrevious);
      if(previous)copyBoundary(row,'bin_start',previous,'bin_end');
      else delete row._histogramPrevious;
    }
    const bin=bins.get(row._histogramBin);
    if(bin)for(const field of ['bin_start','bin_end'])copyBoundary(row,field,bin,field);
  }
}

function prepareHistogramTarget(run){
  const target=histogramRunTarget(run),i=target.binIndex;
  if(target.phase==='row'&&!target.row){
    const key=newKey('histogram-entry');
    appendHistogramRow(target.series,{_histogramEntry:key,...(i?{_histogramPrevious:run.entries[i-1]}:{})});
    run.entries[i]=key;
  }
  if(target.phase==='bounds'&&!target.bin){
    p.histogramBins.push({...newHistogramBin(),inheritStart:i>0});
  }
  syncHistogramBoundaries();
}

function histogramGeometryReady(count=p.histogramBins?.length){
  const bins=p.histogramBins;
  return !!count&&bins?.length===count&&bins.every(completeHistogramBin)&&!histogramBinsOverlap(bins);
}

function histogramTargetFinished(run,target){
  if(target.phase==='row')return completeHistogramBin(target.row)&&finite(target.row.value);
  if(target.phase==='bounds')return completeHistogramBin(target.bin)&&
    (target.binIndex<run.count-1||histogramGeometryReady(run.count));
  return run.skipped[run.step]||finite(target.row?.value)&&target.row.value>=0;
}

function advanceHistogramRun(run){
  run.handle=null;
  while(run.step<histogramRunSize(run)){
    prepareHistogramTarget(run);
    if(!histogramTargetFinished(run,histogramRunTarget(run)))break;
    run.step++;
  }
  selectHistogramRunTarget();
  if(!activeHistogramRun()){
    selected=-1;
    if(tool==='point')setTool('select');
  }
}

function histogramBinCount(input){
  const count=$(input).valueAsNumber;
  if(!Number.isSafeInteger(count)||count<1)throw Error('请输入正整数数量');
  return count;
}

function changeHistogramSeriesCount(){
  const active=activeHistogramRun();
  if(active&&active.phase!=='bounds')return;
  const count=histogramBinCount('histogramSeriesCount');
  const removed=new Set(p.series.slice(count).map(s=>s.key));
  const observations=p.rows.filter(row=>removed.has(identity(row))).length;
  if(observations&&!confirm(`将移除末尾系列及其 ${observations} 条记录。继续？`))return;
  change(()=>{
    while(p.series.length>count)removeObject(p,'series',p.series.at(-1).key);
    let n=p.series.length+1;
    while(p.series.length<count){
      const name='Series '+n++;
      if(!p.series.some(s=>s.name===name))addObject(p,'series',name);
    }
    selected=-1;
  },{form:true});
}

function startHistogramRun(phase=isHistogramStack(p)?'bounds':'row'){
  if(activeHistogramRun())return;
  const stacked=isHistogramStack(p),bins=p.histogramBins??[];
  const count=phase==='segment'?bins.length:histogramBinCount('histogramBinCount');
  if(phase==='bounds'&&bins.length>count)throw Error(`分箱数量至少为 ${bins.length}。可在共享分箱表删除分箱`);
  if(phase==='segment'&&!histogramGeometryReady())throw Error('请先完成共享分箱边界');
  const names=p.series.map(s=>s.name);
  if(phase!=='bounds'&&!p.kind.endsWith('_1')&&
      (names.some(name=>typeof name!=='string'||!name.trim())||new Set(names).size!==names.length)){
    throw Error('请先填写非空且唯一的系列名称');
  }
  if(phase==='segment'&&histogramBinCount('histogramSeriesCount')!==p.series.length){
    throw Error('请先点击「设置系列数量」并核对系列名称和顺序');
  }
  const series=phase==='segment'?[...p.series].sort((a,b)=>a.stackOrder-b.stackOrder).map(s=>s.key):
    phase==='row'?[assist().series]:[];
  const run={stacked,phase,count,series,step:0,entries:[],pending:{},skipped:{},handle:null};
  if(!Number.isSafeInteger(histogramRunSize(run)))throw Error('分箱和系列数量过多');
  change(()=>{
    if(stacked)p.histogramBins=bins;
    if(phase!=='segment')p.histogramBinCount=count;
    p.histogramRun=run;
    delete assist().histogramBin;
    advanceHistogramRun(run);
  });
  if(image&&activeHistogramRun())setTool('point');
}

function previousHistogramStep(){
  const run=p.histogramRun;
  if(!run||!histogramRunSeriesExist(run))return;
  const active=activeHistogramRun(),target=active?histogramRunTarget(run):null;
  const handle=target&&histogramRunHandle(run,target);
  const inherits=target?.row?._histogramPrevious||target?.bin?.inheritStart;
  const handles=target?.handles.filter(k=>!inherits||k!=='bin_startPixel'||k===handle);
  const earlier=handles?.[handles.indexOf(handle)-1];
  if(!earlier&&!run.step)return;
  change(()=>{
    if(earlier)run.handle=earlier;
    else{
      run.step--;
      prepareHistogramTarget(run);
      const target=histogramRunTarget(run);
      run.handle=run.skipped[run.step]?target.handles[0]:target.handles.at(-1);
    }
    selectHistogramRunTarget();
  });
  if(image)setTool('point');
}

function storeHistogramSegment(target,value,evidence){
  if(target.row)applyHistogramMeasurement(target.rowIndex,{field:'value',value,evidence});
  else appendHistogramRow(target.series,{
    _histogramBin:target.bin.key,bin_start:target.bin.bin_start,bin_end:target.bin.bin_end,value
  },evidence);
}

function measureHistogramRun(pt){
  const run=activeHistogramRun(),target=histogramRunTarget(run),handle=histogramRunHandle(run,target);
  const {phase,row,rowIndex,bin}=target;
  let update;
  if(phase==='row'){
    update=histogramMeasurementUpdate(rowIndex,handle,pt);
    if(update.field==='bin_end'&&finite(row.bin_start)&&update.value<=row.bin_start){
      throw Error('结束边界必须大于起始边界。请重取结束边界，或手动填入更精确的边界。');
    }
  }else if(phase==='bounds'){
    update=histogramMeasurement(bin,bin.evidence,handle,pt,handle==='bin_startPixel'&&bin.inheritStart);
  }else{
    if(!histogramGeometryReady(run.count))throw Error('请先在共享分箱边界表修正边界');
    update=histogramMeasurement(row,run.pending[run.step]??p.evidence?.[rowIndex],handle,pt);
  }
  change(()=>{
    if(phase==='row')applyHistogramMeasurement(rowIndex,update);
    else if(phase==='bounds')applyHistogramBinMeasurement(bin,update);
    else if(update.value===null)run.pending[run.step]=update.evidence;
    else{
      storeHistogramSegment(target,update.value,update.evidence);
      delete run.skipped[run.step];
      delete run.pending[run.step];
    }
    advanceHistogramRun(run);
  });
}

function applyHistogramBinMeasurement(bin,{field,value,evidence}){
  bin[field]=value;
  bin.evidence=evidence;
  if(field==='bin_start')bin.inheritStart=false;
  syncHistogramBoundaries();
}

function hasHistogramSegment(bin,series,except){
  return !!bin&&p.rows.some(row=>row!==except&&row._histogramBin===bin&&identity(row)===series);
}

function assignHistogramBin(input){
  const row=p.rows[Number(input.dataset.i)],key=input.value;
  if(hasHistogramSegment(key,identity(row),row)){
    input.value=row._histogramBin??'';
    toast('该分箱和系列已有记录');
    return;
  }
  change(()=>{
    row._histogramBin=key||null;
    row.bin_start=row.bin_end=null;
    syncHistogramBoundaries();
  });
}

function selectHistogramBin(bin,handle=HISTOGRAM_BOUNDARY_HANDLES[0]){
  selected=-1;
  const a=assist();
  a.histogramBin=bin.key;
  a.histogramHandle=selectedHandle=handle;
}

function addHistogramBin(){
  if(activeHistogramRun())return;
  change(()=>{
    const bin=newHistogramBin();
    (p.histogramBins??=[]).push(bin);
    delete p.histogramRun;
    selectHistogramBin(bin);
  });
}

function removeHistogramBin(index){
  if(activeHistogramRun())return;
  const bin=p.histogramBins[index],rows=p.rows.filter(row=>row._histogramBin===bin.key);
  change(()=>{
    const next=p.histogramBins[index+1];
    if(next?.inheritStart)next.inheritStart=false;
    p.histogramBins.splice(index,1);
    for(const row of rows){
      row._histogramBin=null;
      row.bin_start=row.bin_end=null;
    }
    delete p.histogramRun;
    if(assist().histogramBin===bin.key)delete assist().histogramBin;
    syncHistogramBoundaries();
  });
  if(rows.length)toast(`请为 ${rows.length} 条受影响的记录重新选择分箱，统计值已保留`);
}

function editHistogramBin(input){
  const bin=p.histogramBins[Number(input.dataset.bin)],field=input.dataset.field;
  change(()=>{
    const display=printedPercent(input.value);
    recordTablePercent(bin,field,display!==null?isHorizontal(p)?'y':'x':null);
    const value=input.value===''?null:display??Number(input.value);
    if(value!==null&&!finite(value))throw Error('分箱边界需要有限数值');
    bin[field]=value;
    delete bin.evidence[field+'Pixel'];
    if(field==='bin_start')bin.inheritStart=false;
    syncHistogramBoundaries();
    const run=activeHistogramRun();
    if(run?.phase==='bounds'&&histogramRunTarget(run).bin===bin)advanceHistogramRun(run);
  });
}

function syncHistogramBinTable(){
  const bins=isHistogramStack(p)?p.histogramBins??[]:[];
  $('histogramBinsPanel').hidden=!isHistogramStack(p);
  if(!isHistogramStack(p))return;
  const body=$('histogramBinsBody'),run=activeHistogramRun(),selectedBin=selectedHistogramBin();
  $('addHistogramBin').disabled=!!run;
  $('measureHistogramBin').disabled=!!run||!selectedBin;
  if(body.rows.length!==bins.length||bins.some((bin,i)=>body.rows[i].dataset.key!==bin.key)){
    body.innerHTML=bins.map(({key},i)=>`<tr data-key="${esc(key)}"><td><button type="button" class="small"
      data-select-bin="${i}" aria-label="选中第 ${i+1} 箱">${i+1}</button></td>${
      HISTOGRAM_BOUNDARIES.map((field,j)=>`<td><input type="text" inputmode="decimal" data-bin="${i}"
        data-field="${field}" aria-label="第 ${i+1} 箱${j?'结束':'起始'}边界"></td>`).join('')
    }<td><button type="button" class="small" data-delete-bin="${i}" aria-label="删除第 ${i+1} 箱">删除</button></td></tr>`).join('');
  }
  bins.forEach((bin,i)=>{
    const row=body.rows[i],highlight=run?i===run.step%run.count:bin===selectedBin;
    row.classList.toggle('selected',highlight);
    row.querySelector('[data-select-bin]').setAttribute('aria-pressed',String(highlight));
    for(const button of row.querySelectorAll('button'))button.disabled=!!run;
    for(const input of body.rows[i].querySelectorAll('input')){
      const field=input.dataset.field,value=bin[field];
      input.value=value??'';
    }
  });
}

function syncHistogramWorkflow(){
  const histogram=isHistogram(p),stacked=isHistogramStack(p),stored=histogram?p.histogramRun:null;
  const active=activeHistogramRun(),lockSeries=!!active&&active.phase!=='bounds';
  const run=stored&&(stacked||stored.series[0]===assist().series)?stored:null;
  const target=active?histogramRunTarget(active):null;
  $('histogramWorkflow').hidden=!histogram;
  $('histogramWorkflowControls').hidden=!run;
  $('activeSeries').disabled=lockSeries;
  for(const id of ['addRow','deleteRow'])$(id).disabled=!!active;
  for(const id of ['addSeries','applySeriesNames'])$(id).disabled=lockSeries;
  if(histogram){
    for(const input of document.querySelectorAll('#seriesList [data-prop="name"], #seriesList button'))input.disabled=lockSeries;
    for(const input of document.querySelectorAll('#tableBody [data-object="series"], #tableBody [data-row-bin]'))input.disabled=!!active;
  }
  syncHistogramBinTable();
  if(!histogram)return;
  const binSetup=$('histogramBinSetup'),dock=$(stacked?'histogramStackBinSetup':'histogramOrdinarySetup');
  if(binSetup.parentElement!==dock)dock.append(binSetup);
  const seriesCount=$('histogramSeriesCount'),seriesKeys=p.series.map(series=>series.key).join();
  if(seriesCount.dataset.series!==seriesKeys){
    seriesCount.value=p.series.length;
    seriesCount.dataset.series=seriesKeys;
  }
  $('histogramSeriesSetup').hidden=!stacked;
  $('histogramStart').textContent=stacked?'连续标注分箱':'开始连续录入';
  $('histogramStartSeries').disabled=!!active||!histogramGeometryReady();
  $('histogramManualRow').hidden=stacked||!p.kind.endsWith('_n');
  for(const id of ['histogramBinCount','histogramStart','histogramManualRow'])$(id).disabled=!!active;
  for(const id of ['histogramSeriesCount','histogramApplySeries'])$(id).disabled=lockSeries;
  const countInput=$('histogramBinCount');
  if(document.activeElement!==countInput)countInput.value=active?.count??p.histogramBinCount??'';
  if(!run)return;
  const progress=$('targetProgress'),hint=$('targetHint');
  $('histogramPrevious').disabled=!histogramRunSeriesExist(run)||
    !run.step&&(!target||histogramRunHandle(run,target)===target.handles[0]);
  $('histogramRetake').hidden=$('histogramNext').hidden=!active;
  $('histogramSkip').hidden=target?.phase!=='segment'||!!target.row;
  $('histogramSegmentLabel').hidden=target?.phase!=='segment';
  if(target?.phase==='segment')$('histogramSegmentValue').value=target.row?.value??'';
  if(active){
    const handle=histogramRunHandle(run,target);
    options($('histogramField'),target.handles.map(k=>[k,histogramHandleLabels[k]]),handle);
    $('histogramField').disabled=false;
    $('histogramNext').disabled=!histogramTargetFinished(run,target);
    const stage=target.phase==='bounds'?'校准分箱边界':target.phase==='segment'?'堆叠段':'连续录入';
    const series=target.series&&!p.kind.endsWith('_1')?' · '+seriesName(p,target.series):'';
    let invalid='';
    if(target.phase==='row'&&finite(target.row.bin_end)&&!completeHistogramBin(target.row)){
      invalid=' · 结束边界必须大于起始边界';
    }
    if(target.phase==='bounds'&&finite(target.bin.bin_end)&&!histogramTargetFinished(run,target)){
      invalid=' · 请核对边界及重叠';
    }
    hint.textContent=`${stage}${series} · 第 ${target.binIndex+1} 箱 · ${histogramHandleLabels[handle]}${invalid}`;
    progress.textContent=`${target.binIndex}/${run.count}`;
  }else{
    if(!p.rows[selected]&&!selectedHistogramBin())hint.textContent=stacked?
      (run.phase==='bounds'?'分箱边界录入完成，可开始连续标注系列':'堆叠系列连续标注完成'):
      '连续录入完成 · '+seriesName(p,run.series[0]);
    progress.textContent=`${run.count}/${run.count}`;
  }
  $('targetTop').textContent=hint.textContent;
}

function editHistogramSegment(input){
  const run=activeHistogramRun();
  if(!run)return;
  const target=histogramRunTarget(run),value=input.value===''?null:input.valueAsNumber;
  if(target.phase!=='segment')return;
  if(!histogramGeometryReady(run.count)||value!==null&&(!finite(value)||value<0)){
    input.value=target.row?.value??'';
    throw Error('共享分箱边界须有效，堆叠段统计值须为非负数');
  }
  if(value===null&&!target.row)return;
  change(()=>{
    const evidence={...p.evidence?.[target.rowIndex],role:'transcribed',source:'manual_edit'};
    for(const handle of target.handles)delete evidence[handle];
    storeHistogramSegment(target,value,evidence);
    delete run.skipped[run.step];
    delete run.pending[run.step];
    advanceHistogramRun(run);
  });
}

function drawHistogramRun(mark){
  const run=activeHistogramRun(),target=run?histogramRunTarget(run):null;
  for(const [i,bin] of (p.histogramBins??[]).entries()){
    const chosen=(target?.bin??selectedHistogramBin())===bin;
    mark(bin.evidence.bin_startPixel,'#008b7e',`${i+1} 箱起点`,chosen&&selectedHandle==='bin_startPixel');
    mark(bin.evidence.bin_endPixel,'#008b7e',`${i+1} 箱终点`,chosen&&selectedHandle==='bin_endPixel');
  }
  if(target?.phase==='segment'){
    const evidence=run.pending[run.step];
    const color=p.series.find(s=>s.key===target.series)?.color||'#008b7e';
    for(const handle of target.handles)mark(evidence?.[handle],color,histogramHandleLabels[handle]);
  }
}

function histogramAction(fn){
  try{fn();}catch(error){toast(error.message);}
}
$('histogramStart').onclick=()=>histogramAction(startHistogramRun);
$('histogramStartSeries').onclick=()=>histogramAction(()=>startHistogramRun('segment'));
$('histogramManualRow').onclick=()=>{
  addHistogramRow();
  if(image)setTool('point');
};
$('histogramBinCount').onchange=e=>{
  const value=e.target.valueAsNumber;
  if(Number.isSafeInteger(value)&&value>0)p.histogramBinCount=value;
  else delete p.histogramBinCount;
  scheduleDraftSave();
};
$('histogramApplySeries').onclick=()=>histogramAction(changeHistogramSeriesCount);
$('histogramPrevious').onclick=previousHistogramStep;
$('histogramNext').onclick=()=>{
  const run=activeHistogramRun();
  if(run)change(()=>advanceHistogramRun(run));
};
$('histogramRetake').onclick=()=>setTool('point');
$('histogramSkip').onclick=()=>{
  const run=activeHistogramRun();
  if(!run)return;
  const target=histogramRunTarget(run);
  if(target.phase!=='segment'||target.row)return;
  change(()=>{
    run.skipped[run.step]=true;
    delete run.pending[run.step];
    advanceHistogramRun(run);
  });
};
$('histogramStop').onclick=()=>{
  change(()=>{delete p.histogramRun;});
  setTool('select');
};
$('histogramBinsBody').onchange=e=>editHistogramBin(e.target);
$('addHistogramBin').onclick=addHistogramBin;
$('measureHistogramBin').onclick=()=>setTool('point');
$('histogramBinsBody').onclick=e=>{
  if(activeHistogramRun())return;
  const {deleteBin,field}=e.target.dataset;
  if(deleteBin!==undefined){removeHistogramBin(+deleteBin);return;}
  const selectedRow=e.target.closest('tr[data-key]');
  if(!selectedRow)return;
  const item=p.histogramBins.find(bin=>bin.key===selectedRow.dataset.key);
  selectHistogramBin(item,field&&field+'Pixel');
  document.querySelector('#tableBody tr.selected')?.classList.remove('selected');
  syncAssist();draw();scheduleDraftSave();
};
$('histogramSegmentValue').onchange=e=>histogramAction(()=>editHistogramSegment(e.target));

function pieAngleAssignment(draft,count){
  if(!count||count!==p.rows.length)return null;
  const categories=p.rows.map(r=>r.category);
  if(categories.some(name=>typeof name!=='string'||!name.trim())||new Set(categories).size!==count)return null;
  const byKey=new Map(p.rows.map((r,i)=>[r._categoryKey,i]));
  const indices=Array.from({length:count},(_,i)=>byKey.get(draft.targets[i]));
  return indices.every(i=>i!==undefined)&&new Set(indices).size===count?indices:null;
}
function syncPieAngles(renderRows=true){
  const active=isPie(p)&&tool==='pie-angle';
  $('pieAnglePanel').hidden=!active;
  if(!active)return;
  const draft=p.pieMeasurement;
  let sectors=[],error='';
  if(draft){
    try{sectors=measurePieSectors(draft.center,draft.boundaries);}catch(e){error=e.message;}
  }
  const assignment=sectors.length&&pieAngleAssignment(draft,sectors.length);
  $('undoPieAngle').disabled=$('resetPieAngle').disabled=!draft?.center;
  $('pieAngleResults').hidden=!sectors.length;
  $('applyPieAngle').disabled=!assignment;
  $('pieAngleTotal').textContent=sectors.length?`合计 ${measuredNumber(sectors.reduce((sum,s)=>sum+s.value,0))}%`:'';
  $('pieAngleStatus').textContent=error||(!draft?.center?'在原图点击圆心。':
    !sectors.length?'从任意一条分界线开始，沿顺时针逐条点击。':
    `已取 ${sectors.length} 条分界线，最后一段自动闭合。现有 ${p.rows.length} 个类别。`+
      (sectors.length===p.rows.length?'请为每个扇区选择一个名称不同的类别。':'请将分界线数量调整为与数据表中的类别数一致。'));
  if(renderRows)$('pieAngleRows').innerHTML=sectors.map(({degrees,value},i)=>`<tr>
    <td>${i+1} → ${(i+1)%sectors.length+1}</td><td>${degrees.toFixed(2)}°</td><td>${value}%</td>
    <td><select data-pie-sector="${i}" aria-label="第 ${i+1} 个扇区的类别"><option value="">选择类别</option>${
      p.rows.map(r=>`<option value="${esc(r._categoryKey)}" ${draft.targets[i]===r._categoryKey?'selected':''}>${esc(r.category)}</option>`).join('')
    }</select></td></tr>`).join('');
}
function pieAngleChanged(){
  syncPieAngles();draw();scheduleDraftSave();
}
function recordPieAngle(point){
  const draft=p.pieMeasurement;
  if(!draft){
    p.pieMeasurement={center:point,boundaries:[],targets:[]};
  }else{
    const boundaries=[...draft.boundaries,point];
    measurePieSectors(draft.center,boundaries);
    draft.boundaries=boundaries;
    draft.targets=[];
  }
  pieAngleChanged();
}
function cancelPieAngles(){
  delete p.pieMeasurement;
  setTool('select');scheduleDraftSave();
}
$('undoPieAngle').onclick=()=>{
  const draft=p.pieMeasurement;
  if(!draft)return;
  if(draft.boundaries.length){draft.boundaries.pop();draft.targets=[];}
  else delete p.pieMeasurement;
  pieAngleChanged();
};
$('resetPieAngle').onclick=()=>{delete p.pieMeasurement;pieAngleChanged();};
$('cancelPieAngle').onclick=cancelPieAngles;
$('pieAngleRows').onchange=e=>{
  const i=e.target.dataset.pieSector;
  if(i===undefined||!p.pieMeasurement)return;
  p.pieMeasurement.targets[+i]=e.target.value;
  syncPieAngles(false);scheduleDraftSave();
};
$('applyPieAngle').onclick=()=>{
  const draft=p.pieMeasurement;
  if(!draft||!isPie(p)||p.valueMode!=='percent')return;
  const sectors=measurePieSectors(draft.center,draft.boundaries);
  const indices=pieAngleAssignment(draft,sectors.length);
  if(!indices)return;
  if(p.rows.some(r=>finite(r.value))&&!confirm('将用测量结果更新现有类别的数值。继续？'))return;
  change(()=>{
    p.evidence??=[];
    indices.forEach((rowIndex,i)=>{
      p.rows[rowIndex].value=sectors[i].value;
      delete p.rows[rowIndex]._pieFraction;
      p.evidence[rowIndex]={role:'observation',source:'pie_angle_measurement',
        pieAngle:{center:draft.center,from:draft.boundaries[i],to:draft.boundaries[(i+1)%sectors.length]}};
    });
    delete p.pieMeasurement;
  });
  setTool('select');toast('角度测量结果已应用，可撤销');
};

// Statistical charts share the canvas, calibration, history, evidence and project lifecycle.
function syncStatForm(){
  const pie=isPie(p),box=isBox(p),stat=isStat(p);
  $('pieFields').hidden=!pie;$('valueMode').value=p.valueMode||'percent';$('valueTitle').value=pieMetricTitle(p.valueTitle);$('donut').checked=!!p.donut;
  $('confirmPieFractions').hidden=!pie||!canConfirmPieFractions(p);
  $('pieScaleReview').hidden=!pie||!p.pieFractionImport;
  $('valueFormatLabel').hidden=!box;$('valueFormat').value=p.valueFormat??'';
  for(const id of ['xTitle','yTitle'])$(id).parentElement.hidden=pie;
  if(stat){$('seriesSection').hidden=true;$('activeSeries').closest('label').hidden=true;}
  $('legend').parentElement.hidden=stat;$('categoryLabel').hidden=!pie&&!categorical();
  $('activeCategoryLabel').hidden=pie||!categorical();$('boxFieldLabel').hidden=!box;
  if(stat)$('connect').parentElement.hidden=true;$('calibrationPanel').hidden=pie;
  document.querySelector('.assist-panel').hidden=pie;
  document.querySelectorAll('[data-tool]').forEach(b=>b.hidden=b.dataset.tool==='pie-angle'?!pie:
    pie&&b.dataset.tool!=='select'||stat&&['lower','upper'].includes(b.dataset.tool));
  if(stat)$('tableNote').textContent=pie?'数值按原图录入，不自动归一化。使用 ↑ / ↓ 调整类别顺序；GT 不保存像素与环形外观。' : 'lower ≤ q1 ≤ median ≤ q3 ≤ upper；只校准数值轴。自动测量依图像分辨率保留有效数字，人工录入及 GT 导入保留原精度。不按 1.5×IQR 重算。异常值可逐个编辑、添加或删除。';
}
function boxHandle(field){const a=assist();return field==='outliers'?`outlier${a.outlierTarget}Pixel`:field+'Pixel';}
function boxHandleField(key){return key.startsWith('outlier')?'outliers':key.replace(/Pixel$/,'');}
function handleKeys(i){return isHistogram(p)?p.rows[i]?._histogramBin?histogramHandles(p,'value'):histogramHandleKeys(p):isArea(p)?['pixel','baselinePixel']:isBox(p)?Object.keys(p.evidence?.[i]||{}).filter(k=>/^(lower|q1|median|q3|upper|outlier\d+)Pixel$/.test(k)&&p.evidence[i][k]):['pixel','startPixel','lowerPixel','upperPixel'];}
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
    const n=a.outlierTarget==='new'?r.outliers.length:+a.outlierTarget;r.outliers[n]=v;delete r._percentData?.['outliers:'+n];key=`outlier${n}Pixel`;
  }else{r[f]=v;delete r._percentData?.[f];key=f+'Pixel';}
  e[key]=pt;e.role=$('role').value;e.source='pixel_measurement';e.modifiedAt=new Date().toISOString();selected=i;selectedHandle=key;
  if(f!=='outliers'){
    const at=BOX_FIELDS.indexOf(f);if(at<4)a.boxField=BOX_FIELDS[at+1];else {a.boxField='lower';nextTarget();}
  }
}
function outlierCells(r,i){return (r.outliers||[]).map((v,j)=>`<div class="series-row"><input type="text" inputmode="decimal" data-i="${i}" data-key="outliers" data-outlier="${j}" aria-label="第${i+1}行 异常值${j+1}" value="${esc(v)}"><button class="small" data-delete-outlier="${j}" data-index="${i}" title="删除异常值">×</button></div>`).join('')+`<button class="small" data-add-outlier="${i}">＋ 异常值</button>`;}
function editStatCell(input,scale){
  const {i,key,outlier}=input.dataset,raw=input.value;
  change(()=>{
    const r=p.rows[i];
    recordTablePercent(r,key==='outliers'?'outliers:'+outlier:key,scale);p.evidence??=[];const e=p.evidence[i]??={};
    if(key==='category'){
      renameObject(p,'category',r._categoryKey,raw);
    }else if(key==='outliers'){
      r.outliers[+outlier]=raw===''?null:Number(raw);delete e[`outlier${outlier}Pixel`];
    }else{r[key]=raw===''?null:Number(raw);delete e[key+'Pixel'];if(isPie(p)&&key==='value'){delete e.pieAngle;delete r._pieFraction;}}
    e.role='transcribed';e.source='manual_edit';
  },{form:true});
}
$('valueMode').onchange=()=>change(()=>{p.valueMode=$('valueMode').value;delete p.pieFractionImport;},{form:true});
$('confirmPieFractions').onclick=()=>change(()=>confirmPieFractions(p),{form:true});
for(const id of ['valueTitle','donut','valueFormat'])$(id).onchange=()=>change(()=>p[id]=id==='donut'?$(id).checked:$(id).value,{form:true});
$('histogramField').onchange=()=>{
  const handle=$('histogramField').value,run=activeHistogramRun();
  if(run)run.handle=handle;
  else assist().histogramHandle=handle;
  selectedHandle=handle;
  syncAssist();draw();scheduleDraftSave();
};
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

function drawPieAngles(mark){
  const draft=p.pieMeasurement;
  if(!draft?.center)return;
  const {center,boundaries}=draft;
  const ray=point=>{ctx.beginPath();ctx.moveTo(center.x,center.y);ctx.lineTo(point.x,point.y);ctx.stroke();};
  ctx.save();
  ctx.strokeStyle='#008b7e';ctx.lineWidth=2/zoom;
  boundaries.forEach(ray);
  if(hover){
    ctx.setLineDash([5/zoom,4/zoom]);
    ray(hover);ctx.setLineDash([]);
  }
  mark(center,'#f05c35','圆心',true);
  boundaries.forEach((point,i)=>mark(point,'#008b7e',String(i+1)));
  ctx.restore();
}
function pointPixel(r,e){if(e?.pixel)return e.pixel;return null;}
function draw(){projectionInfo=null;if(!image){canvas.width=0;canvas.height=0;return;}const dpr=window.devicePixelRatio||1;canvas.width=Math.round(image.width*zoom*dpr);canvas.height=Math.round(image.height*zoom*dpr);canvas.style.width=image.width*zoom+'px';canvas.style.height=image.height*zoom+'px';ctx.setTransform(zoom*dpr,0,0,zoom*dpr,0,0);ctx.drawImage(image,0,0);$('zoomText').textContent=Math.round(zoom*100)+'%';if(isHeatmap(p))drawMagnifier(hover,!!hover&&assist().magnify);if(!$('overlay').checked){drawGuides();return;}
const mark=(pt,color,text,ring=false)=>{if(!pt||!Number.isFinite(pt.x)||!Number.isFinite(pt.y))return;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5/zoom;ctx.beginPath();ctx.arc(pt.x,pt.y,(ring?7:4)/zoom,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(pt.x-8/zoom,pt.y);ctx.lineTo(pt.x+8/zoom,pt.y);ctx.moveTo(pt.x,pt.y-8/zoom);ctx.lineTo(pt.x,pt.y+8/zoom);ctx.stroke();ctx.font=`${11/zoom}px monospace`;ctx.fillText(text,pt.x+9/zoom,pt.y-7/zoom);};
if(isHeatmap(p)){drawHeatmap(mark);return;}
if(tool==='pie-angle'&&isPie(p)){drawPieAngles(mark);return;}
if(isHistogramStack(p))drawHistogramRun(mark);
if(isPercentStack(p))drawPercentStackHeights(mark);
if($('connect').checked&&(p.kind.startsWith('line')||isComposite(p)))for(const s of p.series.filter(s=>!isComposite(p)||s.role==='line')){const pts=p.rows.map((r,i)=>({r,e:p.evidence?.[i]})).filter(v=>identity(v.r)===s.key&&v.e?.pixel).sort((a,b)=>(a.r.path_order??0)-(b.r.path_order??0));ctx.beginPath();pts.forEach((v,i)=>{const q=v.e.pixel;ctx[i?'lineTo':'moveTo'](q.x,q.y)});ctx.strokeStyle=s.color||'#06a77d';ctx.lineWidth=1.5/zoom;ctx.stroke();}
p.rows.forEach((r,i)=>{const e=p.evidence?.[i];if(isBox(p)){for(const k of handleKeys(i))mark(e[k],i===selected&&k===selectedHandle?'#007bea':'#e85b35',`${i+1}:${boxHandleField(k)==='outliers'?'o'+(+k.match(/\d+/)[0]+1):boxHandleField(k)}`,i===selected&&k===selectedHandle);return;}const color=p.series.find(s=>s.key===identity(r))?.color||'#e85b35';if(isHistogram(p)){
  for(const k of handleKeys(i))mark(e?.[k],color,`${i+1}: ${histogramHandleLabels[k]}`,i===selected&&k===selectedHandle);
  return;
}mark(pointPixel(r,e),color,isArea(p)?`${i+1}:上界`:String(i+1),i===selected&&(!isArea(p)||selectedHandle==='pixel'));if(isArea(p)&&e?.baselinePixel)mark(e.baselinePixel,color,`${i+1}:下界`,i===selected&&selectedHandle==='baselinePixel');
if(e?.startPixel){mark(e.startPixel,color,'s');if(e.pixel){ctx.beginPath();ctx.moveTo(e.startPixel.x,e.startPixel.y);ctx.lineTo(e.pixel.x,e.pixel.y);ctx.stroke();}}for(const k of ['lower','upper'])if(e?.[k+'Pixel'])mark(e[k+'Pixel'],color,k==='lower'?'−':'+');});
drawGuides();if(pendingStart)mark(pendingStart,'#ffae00','起点');for(const a of isComposite(p)||isLine(p)?requiredAxes(p):isNominalArea(p)?['y']:['x','y'])for(const n of [1,2]){const pt=p.axes[a]['point'+n];if(pt)mark(pt,'#007bea',a.toUpperCase()+n);} }
function setTool(t){
  if(!['heatmap-corners','heatmap-boundary','heatmap-color'].includes(t))heatmapCapture=null;
  if(t!=='percent-stack-height')percentStackHeightCapture=null;
  if(isHeatmap(p)){
    if(t==='select')$('heatmapMeasurementStatus').textContent='';
    const required=requiredAxes(p);
    if(!required.includes(calTarget[0]))calTarget=(required[0]??'x')+'1';
    if(t==='calibrate'&&!required.length)t='select';
  }
  if(t==='pie-angle'){
    if(!isPie(p))t='select';
    else if(p.valueMode!=='percent'||!image){
      toast(p.valueMode!=='percent'?'角度测量适用于百分比模式，请先选择百分比':'请先添加饼图原图');
      return;
    }
  }
  if((isBox(p)||isNominalArea(p)||isPercentStack(p))&&!requiredAxes(p).includes(calTarget[0]))calTarget=valueAxis(p)+'1';if(isPie(p)&&t!=='select'&&t!=='pie-angle'||t.startsWith('area-')&&!isArea(p))t='select';tool=t;pendingStart=null;hover=null;document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));$('calibrationPanel').open=t==='calibrate'||$('calibrationPanel').open;const hints={'area-upper':'选中数据行后，在同一 X 处点击新的上界。','area-baseline':'选中数据行后，在同一 X 处点击新的下界。',select:'点击已有标记或选择表格字段后拖动、方向键微调。重合点优先编辑已选字段；Shift 拖动限制方向。',point:isHistogram(p)?(activeHistogramRun()?'按当前测量项点击原图，也可在表格直接输入。':'添加或选中记录，选择测量项后点击原图。'):isArea(p)?(p.kind==='area_stack'?'选择当前层，在同一 X 依次点该层的累计上界和实际下界。':'在同一 X 依次取上界和下界。下界也可在表格中输入。'):isStack(p)?(horizontal()?'横向堆叠：从左到右依次点击起点、各交界点、终点。':'纵向堆叠：从下到上依次点击起点、各交界点、终点。')+'同一堆叠自动复用交界点；系列按此方向排列。':'点击原图取点，近已有标记可直接拖动；Alt 点击强制新增。类别和系列自动推进，进度格可随时跳转。',calibrate:'选择下方 X1 / X2 / Y1 / Y2，点击原图刻度，再填写真实数值。',lower:'先选中记录，然后点击误差区间下限。',upper:'先选中记录，然后点击误差区间上限。'};$('hint').textContent=isPie(p)?(t==='pie-angle'?'先点击圆心，再沿顺时针点击每条分界线。':'可在表格人工录入原始数值，或使用角度测量。'):isBox(p)&&t==='point'?'点击只测量当前项，五数统计量自动推进；近邻和重合点均可连续标注。选择任意项可重测，outliers 可连续新增；编辑请切换「选择 / 拖动」。':hints[t]|| (t==='lock-x'?'先填写已知 X 数值，再点击原图对应 X 刻度；然后沿竖直线寻找 Y。':'点击当前类别在原图中的刻度或柱中心位置，之后只测数值。');if(isHeatmap(p)){
    const hints={select:'有网格时可点击原图选格，也可在矩阵中选格。',
      'heatmap-corners':'点击网格的第一个角。','heatmap-boundary':'点击所选的共享边界。',
      'heatmap-color':'点击色带内部的校准位置。','heatmap-measure':'点击原图中要测量的格子。'};
    if(hints[t])$('hint').textContent=hints[t];
  }axisForm();syncAssist();syncPercentStackHeightPanel();draw();}
function resumeTool(){
  if(activeHistogramRun()){
    selectHistogramRunTarget();
    setTool(image?'point':'select');
    table();syncHistogramWorkflow();
    return;
  }
  setTool(isPie(p)&&p.pieMeasurement&&p.valueMode==='percent'&&image?'pie-angle':'select');
}
function coords(event){const rect=canvas.getBoundingClientRect();return{x:(event.clientX-rect.left)*image.width/rect.width,y:(event.clientY-rect.top)*image.height/rect.height};}
function calibrated(skipX=false,key=null){const axes=isComposite(p)?[measurementAxis(p,key??assist().series)]:requiredAxes(p);for(const a of axes){if(a==='x'&&skipX)continue;if(!p.axes[a].calibrated)throw Error('请先校准 '+a.toUpperCase()+' 轴的两个刻度');pixelToValue(p.axes[a].p1,p.axes[a]);}}
function measureAt(pt,i=null){
  if(isHistogram(p))return Object.fromEntries(['x','y'].map(axis=>[axis,measuredAxisValue(pt[axis],p.axes[axis])]));
  if(isPercentStack(p)){
    const category=i===null?assist().category:categoryIdentity(p.rows[i]),axis=valueAxis(p);
    return {category:categoryName(p,category),value:measuredAxisValue(pt[axis],requirePercentStackCalibration(p))};
  }
  if(isComposite(p)){const key=i===null?assist().series:identity(p.rows[i]);calibrated(false,key);return {category:i===null?categoryName(p,assist().category):p.rows[i].category,value:measuredAxisValue(pt.y,p.axes[measurementAxis(p,key)])};}
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
  const discrete=lineCategoryAxis(p);
  if(discrete){
    calibrated();
    const numeric=discrete==='x'?'y':'x';
    return {[discrete]:i===null?categoryName(p,assist().category):p.rows[i][discrete],
      [numeric]:measuredAxisValue(pt[numeric],p.axes[numeric])};
  }
  const a=assist(),e=i===null?null:p.evidence?.[i],fixed=i===null?(!categorical()&&a.lockX?{value:a.fixedXValue}:null):e?.fixedX;calibrated(!!fixed&&Number.isFinite(fixed.value));if(isBox(p))return{category:i===null?categoryName(p,a.category):p.rows[i].category,value:boxValueAt(pt,p)};if(bar())return{category:i===null?categoryName(p,a.category):p.rows[i].category,value:measuredAxisValue(horizontal()?pt.x:pt.y,p.axes[horizontal()?'x':'y'])};return{x:p.xType==='ordinal'?(i===null?categoryName(p,a.category):p.rows[i].x):fixed&&Number.isFinite(fixed.value)?fixed.value:measuredAxisValue(pt.x,p.axes.x),y:measuredAxisValue(pt.y,p.axes.y)};}
function requirePercentStackCalibration(project){
  const calibration=project.axes[valueAxis(project)];
  if(!calibration.calibrated)throw Error('请先按原图校准数值轴的两个刻度');
  axisTransform(calibration);
  return calibration;
}
function drawPercentStackHeights(mark){
  const first=firstPercentStackHeightCategory(p),color='#008b7e';
  for(const {key,name} of p.categoryObjects){
    if(percentStackHeightSource(p,key,first)!==key)continue;
    const record=p.percentStackCategoryHeights[key];
    if(!record.startPixel||!record.endPixel)continue;
    const {startPixel,endPixel}=record;
    ctx.beginPath();
    ctx.strokeStyle=color;ctx.lineWidth=1.5/zoom;
    ctx.moveTo(startPixel.x,startPixel.y);ctx.lineTo(endPixel.x,endPixel.y);ctx.stroke();
    mark(startPixel,color,'整柱起点');
    mark(endPixel,color,name+' · 整柱终点');
  }
  if(percentStackHeightCapture?.start)mark(percentStackHeightCapture.start,color,'整柱起点',true);
}
function measurePercentStackHeight(raw){
  requirePercentStackCalibration(p);
  const capture=percentStackHeightCapture,point=bounded(raw),axis=valueAxis(p);
  if(!capture.start){
    capture.start=point;
    syncPercentStackHeightPrompt();
    draw();
    return;
  }
  const endPixel={...capture.start,[axis]:point[axis]};
  if(percentStackHeightFromPoints(p,capture.start,endPixel)===null)throw Error('请选取与起点不同的整柱终点');
  change(()=>{
    p.percentStackCategoryHeights[capture.category]={selected:true,startPixel:capture.start,endPixel};
  });
  setTool('select');
}
function updatePercentStackValue(project,row,evidence){
  project.precisionVersion=1;
  const {start,end}=percentStackMeasurement(project,row,evidence);
  const axis=valueAxis(project),calibration=percentStackCalibration(project,categoryIdentity(row));
  if(evidence?.startPixel)row.start=finite(start)?measuredAxisValue(evidence.startPixel[axis],calibration):null;
  if(evidence?.pixel)row.end=finite(end)?measuredAxisValue(evidence.pixel[axis],calibration):null;
  row.difference=finite(row.start)&&finite(row.end)?Math.abs(decimalDifference(row.end,row.start)):null;
  if(!usesPercentStackRatio(project,categoryIdentity(row))&&!evidence?.valueOverride)row.value=row.difference;
}
function recalculatePercentStack(categories,includeAllRows=false){
  for(const [i,row] of p.rows.entries()){
    const evidence=p.evidence?.[i];
    if((!categories||categories.has(categoryIdentity(row)))&&
        (includeAllRows||evidence?.pixel||evidence?.startPixel))
      updatePercentStackValue(p,row,evidence);
  }
}
function useNumericPercentStack(category){
  if(!usesPercentBarLength(p,category))return;
  delete p.percentStackBarCategories[category];
  recalculatePercentStack(new Set([category]));
}
function measurePercentStackEndpoint(raw){
  const a=assist();
  if(!a.category||!a.series)throw Error('请先选择类别和系列');
  requirePercentStackCalibration(p);
  const pt=constrainAdd(raw),field=percentStackEndpoint(a),handle=field==='start'?'startPixel':'pixel';
  const existing=targetIndex(a),previous=p.rows[existing];
  const complete=finite(previous?.start)&&finite(previous?.end);
  change(()=>{
    useNumericPercentStack(a.category);
    const inherited=field==='end'&&!finite(previous?.start)?inheritedPercentStart(a):null;
    let index=existing;
    if(!previous){
      index=p.rows.length;
      p.rows.push({category:categoryName(p,a.category),series:seriesName(p,a.series),
        _categoryKey:a.category,_seriesKey:a.series,value:null});
    }
    p.evidence??=[];
    const row=p.rows[index],evidence=p.evidence[index]??={role:'observation',source:'pixel_measurement'};
    if(previous&&evidence.valueOverride===undefined&&finite(row.value)&&!finite(row.start)&&!finite(row.end)&&
        !(usesPercentStackRatio(p,a.category)&&validPercent(row.height)))
      evidence.valueOverride=true;
    if(inherited){
      row.start=inherited.value;
      if(inherited.pixel)evidence.startPixel={...inherited.pixel};
    }
    if(a.lockCategory){
      if(horizontal())evidence.fixedY={pixel:pt.y};else evidence.fixedX={pixel:pt.x};
    }
    editHandle(index,handle,pt);
    selected=index;selectedHandle=handle;
    clearPercentSkip(a);
    delete a.percentStackEndpoint;
    if(!complete&&finite(row.start)&&finite(row.end))nextTarget();
  });
}
function updatePercentStackCalibration(axis){
  const calibration=p.axes[axis];
  try{axisTransform(calibration);calibration.calibrated=true;}
  catch{calibration.calibrated=false;}
  recalculatePercentStack();
}
function applyPixel(i,pt){const r=p.rows[i],e=p.evidence[i],data=measureAt(pt,i);if(bar()){r.value=data.value;if(isStack(p)){r.end=data.value;r.value=decimalDifference(r.end,r.start);}}else{const discrete=lineCategoryAxis(p);if(discrete!=='x'&&p.xType!=='ordinal')r.x=data.x;if(discrete!=='y')r.y=data.y;}e.pixel=pt;if(bar())for(const key of ['lowerPixel','upperPixel'])if(e[key])e[key][horizontal()?'y':'x']=pt[horizontal()?'y':'x'];e.modifiedAt=new Date().toISOString();}
function recalculate(){
  if(isHeatmap(p))return;
  if(isPercentStack(p)){recalculatePercentStack();return;}
  if(isArea(p)){recalculateArea();return;}if(isBox(p)){for(let i=0;i<p.rows.length;i++)for(const k of handleKeys(i))editHandle(i,k,p.evidence[i][k]);return;}for(let i=0;i<p.rows.length;i++){const e=p.evidence?.[i];if(isComposite(p)&&!p.axes[measurementAxis(p,identity(p.rows[i]))]?.calibrated)continue;if(!e?.pixel)continue;applyPixel(i,e.pixel);if(e.startPixel){p.rows[i].start=measuredAxisValue(e.startPixel[horizontal()?'x':'y'],p.axes[horizontal()?'x':'y']);p.rows[i].value=decimalDifference(p.rows[i].end,p.rows[i].start);}for(const k of ['lower','upper'])if(e[k+'Pixel'])p.rows[i][k]=measuredAxisValue(horizontal()?e[k+'Pixel'].x:e[k+'Pixel'].y,p.axes[measurementAxis(p,identity(p.rows[i]))]);}}
canvas.addEventListener('pointerdown',e=>{if(!image)return;canvas.focus({preventScroll:true});const raw=coords(e);try{
if(isHeatmap(p)&&tool!=='calibrate'){if(e.button===0)handleHeatmapPointer(raw);return;}
if(tool==='pie-angle'){if(e.button===0)recordPieAngle(raw);return;}
if(tool==='percent-stack-height'){if(e.button===0)measurePercentStackHeight(raw);return;}
if(tool==='lock-x'){
  const a=assist();
  if(!finite(a.fixedXValue)||isArea(p)&&finite(a.fixedXPixel)){
    if(!p.axes.x.calibrated)throw Error('请先在固定 X 输入框填写标签的真实数值');
    a.fixedXValue=measuredAxisValue(raw.x,p.axes.x);
  }
  a.fixedXPixel=raw.x;a.lockX=true;setTool('point');hover=raw;refresh();toast('X 已固定，沿竖直参考线寻找 Y');return;
}
if(tool==='anchor'){
  const a=assist(),anchor=anchorKey(),axis=categoryPixelAxis();
  if(!a.category)throw Error('请先填写并选择当前类别');
  const locate=()=>{a.categoryPixels[anchor]=raw[axis];a.lockCategory=true;};
  if(lineCategoryAxis(p))change(locate);else locate();
  setTool('point');hover=raw;refresh();toast('当前位置已固定，可直接测数值');return;
}
if(tool==='calibrate'){const a=calTarget[0],n=calTarget[1];change(()=>{p.axes[a]['p'+n]=a==='x'?raw.x:raw.y;p.axes[a]['point'+n]=raw;if(isHistogram(p))updateHistogramCalibration(a);else if(isHeatmap(p))updateHeatmapCalibration(a);else if(isPercentStack(p))updatePercentStackCalibration(a);else{p.axes[a].calibrated=!!(p.axes[a].point1&&p.axes[a].point2);if(p.axes[a].calibrated)recalculate();}},{form:true});toast(`已取 ${calTarget.toUpperCase()}，请填写真实刻度值`);return;}
if(isHistogram(p)&&tool==='point'){if(e.button===0)measureHistogram(raw);return;}
if(isPercentStack(p)&&tool==='point'){if(e.button===0)measurePercentStackEndpoint(raw);return;}
if(isArea(p)&&areaTool()){measureArea(raw);return;}
if(tool==='point'&&hasErrors(p)&&!isStack(p)){measureError(raw);return;}
if((tool==='select'||tool==='point'&&!isBox(p)&&!(isStack(p)&&targetIndex(assist())<0))&&(!e.altKey||isArea(p))){let best=null,d=10/zoom;const chosen=p.evidence?.[selected]?.[selectedHandle];if(tool==='select'&&chosen&&Math.hypot(raw.x-chosen.x,raw.y-chosen.y)<d)best={i:selected,kind:selectedHandle};if(!best)p.evidence?.forEach((v,i)=>{for(const kind of handleKeys(i)){if(!v?.[kind])continue;const dist=Math.hypot(raw.x-v[kind].x,raw.y-v[kind].y);if(dist<d){best={i,kind};d=dist;}}});if(best){selected=best.i;selectedHandle=best.kind;if(isBox(p)){assist().category=p.rows[selected]._categoryKey;assist().boxField=boxHandleField(best.kind);assist().outlierTarget=assist().boxField==='outliers'?best.kind.match(/\d+/)[0]:'new';}drag={...best,checkpointed:false};dragOrigin={...p.evidence[selected][selectedHandle]};try{canvas.setPointerCapture(e.pointerId);}catch{}table();syncAssist();draw();return;}if(tool==='select'){selected=-1;selectedHandle='pixel';table();syncAssist();draw();return;}}
if(tool==='lower'||tool==='upper'){if(isComposite(p)&&selected>=0&&compositeRole(p,identity(p.rows[selected]))!=='bar')throw Error('误差区间仅适用于柱系列');calibrated(false,selected>=0?identity(p.rows[selected]):null);if(selected<0)throw Error('请先选中一条数据记录');if(!bar())throw Error('当前规范只在柱图中导出误差区间');change(()=>{const axis=horizontal()?'x':'y';p.rows[selected][tool]=measuredAxisValue(raw[axis],p.axes[measurementAxis(p,identity(p.rows[selected]))]);p.evidence[selected]??={role:'transcribed'};p.evidence[selected][tool+'Pixel']=raw;selectedHandle=tool+'Pixel';});return;}
if(tool==='point'&&isBox(p)){const pt=constrainAdd(raw);calibrated();change(()=>measureBox(pt));return;}
if(tool==='point'){const a=assist();if(categorical()&&a.sequence!=='manual'&&targetIndex(a)>=0){selected=targetIndex(a);selectedHandle='pixel';hover=null;refresh();throw Error('当前目标已经标注；可拖动修改，或选择下一个待标目标');}const pt=constrainAdd(raw),data=measureAt(pt);if(categorical()&&!a.category)throw Error('请先填写类别并选择当前类别');if(isStack(p)&&!pendingStart){const previous=p.rows.findIndex(r=>categoryIdentity(r)===a.category&&identity(r)===p.series[p.series.findIndex(s=>s.key===a.series)-1]?.key);if(previous>=0&&p.evidence?.[previous]?.pixel)pendingStart={...p.evidence[previous].pixel};}if(isStack(p)&&!pendingStart){pendingStart=pt;draw();toast('起点已取，请依次点击各段交界点和最终终点');return;}change(()=>{const row={...data,series:seriesName(p,a.series),_seriesKey:a.series,...(categorical()?{_categoryKey:a.category}:{})};if(isLine(p)){appendLinePathRank(p,row);const axis=lineCategoryAxis(p);if(axis)a.categoryPixels[anchorKey()]??=pt[axis];}const ev={pixel:pt,role:$('role').value,source:'pixel_measurement',createdAt:new Date().toISOString()};if(a.lockX&&!categorical())ev.fixedX={value:a.fixedXValue,pixel:pt.x};else if(a.lockCategory&&categorical()){if(categoryPixelAxis()==='y')ev.fixedY={pixel:pt.y};else ev.fixedX={pixel:pt.x};}if(pendingStart){row.start=measuredAxisValue(pendingStart[horizontal()?'x':'y'],p.axes[horizontal()?'x':'y']);row.end=data.value;row.value=decimalDifference(row.end,row.start);ev.startPixel={...pendingStart};pendingStart=null;}p.rows.push(row);p.evidence??=[];p.evidence.push(ev);selected=p.rows.length-1;selectedHandle='pixel';if(categorical()&&a.sequence!=='manual'){const previousCategory=a.category;const advanced=nextTarget();if(isStack(p)&&advanced&&a.category===previousCategory)pendingStart={...pt};}});}}
catch(err){toast(err.message);}});
canvas.addEventListener('pointermove',e=>{if(!image)return;const pt=coords(e);hover=pt;let val='';if(!isHeatmap(p))try{const area=isArea(p)&&areaTool(),i=area?areaTargetIndex():-1;const v=measureAt(area?areaPoint(pt):tool==='point'&&!isHistogram(p)?constrainAdd(pt):pt,i>=0?i:null);val=isHistogram(p)?` · X ${v.x} / Y ${v.y}`:isBox(p)?` · ${v.category} / ${assist().boxField}: ${v.value}`:bar()?` · ${v.category}: ${v.value.toPrecision(6)}`:` · X ${typeof v.x==='number'?Number(v.x.toPrecision(6)):v.x??v.category} / Y ${Number(v.y.toPrecision(6))}`;}catch{}$('cursorInfo').textContent=`原图 px: ${pt.x.toFixed(1)}, ${pt.y.toFixed(1)}${val}`;if(drag!==null){try{const next=constrainDrag(pt,drag.i,drag.kind,e.shiftKey),old=p.evidence[drag.i][drag.kind];if(next.x!==old.x||next.y!==old.y){if(!drag.checkpointed){checkpoint();drag.checkpointed=true;}editHandle(drag.i,drag.kind,next);if(isPercentStack(p))syncPercentStackRatios(p);dirty();table();}}catch(err){toast(err.message);}}draw();});
function endDrag(){if(drag!==null){drag=null;dragOrigin=null;refresh();}}
canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);canvas.addEventListener('lostpointercapture',endDrag);
canvas.addEventListener('pointerleave',()=>{if(drag===null){hover=null;$('magnifier').hidden=true;draw();}});

$('tableBody').addEventListener('click',e=>{if(isStat(p)&&e.target.closest('button'))return;const row=e.target.closest('[data-row]');if(row){selected=+row.dataset.row;
if(isNominalArea(p)||isPercentStack(p)){
  const a=assist(),category=categoryIdentity(p.rows[selected]),series=identity(p.rows[selected]);
  if(isPercentStack(p)&&(category!==a.category||series!==a.series))delete a.percentStackEndpoint;
  a.category=category;a.series=series;
}
if(isHistogramStack(p)&&!activeHistogramRun()){
  const a=assist(),evidence=p.evidence?.[selected];
  a.series=identity(p.rows[selected]);
  delete a.histogramBin;
  a.histogramHandle=evidence?.valueStartPixel&&!evidence.valueEndPixel?'valueEndPixel':'valueStartPixel';
}
if(isBox(p)){assist().category=p.rows[selected]._categoryKey;const k=e.target.dataset.key;if(BOX_FIELDS.includes(k))assist().boxField=k;if(k==='outliers'){assist().boxField='outliers';assist().outlierTarget=e.target.dataset.outlier;}selectedHandle=boxHandle(assist().boxField);}else{const key=e.target.dataset.key;selectedHandle=isHistogram(p)?(key?histogramHandles(p,key).at(-1):assist().histogramHandle):key==='start'?'startPixel':['lower','upper','baseline'].includes(key)?key+'Pixel':'pixel';}syncAssist();document.querySelectorAll('#tableBody tr').forEach((r,i)=>r.classList.toggle('selected',i===selected));draw();}});
function editPercentStackCell(index,field,input){
  const raw=input.value;
  change(()=>{
    const row=p.rows[index],target={category:categoryIdentity(row),series:identity(row)};
    const complete=validPercent(row.value);
    p.evidence??=[];
    const evidence=p.evidence[index]??={};
    row[field]=raw===''?null:Number(raw);
    if(field==='value'){
      evidence.valueOverride=finite(row.value);
      if(evidence.valueOverride){
        evidence.role='transcribed';evidence.source='manual_edit';
      }
    }else{
      delete evidence[field==='start'?'startPixel':'pixel'];
    }
    updatePercentStackValue(p,row,evidence);
    if(!evidence.valueOverride){
      evidence.role='observation';
      evidence.source=evidence.pixel&&evidence.startPixel?'pixel_measurement':'endpoint_calculation';
    }
    if(field==='value'&&validPercent(row.value)){
      clearPercentSkip(target);
      const current=assist();
      if(!complete&&targetIndex(current)===index)nextTarget();
    }
  });
}
$('tableBody').addEventListener('change',e=>{const {i,key,object}=e.target.dataset;if(i===undefined)return;
let scale;
if(key&&!['category','series','path_order','stack_order'].includes(key)&&!(key===categoryField(p)&&categorical())){
  const display=printedPercent(e.target.value);
  if(display!==null){
    scale=fieldScale(p,p.rows[i],key);
    e.target.value=String(display);
  }else if(e.target.value.trim()!==''&&!finite(Number(e.target.value))){toast('请输入有限数值或带 % 的原图标签');table();return;}
}
if(isHistogramStack(p)){
  if(e.target.hasAttribute('data-row-bin')){assignHistogramBin(e.target);return;}
  if(object==='series'&&hasHistogramSegment(p.rows[i]._histogramBin,e.target.value,p.rows[i])){
    e.target.value=identity(p.rows[i]);toast('该分箱和系列已有记录');return;
  }
}
if(isPercentStack(p)&&['value','start','end'].includes(key)){editPercentStackCell(+i,key,e.target);return;}
if(isHistogram(p)&&key){editHistogramCell(+i,key,e.target.value,scale);return;}if(isStat(p)&&key){editStatCell(e.target,scale);return;}if(isArea(p)&&key){editAreaCell(+i,key,e.target.value,scale);return;}change(()=>{if(key)recordTablePercent(p.rows[i],key,scale);if(object){
const row=p.rows[i],ref=object==='series'?'_seriesKey':'_categoryKey',field=object==='series'?'series':categoryField(p);
const restoreDirectPercent=isPercentStack(p)&&object==='category'&&usesPercentStackRatio(p,categoryIdentity(row))&&!usesPercentStackRatio(p,e.target.value);
if(isNominalArea(p)||isPercentStack(p)){

  const target={category:object==='category'?e.target.value:row._categoryKey,series:object==='series'?e.target.value:row._seriesKey};
  if(row[ref]===e.target.value)return;
  if(targetIndex(target)>=0){e.target.value=row[ref];throw Error(isPercentStack(p)?'该类别和系列已有柱段记录':'该类别和系列已有面积边界记录');}
  if(object==='category'&&p.evidence?.[i]){
    delete p.evidence[i].pixel;
    delete p.evidence[i].baselinePixel;
    if(isPercentStack(p))delete p.evidence[i].startPixel;
  }
  clearPercentSkip(target);
}
if(isComposite(p)&&object==='series'){const role=compositeRole(p,e.target.value);if(role==='line'&&['lower','upper'].some(k=>present(p.rows[i][k]))||role==='bar'&&present(p.rows[i].path_order))throw Error('请先清除与目标系列角色不兼容的字段');if(p.evidence?.[i]){delete p.evidence[i].pixel;delete p.evidence[i].lowerPixel;delete p.evidence[i].upperPixel;}}
if(lineCategoryAxis(p)&&object==='category'&&row[ref]!==e.target.value&&p.evidence?.[i]){
  const evidence=p.evidence[i];
  delete evidence.pixel;delete evidence.fixedX;delete evidence.fixedY;
  evidence.role='transcribed';evidence.source='manual_edit';
}
row[ref]=e.target.value;row[field]=object==='series'?seriesName(p,e.target.value):categoryName(p,e.target.value);
if(restoreDirectPercent)updatePercentStackValue(p,row,p.evidence?.[i]);
return;}const raw=e.target.value;const numeric=!(key==='category'||key==='series'||key===categoryField(p)&&categorical());if(raw===''&&['lower','upper','start','end','stack_order','path_order'].includes(key))delete p.rows[i][key];else p.rows[i][key]=numeric?(raw===''?null:Number(raw)):raw;if(isStack(p)){const r=p.rows[i];if(['start','end'].includes(key)&&Number.isFinite(r.start)&&Number.isFinite(r.end))r.value=decimalDifference(r.end,r.start);else if(key==='value'&&Number.isFinite(r.start)&&Number.isFinite(r.value))r.end=r.start+r.value;}p.evidence??=[];p.evidence[i]??={};p.evidence[i].role='transcribed';p.evidence[i].source='manual_edit';delete p.evidence[i].pixel;delete p.evidence[i].startPixel;delete p.evidence[i].lowerPixel;delete p.evidence[i].upperPixel;});});
for(const key of ['title','xTitle','yTitle','notes','heatmapTitle'])$(key).addEventListener('change',()=>change(()=>p[key]=$(key).value,{form:true}));
$('xType').onchange=()=>{
  const next=$('xType').value;
  if(isLine(p)){selectLineMode('x',next);return;}
  change(()=>{switchAreaMode(p,next);selected=-1;},{form:true});
  setTool('select');
};
function selectLineMode(axis,type){
  const current=lineMode(p),next=type==='nominal'?axis:current===axis?'quantitative':current;
  if(next===current)return;
  change(()=>{switchLineMode(p,next);selected=-1;},{form:true});
  setTool('select');
  toast(next==='quantitative'?'已切换到双连续轴，原模式记录已保留':`已切换到离散 ${next.toUpperCase()}，原模式记录已保留`);
}
$('yType').onchange=()=>selectLineMode('y',$('yType').value);
$('legend').onchange=()=>change(()=>p.legend=$('legend').checked,{form:true});$('reviewed').onchange=()=>{p.reviewed=$('reviewed').checked;p.reviewedAt=p.reviewed?new Date().toISOString():null;refresh();};
$('kind').onchange=()=>{const kind=$('kind').value;if(hasRows(p)&&!confirm('切换类型会清空当前数据记录。建议先保存工程。继续？')){syncTypes();return;}change(()=>{const old=p;p=fresh(kind,isArea(old)?old.xType:undefined);for(const k of ['title','xTitle','yTitle','notes'])p[k]=old[k];selected=-1;},{form:true});setTool('select');};
$('family').onchange=()=>{const kind=Object.keys(labels).find(k=>familyOf(k)===$('family').value);options($('kind'),Object.entries(labels).filter(([k])=>familyOf(k)===familyOf(kind)),kind);$('kind').onchange();};
function applyBulkNames(kind,inputId){
  const text=$(inputId).value,names=parseObjectNames(text),label=kind==='series'?'系列':'类别位置';
  if(!names.length){toast('请至少输入一个名称');return;}
  if(kind==='series'&&p.kind.endsWith('_1')&&names.length>1){toast('单系列类型只允许一个系列，请先选择多系列图表');return;}
  const pie=kind==='category'&&isPie(p);
  if(pie&&new Set(names).size!==names.length){toast('饼图类别名称不能重复');return;}
  const list=kind==='series'?p.series:p.categoryObjects,ref=kind==='series'?'_seriesKey':'_categoryKey';
  const keys=pie?p.rows.map(row=>row[ref]):list.map(o=>o.key);
  const removed=new Set(keys.slice(names.length)),rows=p.rows.filter(r=>removed.has(r[ref])).length;
  if(removed.size&&!confirm('将删除末尾 '+removed.size+' 个'+label+'及其 '+rows+' 条记录。继续？'))return;
  let applied=false;change(()=>{if(pie)applyPieCategoryNames(p,text);else applyObjectNames(p,kind,text);selected=-1;pendingStart=null;applied=true;},{form:true});
  if(applied)toast('已按行应用 '+names.length+' 个'+label+'名称');
}
$('applySeriesNames').onclick=()=>applyBulkNames('series','seriesNames');
$('applyCategoryNames').onclick=()=>applyBulkNames('category','categories');
$('seriesList').onchange=e=>{const {series,prop}=e.target.dataset;if(series===undefined)return;change(()=>{const obj=p.series[series];if(prop==='name')renameObject(p,'series',obj.key,e.target.value);else if(prop==='role'){if(!['bar','line'].includes(e.target.value))throw Error('请选择柱或线');if(p.rows.some(r=>identity(r)===obj.key))throw Error('该系列已有记录，请先移除记录再更改角色');obj.role=e.target.value;}else obj[prop]=e.target.value;},{form:true});};
$('seriesList').onclick=e=>{const d=e.target.dataset;if(d.moveSeries!==undefined){change(()=>{moveSeries(p,+d.moveSeries,Number(d.delta));if(isPercentStack(p))pendingStart=null;},{form:true});return;}if(d.removeSeries===undefined)return;const obj=p.series[d.removeSeries];if(p.rows.some(r=>identity(r)===obj.key)&&!confirm('删除该系列及其全部记录？'))return;change(()=>{removeObject(p,'series',obj.key);selected=-1;},{form:true});};
$('addSeries').onclick=()=>{if(p.kind.endsWith('_1')){toast('单系列类型只允许一个系列，请先选择多系列图表');return;}change(()=>{
  let n=p.series.length+1;
  if(isArea(p)||isHistogram(p))while(p.series.some(s=>s.name==='Series '+n))n++;
  addObject(p,'series','Series '+n);
},{form:true});};
$('axisFields').onclick=e=>{if(e.target.dataset.tick){calTarget=e.target.dataset.tick;setTool('calibrate');}};
$('axisFields').onchange=e=>{const {axis,field,percentScale}=e.target.dataset;if(percentScale){change(()=>{p.percentLabels??={};p.percentLabels[percentScale]=e.target.checked;},{form:true});return;}if(!axis)return;
let scale;
if(['v1','v2'].includes(field)){
  const display=printedPercent(e.target.value);
  if(display!==null){scale=axis;e.target.value=String(display);}
  else if(e.target.value!==''&&!finite(Number(e.target.value))){toast('刻度需要有限数值');axisForm();return;}
}
if(isHistogram(p)||isHeatmap(p)||isPercentStack(p)){
  const raw=e.target.value;
  change(()=>{
    recordPercentScale(scale,Number(raw));
    const calibration=p.axes[axis];
    calibration[field]=field==='type'?raw:raw===''?null:Number(raw);
    if(field==='p1'||field==='p2'){
      const key='point'+field.slice(1),pixel=calibration[field];
      if(pixel===null)delete calibration[key];
      else calibration[key]=axis==='x'?{x:pixel,y:p.axes.y.p1??0}:{x:p.axes.x.p1??0,y:pixel};
    }
    if(isHeatmap(p))updateHeatmapCalibration(axis);
    else if(isPercentStack(p))updatePercentStackCalibration(axis);
    else updateHistogramCalibration(axis);
  },{form:isHeatmap(p)||isPercentStack(p)});
  syncCalibrationStatus();
  return;
}try{change(()=>{recordPercentScale(scale,Number(e.target.value));if(field!=='type'&&e.target.value==='')throw Error('刻度值不能为空');p.axes[axis][field]=field==='type'?e.target.value:Number(e.target.value);if(field==='p1'||field==='p2'){const n=field.slice(1);p.axes[axis]['point'+n]=axis==='x'?{x:p.axes[axis][field],y:p.axes.y.p1}:{x:p.axes.x.p1,y:p.axes[axis][field]};}p.axes[axis].calibrated=!!(p.axes[axis].point1&&p.axes[axis].point2)&&p.axes[axis].p1!==p.axes[axis].p2&&p.axes[axis].v1!==p.axes[axis].v2;recalculate();},{form:true});}catch(err){toast(err.message);syncForm();}};
document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
$('addRow').onclick=()=>{if(isHistogram(p)){addHistogramRow();return;}if(isArea(p)){
  const nominal=isNominalArea(p);
  if(nominal&&(targetIndex(assist())>=0||!assist().category)){
    toast(assist().category?'该类别和系列已有记录，请选择其他目标':'请先填写类别并选择当前类别');
    return;
  }
  change(()=>addAreaRow({...(nominal?{}:{x:null}),y:null,baseline:null},{role:'transcribed',source:'manual_entry'}));
  document.querySelector(`[data-i="${selected}"][data-key="${nominal?'y':'x'}"]`)?.focus();
  return;
}if(isStat(p)){change(()=>{const a=assist(),c=isBox(p)&&a.category&&targetIndex(a)<0?p.categoryObjects.find(c=>c.key===a.category):addObject(p,'category',nextCategory());p.rows.push({...isPie(p)?{category:c.name,value:null}:emptyBox(c.name),_categoryKey:c.key,_seriesKey:a.series,series:seriesName(p,a.series)});p.evidence??=[];p.evidence.push({role:'transcribed',source:'manual_entry'});selected=p.rows.length-1;a.category=c.key;selectedHandle=isBox(p)?boxHandle('lower'):'pixel';},{form:true});return;}if(lineCategoryAxis(p)&&!assist().category){toast('请先填写并选择当前类别');return;}if(categorical()&&(assist().sequence!=='manual'||isPercentStack(p))&&targetIndex(assist())>=0){toast(isPercentStack(p)?'当前目标已有记录，可直接编辑该行':'当前目标已标注，请选择其他目标或切换手动模式');return;}change(()=>{const row=bar()?{category:categoryName(p,assist().category)||'A',value:0,series:seriesName(p,assist().series),_categoryKey:assist().category,_seriesKey:assist().series}:{x:categorical()&&categoryField(p)==='x'?categoryName(p,assist().category):0,y:lineCategoryAxis(p)==='y'?categoryName(p,assist().category):0,series:seriesName(p,assist().series),_seriesKey:assist().series,...(categorical()?{_categoryKey:assist().category}:{})};if(isPercentStack(p)){row.value=null;clearPercentSkip(assist());pendingStart=null;}else if(isStack(p)){row.start=0;row.end=0;}if(isLine(p))appendLinePathRank(p,row);p.rows.push(row);p.evidence??=[];p.evidence.push({role:$('role').value,source:'manual_entry'});selected=p.rows.length-1;selectedHandle='pixel';if(categorical()&&assist().sequence!=='manual'&&!isPercentStack(p))nextTarget();});const field=document.querySelector('[data-i="'+selected+'"][data-key="'+(bar()?'value':lineCategoryAxis(p)==='y'?'x':'y')+'"]');field?.focus();field?.select();};
$('deleteRow').onclick=()=>{if(selected<0)return;change(()=>{p.rows.splice(selected,1);p.evidence?.splice(selected,1);if(isPercentStack(p))pendingStart=null;selected=-1;},{form:isPie(p)});};
$('undo').onclick=()=>{if(!history.length)return;future.push(clone(p));p=history.pop();selected=-1;pendingStart=null;selectHistogramRunTarget();refresh(true);};$('redo').onclick=()=>{if(!future.length)return;history.push(clone(p));p=future.pop();selected=-1;pendingStart=null;selectHistogramRunTarget();refresh(true);};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&focusMode){e.preventDefault();exitFocus();return;}if(e.target.matches?.('input,textarea,select,[contenteditable=true]'))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}if(e.key==='Escape'){if(focusMode){exitFocus();return;}if(tool==='pie-angle'){cancelPieAngles();return;}pendingStart=null;setTool('select');}if(!isHeatmap(p)&&(!isBox(p)&&!isArea(p)&&!isHistogram(p)||tool==='select')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&selected>=0&&p.evidence?.[selected]?.[selectedHandle]){e.preventDefault();const step=e.altKey?.1:e.shiftKey?10:1;const pt={...p.evidence[selected][selectedHandle]||p.evidence[selected].pixel};pt.x+=(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);pt.y+=(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);change(()=>editHandle(selected,selectedHandle,constrainDrag(pt,selected,selectedHandle)));}});
function setZoom(z){zoom=Math.max(.08,Math.min(8,z));draw();}function fit(){if(image)setZoom(Math.min(($('canvasWrap').clientWidth-20)/image.width,($('canvasWrap').clientHeight-20)/image.height,1));}
$('zoomIn').onclick=()=>setZoom(zoom*1.3);$('zoomOut').onclick=()=>setZoom(zoom/1.3);$('fit').onclick=fit;$('overlay').onchange=draw;$('connect').onchange=draw;
function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
async function loadImage(data){const version=++imageLoadVersion;return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{if(version!==imageLoadVersion){resolve();return;}image=img;imageData=data;$('empty').style.display='none';fit();resolve();};img.onerror=()=>reject(Error('无法读取图像'));img.src=data;});}
function visibleQueue(){return queue.filter(q=>(q.projectId??null)===currentProjectId);}
function projectName(){return projects.find(q=>q.id===currentProjectId)?.name||'无项目';}
function queueUI(){const items=visibleQueue().map(q=>q.id===activeId?{...q,project:p}:q);$('queue').innerHTML=items.map(q=>`<button class="${q.id===activeId?'active':''}" data-queue="${esc(q.id)}" title="${esc(q.name)}">${q.project.reviewed?'✓ ':hasRows(q.project)?'◐ ':'○ '}${esc(q.name)}</button>`).join('');options($('projectSelect'),[["",'无项目'],...projects.map(q=>[q.id,q.name])],currentProjectId||'');options($('moveProject'),[["",'无项目'],...projects.map(q=>[q.id,q.name])],currentProjectId||'');$('moveProjectLabel').hidden=!activeId;$('queueSummary').textContent=projectName()+' · '+items.length+' 张图 / '+items.filter(q=>q.project.reviewed).length+' 张已核对';$('renameProject').disabled=!currentProjectId;$('deleteProject').disabled=!currentProjectId;$('removeImage').disabled=!activeId;}
function stash(){let q=queue.find(q=>q.id===activeId);if(!q&&(imageData||hasRows(p))){activeId=crypto.randomUUID();q={id:activeId,projectId:currentProjectId,name:fileName||'未命名图表',image:imageData,project:clone(p)};queue.push(q);}if(q){q.project=clone(p);q.image=imageData;}}
function resetCurrent(){imageLoadVersion++;activationVersion++;p=fresh(p.kind+(hasErrors(p)&&!isStack(p)&&!isComposite(p)?'_error':''),p.xType,p.yType);image=null;imageData=null;fileName='';activeId=null;selected=-1;hover=null;pendingStart=null;drag=null;history=[];future=[];$('empty').style.display='flex';$('fileName').textContent='从一张图开始';$('magnifier').hidden=true;$('cursorInfo').textContent='原始像素坐标';setTool('select');refresh(true);queueUI();}
function decodeImage(data){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('无法读取图像'));img.src=data;});}
// Decode before replacing live state; failed or superseded selections must not damage annotations.
async function activate(id){const version=++activationVersion;stash();const q=queue.find(q=>q.id===id);if(!q)throw Error('图像不存在');const nextImage=q.image?await decodeImage(q.image):null;if(version!==activationVersion||!queue.includes(q))return;stash();imageLoadVersion++;activeId=id;currentProjectId=q.projectId??null;p=restoreHistogramBins(ensureIdentities(clone(q.project)));fileName=q.name;image=nextImage;imageData=q.image||null;hover=null;pendingStart=null;drag=null;$('fileName').textContent=fileName;history=[];future=[];selected=-1;$('empty').style.display=image?'none':'flex';if(image)fit();refresh(true);queueUI();resumeTool();}
async function selectProject(id){stash();const destination=id||null,first=queue.find(q=>(q.projectId??null)===destination);if(first)await activate(first.id);else{currentProjectId=destination;resetCurrent();}}
async function importImages(files){stash();const supported=[...files].filter(f=>/^image\/(png|jpeg|webp)$/.test(f.type)||/\.(png|jpe?g|webp)$/i.test(f.name)),ordered=supported.sort((a,b)=>(a.webkitRelativePath||a.relativePath||a.name).localeCompare(b.webkitRelativePath||b.relativePath||b.name,'zh-CN',{numeric:true}));let first=null,failed=0;const destination=currentProjectId,kind=p.kind+(hasErrors(p)&&!isStack(p)&&!isComposite(p)?'_error':''),xType=p.xType,yType=p.yType;for(const f of ordered){try{const data=await readFile(f);await new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=reject;im.src=data;});const id=crypto.randomUUID();queue.push({id,projectId:destination,name:f.webkitRelativePath||f.relativePath||f.name,image:data,project:fresh(kind,xType,yType)});first??=id;}catch{failed++;}}if(first&&destination===currentProjectId)await activate(first);queueUI();toast('已导入 '+(ordered.length-failed)+' 张图'+(failed?'；'+failed+' 张无法读取':'')+'；跳过 '+(files.length-supported.length)+' 个非支持文件');}
for(const id of ['imageInput','folderInput'])$(id).onchange=async e=>{try{await importImages([...e.target.files]);}catch(err){toast(err.message);}finally{e.target.value='';}};
$('projectSelect').onchange=()=>selectProject($('projectSelect').value).catch(e=>toast(e.message));
$('newProject').onclick=async()=>{const name=prompt('新标注项目名称');if(!name?.trim())return;const id=crypto.randomUUID();projects.push({id,name:name.trim()});await selectProject(id);};
$('renameProject').onclick=()=>{const q=projects.find(q=>q.id===currentProjectId);if(!q)return;const name=prompt('项目新名称',q.name);if(name?.trim()){q.name=name.trim();queueUI();refresh();}};
$('deleteProject').onclick=async()=>{const q=projects.find(q=>q.id===currentProjectId);if(!q||!confirm('删除项目“'+q.name+'”？其中的图像和标注将移到“无项目”，不会删除。'))return;stash();queue.filter(q=>q.projectId===currentProjectId).forEach(q=>q.projectId=null);projects=projects.filter(q=>q.id!==currentProjectId);await selectProject(null);};
$('moveProject').onchange=async()=>{stash();const q=queue.find(q=>q.id===activeId);if(q){q.projectId=$('moveProject').value||null;await selectProject(q.projectId);}};
$('removeImage').onclick=async()=>{if(!activeId||!confirm('移除当前图像和标注？请确认已保存工程备份。'))return;queue=queue.filter(q=>q.id!==activeId);activeId=null;imageData=null;p.rows=[];const next=visibleQueue()[0];if(next)await activate(next.id);else resetCurrent();};
$('queue').onclick=async e=>{const button=e.target.closest('[data-queue]');if(button)try{await activate(button.dataset.queue);}catch(err){toast(err.message);}};
function downloadBlob(name,blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function tableFiles(spec,stem){
  return globalThis.VegaLiteTableExport.exportTables(spec).flatMap(t=>[
    {name:stem+'/'+t.id+'.md',text:t.markdown},{name:stem+'/'+t.id+'.csv',text:t.csv}
  ]);
}
function download(name,object){downloadBlob(name,new Blob([JSON.stringify(object,null,2)],{type:'application/json'}));}
function bundle(){stash();return{format:'chart-studio-project',version:2,savedAt:new Date().toISOString(),projects:clone(projects),currentProjectId,activeId,queue:clone(queue),current:{project:clone(p),image:imageData,name:fileName}};}
$('saveProject').onclick=()=>{download('chart-studio-workspace.project.json',bundle());toast('工作区已备份：包含全部项目、原图、标注和校准记录');};
$('exportGT').onclick=async()=>{await render();const errors=validate(p).filter(i=>i.severity==='error');if(errors.length||!renderOk||!lastSpec){toast('请先修正质量检查错误并确认渲染成功');return;}if(!p.reviewed){toast('请先核对原图和数值来源，并勾选右侧确认');return;}const spec=clone(lastSpec);if($('withSchema').checked)spec.$schema='https://vega.github.io/schema/vega-lite/v6.json';download(safeExportName(fileName||p.kind).split('/').at(-1),spec);toast('已导出精简 GT；像素与来源请另存工程');};
$('exportTables').onclick=async()=>{
  await render();
  if(!p.reviewed||!renderOk||!lastSpec){toast('请完成数据核对和渲染后导出');return;}
  try{const stem=safeExportName(fileName||p.kind).split('/').at(-1).replace(/\.gt\.json$/,'');
    downloadBlob(stem+'.tables.zip',new Blob([zipBytes(tableFiles(lastSpec,stem))],{type:'application/zip'}));
  }catch(error){toast(error.message);}
};
$('batchExport').onclick=async()=>{stash();const items=visibleQueue();if(!items.length){toast('当前项目还没有图像');return;}const report=[],entries=[],names=new Set();for(const q of items){let reason='',spec,tables;try{if(!q.project.reviewed)throw Error('尚未核对');spec=makeSpec(q.project);window.vega.parse(window.vegaLite.compile(spec).spec);tables=tableFiles(spec,'tables');}catch(e){reason=e.message;}let name=safeExportName(q.name);for(let n=2;names.has(name);n++)name=safeExportName(q.name).replace(/\.gt\.json$/,'-'+n+'.gt.json');if(!reason){names.add(name);if($('withSchema').checked)spec.$schema='https://vega.github.io/schema/vega-lite/v6.json';entries.push({name:'gt/'+name,text:JSON.stringify(spec,null,2)},...tables.map(t=>({...t,name:'tables/'+name.slice(0,-8)+'/'+t.name.slice(7)})));}report.push({image:q.name,id:q.id,status:reason?'skipped':'exported',file:reason?null:'gt/'+name,reason:reason||null});}entries.push({name:'export-report.json',text:JSON.stringify({project:projectName(),exported:names.size,skipped:report.filter(q=>q.status==='skipped').length,images:report},null,2)});downloadBlob(projectName().replace(/[<>:"/\\|?*]/g,'_')+'.gt.zip',new Blob([zipBytes(entries)],{type:'application/zip'}));toast('批量导出 '+names.size+' 张；跳过 '+report.filter(q=>q.status==='skipped').length+' 张（原因见 ZIP 内清单）');queueUI();};
$('copyGT').onclick=async()=>{if(!lastSpec){toast('暂无有效 GT');return;}try{await navigator.clipboard.writeText(JSON.stringify(lastSpec,null,2));toast('JSON 已复制');}catch{toast('无法访问剪贴板，请使用导出 GT');}};
$('openProject').onclick=()=>$('projectInput').click();$('importSpec').onclick=()=>$('specInput').click();
async function restore(data){if(data.format!=='chart-studio-project'||![1,2].includes(data.version)||!data.current?.project||!Array.isArray(data.queue))throw Error('不是受支持的 Chart Studio 工程');const all=[data.current.project,...data.queue.map(q=>q.project)];for(const item of all){if(!labels[item.kind]||!Array.isArray(item.rows)||!item.axes?.x||!item.axes?.y||!Array.isArray(item.series))throw Error('工程结构不完整');if(isHeatmap(item))checkHeatmapProject(item);}const nextProjects=data.version===2?data.projects||[]:[];if(!Array.isArray(nextProjects)||nextProjects.some(q=>!q.id||typeof q.name!=='string')||new Set(nextProjects.map(q=>q.id)).size!==nextProjects.length)throw Error('项目列表无效');if(new Set(data.queue.map(q=>q.id)).size!==data.queue.length||data.queue.some(q=>typeof q.id!=='string'))throw Error('图像列表 ID 无效');const projectIds=new Set(nextProjects.map(q=>q.id));const active=data.queue.find(q=>q.id===data.activeId);if(data.activeId&&!active)throw Error('当前图像 ID 不存在');if(data.version===2&&active&&(active.projectId??null)!==(data.currentProjectId||null))throw Error('当前图像与所选项目不一致');if(data.version===2&&(data.currentProjectId&&!projectIds.has(data.currentProjectId)||data.queue.some(q=>q.projectId&&!projectIds.has(q.projectId))))throw Error('图像所属项目不存在');if(data.current.image)await new Promise((resolve,reject)=>{const im=new Image();im.onload=resolve;im.onerror=()=>reject(Error('工程原图无法读取'));im.src=data.current.image;});activationVersion++;queue=clone(data.queue);for(const q of queue){restoreHistogramBins(ensureIdentities(q.project));}projects=clone(nextProjects);currentProjectId=data.version===2?data.currentProjectId||null:null;activeId=data.activeId;p=restoreHistogramBins(ensureIdentities(clone(data.current.project)));p.errorBars=hasErrors(p);imageData=data.current.image;fileName=data.current.name||'';image=null;hover=null;pendingStart=null;drag=null;history=[];future=[];selected=-1;if(imageData)await loadImage(imageData);else{$('empty').style.display='flex';$('magnifier').hidden=true;draw();}$('fileName').textContent=fileName||'未命名工程';queueUI();refresh(true);resumeTool();}
$('projectInput').onchange=async e=>{try{await restore(JSON.parse(await e.target.files[0].text()));toast('工程已恢复');}catch(err){toast('打开失败：'+err.message);}e.target.value='';};
$('specInput').onchange=async e=>{try{const next=importSpec(JSON.parse(await e.target.files[0].text()),p.kind);next.errorBars=hasErrors(next);change(()=>{keepOtherAreaMode(p,next);keepOtherLineModes(p,next);p={...next,evidence:next.rows.map(()=>({role:'transcribed',source:'imported_gt',...(isPercentStack(next)?{valueOverride:true}:{})})),reviewed:false};for(const a of Object.values(p.axes))a.calibrated=false;selected=-1;},{form:true});setTool('select');toast('GT 已导入；像素证据需重新标注');}catch(err){toast('导入失败：'+err.message);}e.target.value='';};
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
