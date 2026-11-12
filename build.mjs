import {readFile,writeFile} from 'node:fs/promises';
const read=f=>readFile(new URL(f,import.meta.url),'utf8');
let html=await read('studio.template.html');
const awaitPlaceholder=await read('vendor.bundle.html');
html=html.replace('<!-- STUDIO_LIBRARIES -->',()=>awaitPlaceholder);
const app=await read('studio.js');
html=html.replace('<script type="module" src="./studio.js"></script>',()=>'<script type="module">'+app.replace(/<\/script/gi,'<\\/script')+'</script>');
await writeFile(new URL('index.html',import.meta.url),html);
console.log(`Built offline index.html (${Buffer.byteLength(html)} bytes)`);
