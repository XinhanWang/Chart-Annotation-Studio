// Independent executable reference for the documented Precision V1 contract.
// Decimal shifting uses Number arithmetic; production uses decimal digits and BigInt.
function quantize(value,uncertainty,allowZero=false){
 if(!Number.isFinite(value)||value===0)return value;
 const shift=(n,e)=>{const [m,p='0']=String(n).split('e');return Number(m+'e'+(Number(p)+e));};
 const significant=Math.floor(Math.log10(Math.abs(value)))-3;
 const round=e=>shift(Math.sign(value)*Math.floor(shift(Math.abs(value),-e)+.5),e);
 const result=round(Math.max(significant,uncertainty>0?Math.floor(Math.log10(uncertainty)):-Infinity));
 return result||allowZero?result:round(significant);
}
function at(pixel,axis){const fraction=(pixel-axis.p1)/(axis.p2-axis.p1);return axis.type==='log'?Math.exp(Math.log(axis.v1)+fraction*(Math.log(axis.v2)-Math.log(axis.v1))):axis.v1+fraction*(axis.v2-axis.v1);}
function uncertainty(value,axis){const span=Math.abs(axis.p2-axis.p1);return axis.type==='log'?Math.abs(value)*Math.expm1(Math.abs(Math.log(axis.v2)-Math.log(axis.v1))/span):Math.abs(axis.v2-axis.v1)/span;}
function measurement(pixel,axis){if(pixel===axis.p1)return axis.v1;if(pixel===axis.p2)return axis.v2;const value=at(pixel,axis);return quantize(value,uncertainty(value,axis),axis.type!=='log');}
function interval(start,end,axis){const a=at(start,axis),b=at(end,axis);return quantize(b-a,uncertainty(a,axis)+uncertainty(b,axis));}
module.exports={measurement,interval,browserSource:[quantize,at,uncertainty,measurement,interval].map(fn=>fn.toString()).join(';')+';'};
