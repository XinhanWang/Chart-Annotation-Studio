"""Strict, licensed SVG text font embedding. JSON stdin/stdout CLI."""
from __future__ import annotations
import base64, hashlib, io, json, re, sys
from pathlib import Path
import xml.etree.ElementTree as ET
from fontTools.ttLib import TTFont
from fontTools import subset
ROOT = Path(__file__).resolve().parent
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
GENERIC = {'sans-serif':'DejaVu Sans', 'serif':'DejaVu Serif', 'monospace':'DejaVu Sans Mono'}
class FontEmbeddingError(ValueError): pass

def names(font, num):
    return list(dict.fromkeys(n.toUnicode() for n in font['name'].names if n.nameID == num))

def inspect_font(file):
    with TTFont(file) as f:
        return {'copyright':names(f,0), 'name13':names(f,13), 'name14':names(f,14), 'fsType':int(f['OS/2'].fsType)}

def licensed_font(record, root):
    file = (root / record['file']).resolve()
    data = file.read_bytes()
    if hashlib.sha256(data).hexdigest() != record.get('sha256'):
        raise FontEmbeddingError('font hash mismatch: '+str(file))
    f = TTFont(io.BytesIO(data), recalcTimestamp=False)
    info = inspect_font(file)
    if info['fsType'] & (2|256|512) or info['fsType'] & ~12:
        raise FontEmbeddingError('restricted/unsupported fsType: '+str(file))
    actual = (f['name'].getBestFamilyName(), int(f['OS/2'].usWeightClass), 'italic' if f['OS/2'].fsSelection & 1 else 'normal')
    if actual != (record['family'],record['weight'],record['style']):
        raise FontEmbeddingError('manifest face does not match font: '+str(file))
    lic = record.get('embedding_license', {})
    if lic.get('status') != 'approved' or lic.get('id') not in ('DejaVu-permissive','OFL-1.1','AGPL-3.0-upstream-source-bundled'):
        raise FontEmbeddingError('embedding license not approved: '+file.name+' '+lic.get('reason','unknown grant'))
    notice = (root / lic['notice']).read_text(encoding='utf-8')
    if hashlib.sha256(notice.encode()).hexdigest() != lic.get('notice_sha256'):
        raise FontEmbeddingError('license notice hash mismatch: '+file.name)
    if lic['id']=='DejaVu-permissive' and not any('Permission is hereby granted' in n and 'Bitstream' in n for n in info['name13']):
        raise FontEmbeddingError('missing permissive name13: '+file.name)
    if lic['id']=='OFL-1.1' and not any('Open Font License' in n for n in info['name13']):
        raise FontEmbeddingError('missing OFL name13: '+file.name)
    return f, info, notice

def embed_svg(svg, manifest_path=ROOT/'fonts.manifest.json'):
    manifest_path=Path(manifest_path); root=manifest_path.parent
    manifest=json.loads(manifest_path.read_text(encoding='utf-8-sig'))
    if '<!DOCTYPE' in svg or '<!ENTITY' in svg: raise FontEmbeddingError('DTD/entities unsupported')
    tree=ET.fromstring(svg)
    if tree.tag != '{'+NS+'}svg': raise FontEmbeddingError('expected SVG root')
    runs=[]; groups={}; generic=[]
    def walk(node, inherited, role=None, intext=False):
        tag=node.tag.rsplit('}',1)[-1]
        if tag=='style': raise FontEmbeddingError('input CSS stylesheet unsupported; use SVG presentation attributes/inline style')
        if tag in ('foreignObject','use','textPath'): raise FontEmbeddingError('unsupported text/resource element: '+tag)
        attrs=dict(inherited)
        attrs.update({k:v for k,v in node.attrib.items() if k.startswith('font-')})
        for declaration in node.get('style','').split(';'):
            if not declaration.strip(): continue
            if ':' not in declaration: raise FontEmbeddingError('invalid inline CSS')
            key,value=map(str.strip,declaration.split(':',1))
            if key=='font' or '!important' in value or 'var(' in value: raise FontEmbeddingError('unsupported font shorthand/CSS')
            if key.startswith('font-'): attrs[key]=value
        for key in ('font-stretch','font-variant','font-feature-settings','font-variation-settings'):
            if attrs.get(key,'normal') not in ('normal','none'): raise FontEmbeddingError('unsupported '+key)
        role=node.get('role') or node.get('class') or role
        active=intext or tag in ('text','tspan')
        def run(text):
            if not text: return
            family=attrs.get('font-family','sans-serif').strip().strip('\"\'')
            if ',' in family: raise FontEmbeddingError('font fallback lists unsupported: '+family)
            requested=family; family=GENERIC.get(family,family)
            if requested!=family:
                generic.append({'requested':requested,'resolved':family})
            weight=attrs.get('font-weight','400'); weight={'normal':'400','bold':'700'}.get(weight,weight)
            try: weight=int(weight)
            except ValueError: raise FontEmbeddingError('unsupported weight: '+str(weight))
            style=attrs.get('font-style','normal')
            if style not in ('normal','italic'): raise FontEmbeddingError('unsupported style: '+style)
            matches=[f for f in manifest['fonts'] if (f['family'],f['weight'],f['style'])==(family,weight,style)]
            if len(matches)!=1: raise FontEmbeddingError(f'no unique exact face: {family}/{weight}/{style}')
            key=(family,weight,style)
            chars={ord(c) for c in text if c not in '\n\r\t'}
            group=groups.setdefault(key,{'record':matches[0], 'chars':set()});group['chars'].update(chars)
            runs.append({'role':role,'text':text,'requested_family':requested,'family':family,'weight':weight,'style':style})
            # Explicitly resolve generics on every text/tspan; preserve inline CSS precedence.
            if requested!=family:
                node.set('font-family',family)
                css=node.get('style','')
                if re.search(r'(?:^|;)\s*font-family\s*:',css):
                    node.set('style',re.sub(r'((?:^|;)\s*font-family\s*:)[^;]*',lambda m:m[1]+family,css))
        if active: run(node.text)
        for child in node:
            walk(child,attrs,role,active)
            if active: run(child.tail)
    walk(tree,{})
    css=[]; faces=[]
    for (family,weight,style),group in sorted(groups.items()):
        rec=group['record']; f,info,notice=licensed_font(rec,root)
        missing=group['chars']-set(f.getBestCmap() or {})
        if missing: raise FontEmbeddingError('missing glyphs '+family+'/'+str(weight)+'/'+style+': '+','.join(f'U+{c:04X}' for c in sorted(missing)))
        if rec['embedding_license']['id'].startswith('AGPL'):
            data=(root / rec['file']).read_bytes(); f.close()
        else:
            options=subset.Options();options.recalc_timestamp=False;options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
            subsetter=subset.Subsetter(options=options);subsetter.populate(unicodes=group['chars']);subsetter.subset(f)
            buf=io.BytesIO();f.save(buf);data=buf.getvalue();f.close()
        mime='font/otf' if data[:4]==b'OTTO' else 'font/ttf'
        css.append('@font-face{font-family:'+json.dumps(family)+';font-weight:'+str(weight)+';font-style:'+style+';src:url("data:'+mime+';base64,'+base64.b64encode(data).decode()+'") format("'+('opentype' if mime=='font/otf' else 'truetype')+'");}')
        faces.append({'family':family,'weight':weight,'style':style,'source_sha256':rec['sha256'],'embedded_sha256':hashlib.sha256(data).hexdigest(),'source_bytes':rec['bytes'],'embedded_bytes':len(data),'codepoints':sorted(group['chars']),'license':rec['embedding_license']['id'],'copyright':info['copyright'],'license_notice':notice,'name13':info['name13'],'name14':info['name14'],'fsType':info['fsType']})
    sources={}
    for group in groups.values():
        lic=group['record']['embedding_license']
        if lic['id'].startswith('AGPL'):
            blob=(root/lic['source_archive']).read_bytes()
            if hashlib.sha256(blob).hexdigest()!=lic['source_sha256']: raise FontEmbeddingError('source archive hash mismatch')
            import tarfile
            with tarfile.open(fileobj=io.BytesIO(blob)) as archive:
                prefix=archive.getnames()[0]+'/'
                original=archive.extractfile(prefix+'fonts/'+Path(group['record']['file']).name).read()
                if hashlib.sha256(original).hexdigest()!=group['record']['sha256']: raise FontEmbeddingError('font differs from corresponding upstream archive')
                for ext in ('.t1','.afm','.ttf'):
                    archive.getmember(prefix+'fonts/'+Path(group['record']['file']).with_suffix(ext).name)
            sources[lic['source_sha256']]={'upstream_commit':lic['upstream_commit'],'source_url':lic['source_url'],'mime':'application/gzip','base64':base64.b64encode(blob).decode(),'sha256':lic['source_sha256'],'scope':'Complete upstream repository as published: Type1, OTF, TTF, AFM, notices; no upstream OTF build recipe or byte-rebuild claim','font_program_license':'AGPL-3.0; PS/PDF exception not relied upon; original font bytes unmodified','chart_content_license':'Not assigned or changed by this helper; separable text/data remain subject to owner terms'}
    metadata={'source_archives':sources,'schema' :'vsr-embedded-fonts/1','faces':faces,'text_runs':runs,'generic_resolutions':list({json.dumps(g,sort_keys=True):g for g in generic}.values()),'fallback':'forbidden','text_layout':'Vega geometry may be estimated; embedding does not certify bounds'}
    meta=ET.Element('{'+NS+'}metadata',{'id':'vsr-font-licenses'});meta.text=json.dumps(metadata,ensure_ascii=False)
    style_node=ET.Element('{'+NS+'}style',{'id':'vsr-embedded-fonts','type':'text/css'});style_node.text=''.join(css)
    tree.insert(0,meta);tree.insert(1,style_node)
    output=ET.tostring(tree,encoding='unicode')
    return {'svg':output,'audit':metadata}

if __name__=='__main__':
    try:
        req=json.load(sys.stdin);json.dump(embed_svg(req['svg'],req.get('manifest',ROOT/'fonts.manifest.json')),sys.stdout,ensure_ascii=False)
    except Exception as exc:
        print('FONT_EMBEDDING_REJECTED: '+str(exc),file=sys.stderr);sys.exit(1)
