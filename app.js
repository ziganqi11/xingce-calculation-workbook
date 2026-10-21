const $ = (id) => document.getElementById(id);
const modeNames = {add3:'三位数加法',sub3:'三位数减法',addsub3:'三位数加减',add4:'四数相加',mul3x1:'三位数乘一位数',div3x1:'三位数除一位数',mul2x2:'两位数乘两位数',big9:'大九九乘法表',mulEstimate:'乘法估算',div53:'五除三直除',base:'求基期量',growth:'求增长量',rate:'求增长率',current:'求现期量',share:'求比重',baseShare:'求基期比重',average:'求平均数',growthCompare:'比较增长量',mixed:'资料分析混合'};
const defaults = {mode:'base',feedbackMode:'training',level:'1',count:15,min:1000,max:9999,target:45,precision:0,numeratorDigits:5,denominatorDigits:3,tolerance:3,divisionStyle:'fraction',repeatErrors:false};
const presets = {1:{min:1000,max:9999,target:45},2:{min:5000,max:49999,target:40},3:{min:10000,max:99999,target:35}};
let state = {version:1,updatedAt:0,settings:{...defaults},active:null,sessions:[],notes:[]};
let loaded = false, saving = false, dirty = false, saveTimer = null, selectedNote = null;
const pendingKey = 'xingce-workbook-pending-v1';
const dbName = 'xingce-workbook-offline-v1';
const dbStore = 'states';
const canUseServer = location.port === '43139';
let tool = 'pen', color = '#273e55', penSize = 3, drawing = null;
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const number = (v,d) => Number.isFinite(+v) ? +v : d;
const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
const rand = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const choose = (arr) => arr[rand(0,arr.length-1)];
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const formatTime = (secs) => `${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;
const formatDate = (iso) => iso ? new Date(iso).toLocaleString('zh-CN',{hour12:false}) : '—';
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const activeQuestion = () => state.active?.questions[state.active.index] || null;

function setStatus(message,error=false){$('save-status').textContent=message;$('save-status').classList.toggle('error',error)}
function openDB(){return new Promise((resolve,reject)=>{if(!('indexedDB' in window)){reject(new Error('此浏览器没有本地数据库'));return}const request=indexedDB.open(dbName,1);request.onupgradeneeded=()=>request.result.createObjectStore(dbStore);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function dbRead(){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(dbStore,'readonly'),request=tx.objectStore(dbStore).get('main');request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close()})}
async function dbWrite(value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(dbStore,'readwrite');tx.objectStore(dbStore).put(value,'main');tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)}})}
async function serverState(){if(!canUseServer)return null;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2500);try{const res=await fetch('api/state',{cache:'no-store',signal:controller.signal});if(!res.ok)throw new Error(`HTTP ${res.status}`);const value=await res.json();return value?.version===1?value:null}catch{return null}finally{clearTimeout(timeout)}}
async function load(){
  try{
    const [remote,local]=await Promise.all([serverState(),dbRead().catch(()=>null)]);
    let recovered=null;
    try{recovered=JSON.parse(localStorage.getItem(pendingKey)||'null')}catch{}
    const candidates=[remote,local,recovered].filter(x=>x?.version===1);
    const source=candidates.sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0]||{version:1,updatedAt:0,settings:{},active:null,sessions:[],notes:[]};
    state={version:1,updatedAt:source.updatedAt||0,settings:{...defaults,...source.settings},active:source.active||null,sessions:Array.isArray(source.sessions)?source.sessions:[],notes:Array.isArray(source.notes)?source.notes:[]};
    if(!modeNames[state.settings.mode])state.settings.mode=defaults.mode;
    if(state.active){
      state.active.questionStartedAt=Date.now();
      const byId=new Map(state.active.questions.map(q=>[q.id,q]));
      for(const answer of state.active.answers||[])answer.question=byId.get(answer.question?.id)||answer.question;
    }
    loaded=true; setStatus(remote?'记录已连接 · 同时保存到此设备':'离线可练 · 记录保存在此设备');
    fillSettings(); renderAll();
    if(source!==local||(remote&&source!==remote)||source===recovered){dirty=true;flush()}
    else if(recovered)try{localStorage.removeItem(pendingKey)}catch{}
  }catch(err){setStatus(`读取记录失败：${err.message}`,true)}
}
function queueSave(){if(!loaded)return;dirty=true;state.updatedAt=Math.max(Date.now(),(state.updatedAt||0)+1);try{localStorage.setItem(pendingKey,JSON.stringify(state))}catch{}setStatus('正在保存…');clearTimeout(saveTimer);saveTimer=setTimeout(flush,40)}
async function flush(){
  if(saving||!dirty)return;
  saving=true;dirty=false;
  const snapshot=JSON.stringify(state);
  try{
    await dbWrite(JSON.parse(snapshot));
    if(!dirty)try{localStorage.removeItem(pendingKey)}catch{}
    setStatus('记录已保存 · 此设备');
    if(canUseServer)try{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),3500);try{const res=await fetch('api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:snapshot,signal:controller.signal});if(res.ok&&!dirty)setStatus('记录已保存 · 此设备及电脑')}finally{clearTimeout(timeout)}}catch{}
  }catch(err){dirty=true;setStatus(`此设备保存失败：${err.message}`,true);setTimeout(flush,3000)}
  finally{saving=false;if(dirty)setTimeout(flush,250)}
}
function fillSettings(){const s=state.settings; for(const key of ['mode','level','count','min','max','target','precision','tolerance'])$(key).value=s[key];$('feedback-mode').value=s.feedbackMode||'training';$('numerator-digits').value=s.numeratorDigits;$('denominator-digits').value=s.denominatorDigits;$('division-style').value=s.divisionStyle;$('repeat-errors').checked=s.repeatErrors}
function readSettings(){
  const s={mode:$('mode').value,feedbackMode:$('feedback-mode').value,level:$('level').value,count:clamp(number($('count').value,15),1,200),min:clamp(number($('min').value,1000),10,999999),max:clamp(number($('max').value,9999),20,999999),target:clamp(number($('target').value,45),1,600),precision:clamp(number($('precision').value,0),0,4),numeratorDigits:clamp(number($('numerator-digits').value,5),3,7),denominatorDigits:clamp(number($('denominator-digits').value,3),2,4),tolerance:clamp(number($('tolerance').value,3),0,50),divisionStyle:$('division-style').value,repeatErrors:$('repeat-errors').checked};
  s.min=Math.trunc(s.min);s.max=Math.trunc(s.max);s.count=Math.trunc(s.count);
  if(s.max<s.min)s.max=s.min;
  return s;
}
function round(value,digits){const power=10**digits;return Math.round((value+Number.EPSILON)*power)/power}
function rateFor(s){const value=s.level==='1'?rand(3,38):s.level==='2'?rand(6,76)/2:rand(30,380)/10;const sign=s.level==='3'&&Math.random()<.22?-1:1;return round(value*sign,2)}
function rateWords(p){return p<0?`同比下降 ${Math.abs(p)}%`:`同比增长 ${p}%`}
function unitRule(s,kind='数值'){return `请填${kind}，${s.precision===0?'四舍五入到整数':`保留 ${s.precision} 位小数`}`}
function makeQuestion(s){
  const mode=s.mode==='mixed'?choose(['div53','base','growth','rate','current','share','baseShare','average','growthCompare']):s.mode;
  const min=s.min,max=s.max,A=rand(min,max),p=rateFor(s),r=p/100;
  let prompt='',answer=0,explanation='',responseHint=unitRule(s),division=null;
  if(mode==='add3'||mode==='sub3'||mode==='addsub3'){
    const x=rand(100,999),y=rand(100,999),subtract=mode==='sub3'||(mode==='addsub3'&&Math.random()<.5);
    const left=subtract?Math.max(x,y):x,right=subtract?Math.min(x,y):y;
    prompt=`${left} ${subtract?'−':'+'} ${right} = ？`;answer=subtract?left-right:left+right;explanation=`${left} ${subtract?'−':'+'} ${right} = ${answer}。`;
  }
  if(mode==='add4'){
    const parts=Array.from({length:4},()=>rand(100,999));prompt=`${parts.join(' + ')} = ？`;answer=parts.reduce((sum,x)=>sum+x,0);explanation=`四数相加 = ${answer}。`;
  }
  if(mode==='mul3x1'||mode==='mul2x2'||mode==='big9'||mode==='mulEstimate'){
    const x=mode==='mul3x1'?rand(100,999):mode==='big9'?rand(11,19):mode==='mulEstimate'?rand(100,999):rand(10,99);
    const y=mode==='mul3x1'?rand(2,9):mode==='big9'?rand(11,19):mode==='mulEstimate'?rand(20,99):rand(10,99);
    prompt=`${x} × ${y} ${mode==='mulEstimate'?'≈':'='} ？`;answer=x*y;explanation=`${x} × ${y} = ${answer}。`;
    if(mode==='mulEstimate')responseHint='估算后填整数结果';
  }
  if(mode==='div3x1'){
    const denominator=rand(2,9),quotient=rand(Math.ceil(100/denominator),Math.floor(999/denominator)),numerator=denominator*quotient;
    prompt=`${numerator} ÷ ${denominator} = ？`;answer=quotient;division={numerator,denominator};explanation=`${numerator} ÷ ${denominator} = ${answer}。`;
  }
  if(mode==='div53'){
    const nd=s.numeratorDigits,dd=s.denominatorDigits;
    const numerator=rand(10**(nd-1),10**nd-1),denominator=rand(10**(dd-1),10**dd-1);
    prompt=`直除练习：${numerator} ÷ ${denominator} ≈ ？`;
    division={numerator,denominator};
    answer=round(numerator/denominator,s.precision);
    explanation=`${numerator} ÷ ${denominator} = ${round(numerator/denominator,5)}；按题目要求取 ${answer}。`;
  }
  if(mode==='base'){
    prompt=`某项指标本期为 ${A}，${rateWords(p)}。基期量约是多少？`;
    answer=round(A/(1+r),s.precision);
    explanation=`基期量 = 现期量 ÷ (1 + 增长率) = ${A} ÷ ${round(1+r,4)} ≈ ${answer}。`;
  }
  if(mode==='growth'){
    prompt=`某项指标本期为 ${A}，${rateWords(p)}。相对基期的变化量约是多少？`;
    answer=round(A*r/(1+r),s.precision);
    explanation=`变化量 = 现期量 × 增长率 ÷ (1 + 增长率) = ${A} × ${p}% ÷ ${round(1+r,4)} ≈ ${answer}。`;
    responseHint+='；下降填负数';
  }
  if(mode==='rate'){
    const B=rand(min,max),rise=rand(Math.max(1,Math.round(B*.03)),Math.max(2,Math.round(B*.38))),C=B+rise;
    prompt=`某项指标基期为 ${B}，现期为 ${C}。同比增长率约为百分之几？`;
    answer=round(rise/B*100,s.precision);
    explanation=`增长率 = (现期量 − 基期量) ÷ 基期量 × 100% = ${rise} ÷ ${B} × 100% ≈ ${answer}%。`;
    responseHint=unitRule(s,'百分数数值，不带 % 号');
  }
  if(mode==='current'){
    prompt=`某项指标基期为 ${A}，${rateWords(p)}。现期量约是多少？`;
    answer=round(A*(1+r),s.precision);
    explanation=`现期量 = 基期量 × (1 + 增长率) = ${A} × ${round(1+r,4)} ≈ ${answer}。`;
  }
  if(mode==='share'){
    const whole=Math.max(100,rand(min,max)),part=rand(Math.round(whole*.18),Math.round(whole*.82));
    prompt=`某项指标总量为 ${whole}，其中部分量为 ${part}。该部分占总体约百分之几？`;
    answer=round(part/whole*100,s.precision);
    explanation=`比重 = 部分量 ÷ 整体量 × 100% = ${part} ÷ ${whole} × 100% ≈ ${answer}%。`;
    responseHint=unitRule(s,'百分数数值，不带 % 号');
  }
  if(mode==='baseShare'){
    const whole=Math.max(100,rand(min,max)),part=rand(Math.round(whole*.18),Math.round(whole*.70));
    const partRate=rateFor(s),wholeRate=rateFor(s);
    prompt=`本期总体为 ${whole}，其中部分为 ${part}；部分${rateWords(partRate)}，总体${rateWords(wholeRate)}。基期部分占基期总体约百分之几？`;
    answer=round((part/(1+partRate/100))/(whole/(1+wholeRate/100))*100,s.precision);
    explanation=`基期比重 = [${part} ÷ (1+${partRate}%)] ÷ [${whole} ÷ (1+${wholeRate}%)] ×100% ≈ ${answer}%。`;
    responseHint=unitRule(s,'百分数数值，不带 % 号');
  }
  if(mode==='average'){
    const total=rand(min,max),count=rand(8,98);
    prompt=`某项指标总量为 ${total}，对应 ${count} 个单位。平均每个单位约为多少？`;
    answer=round(total/count,s.precision);
    explanation=`平均数 = 总量 ÷ 个数 = ${total} ÷ ${count} ≈ ${answer}。`;
  }
  if(mode==='growthCompare'){
    let X=rand(min,max),Y=rand(min,max),px=rand(5,35),py=rand(5,35),gx=X*px/(100+px),gy=Y*py/(100+py);
    if(Math.abs(gx-gy)<Math.min(gx,gy)*.08){Y=Math.max(min,Math.min(max,Y+Math.round(max*.25)));gy=Y*py/(100+py)}
    prompt=`甲现期 ${X}，同比增长 ${px}%；乙现期 ${Y}，同比增长 ${py}%。谁的增长量更大？输入 1 表示甲，2 表示乙。`;
    answer=gx>=gy?1:2;
    explanation=`甲增长量≈${round(gx,1)}，乙增长量≈${round(gy,1)}；因此${answer===1?'甲':'乙'}更大。`;
    responseHint='输入 1 或 2';
  }
  return {id:uid(),mode,prompt,answer,explanation,responseHint,division,strokes:[],note:'',createdAt:new Date().toISOString()};
}
function errorPool(s){return state.sessions.flatMap(x=>x.answers||[]).filter(x=>x.status==='wrong'&&x.question?.mode&&(s.mode==='mixed'||s.mode===x.question.mode)).map(x=>x.question).slice(-100)}
function startPractice(){
  const s=readSettings();state.settings=s;fillSettings();
  if(state.active){archiveActive(true)}
  const pool=s.repeatErrors?errorPool(s):[];
  const questions=Array.from({length:s.count},(_,i)=>{
    if(pool.length&&i<Math.min(pool.length,Math.ceil(s.count/2))){const old=choose(pool);return {...old,id:uid(),strokes:[],note:'',createdAt:new Date().toISOString(),retryOf:old.id}}
    return makeQuestion(s);
  });
  state.active={id:uid(),settings:{...s},questions,index:0,answers:[],startedAt:new Date().toISOString(),questionStartedAt:Date.now(),elapsedBefore:0,reviewing:false};
  queueSave();renderAll();$('answer').focus();
}
function archiveActive(incomplete=false){
  const a=state.active;if(!a)return;
  state.sessions.unshift({id:a.id,settings:a.settings,startedAt:a.startedAt,endedAt:new Date().toISOString(),answers:a.answers,planned:a.questions.length,incomplete});
  state.active=null;queueSave();
}
function finishPractice(){archiveActive(true);renderAll();showView('records')}
function submit(status='answered'){
  const a=state.active,q=activeQuestion();if(!a||!q||a.reviewing)return;
  const raw=$('answer').value.trim().replace('％','%').replace('%','').replace('−','-').replace(',','.');
  if(status==='answered'&&!/^[-+]?\d+(\.\d+)?$/.test(raw)){$('feedback').className='feedback bad';$('feedback').textContent='请输入数字答案';return}
  const given=status==='answered'?Number(raw):null;
  const tolerance=q.mode==='growthCompare'?0:(a.settings.tolerance||0);
  const errorPercent=status==='answered'?Math.abs(given-q.answer)/Math.max(Math.abs(q.answer),1)*100:Infinity;
  const correct=status==='answered'&&(Math.abs(given-q.answer)<0.00001||(tolerance>0&&errorPercent<=tolerance+0.0000001));
  const actual=status==='skip'?'skip':correct?'correct':'wrong';
  const seconds=Math.max(1,Math.round(((a.elapsedBefore||0)+Date.now()-a.questionStartedAt)/1000));
  a.answers.push({question:q,given,status:actual,seconds,at:new Date().toISOString()});
  a.reviewing=true;
  $('feedback').className=`feedback ${correct?'good':'bad'}`;
  $('feedback').textContent=a.settings.feedbackMode==='race'?`${actual==='skip'?'已跳过':'答案已记录'} · 用时 ${seconds} 秒 · 做完本组后查看答案`:correct?`答对了 · 用时 ${seconds} 秒${seconds<=a.settings.target?' · 达到目标':''}${errorPercent>0?` · 误差 ${round(errorPercent,2)}%`:''}`:`${actual==='skip'?'已跳过':'答案有误'} · 参考答案 ${q.answer}。${q.explanation}`;
  $('answer').disabled=true;$('submit').disabled=true;$('skip').hidden=true;$('next').hidden=false;
  queueSave();renderProgress();
}
function nextQuestion(){const a=state.active;if(!a||!a.reviewing)return;if(a.index>=a.questions.length-1){archiveActive(false);renderAll();showView('records');return}a.index++;a.questionStartedAt=Date.now();a.elapsedBefore=0;a.reviewing=false;queueSave();renderAll();$('answer').focus()}
function renderProgress(){
  const a=state.active;if(!a){$('progress-fill').style.width='0%';$('progress-label').textContent='设置题型和题量，开始练习';$('score-label').textContent='正确 0';return}
  const done=a.answers.length,good=a.answers.filter(x=>x.status==='correct').length;
  $('progress-fill').style.width=`${done/a.questions.length*100}%`;
  $('progress-label').textContent=`第 ${a.index+1} / ${a.questions.length} 题 · 已做 ${done}`;
  $('score-label').textContent=a.settings.feedbackMode==='race'?`竞速中 · 误差 ≤${a.settings.tolerance??0}% · 目标 ${a.settings.target} 秒/题`:`正确 ${good} · 误差 ≤${a.settings.tolerance??0}% · 目标 ${a.settings.target} 秒/题`;
}
function renderPractice(){
  const a=state.active,q=activeQuestion();
  $('resume').hidden=!a;$('finish').hidden=!a;
  $('exercise-title').textContent=a?`${modeNames[a.settings.mode]} · ${a.settings.level==='4'?'自定义':(['','入门','熟练','冲刺'][+a.settings.level])}`:'准备好就开始';
  $('question-box').classList.toggle('idle',!q);
  $('question-box').classList.toggle('is-math',!!q&&['add3','sub3','addsub3','add4','mul3x1','div3x1','mul2x2','big9','mulEstimate','div53'].includes(q.mode));
  $('answer-area').hidden=!q;
  $('question-hint').textContent=q?`${modeNames[q.mode]||'资料分析'} · ${q.retryOf?'错题重练':'专项计算'}`:'资料分析 · 可自由调整';
  if(q?.division&&a.settings.divisionStyle==='fraction'){
    const {numerator,denominator}=q.division;
    $('question').innerHTML=`<span class="question-lead">${modeNames[q.mode]}</span><span class="math-row"><span class="fraction"><span>${numerator}</span><span>${denominator}</span></span><span>${q.mode==='div53'?'≈':'='} ？</span></span>`;
  }else $('question').textContent=q?q.prompt:'从基期、增量或直除开始，把计算过程留在旁边。';
  $('answer-rule').textContent=q?.responseHint?`${q.responseHint}${q.mode==='growthCompare'?'':`；允许误差 ${a.settings.tolerance??0}%`}`:'';
  $('scratch-linked').textContent=q?`第 ${a.index+1} 题 · 随题保存`:'开始后随题保存';
  $('question-note').value=q?.note||'';
  $('answer').value='';$('answer').disabled=!!a?.reviewing;$('submit').disabled=!!a?.reviewing;
  $('skip').hidden=!!a?.reviewing;$('next').hidden=!a?.reviewing;
  $('next').textContent=a?.index===a?.questions.length-1?'完成本组 →':'下一题 →';
  const result=a?.reviewing?a.answers[a.answers.length-1]:null;
  if(result)$('answer').value=result.given??'';
  $('feedback').className=`feedback ${result?.status==='correct'?'good':result?'bad':''}`;
  $('feedback').textContent=result?(a.settings.feedbackMode==='race'?`${result.status==='skip'?'已跳过':'答案已记录'} · 用时 ${result.seconds} 秒 · 做完本组后查看答案`:result.status==='correct'?`答对了 · 用时 ${result.seconds} 秒`:`${result.status==='skip'?'已跳过':'答案有误'} · 正确答案 ${result.question.answer}。${result.question.explanation}`):'';
  renderProgress();resizeCanvas();
}
function renderRecords(){
  const sessions=state.sessions,answers=sessions.flatMap(s=>(s.answers||[]).map(a=>({...a,session:s})));
  const correct=answers.filter(a=>a.status==='correct').length,spent=answers.reduce((t,a)=>t+(a.seconds||0),0);
  const cards=[['练习组数',sessions.length],['已答题数',answers.length],['正确率',answers.length?`${Math.round(correct/answers.length*100)}%`:'—'],['平均用时',answers.length?`${Math.round(spent/answers.length)} 秒`:'—']];
  $('stats').innerHTML=cards.map(([label,value])=>`<div class="stat"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('sessions-list').innerHTML=sessions.length?sessions.map(s=>{const good=(s.answers||[]).filter(a=>a.status==='correct').length;return `<div class="item"><div class="item-title">${modeNames[s.settings?.mode]||'练习'} · ${good}/${(s.answers||[]).length} 正确 ${s.incomplete?'· 提前结束':''}</div><div class="item-meta">${formatDate(s.startedAt)} · 计划 ${s.planned} 题 · 实做 ${(s.answers||[]).length} 题</div></div>`}).join(''):'<div class="empty">还没有完成的练习。做完一组后，这里会留下记录。</div>';
  const filter=$('record-filter').value;
  const shown=answers.filter(a=>filter==='all'||a.status===filter).sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,200);
  $('answers-list').innerHTML=shown.length?shown.map(a=>`<div class="item"><div class="item-title">${escapeHtml(a.question.prompt)} <span style="color:${a.status==='correct'?'var(--green)':'var(--warm)'}">${a.status==='correct'?'✓':a.status==='wrong'?'×':'跳过'}</span></div><div class="item-meta">${formatDate(a.at)} · ${a.seconds} 秒 · 你的答案 ${a.given===null?'—':escapeHtml(a.given)} · 正确答案 ${escapeHtml(a.question.answer)}</div><div class="item-details">解析：${escapeHtml(a.question.explanation||'')}</div>${a.question.note?`<div class="item-details">笔记：${escapeHtml(a.question.note)}</div>`:''}<button data-retry="${escapeHtml(a.question.id)}">重练这题</button>${a.question.strokes?.length?`<button data-scratch="${escapeHtml(a.question.id)}">查看演草</button>`:''}</div>`).join(''):'<div class="empty">这个筛选下没有题目。</div>';
}
function renderNotes(){
  $('notes-list').innerHTML=state.notes.length?state.notes.map(n=>`<button class="note-list-button ${selectedNote===n.id?'selected':''}" data-note="${escapeHtml(n.id)}"><strong>${escapeHtml(n.title||'未命名笔记')}</strong><div class="item-meta">${formatDate(n.updatedAt)}</div></button>`).join(''):'<div class="empty">还没有独立笔记。可以先记一条常用算法。</div>';
  const n=state.notes.find(x=>x.id===selectedNote);
  $('note-title').value=n?.title||'';$('note-body').value=n?.body||'';
  $('delete-note').hidden=!n;$('note-stamp').textContent=n?`上次保存：${formatDate(n.updatedAt)}`:'新笔记';
}
function renderAll(){renderPractice();renderRecords();renderNotes()}
function showView(id){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('.nav').forEach(x=>x.classList.toggle('active',x.dataset.view===id));if(id==='practice')resizeCanvas()}
function saveNote(){const title=$('note-title').value.trim(),body=$('note-body').value.trim();if(!title&&!body){$('note-title').focus();return}let n=state.notes.find(x=>x.id===selectedNote);if(!n){n={id:uid()};state.notes.unshift(n);selectedNote=n.id}n.title=title||'未命名笔记';n.body=body;n.updatedAt=new Date().toISOString();queueSave();renderNotes()}
function retryQuestion(id){const found=state.sessions.flatMap(s=>s.answers||[]).find(a=>a.question?.id===id);if(!found)return;if(state.active)archiveActive(true);const q={...found.question,id:uid(),strokes:[],note:'',retryOf:id};const s={...state.settings,mode:q.mode,count:1};state.active={id:uid(),settings:s,questions:[q],index:0,answers:[],startedAt:new Date().toISOString(),questionStartedAt:Date.now(),elapsedBefore:0,reviewing:false};queueSave();showView('practice');renderAll()}
function showScratch(id){
  const found=state.sessions.flatMap(s=>s.answers||[]).find(a=>a.question?.id===id);if(!found)return;
  const q=found.question;$('review-title').textContent=q.prompt;$('review-explanation').textContent=`解析：${q.explanation||''}`;$('review-note').textContent=q.note?`笔记：${q.note}`:'';
  $('review-overlay').hidden=false;
  const target=$('review-canvas'),rect=target.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);
  target.width=rect.width*ratio;target.height=rect.height*ratio;
  const c=target.getContext('2d');c.setTransform(ratio,0,0,ratio,0,0);
  for(const stroke of q.strokes||[]){if(!stroke.points?.length)continue;c.save();c.globalCompositeOperation=stroke.erase?'destination-out':'source-over';c.strokeStyle=stroke.color;c.lineWidth=stroke.size;c.lineCap='round';c.lineJoin='round';c.beginPath();stroke.points.forEach((p,i)=>i?c.lineTo(p[0]*rect.width,p[1]*rect.height):c.moveTo(p[0]*rect.width,p[1]*rect.height));c.stroke();c.restore()}
}

function resizeCanvas(){const bounds=canvas.getBoundingClientRect();if(!bounds.width||!bounds.height)return;const ratio=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(bounds.width*ratio);canvas.height=Math.round(bounds.height*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);drawStrokes()}
function drawStroke(stroke){const width=canvas.clientWidth,height=canvas.clientHeight;if(!stroke.points?.length)return;ctx.save();ctx.globalCompositeOperation=stroke.erase?'destination-out':'source-over';ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=stroke.color;ctx.lineWidth=stroke.size;ctx.beginPath();stroke.points.forEach((p,i)=>{const x=p[0]*width,y=p[1]*height;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});if(stroke.points.length===1){const p=stroke.points[0];ctx.lineTo(p[0]*width+.1,p[1]*height+.1)}ctx.stroke();ctx.restore()}
function drawStrokes(){ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight);for(const stroke of activeQuestion()?.strokes||[])drawStroke(stroke);if(drawing)drawStroke(drawing)}
function point(event){const rect=canvas.getBoundingClientRect();return [clamp((event.clientX-rect.left)/rect.width,0,1),clamp((event.clientY-rect.top)/rect.height,0,1)]}

document.querySelectorAll('.nav').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('level').addEventListener('change',()=>{const p=presets[$('level').value];if(p){$('min').value=p.min;$('max').value=p.max;$('target').value=p.target}});
for(const id of ['mode','feedback-mode','level','count','min','max','target','precision','numerator-digits','denominator-digits','tolerance','division-style','repeat-errors'])$(id).addEventListener('change',()=>{if(id==='feedback-mode'&&$('feedback-mode').value==='race'&&$('count').value==='15')$('count').value='10';state.settings=readSettings();queueSave()});
$('start').addEventListener('click',startPractice);
$('resume').addEventListener('click',()=>{showView('practice');$('answer').focus()});
$('submit').addEventListener('click',()=>submit());$('answer').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();state.active?.reviewing?nextQuestion():submit()}});
$('skip').addEventListener('click',()=>submit('skip'));$('next').addEventListener('click',nextQuestion);$('finish').addEventListener('click',finishPractice);
$('record-filter').addEventListener('change',renderRecords);
$('answers-list').addEventListener('click',e=>{const retry=e.target.closest('[data-retry]'),scratch=e.target.closest('[data-scratch]');if(retry)retryQuestion(retry.dataset.retry);if(scratch)showScratch(scratch.dataset.scratch)});
$('close-review').addEventListener('click',()=>$('review-overlay').hidden=true);
$('review-overlay').addEventListener('click',e=>{if(e.target===$('review-overlay'))$('review-overlay').hidden=true});
$('export').addEventListener('click',async()=>{await flush();const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`资料分析计算练习本-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$('import').addEventListener('click',()=>$('import-file').click());
$('import-file').addEventListener('change',async()=>{const file=$('import-file').files?.[0];if(!file)return;try{const value=JSON.parse(await file.text());if(value?.version!==1||!Array.isArray(value.sessions)||!Array.isArray(value.notes))throw new Error('文件不是本练习本的记录');if(!confirm('导入将替换此设备当前的练习、演草和笔记。请先导出当前记录留作备份。确定继续？'))return;state={version:1,updatedAt:Math.max(Date.now(),(state.updatedAt||0)+1),settings:{...defaults,...value.settings},active:value.active||null,sessions:value.sessions,notes:value.notes};selectedNote=null;fillSettings();renderAll();queueSave();setStatus('备份已导入 · 正在保存')}catch(err){alert(`导入失败：${err.message}`)}finally{$('import-file').value=''}});
$('new-note').addEventListener('click',()=>{selectedNote=null;renderNotes();$('note-title').focus()});
$('notes-list').addEventListener('click',e=>{const b=e.target.closest('[data-note]');if(b){selectedNote=b.dataset.note;renderNotes()}});
$('save-note').addEventListener('click',saveNote);
$('delete-note').addEventListener('click',()=>{if(!selectedNote)return;if(!confirm('删除这条笔记？'))return;state.notes=state.notes.filter(n=>n.id!==selectedNote);selectedNote=null;queueSave();renderNotes()});
$('question-note').addEventListener('input',()=>{const q=activeQuestion();if(q){q.note=$('question-note').value;queueSave()}});
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>{tool=b.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('selected',x===b))}));
document.querySelectorAll('[data-color]').forEach(b=>b.addEventListener('click',()=>{color=b.dataset.color;document.querySelectorAll('[data-color]').forEach(x=>x.classList.toggle('selected',x===b))}));
$('pen-size').addEventListener('input',()=>{penSize=+$('pen-size').value});
$('undo').addEventListener('click',()=>{const q=activeQuestion();if(q?.strokes?.length){q.strokes.pop();drawStrokes();queueSave()}});
$('clear').addEventListener('click',()=>{const q=activeQuestion();if(q?.strokes?.length&&confirm('清空本题演草？')){q.strokes=[];drawStrokes();queueSave()}});
canvas.addEventListener('pointerdown',e=>{const q=activeQuestion();if(!q)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);drawing={color,size:penSize*(tool==='eraser'?4:1),erase:tool==='eraser',points:[point(e)]};drawStrokes()});
canvas.addEventListener('pointermove',e=>{if(!drawing)return;e.preventDefault();drawing.points.push(point(e));drawStrokes()});
function endDraw(e){if(!drawing)return;e.preventDefault();const q=activeQuestion();if(q){q.strokes.push(drawing);queueSave()}drawing=null;drawStrokes()}
canvas.addEventListener('pointerup',endDraw);canvas.addEventListener('pointercancel',endDraw);
window.addEventListener('resize',resizeCanvas);
setInterval(()=>{const a=state.active;if(a&&!a.reviewing){$('timer').textContent=formatTime(Math.floor(((a.elapsedBefore||0)+Date.now()-a.questionStartedAt)/1000))}else $('timer').textContent='00:00'},1000);
window.addEventListener('pagehide',()=>{const a=state.active;if(a&&!a.reviewing){a.elapsedBefore=(a.elapsedBefore||0)+Date.now()-a.questionStartedAt;a.questionStartedAt=Date.now();queueSave()}if(canUseServer&&dirty&&navigator.sendBeacon)navigator.sendBeacon('api/beacon',new Blob([JSON.stringify(state)],{type:'application/json'}))});
window.addEventListener('online',()=>{if(loaded){dirty=true;flush()}});
if('serviceWorker' in navigator&&window.isSecureContext){navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready).then(()=>$('offline-status').textContent='页面已缓存 · 可断网打开').catch(()=>$('offline-status').textContent='离线缓存失败，请联网刷新')}else $('offline-status').textContent='此地址需联网；请用 HTTPS 地址安装离线版';
load();
