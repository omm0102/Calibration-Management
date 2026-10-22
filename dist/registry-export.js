/* Styled, self-contained XLSX export. Values stay text to preserve equipment IDs. */
(function(root){
'use strict';
const NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const letters=index=>{let result='';for(index++;index;index=Math.floor((index-1)/26))result=String.fromCharCode(65+(index-1)%26)+result;return result};
function width(label){return ({'設備編號':24,'設備名稱':34,'資產編號':23,'廠牌':20,'型號':24,'序號':24,'校驗方式':13,'允收標準':64,'實驗室及廠商':27,'保管單位':27,'保管人':27,'有效日期':17,'校驗週期':16,'儀器狀態':15,'使用量測範圍':30,'使用最小公差':25,'儀器精度':25,'備註':48})[label]||24}
function rowHeight(values,columns,visible){
 let lines=1;
 values.forEach((value,i)=>{if(!visible.has(columns[i].key))return;for(const line of String(value??'').split('\n')){const length=Array.from(line,c=>c.codePointAt(0)>255?2:1).reduce((a,b)=>a+b,0);lines=Math.max(lines,Math.ceil(length/Math.max(8,width(columns[i].label)-2)))}});
 return Math.max(27,Math.min(150,lines*15+9));
}
function styles(){
 const font=(color,bold=false)=>`<font><sz val="11"/><color rgb="${color}"/><name val="Microsoft JhengHei"/>${bold?'<b/>':''}</font>`;
 const fill=color=>`<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`;
 const xf=(fontId,fillId,head=false)=>`<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${head?'center':'left'}" vertical="center" wrapText="1"/></xf>`;
 return `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${NS}"><fonts count="3">${font('FF24496B')}${font('FFFFFFFF',true)}${font('FFB44747')}</fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${['FF203E5C','FFFFFFFF','FFF0F5FB','FFFFF0F0','FFFCE5E5'].map(fill).join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>${['left','right','top','bottom'].map(side=>`<${side} style="thin"><color rgb="FFD6E0EB"/></${side}>`).join('')}<diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${xf(1,2,true)}${xf(0,3)}${xf(0,4)}${xf(2,5)}${xf(2,6)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}
function sheetXml(sheet,columns,month){
 const visible=new Set(sheet.visibleKeys),last=letters(columns.length-1),ref=`A1:${last}${sheet.rows.length+1}`;
 const cell=(value,row,col,style)=>`<c r="${letters(col)}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
 const filters=sheet.filters.map(({key,values})=>{
  const colId=columns.findIndex(c=>c.key===key);if(colId<0)return '';
  return `<filterColumn colId="${colId}"><filters blank="${values.includes('')?'1':'0'}">${values.filter(v=>v!=='').map(v=>`<filter val="${xml(v)}"/>`).join('')}</filters></filterColumn>`;
 }).join('');
 const header=`<row r="1" ht="34" customHeight="1">${columns.map((c,i)=>cell(c.label,1,i,1)).join('')}</row>`;
 const data=sheet.rows.map((row,i)=>`<row r="${i+2}" ht="${rowHeight(row.values,columns,visible)}" customHeight="1"${row.hidden?' hidden="1"':''}>${row.values.map((value,col)=>cell(value,i+2,col,row.inactive?(i%2?5:4):(i%2?3:2))).join('')}</row>`).join('');
 return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}" xmlns:r="${REL}"><sheetPr filterMode="${sheet.rows.some(r=>r.hidden)||filters?'1':'0'}"><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="${ref}"/><sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane xSplit="3" ySplit="1" topLeftCell="D2" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="D2" sqref="D2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="27"/><cols>${columns.map((c,i)=>`<col min="${i+1}" max="${i+1}" width="${width(c.label)}" customWidth="1"${visible.has(c.key)?'':' hidden="1"'}/>`).join('')}</cols><sheetData>${header}${data}</sheetData><autoFilter ref="${ref}">${filters}</autoFilter><printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/><headerFooter><oddHeader>&amp;C${xml('量測監控設備清冊 · '+month+' · '+sheet.name)}</oddHeader><oddFooter>&amp;R&amp;P / &amp;N</oddFooter></headerFooter></worksheet>`;
}
async function build({columns,sheets,month}){
 const zip=new root.JSZip();
 const sheetNames=sheets.map(s=>s.name);
 const overrides=sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
 zip.file('[Content_Types].xml',`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`);
 zip.file('_rels/.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
 zip.file('xl/_rels/workbook.xml.rels',`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="${REL}/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rStyle" Type="${REL}/styles" Target="styles.xml"/></Relationships>`);
 const definitions=sheets.map((sheet,i)=>{const range=`'${sheet.name.replace(/'/g,"''")}'!$A$1:$${letters(columns.length-1)}$${sheet.rows.length+1}`;return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xml(range)}</definedName><definedName name="_xlnm.Print_Titles" localSheetId="${i}">${xml("'"+sheet.name.replace(/'/g,"''")+"'!$1:$1")}</definedName>`}).join('');
 zip.file('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}" xmlns:r="${REL}"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${sheetNames.map((name,i)=>`<sheet name="${xml(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><definedNames>${definitions}</definedNames></workbook>`);
 zip.file('xl/styles.xml',styles());
 sheets.forEach((sheet,i)=>zip.file(`xl/worksheets/sheet${i+1}.xml`,sheetXml(sheet,columns,month)));
 return zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
root.RegistryWorkbook={build};
})(window);
