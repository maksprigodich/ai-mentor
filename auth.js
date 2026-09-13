(() => {
  const TOKEN='aiMentorToken'; let mode='login';
  const $=id=>document.getElementById(id);
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{mode=btn.dataset.mode;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));$('auth-submit').textContent=mode==='login'?'Войти в AI-Mentor':'Создать аккаунт';$('password').setAttribute('autocomplete',mode==='login'?'current-password':'new-password');$('auth-error').textContent='';}));
  $('auth-form').addEventListener('submit',async e=>{e.preventDefault();$('auth-error').textContent='';const email=$('email').value.trim(),password=$('password').value;if(!email||!password)return;const endpoint=mode==='login'?'/api/auth/login':'/api/auth/register';const btn=$('auth-submit');btn.disabled=true;btn.textContent='Подключаемся…';try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Ошибка');localStorage.setItem(TOKEN,data.token);if(mode==='register')sessionStorage.setItem('aiMentorOnboarding','1');location.href='chat.html';}catch(err){$('auth-error').textContent=err.message;}finally{btn.disabled=false;$('auth-submit').textContent=mode==='login'?'Войти в AI-Mentor':'Создать аккаунт';}});
  const existingToken=localStorage.getItem(TOKEN);
  if(existingToken){
    const GUARD='aiMentorRedirectGuard';
    const guard=JSON.parse(sessionStorage.getItem(GUARD)||'{"count":0,"ts":0}');
    const now=Date.now();
    if(now-guard.ts>4000)guard.count=0;
    guard.count++;guard.ts=now;
    sessionStorage.setItem(GUARD,JSON.stringify(guard));
    if(guard.count>3){
      localStorage.removeItem(TOKEN);
      sessionStorage.removeItem(GUARD);
      $('auth-error').textContent='Не удалось подключиться к серверу. Попробуйте войти ещё раз через минуту.';
    } else {
      fetch('/api/me',{headers:{Authorization:`Bearer ${existingToken}`}})
        .then(r=>{ if(r.ok){ sessionStorage.removeItem(GUARD); location.href='chat.html'; } else { localStorage.removeItem(TOKEN); } })
        .catch(()=>{});
    }
  }
})();
