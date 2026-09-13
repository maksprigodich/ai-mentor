(() => {
  const TOKEN='aiMentorToken'; let token=localStorage.getItem(TOKEN);
  const GUARD='aiMentorRedirectGuard';
  const BACKOFF='aiMentorBackoffUntil';
  function isBackedOff(){return Date.now()<Number(sessionStorage.getItem(BACKOFF)||0);}
  function setBackoff(sec){sessionStorage.setItem(BACKOFF,String(Date.now()+sec*1000));}
  function showCooldown(msg){document.body.innerHTML=`<p style="padding:40px;font-family:sans-serif">${msg}</p>`;}
  if(isBackedOff()){showCooldown('Сервер временно ограничил запросы. Обновите страницу через 20–30 секунд.');return;}
  function guardedRedirectToIndex(){
    const guard=JSON.parse(sessionStorage.getItem(GUARD)||'{"count":0,"ts":0}');
    const now=Date.now();
    if(now-guard.ts>4000)guard.count=0;
    guard.count++;guard.ts=now;
    sessionStorage.setItem(GUARD,JSON.stringify(guard));
    if(guard.count>3){
      document.body.innerHTML='<p style="padding:40px;font-family:sans-serif">Не удалось подключиться к серверу. Обновите страницу через минуту.</p>';
      return;
    }
    location.href='index.html';
  }
  if(!token){guardedRedirectToIndex();return;}
  const $=id=>document.getElementById(id); let me=null, activeChat=null, chats=[];
  async function api(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,...(options.headers||{})}});if(r.status===429){setBackoff(20);showCooldown('Сервер временно ограничил запросы. Обновите страницу через 20–30 секунд.');throw new Error('Слишком много запросов');}if(r.status===401){localStorage.removeItem(TOKEN);guardedRedirectToIndex();throw new Error('Сессия истекла');}const d=await r.json();if(!r.ok)throw new Error(d.error||'Ошибка сервера');return d;}
  function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function mdInline(s){
    s=s.replace(/`([^`]+?)`/g,'<code>$1</code>');
    s=s.replace(/\*\*([^*]+?)\*\*/g,'<strong>$1</strong>');
    s=s.replace(/__([^_]+?)__/g,'<strong>$1</strong>');
    s=s.replace(/\*([^*]+?)\*/g,'<em>$1</em>');
    s=s.replace(/(?<![\w*])_([^_]+?)_(?![\w*])/g,'<em>$1</em>');
    s=s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    return s;
  }
  function splitRow(line){return line.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());}
  function renderMarkdown(raw){
    const lines=esc(raw).split('\n');
    let html='',inCode=false,codeLines=[],listType=null,listBuffer=[],paraBuffer=[];
    function flushPara(){if(paraBuffer.length){html+=`<p class="md-p">${paraBuffer.map(mdInline).join('<br>')}</p>`;paraBuffer=[];}}
    function flushList(){if(listType){html+=`<${listType} class="md-list">${listBuffer.map(li=>`<li>${mdInline(li)}</li>`).join('')}</${listType}>`;listType=null;listBuffer=[];}}
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(/^\s*```/.test(line)){
        flushPara();flushList();
        if(inCode){html+=`<pre class="md-pre"><code>${codeLines.join('\n')}</code></pre>`;codeLines=[];inCode=false;}
        else inCode=true;
        continue;
      }
      if(inCode){codeLines.push(line);continue;}
      const isTableRow=/^\s*\|.*\|\s*$/.test(line);
      const nextIsSeparator=lines[i+1]&&/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i+1]);
      if(isTableRow&&nextIsSeparator){
        flushPara();flushList();
        const headCells=splitRow(line);
        let j=i+2,rows=[];
        while(j<lines.length&&/^\s*\|.*\|\s*$/.test(lines[j])){rows.push(splitRow(lines[j]));j++;}
        html+=`<div class="md-table-wrap"><table class="md-table"><thead><tr>${headCells.map(c=>`<th>${mdInline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${mdInline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        i=j-1;
        continue;
      }
      const h=line.match(/^(#{1,6})\s+(.+)$/);
      if(h){flushPara();flushList();const lvl=h[1].length;html+=`<h${lvl} class="md-h md-h${lvl}">${mdInline(h[2])}</h${lvl}>`;continue;}
      const ul=line.match(/^\s*[-*]\s+(.+)$/);
      const ol=line.match(/^\s*\d+\.\s+(.+)$/);
      if(ul){flushPara();if(listType!=='ul'){flushList();listType='ul';}listBuffer.push(ul[1]);continue;}
      if(ol){flushPara();if(listType!=='ol'){flushList();listType='ol';}listBuffer.push(ol[1]);continue;}
      const bq=line.match(/^>\s?(.*)$/);
      if(bq){flushPara();flushList();html+=`<blockquote class="md-quote">${mdInline(bq[1])}</blockquote>`;continue;}
      if(line.trim()===''){flushPara();flushList();continue;}
      flushList();
      paraBuffer.push(line);
    }
    flushPara();flushList();
    if(inCode&&codeLines.length)html+=`<pre class="md-pre"><code>${codeLines.join('\n')}</code></pre>`;
    return html;
  }
  function renderHistory(){ $('history').innerHTML=chats.length?chats.map(c=>`<div class="history-item ${activeChat&&activeChat.id===c.id?'active':''}"><button class="history-open" data-id="${c.id}"><span>${esc(c.title)}</span><small>${new Date(c.updated_at).toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'})}</small></button><button class="history-delete" data-id="${c.id}" title="Удалить чат" aria-label="Удалить чат">✕</button></div>`).join(''):'<div class="empty-side">Пока нет диалогов.<br>Создай первый — разберёмся вместе.</div>';document.querySelectorAll('.history-open').forEach(b=>b.onclick=()=>openChat(Number(b.dataset.id)));document.querySelectorAll('.history-delete').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteChat(Number(b.dataset.id));});}
  async function deleteChat(id){if(!confirm('Удалить этот диалог без возможности восстановления?'))return;await api(`/api/chats/${id}`,{method:'DELETE'});chats=chats.filter(c=>c.id!==id);if(activeChat&&activeChat.id===id){activeChat=null;const d=await api('/api/me');renderDashboard(d.profile);}renderHistory();}
  async function load(){const[d,c]=await Promise.all([api('/api/me'),api('/api/chats')]);sessionStorage.removeItem(GUARD);me=d.user;chats=c.chats;const onboarding=sessionStorage.getItem('aiMentorOnboarding')==='1';if(onboarding&&!d.profile){sessionStorage.removeItem('aiMentorOnboarding');renderHistory();showProfile(d.profile);}else{renderDashboard(d.profile);renderHistory();}}
  function renderDashboard(profile){$('profile-panel').classList.add('hidden');$('settings-panel').classList.add('hidden');$('chat-panel').classList.add('hidden');$('dashboard').classList.remove('hidden');$('top-title').textContent=profile?.name?`Привет, ${profile.name} 👋`:'Добро пожаловать в AI-Mentor';$('top-sub').textContent=profile?'Профиль готов — теперь двигаемся к цели.':'Заполни профиль, чтобы наставник стал персональным.'; $('dashboard').innerHTML=`<div class="hero glass"><div><span class="eyebrow">YOUR NEXT MOVE</span><h1>${profile?'Давай превратим цель в маршрут.':'Сначала познакомимся.'}</h1><p>${profile?'AI-Mentor уже знает базовый контекст о тебе. Выбери задачу или открой новый чат.':'Пара минут — и рекомендации будут учитывать твой возраст, этап обучения, интересы и цель.'}</p></div><button class="primary hero-btn" id="hero-action">${profile?'Начать диалог':'Заполнить профиль'}</button></div><div class="dash-grid"><div class="metric glass"><span>Профиль</span><strong>${profile?'Готов':'0%'}</strong><small>${profile?'можно улучшать в любой момент':'нужно заполнить'}</small></div><div class="metric glass"><span>Диалоги</span><strong>${chats.length}</strong><small>сохранены на сервере</small></div><div class="metric glass"><span>Фокус</span><strong>${esc(profile?.goal||'—')}</strong><small>главная цель</small></div></div><div class="quick glass"><div><h3>Что умеет AI-Mentor</h3><p>Профиль → рекомендации → план → сопровождение. Один наставник вместо десятка разрозненных сервисов.</p></div><div class="quick-list"><span>01 <b>Понять себя</b></span><span>02 <b>Выбрать направление</b></span><span>03 <b>Сделать план</b></span><span>04 <b>Отслеживать прогресс</b></span></div></div>`;$('hero-action').onclick=()=>profile?newChat():showProfile(profile);}
  async function newChat(){const d=await api('/api/chats',{method:'POST',body:JSON.stringify({title:'Новый диалог'})});chats=[d.chat,...chats];renderHistory();await openChat(d.chat.id);}
  async function openChat(id){activeChat=chats.find(c=>c.id===id)||null;if(!activeChat)return;renderHistory();$('dashboard').classList.add('hidden');$('profile-panel').classList.add('hidden');$('settings-panel').classList.add('hidden');$('chat-panel').classList.remove('hidden');$('chat-title').textContent=activeChat.title;const d=await api(`/api/chats/${id}/messages`);$('messages').innerHTML='';d.messages.forEach(m=>addMessage(m.role,m.content));if(!d.messages.length)addMessage('assistant','Привет! Я твой AI-Mentor. Расскажи, чего ты хочешь добиться — выбрать направление, разобраться с вузами, составить план учёбы или просто понять, с чего начать.');}
  function addMessage(role,text){const el=document.createElement('div');el.className=`message ${role}`;const body=role==='assistant'?renderMarkdown(text):esc(text).replace(/\n/g,'<br>');el.innerHTML=`<div class="message-role">${role==='assistant'?'AI-Mentor':'Ты'}</div><div class="message-text">${body}</div>`;$('messages').appendChild(el);$('messages').scrollTop=$('messages').scrollHeight;}
  $('message-form').onsubmit=async e=>{e.preventDefault();const input=$('message-input'),text=input.value.trim();if(!text||!activeChat)return;input.value='';addMessage('user',text);input.disabled=true;document.querySelector('.send').disabled=true;const typing=document.createElement('div');typing.className='message assistant typing';typing.textContent='AI-Mentor думает…';$('messages').appendChild(typing);try{const d=await api(`/api/chats/${activeChat.id}/message`,{method:'POST',body:JSON.stringify({content:text})});typing.remove();addMessage('assistant',d.message.content);const c=await api('/api/chats');chats=c.chats;renderHistory();}catch(err){typing.remove();addMessage('assistant',`Не получилось получить ответ: ${err.message}`);}finally{input.disabled=false;document.querySelector('.send').disabled=false;input.focus();}};
  document.querySelectorAll('#suggestions button').forEach(b=>b.onclick=()=>{ $('message-input').value=b.textContent; $('message-form').requestSubmit(); });
  async function showProfile(profile){$('dashboard').classList.add('hidden');$('chat-panel').classList.add('hidden');$('settings-panel').classList.add('hidden');$('profile-panel').classList.remove('hidden');$('top-title').textContent='Твой профиль';$('top-sub').textContent='Чем больше контекста — тем полезнее наставник.';$('profile-panel').innerHTML=`<div class="profile-head"><div><span class="eyebrow">PERSONAL CONTEXT</span><h2>Расскажи о себе</h2><p>Не нужно писать идеально. Мы используем эти данные только как контекст для твоих рекомендаций.</p></div></div><form id="profile-form" class="profile-form"><label>Имя<input name="name" value="${esc(profile?.name||'')}" placeholder="Как к тебе обращаться?"></label><div class="two"><label>Возраст<input name="age" type="number" min="12" max="100" value="${profile?.age||''}"></label><label>Этап<select name="stage"><option value="">Выбери</option><option ${profile?.stage==='Школа'?'selected':''}>Школа</option><option ${profile?.stage==='1 курс'?'selected':''}>1 курс</option><option ${profile?.stage==='2+ курс'?'selected':''}>2+ курс</option></select></label></div><div class="two"><label>Город<input name="city" value="${esc(profile?.city||'')}" placeholder="Например, Нижний Новгород"></label><label>Целевой вуз<input name="target_university" value="${esc(profile?.target_university||'')}" placeholder="Если уже знаешь"></label></div><label>Интересы<textarea name="interests" placeholder="IT, игры, математика, дизайн…">${esc(profile?.interests||'')}</textarea></label><label>Предметы / сильные стороны<textarea name="subjects" placeholder="Что нравится и что получается?">${esc(profile?.subjects||'')}</textarea></label><label>Навыки<textarea name="skills" placeholder="Python — база, C — начинаю, Git — нет…">${esc(profile?.skills||'')}</textarea></label><label>Главная цель<textarea name="goal" placeholder="К чему хочешь прийти?">${esc(profile?.goal||'')}</textarea></label><button class="primary" type="submit">Сохранить профиль →</button><div id="profile-error" class="error"></div></form>`;$('profile-form').onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const payload=Object.fromEntries(fd.entries());try{const d=await api('/api/profile',{method:'PUT',body:JSON.stringify(payload)});renderDashboard(d.profile);}catch(err){$('profile-error').textContent=err.message;}};}
  async function showSettings(){$('dashboard').classList.add('hidden');$('chat-panel').classList.add('hidden');$('profile-panel').classList.add('hidden');$('settings-panel').classList.remove('hidden');$('top-title').textContent='Настройки аккаунта';$('top-sub').textContent='Email, пароль и управление данными.';
    $('settings-panel').innerHTML=`<div class="profile-head"><div><span class="eyebrow">ACCOUNT</span><h2>Настройки аккаунта</h2><p>Текущий email: <b>${esc(me?.email||'')}</b></p></div></div>`+
      `<form id="password-form" class="profile-form"><h3 class="settings-sub">Сменить пароль</h3><label>Текущий пароль<input name="currentPassword" type="password" autocomplete="current-password" required></label><div class="two"><label>Новый пароль<input name="newPassword" type="password" minlength="6" autocomplete="new-password" required></label><label>Повтори новый пароль<input name="confirmPassword" type="password" minlength="6" autocomplete="new-password" required></label></div><button class="primary" type="submit">Обновить пароль</button><div id="password-error" class="error"></div><div id="password-success" class="success"></div></form>`+
      `<form id="email-form" class="profile-form"><h3 class="settings-sub">Сменить email</h3><label>Новый email<input name="newEmail" type="email" required></label><label>Пароль для подтверждения<input name="password" type="password" autocomplete="current-password" required></label><button class="primary" type="submit">Обновить email</button><div id="email-error" class="error"></div><div id="email-success" class="success"></div></form>`+
      `<div class="profile-form"><h3 class="settings-sub">Экспорт данных</h3><p class="sub">Скачай копию профиля, диалогов и сообщений в формате JSON.</p><button class="ghost full" id="export-data" type="button">Скачать мои данные</button></div>`+
      `<form id="delete-form" class="profile-form"><h3 class="settings-sub danger-title">Удалить аккаунт</h3><p class="sub">Действие необратимо: профиль, все диалоги и сообщения будут удалены без возможности восстановления.</p><label>Пароль<input name="password" type="password" autocomplete="current-password" required></label><button class="ghost danger full" type="submit">Удалить аккаунт навсегда</button><div id="delete-error" class="error"></div></form>`;
    $('password-form').onsubmit=async e=>{e.preventDefault();$('password-error').textContent='';$('password-success').textContent='';const fd=new FormData(e.currentTarget);const{currentPassword,newPassword,confirmPassword}=Object.fromEntries(fd.entries());if(newPassword!==confirmPassword){$('password-error').textContent='Новые пароли не совпадают';return;}try{await api('/api/account/password',{method:'PUT',body:JSON.stringify({currentPassword,newPassword})});$('password-success').textContent='Пароль обновлён.';e.currentTarget.reset();}catch(err){$('password-error').textContent=err.message;}};
    $('email-form').onsubmit=async e=>{e.preventDefault();$('email-error').textContent='';$('email-success').textContent='';const fd=new FormData(e.currentTarget);const{newEmail,password}=Object.fromEntries(fd.entries());try{const d=await api('/api/account/email',{method:'PUT',body:JSON.stringify({newEmail,password})});token=d.token;localStorage.setItem(TOKEN,token);me={...me,email:d.user.email};showSettings();$('email-success').textContent='Email обновлён.';}catch(err){$('email-error').textContent=err.message;}};
    $('export-data').onclick=async()=>{try{const d=await api('/api/account/export');const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='ai-mentor-data.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}catch(err){alert('Не удалось экспортировать данные: '+err.message);}};
    $('delete-form').onsubmit=async e=>{e.preventDefault();$('delete-error').textContent='';if(!confirm('Аккаунт и все данные будут удалены безвозвратно. Продолжить?'))return;const fd=new FormData(e.currentTarget);const{password}=Object.fromEntries(fd.entries());try{await api('/api/account',{method:'DELETE',body:JSON.stringify({password})});localStorage.removeItem(TOKEN);location.href='index.html';}catch(err){$('delete-error').textContent=err.message;}};
  }
  $('settings-btn').onclick=async()=>{const d=await api('/api/me');me=d.user;showSettings();$('sidebar').classList.remove('open');$('mobile-overlay').classList.remove('active');};
  $('profile-btn').onclick=async()=>{const d=await api('/api/me');showProfile(d.profile);$('sidebar').classList.remove('open');$('mobile-overlay').classList.remove('active');};
  $('dashboard-btn').onclick=async()=>{const d=await api('/api/me');renderDashboard(d.profile);};
  $('new-chat').onclick=newChat;$('logout').onclick=()=>{localStorage.removeItem(TOKEN);location.href='index.html'};$('burger').onclick=()=>{$('sidebar').classList.toggle('open');$('mobile-overlay').classList.toggle('active')};$('mobile-overlay').onclick=()=>{$('sidebar').classList.remove('open');$('mobile-overlay').classList.remove('active')};
  load().catch(console.error);
})();
