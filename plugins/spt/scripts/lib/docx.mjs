// Minimal .docx -> Markdown text extraction (no dependencies). Keeps headings, list items and table rows.
import fs from 'node:fs';
import zlib from 'node:zlib';

function readZipEntry(buf, wanted) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid .docx (zip) file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    if (name === wanted) {
      const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${wanted} not found in .docx`);
}

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function paragraphText(p) {
  return decode([...p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
    .map(m => (m[1] !== undefined ? m[1] : m[0] === '<w:tab/>' ? '\t' : '\n')).join(''));
}

function paragraphMd(p) {
  const text = paragraphText(p).trim();
  if (!text) return '';
  const style = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
  const h = style.match(/^(?:Heading|heading)\s?(\d)$/) || (style === 'Title' ? [null, '1'] : null);
  if (h) return `${'#'.repeat(Math.min(Number(h[1]), 6))} ${text}`;
  if (/<w:numPr>/.test(p) || /List/i.test(style)) return `- ${text}`;
  return text;
}

export function docxToMarkdown(file) {
  const xml = readZipEntry(fs.readFileSync(file), 'word/document.xml').toString('utf8');
  const body = (xml.match(/<w:body>([\s\S]*)<\/w:body>/) || [null, xml])[1];
  const out = [];
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const chunk = m[0];
    if (chunk.startsWith('<w:tbl>')) {
      const rows = [...chunk.matchAll(/<w:tr[ >][\s\S]*?<\/w:tr>/g)].map(r =>
        [...r[0].matchAll(/<w:tc>[\s\S]*?<\/w:tc>/g)].map(c =>
          [...c[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)].map(pp => paragraphText(pp[0]).trim()).filter(Boolean).join(' ').replace(/\|/g, '\\|')));
      rows.forEach((cells, i) => {
        out.push(`| ${cells.join(' | ')} |`);
        if (i === 0) out.push(`|${cells.map(() => '---').join('|')}|`);
      });
      out.push('');
    } else {
      const line = paragraphMd(chunk);
      if (line) out.push(line, '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
