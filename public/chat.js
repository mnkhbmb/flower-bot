/* La Paradiso — сайтын AI туслах. Хуудсанд <script src="/chat.js" defer></script> гэж нэмэхэд
   баруун доод буланд товч гарч, дарахад чатын цонх нээгдэнэ. Хуудасны өнгөний хувьсагчдыг
   (--accent, --panel, --ink, --line, --muted, --soft) ашиглана, байхгүй бол өөрийн утгатай. */
(function () {
  'use strict';
  if (window.__lpChat) return;
  window.__lpChat = true;

  var KEY = 'lp_chat_v1', MAX_LEN = 400;
  var GREETING = 'Сайн байна уу! Баглаа сонгох, хүргэлт, цагийн хуваарийн талаар асуугаарай.';
  var IDEAS = ['Ээждээ ямар баглаа тохирох вэ?', 'Хүргэлт хийдэг үү?', 'Хэдэн цагт ажилладаг вэ?'];

  var css = [
    '.lpc-btn{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:40;',
    'padding:11px 15px;font:700 14px "Golos Text",system-ui,sans-serif;cursor:pointer;',
    'background:var(--accent,#E23B41);color:var(--accent-ink,#fff);border:2px solid var(--line,#2B1A1D);',
    'box-shadow:3px 3px 0 var(--line,#2B1A1D)}',
    '.lpc-btn:active{transform:translate(2px,2px);box-shadow:1px 1px 0 var(--line,#2B1A1D)}',
    '.lpc-panel{position:fixed;z-index:50;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));',
    'width:min(380px,calc(100vw - 28px));height:min(560px,calc(100dvh - 90px));display:flex;flex-direction:column;',
    'background:var(--panel,#fff);color:var(--ink,#2B1A1D);border:2px solid var(--line,#2B1A1D);',
    'box-shadow:5px 5px 0 var(--line,#2B1A1D);font:15px/1.45 "Golos Text",system-ui,sans-serif}',
    '@media (max-width:520px){.lpc-panel{right:0;left:0;bottom:0;width:auto;height:min(78dvh,620px);',
    'border-left:0;border-right:0;border-bottom:0;box-shadow:none;padding-bottom:env(safe-area-inset-bottom,0px)}}',
    '.lpc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;',
    'border-bottom:2px solid var(--line,#2B1A1D);background:var(--soft,#FFE1E4)}',
    '.lpc-head b{font-family:"Montserrat",system-ui,sans-serif;font-size:15px}',
    '.lpc-head small{display:block;font-size:11.5px;color:var(--muted,#7A5F65);font-weight:500}',
    '.lpc-x{background:none;border:2px solid var(--line,#2B1A1D);width:34px;height:34px;font:700 16px sans-serif;',
    'cursor:pointer;color:inherit;flex:none}',
    '.lpc-log{flex:1;min-height:0;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;',
    '-webkit-overflow-scrolling:touch}',
    '.lpc-m{max-width:86%;padding:8px 11px;border:2px solid var(--line,#2B1A1D);white-space:pre-wrap;overflow-wrap:anywhere}',
    '.lpc-m.bot{align-self:flex-start;background:var(--panel,#fff)}',
    '.lpc-m.me{align-self:flex-end;background:var(--accent,#E23B41);color:var(--accent-ink,#fff)}',
    '.lpc-m.err{align-self:flex-start;border-style:dashed;color:var(--muted,#7A5F65)}',
    '.lpc-m a{color:inherit;font-weight:700}',
    '.lpc-m.wait{color:var(--muted,#7A5F65);font-style:italic}',
    '.lpc-ideas{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 10px}',
    '.lpc-idea{padding:6px 9px;font:500 13px "Golos Text",system-ui,sans-serif;cursor:pointer;',
    'background:var(--panel,#fff);color:inherit;border:2px solid var(--line,#2B1A1D)}',
    '.lpc-form{display:flex;gap:8px;padding:10px 12px;border-top:2px solid var(--line,#2B1A1D)}',
    '.lpc-form textarea{flex:1;min-width:0;height:46px;resize:none;padding:10px;font:16px "Golos Text",system-ui,sans-serif;',
    'background:var(--panel,#fff);color:inherit;border:2px solid var(--line,#2B1A1D);border-radius:0}',
    '.lpc-send{flex:none;padding:0 14px;font:700 14px "Golos Text",system-ui,sans-serif;cursor:pointer;',
    'background:var(--accent,#E23B41);color:var(--accent-ink,#fff);border:2px solid var(--line,#2B1A1D)}',
    '.lpc-send:disabled{opacity:.5;cursor:not-allowed}',
    '.lpc-note{padding:0 12px 8px;font-size:11.5px;color:var(--muted,#7A5F65)}'
  ].join('');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------- Түүх (зөвхөн энэ хөтчийн цонхонд) ---------- */
  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { history = []; }
  if (!Array.isArray(history)) history = [];
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-20))); } catch (e) { /* алгасна */ } }

  /* ---------- Бүтэц ---------- */
  var btn = document.createElement('button');
  btn.className = 'lpc-btn'; btn.type = 'button'; btn.textContent = 'Асуух зүйл байна уу?';
  btn.setAttribute('aria-haspopup', 'dialog');

  var panel = document.createElement('section');
  panel.className = 'lpc-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'La Paradiso туслах');
  panel.innerHTML =
    '<div class="lpc-head"><div><b>La Paradiso туслах</b><small>AI хариулж байна</small></div>' +
    '<button class="lpc-x" type="button" aria-label="Хаах">✕</button></div>' +
    '<div class="lpc-log" aria-live="polite"></div>' +
    '<div class="lpc-ideas"></div>' +
    '<form class="lpc-form"><textarea maxlength="' + MAX_LEN + '" placeholder="Асуултаа бичнэ үү" aria-label="Асуулт"></textarea>' +
    '<button class="lpc-send" type="submit">Илгээх</button></form>' +
    '<div class="lpc-note">Үнэ болон захиалгыг ажилтан баталгаажуулна.</div>';

  document.body.appendChild(btn);
  document.body.appendChild(panel);

  var log = panel.querySelector('.lpc-log'), ideas = panel.querySelector('.lpc-ideas');
  var form = panel.querySelector('.lpc-form'), input = form.querySelector('textarea'), send = form.querySelector('.lpc-send');
  var busy = false;

  // Текстийг аюулгүй болгоод сайтын зам (/zagvar#b20) болон https холбоосыг дарагддаг болгоно
  function render(text) {
    var safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return safe.replace(/(https?:\/\/[^\s<]+[^\s<.,!?)])|(^|[\s(])(\/(?:zagvar|baglaa|test|trivia)(?:#b\d{2})?)(?![\w/])/g,
      function (m, url, pre, pathname) {
        if (url) return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
        return pre + '<a href="' + pathname + '">' + pathname + '</a>';
      });
  }
  function bubble(kind, text) {
    var d = document.createElement('div');
    d.className = 'lpc-m ' + kind;
    if (kind === 'bot') d.innerHTML = render(text); else d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function drawIdeas() {
    ideas.innerHTML = '';
    if (history.length) return;
    IDEAS.forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'lpc-idea'; b.type = 'button'; b.textContent = t;
      b.addEventListener('click', function () { ask(t); });
      ideas.appendChild(b);
    });
  }
  function redraw() {
    log.innerHTML = '';
    bubble('bot', GREETING);
    history.forEach(function (m) { bubble(m.role === 'user' ? 'me' : 'bot', m.content); });
    drawIdeas();
  }

  function ask(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text || busy) return;
    busy = true; send.disabled = true; input.value = ''; ideas.innerHTML = '';
    bubble('me', text);
    var wait = bubble('bot wait', 'Бичиж байна…');
    var prior = history.slice(-8);

    fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text.slice(0, MAX_LEN), history: prior })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, data: data }; });
    }).then(function (r) {
      wait.remove();
      if (!r.ok || !r.data.reply) { bubble('err', r.data.error || 'Одоо хариулж чадсангүй. Дахин оролдоно уу.'); return; }
      bubble('bot', r.data.reply);
      history.push({ role: 'user', content: text }, { role: 'assistant', content: r.data.reply });
      save();
    }).catch(function () {
      wait.remove();
      bubble('err', 'Интернэт холболтоо шалгаад дахин оролдоно уу.');
    }).then(function () { busy = false; send.disabled = false; });
  }

  function open() { panel.hidden = false; btn.hidden = true; redraw(); input.focus(); }
  function close() { panel.hidden = true; btn.hidden = false; btn.focus(); }

  btn.addEventListener('click', open);
  panel.querySelector('.lpc-x').addEventListener('click', close);
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  // Чат доторх сайтын холбоосыг дарахад цонх хаагдаж, хуудас нь харагдана
  log.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (a && a.getAttribute('href').charAt(0) === '/') close();
  });
})();
