'use strict';
const columns = [
  ['spend','Spend','money','Rezultate'],['leads','Leads','number','Rezultate'],['l1in','L1 intrat','number','Rezultate'],['l1sent','L1 trimis','number','Rezultate'],['graduates','Absolvit','number','Rezultate'],['orders','Com creată','number','Rezultate'],['paid','Com plătită','number','Rezultate'],['revenue','Venit','money','Rezultate'],
  ['sub_16','sub_16','number','Vârstă · număr de leaduri'],['16_17','16_17','number','Vârstă · număr de leaduri'],['18_24','18_24','number','Vârstă · număr de leaduri'],['25_34','25_34','number','Vârstă · număr de leaduri'],['35_44','35_44','number','Vârstă · număr de leaduri'],['45_plus','45_plus','number','Vârstă · număr de leaduri'],
  ['cpl1','Cost per L1 trimis','money','Indicatori calculați'],['cpgrad','Cost per Absolvit','money','Indicatori calculați'],['gradRate','Rata de absolvire','percent','Indicatori calculați'],['cppaid','Cost per Com plătită','money','Indicatori calculați'],['roas','ROAS','ratio','Indicatori calculați'],['paidRate','Lead → Plătit %','percent','Indicatori calculați']
];
const ageKeys=['sub_16','16_17','18_24','25_34','35_44','45_plus'];
const baseKeys=['spend','leads','l1in','l1sent','graduates','orders','paid','revenue',...ageKeys];
const campaigns=[
 {id:'c1',name:'AN_Leads_RO/MD_Orase_25_Iun',children:[
  {id:'a1',name:'BROAD_MD_23_40_25_IUNIE',children:['Ad1_import','Ad4_video_sergiu+prezentare','AI_in_actiune','curs_gratuit_7_zile','curs_gratuit_blue'].map((name,i)=>creative('r'+i,name,i))},
  {id:'a2',name:'BROAD_RO_23_40_25_IUNIE',children:['Ad1_import','Ad3_import_v2','curs_gratuit_circle','Incepe_acum_briliant'].map((name,i)=>creative('s'+i,name,i+5))},
  {id:'a3',name:'INTEREST_DESIGN_MD_25_IUNIE',children:['design_cu_mentor','Invata_Web_design'].map((name,i)=>creative('t'+i,name,i+9))}]},
 {id:'c2',name:'AN_Leads_RO_Design_12_Iun',children:[
  {id:'a4',name:'BROAD_RO_18_34_DESIGN',children:['Video_rezultate','Un_skill_nou','inainte_sa_platesti'].map((name,i)=>creative('u'+i,name,i+11))},
  {id:'a5',name:'RETARGETING_RO_30_ZILE',children:['Poveste_absolvent','Ultimele_locuri'].map((name,i)=>creative('v'+i,name,i+14))}]},
 {id:'c3',name:'AN_Leads_MD_Retargeting_05_Iun',children:[{id:'a6',name:'WARM_MD_ENGAGEMENT',children:['Ad_testimonial','curs_gratuit_pink'].map((name,i)=>creative('w'+i,name,i+16))}]}];
function creative(id,name,i){const leads=48+(i*23)%137;const l1in=Math.floor(leads*.78);const l1sent=Math.floor(l1in*.83);const graduates=Math.floor(l1sent*(.49+(i%4)*.06));const orders=Math.floor(graduates*.53);const paid=Math.floor(orders*.68);const ages=[.03,.09,.32,.30,.18].map(v=>Math.floor(leads*v));ages.push(leads-ages.reduce((a,b)=>a+b,0));return {id,name,spend:Math.round((leads*(2.4+(i%5)*.37))*100)/100,leads,l1in,l1sent,graduates,orders,paid,revenue:paid*(89+(i%3)*20),...Object.fromEntries(ageKeys.map((k,j)=>[k,ages[j]]))};}
const allNodes=campaigns.flatMap(c=>[c,...c.children.flatMap(a=>[a,...a.children])]);
const leaves=node=>node.children?node.children.flatMap(leaves):[node];
const selected=new Set(campaigns.flatMap(leaves).map(x=>x.id));
const expanded=new Set(['c1','c2','c3','a1']);
const visible=new Set(['spend','leads','l1in','l1sent','graduates','orders','paid','cpl1','cpgrad','gradRate','cppaid','roas','paidRate']);
let tagFilter='all';
let currency='USD';
let dateFrom='2026-06-01',dateTo='2026-06-30';
const inactiveTags=new Set();
try { const saved=JSON.parse(localStorage.getItem('campaignsheet.preferences')||'{}');
if(['USD','EUR','RON','MDL'].includes(saved.currency))currency=saved.currency;
if(Array.isArray(saved.inactiveTags))saved.inactiveTags.filter(id=>allNodes.some(n=>n.id===id)).forEach(id=>inactiveTags.add(id));
} catch {}
function savePreferences(){try{localStorage.setItem('campaignsheet.preferences',JSON.stringify({currency,inactiveTags:[...inactiveTags]}));$('storage-note').textContent='';}catch{$('storage-note').textContent='Stocarea locală nu este disponibilă. Tagurile se păstrează doar până la reîncărcare.';}}
// Deterministic daily observations; nested funnel events share their lead date.
for(const [index,ad] of campaigns.flatMap(leaves).entries()){
 ad.daily=Array.from({length:30},(_,d)=>({date:`2026-06-${String(d+1).padStart(2,'0')}`,...Object.fromEntries(baseKeys.map(k=>[k,0]))}));
 for(let i=0;i<ad.leads;i++){
  const day=ad.daily[(i*7+index*3)%30];day.leads++;
  for(const key of ['l1in','l1sent','graduates','orders','paid'])if(i<ad[key])day[key]++;
  let end=0;for(const key of ageKeys){end+=ad[key];if(i<end){day[key]++;break;}}
 }
 const cents=Math.round(ad.spend*100);
 ad.daily.forEach((day,d)=>{day.spend=(Math.floor(cents*(d+1)/30)-Math.floor(cents*d/30))/100;day.revenue=day.paid*(ad.paid?ad.revenue/ad.paid:0);});
}
function periodData(ad){const days=ad.daily.filter(d=>d.date>=dateFrom&&d.date<=dateTo);return days.length?{id:ad.id,...aggregate(days)}:null;}

const $=id=>document.getElementById(id);
const number=new Intl.NumberFormat('ro-RO',{maximumFractionDigits:0});
const decimal=new Intl.NumberFormat('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2});
function divide(a,b,m=1){return b ? a/b*m : null;}
function aggregate(rows){const s=Object.fromEntries(baseKeys.map(k=>[k,rows.reduce((sum,r)=>sum+r[k],0)]));return {...s,cpl1:divide(s.spend,s.l1sent),cpgrad:divide(s.spend,s.graduates),gradRate:divide(s.graduates,s.l1sent,100),cppaid:divide(s.spend,s.paid),roas:divide(s.revenue,s.spend),paidRate:divide(s.paid,s.leads,100)};}
function format(v,type){if(v===null)return '—';return type==='money'?decimal.format(v)+' '+currency:type==='percent'?decimal.format(v)+'%':type==='ratio'?decimal.format(v)+'×':number.format(v);}
function filteredLeaves(node,parentInactive=false){const inactive=parentInactive||inactiveTags.has(node.id);if(tagFilter==='exclude'&&inactive)return [];return node.children?node.children.flatMap(n=>filteredLeaves(n,inactive)):selected.has(node.id)&&(tagFilter!=='only'||inactive)?[periodData(node)].filter(Boolean):[];}
function cellValues(s){return columns.filter(c=>visible.has(c[0])).map(([key,label,type,group])=>`<td class="${group==='Indicatori calculați'?'derived ':''}${key==='roas'&&s[key]>=1?'roas-good':''}">${format(s[key],type)}</td>`).join('');}
function render(){const rows=campaigns.flatMap(c=>filteredLeaves(c));const total=aggregate(rows);const cards=[['Spend',format(total.spend,'money'),'Buget cheltuit','↗'],['Leads',format(total.leads,'number'),'Leaduri în selecția curentă','♧'],['Absolvit',format(total.graduates,'number'),format(total.gradRate,'percent')+' din L1 trimis','✓'],['Com plătită',format(total.paid,'number'),format(total.revenue,'money')+' venit','▣'],['ROAS',format(total.roas,'ratio'),'Venit / buget cheltuit','↗']];
$('metrics').innerHTML=cards.map(([label,value,detail,icon])=>`<article class="metric"><div class="metric-label">${label}<span>${icon}</span></div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></article>`).join('');
$('table-head').innerHTML=`<tr><th scope="col"><div class="hierarchy-head">Campanie / Adset / Creative <small>DENUMIRE</small></div></th>${columns.filter(c=>visible.has(c[0])).map(c=>`<th scope="col" title="${c[3]}">${c[1]}</th>`).join('')}</tr>`;
let html='',campaignCount=0,adsetCount=0;
function row(node,level,parentInactive=false){const inactive=parentInactive||inactiveTags.has(node.id);const included=filteredLeaves(node,parentInactive);if(!included.length)return;if(level===0)campaignCount++;if(level===1)adsetCount++;const kind=['campaign','adset','creative'][level];html+=`<tr class="${kind} ${inactive?'inactive-row':''}"><td><div class="row-label">${node.children?`<button class="toggle" data-toggle="${node.id}" aria-expanded="${expanded.has(node.id)}" aria-label="${expanded.has(node.id)?'Restrânge':'Extinde'} ${node.name}">${expanded.has(node.id)?'−':'+'}</button>`:'<span class="type-icon">▧</span>'}<span class="name" title="${node.name}">${node.name}</span>${inactive?`<span class="manual-tag" title="${inactiveTags.has(node.id)?'Tag manual':'Tag moștenit de la părinte'}">Inactiv${inactiveTags.has(node.id)?'':' ↳'}</span>`:''}</div></td>${cellValues(aggregate(included))}</tr>`;if(node.children&&expanded.has(node.id))node.children.forEach(child=>row(child,level+1,inactive));}
campaigns.forEach(c=>row(c,0));$('table-body').innerHTML=html||`<tr><td class="empty" colspan="${visible.size+1}">Nu există date pentru perioada și filtrele selectate. Date demo: 1–30 iunie 2026.</td></tr>`;
$('table-foot').innerHTML=`<tr><td>Total selecție <span style="font-weight:400;color:#6e8476;margin-left:8px;font-size:11px">${rows.length} creative</span></td>${cellValues(total)}</tr>`;
$('campaign-count').textContent=campaignCount+' campanii';$('selection-count').textContent=rows.length;$('column-count').textContent=visible.size;$('row-count').textContent=`${campaignCount} campanii · ${campaigns.flatMap(c=>c.children.filter(a=>filteredLeaves(a,inactiveTags.has(c.id)).length)).length} adseturi · ${rows.length} creative în selecție`;
$('collapse-all').textContent=expanded.size?'⊟ Restrânge tot':'⊞ Extinde tot';}
function renderEntities(){let html='';function option(node,level,parentInactive=false){const inherited=parentInactive;const tagged=inactiveTags.has(node.id);const desc=leaves(node);const count=desc.filter(r=>selected.has(r.id)).length;html+=`<div class="entity-option ${['c-level','a-level','r-level'][level]}"><label class="option"><input type="checkbox" data-entity="${node.id}" ${count===desc.length?'checked':''}><span>${node.name}</span></label><button class="tag-button ${tagged?'tagged':''}" data-tag="${node.id}" aria-pressed="${tagged}" aria-label="Tag Inactiv pentru ${node.name}">${tagged?'Inactiv ×':'+ Inactiv'}</button>${inherited?'<small>Inactiv prin părinte</small>':''}</div>`;if(node.children)node.children.forEach(n=>option(n,level+1,inherited||tagged));}campaigns.forEach(c=>option(c,0));$('entity-options').innerHTML=html;$('entity-options').querySelectorAll('input').forEach(el=>{const desc=leaves(allNodes.find(n=>n.id===el.dataset.entity));const count=desc.filter(r=>selected.has(r.id)).length;el.indeterminate=count>0&&count<desc.length;});}
function renderColumns(){let group='';$('column-options').innerHTML=columns.map(([id,label,type,g])=>{let title=g!==group?`<h3 class="column-group">${g}</h3>`:'';group=g;return title+`<label class="option"><input type="checkbox" data-column="${id}" ${visible.has(id)?'checked':''}>${label}${g==='Indicatori calculați'?'<small>Calculat</small>':''}</label>`;}).join('');}
document.addEventListener('click',e=>{const toggle=e.target.closest('[data-toggle]');if(toggle){const id=toggle.dataset.toggle;expanded.has(id)?expanded.delete(id):expanded.add(id);render();}const panel=e.target.closest('[data-panel]');if(panel){panel.dataset.panel==='entities'?renderEntities():renderColumns();$(panel.dataset.panel+'-dialog').showModal();}if(e.target.closest('.close'))e.target.closest('dialog').close();});
$('entity-options').addEventListener('change',e=>{if(!e.target.matches('[data-entity]'))return;const node=allNodes.find(n=>n.id===e.target.dataset.entity);leaves(node).forEach(r=>e.target.checked?selected.add(r.id):selected.delete(r.id));const id=e.target.dataset.entity;renderEntities();$('entity-options').querySelector(`[data-entity="${id}"]`).focus();render();});
$('column-options').addEventListener('change',e=>{const id=e.target.dataset.column;if(!id)return;e.target.checked?visible.add(id):visible.delete(id);render();});
$('tag-filter').addEventListener('change',e=>{tagFilter=e.target.value;render();});
$('currency').value=currency;
$('currency').addEventListener('change',e=>{currency=e.target.value;savePreferences();render();});
$('period-form').addEventListener('submit',e=>{e.preventDefault();const from=$('date-from').value,to=$('date-to').value;if(!from||!to||from>to){$('period-error').textContent='Data de început trebuie să fie înaintea datei de sfârșit.';return;}$('period-error').textContent='';dateFrom=from;dateTo=to;render();});
$('entity-options').addEventListener('click',e=>{const button=e.target.closest('[data-tag]');if(!button)return;const id=button.dataset.tag;inactiveTags.has(id)?inactiveTags.delete(id):inactiveTags.add(id);savePreferences();renderEntities();$('entity-options').querySelector(`[data-tag="${id}"]`).focus();render();});
$('collapse-all').onclick=()=>{if(expanded.size)expanded.clear();else allNodes.filter(n=>n.children).forEach(n=>expanded.add(n.id));render();};
$('select-all').onclick=()=>{campaigns.flatMap(leaves).forEach(n=>selected.add(n.id));renderEntities();render();};
$('select-none').onclick=()=>{selected.clear();renderEntities();render();};
$('reset').onclick=()=>{campaigns.flatMap(leaves).forEach(n=>selected.add(n.id));tagFilter='all';$('tag-filter').value='all';dateFrom='2026-06-01';dateTo='2026-06-30';$('date-from').value=dateFrom;$('date-to').value=dateTo;$('period-error').textContent='';render();};
$('formulas-button').onclick=()=>$('formulas-dialog').showModal();
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
render();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'configure_campaign_view',description:'Configure visible columns and the manual inactive tag filter.',inputSchema:{type:'object',properties:{columns:{type:'array',items:{type:'string',enum:columns.map(c=>c[0])}},tagFilter:{type:'string',enum:['all','exclude','only']}},required:['columns'],additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||!Array.isArray(input.columns)||input.columns.some(id=>!columns.some(c=>c[0]===id))||(input.tagFilter!==undefined&&!['all','exclude','only'].includes(input.tagFilter)))throw new Error('Invalid view configuration');visible.clear();input.columns.forEach(id=>visible.add(id));if(input.tagFilter!==undefined)tagFilter=input.tagFilter;$('tag-filter').value=tagFilter;renderColumns();render();return {columns:[...visible],tagFilter};}})).catch(()=>{});}catch{}}
