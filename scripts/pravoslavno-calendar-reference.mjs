// Source-specific semantic gate only. No fetch, approval, source text or date inference.
export const PRAVOSLAVNO_SOURCE_ID = 'pravoslavno-rs-daily-readings-2026-10-06';
export const PRAVOSLAVNO_SOURCE_URL = 'https://www.pravoslavno.rs/index.php?q=citanja';
export const PRAVOSLAVNO_SOURCE_TITLE = 'Pravoslavno.rs — дневна читања (према издавачу)';
const names = { 'Матеј':'Matthew','Матеја':'Matthew','Марко':'Mark','Марка':'Mark','Лука':'Luke','Луке':'Luke','Јован':'John','Јована':'John' };
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const positive = n => Number.isSafeInteger(n)&&n>0;
const compare = (a,b) => a.chapter-b.chapter||a.verse-b.verse;

export function parsePravoslavnoHeading(text) {
  if(typeof text!=='string'||text.length>2048||text!==text.trim()||/[\u0000-\u001f\u007f<>]/u.test(text)||/\s{2}/u.test(text)) return null;
  const m=/^(?:Свето )?Јеванђеље\s+(?:(?:од|по)\s+)?(Матеј|Матеја|Марко|Марка|Лука|Луке|Јован|Јована),\s*зачало\s+([1-9][0-9]*(?:,\s*[1-9][0-9]*)*)\.?\s*\(([^()]+)\)$/u.exec(text);
  if(!m)return null;
  const zachalo_numbers=m[2].split(/,\s*/u).map(Number),segments=[];
  if(zachalo_numbers.length>64||!zachalo_numbers.every(positive)||new Set(zachalo_numbers).size!==zachalo_numbers.length)return null;
  let chapter=null,previous=null;
  for(const part of m[3].split(/;\s*/u)) {
    const r=/^(?:([1-9][0-9]*),\s*)?([1-9][0-9]*)(?:[-–](?:([1-9][0-9]*),\s*)?([1-9][0-9]*))?$/u.exec(part.trim());
    if(!r)return null;
    chapter=r[1]?Number(r[1]):chapter;
    const start={chapter,verse:Number(r[2])},end={chapter:Number(r[3]??chapter),verse:Number(r[4]??r[2])};
    if(![start.chapter,start.verse,end.chapter,end.verse].every(positive)||compare(start,end)>0||(previous&&compare(start,previous)<=0)||segments.length===64)return null;
    segments.push({start,end});chapter=end.chapter;previous=end;
  }
  return {book:names[m[1]],segments,zachalo:zachalo_numbers[0],zachalo_numbers};
}

export function pravoslavnoCalendarLabelMatches(reading,sources) {
  if(!same(reading?.source_ids,[PRAVOSLAVNO_SOURCE_ID])||!Array.isArray(sources))return false;
  const records=sources.filter(s=>s?.id===PRAVOSLAVNO_SOURCE_ID);
  if(records.length!==1||records[0].url!==PRAVOSLAVNO_SOURCE_URL||records[0].title!==PRAVOSLAVNO_SOURCE_TITLE)return false;
  const parsed=parsePravoslavnoHeading(reading.source_reference);
  return parsed!==null&&reading.book===parsed.book&&same(reading.segments,parsed.segments)&&
    reading.zachalo===parsed.zachalo&&same(reading.zachalo_numbers,parsed.zachalo_numbers)&&
    reading.zachalo_qualifier===''&&reading.range_precision==='VERSE_RANGE_AS_PRINTED'&&
    reading.role==='source_daily_reading'&&reading.service==='unspecified';
}
