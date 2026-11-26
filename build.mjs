import {readFile,writeFile} from 'node:fs/promises';
const read=f=>readFile(new URL(f,import.meta.url),'utf8');
let html=await read('studio.template.html');
// Checkout settings can change line endings in the two embedded inputs.
const awaitPlaceholder=(await read('vendor.bundle.html')).replaceAll('\r\n','\n');
html=html.replace('<!-- STUDIO_LIBRARIES -->',()=>awaitPlaceholder);
const exporter=(await read('vendor/vega-lite-table-export.js')).replaceAll('\r\n','\n');
const {createHash}=await import('node:crypto');
const pin=JSON.parse(await read('vendor/vega-lite-table-export.lock.json'));
if(createHash('sha256').update(exporter).digest('hex')!==pin.sha256)throw Error('Table exporter checksum differs from the pinned build');
html=html.replace('<script src="./vendor/vega-lite-table-export.js"></script>',()=>'<script>'+exporter.replace(/<\/script/gi,'<\\/script')+'</script>');
const app=(await Promise.all(['radar.js','radar-tools.js','smooth.js','studio.js'].map(read))).join('\n').replaceAll('\r\n','\n');
html=html.replace('<script type="module" src="./studio.js"></script>',()=>'<script type="module">'+app.replace(/<\/script/gi,'<\\/script')+'</script>');
await writeFile(new URL('index.html',import.meta.url),html);
console.log(`Built offline index.html (${Buffer.byteLength(html)} bytes)`);
