/* Painel Escolar CEMPFB - PWA de teste (v0.1). Dados ficam no Google Sheets; esta página só mostra e envia. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var S = { tok: sessionStorage.getItem('tok') || '', perfil: sessionStorage.getItem('perfil') || '', nome: sessionStorage.getItem('nome') || '',
            modo: Q.get('modo') === 'prof' ? 'prof' : 'aluno', mat: (Q.get('m') || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 20) };
  var $app = document.getElementById('app'), timers = [], stream = null, ultimo = {}, sessaoLida = {};
  function $(i) { return document.getElementById(i); }
  function el(t, p, k) { var e = document.createElement(t); if (p) for (var a in p) { if (a === 'cls') e.className = p[a]; else if (a === 'txt') e.textContent = p[a]; else e.setAttribute(a, p[a]); } (k || []).forEach(function (c) { if (c) e.appendChild(c); }); return e; }
  function fmt(v) { return (v === '' || v === null || v === undefined || isNaN(Number(v))) ? '—' : Number(v).toFixed(1).replace('.', ','); }
  function sitCls(s) { return s === 'APROVADO' ? 'ok' : (String(s).indexOf('RECUPERA') === 0 ? 'rec' : 'amb'); }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }
  function limpaTimers() { timers.forEach(clearInterval); timers = []; pararCam(); }

  // ---------- API (Apps Script, POST texto simples = sem preflight) ----------
  function api(a, p) {
    var body = JSON.stringify(Object.assign({ a: a, t: S.tok }, p || {}));
    return fetch(window.CFG.API_URL, { method: 'POST', body: body, redirect: 'follow' }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.erro) { if (String(j.erro).indexOf('SESSAO_EXPIRADA') >= 0) { sair(true); } throw new Error(j.erro); }
      return j;
    });
  }
  function offline(e) { return e instanceof TypeError || !navigator.onLine; }

  // ---------- login ----------
  function telaLogin(aviso) {
    limpaTimers(); document.querySelector('.tabs') && document.querySelector('.tabs').remove();
    var prof = S.modo === 'prof';
    var id = el('input', { id: 'id', autocomplete: 'username', maxlength: '40', value: S.mat }), pin = el('input', { id: 'pin', cls: 'pin', type: 'password', inputmode: 'numeric', maxlength: '6', autocomplete: 'current-password' });
    var msg = el('div', { cls: 'msg', txt: aviso || '' }), btn = el('button', { txt: 'Entrar' });
    function go() {
      msg.textContent = ''; btn.disabled = true;
      api('login', { id: id.value, pin: pin.value, modo: S.modo }).then(function (r) {
        btn.disabled = false;
        if (!r.ok) { msg.textContent = r.msg; pin.value = ''; return; }
        S.tok = r.token; S.perfil = r.perfil; S.nome = r.nome;
        sessionStorage.setItem('tok', S.tok); sessionStorage.setItem('perfil', S.perfil); sessionStorage.setItem('nome', S.nome);
        iniciar();
      }).catch(function () { btn.disabled = false; msg.textContent = 'Sem conexão ou endereço do app não configurado.'; });
    }
    btn.onclick = go; pin.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    var troca = el('button', { cls: 'sec', txt: prof ? 'Sou aluno' : 'Sou professor' });
    troca.onclick = function () { S.modo = prof ? 'aluno' : 'prof'; telaLogin(); };
    $app.textContent = '';
    $app.appendChild(el('div', { cls: 'card' }, [el('h1', { txt: prof ? 'Acesso do professor' : 'Acesso do aluno' }),
      el('div', { cls: 'muted', txt: prof ? 'Informe seu código e o PIN da coordenação.' : 'Informe sua matrícula SIAEP e o PIN da sua etiqueta.' }),
      el('label', { txt: prof ? 'Código do professor' : 'Matrícula SIAEP' }), id, el('label', { txt: 'PIN (6 dígitos)' }), pin, btn, msg, el('div', { style: 'margin-top:10px' }, [troca]),
      el('div', { cls: 'muted', style: 'margin-top:12px', txt: 'Consulta informativa. O registro oficial é o SIAEP. Não compartilhe seu PIN.' })]));
    instalarBox();
  }
  function sair(silencioso) {
    if (S.tok) { try { api('logout'); } catch (e) {} }
    S.tok = ''; sessionStorage.clear(); limpaTimers(); telaLogin(silencioso === true ? 'Sessão encerrada. Entre novamente.' : '');
  }

  // ---------- instalar ----------
  var evInstalar = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); evInstalar = e; });
  function instalarBox() {
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent), standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    if (standalone) return;
    var c = el('div', { cls: 'card' }, [el('h2', { txt: 'Instalar no celular' })]);
    if (ios) c.appendChild(el('div', { cls: 'muted', txt: 'iPhone: abra no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".' }));
    else {
      c.appendChild(el('div', { cls: 'muted', txt: 'Android: menu do Chrome (3 pontos) > "Instalar app" ou "Adicionar à tela inicial".' }));
      var b = el('button', { cls: 'sec', style: 'margin-top:8px', txt: 'Instalar agora' });
      b.onclick = function () { if (evInstalar) { evInstalar.prompt(); } else { alert('Use o menu do Chrome: Instalar app / Adicionar à tela inicial.'); } };
      c.appendChild(b);
    }
    $app.appendChild(c);
  }

  // ---------- navegação ----------
  function abas(lista, atual) {
    var old = document.querySelector('.tabs'); if (old) old.remove();
    var t = el('nav', { cls: 'tabs' }); lista.forEach(function (a) { var b = el('button', { txt: a[1], cls: a[0] === atual ? 'on' : '' }); b.onclick = function () { limpaTimers(); a[2](); abas(lista, a[0]); }; t.appendChild(b); });
    document.body.appendChild(t);
  }
  function iniciar() {
    if (S.perfil === 'prof') { var L = [['ch', '✔ Chamada', telaChamada], ['bo', '📊 Boletim', telaBoletim], ['ca', '🍽 Cardápio', telaCardapio]]; L[0][2](); abas(L, 'ch'); }
    else { var A = [['no', '📚 Notas', telaNotas], ['qr', '▣ Meu QR', telaQR], ['ca', '🍽 Cardápio', telaCardapio]]; A[0][2](); abas(A, 'no'); }
    sincronizarFila();
  }
  function topo(sub) { return el('div', { cls: 'card' }, [el('div', { cls: 'top' }, [el('div', {}, [el('h1', { txt: S.nome }), el('div', { cls: 'muted', txt: sub || '' })]), (function () { var b = el('button', { cls: 'sec', txt: 'Sair' }); b.onclick = function () { sair(); }; return b; })()])]); }
  function erroBox(e) { return el('div', { cls: 'msg', txt: offline(e) ? 'Sem internet.' : 'Não foi possível carregar.' }); }

  // ---------- aluno: notas ----------
  function telaNotas() {
    $app.textContent = ''; $app.appendChild(el('div', { cls: 'card', txt: 'Carregando…' }));
    api('aluno').then(function (d) {
      $app.textContent = ''; $app.appendChild(topo('Matrícula ' + d.matricula + ' · ' + d.turma));
      if (!d.linhas.length) $app.appendChild(el('div', { cls: 'card', txt: 'Ainda não há notas publicadas para você.' }));
      var bims = {}; d.linhas.forEach(function (l) { (bims[l.bim] = bims[l.bim] || []).push(l); });
      Object.keys(bims).sort().forEach(function (b) {
        var t = el('table', {}, [el('tr', {}, [el('th', { cls: 'l', txt: 'Componente' }), el('th', { txt: 'AV1' }), el('th', { txt: 'RP1' }), el('th', { txt: 'AV2' }), el('th', { txt: 'Média' }), el('th', { txt: 'Situação' })])]);
        bims[b].forEach(function (l) {
          var s = l.media === '' ? 'EM ANDAMENTO' : l.sit;
          t.appendChild(el('tr', {}, [el('td', { cls: 'l', txt: l.comp }), el('td', { txt: fmt(l.av1) }), el('td', { txt: fmt(l.rp1) }), el('td', { txt: fmt(l.av2) }), el('td', { cls: sitCls(s), txt: fmt(l.media) }), el('td', {}, [el('span', { cls: 'chip ' + sitCls(s), txt: s })])]));
          if (l.pend) t.appendChild(el('tr', {}, [el('td', { cls: 'l muted', colspan: '6', txt: '↳ ' + l.pend + ' (ainda não lançada)' })]));
        });
        $app.appendChild(el('div', { cls: 'card' }, [el('h2', { txt: b + 'º bimestre' }), t]));
      });
      if (d.docs.length) { var c = el('div', { cls: 'card' }, [el('h2', { txt: 'Documentos' })]); d.docs.forEach(function (x) { c.appendChild(el('a', { cls: 'doc', href: x.url, target: '_blank', rel: 'noopener', txt: '📄 ' + x.titulo })); }); $app.appendChild(c); }
      $app.appendChild(el('div', { cls: 'muted', txt: 'Dados atualizados em ' + (d.atualizado || '—') + '. Média ≥ 6,0 = aprovado.' }));
    }).catch(function (e) { $app.textContent = ''; $app.appendChild(erroBox(e)); });
  }

  // ---------- aluno: QR rotativo ----------
  function desenharQR(texto, alvo) {
    var q = qrcode(0, 'M'); q.addData(texto); q.make(); alvo.src = q.createDataURL(8, 2);
  }
  function telaQR() {
    var img = el('img', { alt: 'QR de presença' }), barra = el('i'), info = el('div', { cls: 'muted', txt: 'Gerando…' }), msg = el('div', { cls: 'msg' });
    $app.textContent = ''; $app.appendChild(topo('Mostre este QR ao professor'));
    $app.appendChild(el('div', { cls: 'card qrbox' }, [img, el('div', { cls: 'bar' }, [barra]), info, msg,
      el('div', { cls: 'muted', style: 'margin-top:8px', txt: 'O código muda a cada poucos segundos. Não envie print para colegas: ele não vale depois de ~2 minutos.' })]));
    var fim = 0;
    function novo() {
      api('qr').then(function (r) { desenharQR(r.code, img); fim = Date.now() + r.valeMs; msg.textContent = ''; info.textContent = 'Matrícula ' + r.matricula; })
        .catch(function (e) { msg.textContent = offline(e) ? 'Sem internet: o QR precisa de conexão.' : 'Não foi possível gerar o QR.'; });
    }
    novo(); timers.push(setInterval(novo, 35000));
    timers.push(setInterval(function () { var p = Math.max(0, (fim - Date.now()) / 45000); barra.style.width = Math.min(100, p * 100) + '%'; }, 500));
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
  }

  // ---------- cardápio ----------
  function telaCardapio() {
    $app.textContent = ''; $app.appendChild(topo('Cardápio da cantina')); var box = el('div', { cls: 'card', txt: 'Carregando…' }); $app.appendChild(box);
    api('cardapio').then(function (d) {
      box.textContent = ''; box.appendChild(el('h2', { txt: 'Próximos dias' }));
      if (!d.itens.length) box.appendChild(el('div', { cls: 'muted', txt: 'Cardápio ainda não publicado.' }));
      d.itens.forEach(function (i) { box.appendChild(el('div', { cls: 'pres' }, [el('div', {}, [el('b', { txt: i.data + ' · ' + i.refeicao }), el('div', { txt: i.prato }), i.obs ? el('div', { cls: 'muted', txt: i.obs }) : null])])); });
    }).catch(function (e) { box.textContent = ''; box.appendChild(erroBox(e)); });
  }

  // ---------- professor: boletim ----------
  function telaBoletim() {
    $app.textContent = ''; $app.appendChild(topo('Boletim da turma')); var box = el('div', { cls: 'card', txt: 'Carregando…' }); $app.appendChild(box);
    api('filtros').then(function (d) {
      var F = d.filtros, sT = el('select'), sC = el('select'), sB = el('select'), res = el('div');
      function opt(s, v) { s.textContent = ''; v.forEach(function (x) { s.appendChild(el('option', { value: x, txt: x })); }); }
      function cT() { opt(sC, uniq(F.filter(function (f) { return f.turma === sT.value; }).map(function (f) { return f.comp; }))); cC(); }
      function cC() { opt(sB, uniq(F.filter(function (f) { return f.turma === sT.value && f.comp === sC.value; }).map(function (f) { return f.bim; }))); car(); }
      function car() {
        res.textContent = 'Carregando…';
        api('boletim', { turma: sT.value, comp: sC.value, bim: sB.value }).then(function (b) {
          res.textContent = ''; var r = b.resumo;
          res.appendChild(el('div', { cls: 'kpis' }, [['Estudantes', r.n], ['Aprovados', r.apr], ['Recuperação', r.rec], ['A lançar', r.pend]].map(function (k) { return el('div', { cls: 'kpi' }, [el('b', { txt: k[1] }), el('span', { txt: k[0] })]); })));
          var t = el('table', {}, [el('tr', {}, [el('th', { cls: 'l', txt: 'Estudante' }), el('th', { txt: 'AV1' }), el('th', { txt: 'RP1' }), el('th', { txt: 'AV2' }), el('th', { txt: 'Média' }), el('th', { txt: 'Situação' })])]);
          b.linhas.forEach(function (l) { var s = l.media === '' ? 'EM ANDAMENTO' : l.sit; t.appendChild(el('tr', {}, [el('td', { cls: 'l', txt: l.nome }), el('td', { txt: fmt(l.av1) }), el('td', { txt: fmt(l.rp1) }), el('td', { txt: fmt(l.av2) }), el('td', { cls: sitCls(s), txt: fmt(l.media) }), el('td', {}, [el('span', { cls: 'chip ' + sitCls(s), txt: l.pend ? l.pend : s })])])); });
          res.appendChild(t);
        }).catch(function (e) { res.textContent = ''; res.appendChild(erroBox(e)); });
      }
      opt(sT, uniq(F.map(function (f) { return f.turma; }))); sT.onchange = cT; sC.onchange = cC; sB.onchange = car; box.textContent = '';
      box.appendChild(el('h2', { txt: 'Boletim da turma' })); [['Turma', sT], ['Componente', sC], ['Bimestre', sB]].forEach(function (x) { box.appendChild(el('label', { txt: x[0] })); box.appendChild(x[1]); }); box.appendChild(res); cT();
    }).catch(function (e) { box.textContent = ''; box.appendChild(erroBox(e)); });
  }

  // ---------- professor: chamada por QR ----------
  var FILA_KEY = 'filaPresenca';
  function fila() { try { return JSON.parse(localStorage.getItem(FILA_KEY) || '[]'); } catch (e) { return []; } }
  function salvaFila(f) { localStorage.setItem(FILA_KEY, JSON.stringify(f)); }
  function sincronizarFila() {
    var f = fila(); if (!f.length || !S.tok || !navigator.onLine) return;
    var item = f[0];
    api('presenca', item).then(function () { var g = fila(); g.shift(); salvaFila(g); atualizaPend(); sincronizarFila(); })
      .catch(function (e) { if (!offline(e)) { var g = fila(); g.shift(); salvaFila(g); atualizaPend(); sincronizarFila(); } });
  }
  window.addEventListener('online', sincronizarFila);
  function atualizaPend() { var p = $('pend'); if (p) { var n = fila().length; p.textContent = n ? ('⚠ ' + n + ' leitura(s) aguardando internet') : ''; p.style.display = n ? 'block' : 'none'; } }
  function pararCam() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }

  function decodificar(video, canvas, detector) {
    if (detector) return detector.detect(video).then(function (r) { return r.length ? r[0].rawValue : null; }).catch(function () { return null; });
    var w = video.videoWidth, h = video.videoHeight; if (!w) return Promise.resolve(null);
    canvas.width = w; canvas.height = h; var ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, w, h);
    var im = ctx.getImageData(0, 0, w, h), r = window.jsQR(im.data, w, h, { inversionAttempts: 'dontInvert' });
    return Promise.resolve(r ? r.data : null);
  }
  window.__decodificarImagem = function (canvas) { var ctx = canvas.getContext('2d'), im = ctx.getImageData(0, 0, canvas.width, canvas.height), r = window.jsQR(im.data, canvas.width, canvas.height); return r ? r.data : null; };

  function telaChamada() {
    $app.textContent = ''; $app.appendChild(topo('Chamada por QR')); var box = el('div', { cls: 'card', txt: 'Carregando…' }); $app.appendChild(box);
    api('filtros').then(function (d) {
      var F = d.filtros, sT = el('select'), sC = el('select'), sA = el('select'), pend = el('div', { id: 'pend', cls: 'off', style: 'display:none' });
      function opt(s, v) { s.textContent = ''; v.forEach(function (x) { s.appendChild(el('option', { value: x, txt: x })); }); }
      function cT() { opt(sC, uniq(F.filter(function (f) { return f.turma === sT.value; }).map(function (f) { return f.comp; }))); }
      opt(sT, uniq(F.map(function (f) { return f.turma; }))); sT.onchange = cT; cT(); opt(sA, ['1ª aula', '2ª aula', '3ª aula', '4ª aula', '5ª aula', '6ª aula', 'Ensaio', 'Evento']);
      var video = el('video', { playsinline: '', muted: '', autoplay: '' }), canvas = document.createElement('canvas'), res = el('div'), cont = el('div', { cls: 'muted', txt: 'Presentes lidos nesta sessão: 0' }), lista = el('div');
      var btnCam = el('button', { txt: '📷 Abrir câmera e ler QR' }), btnLista = el('button', { cls: 'sec', style: 'margin-top:10px;width:100%', txt: 'Ver presentes e faltantes' }), n = 0, vistos = {}, detector = null, loop = null;
      try { if ('BarcodeDetector' in window) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
      function params() { return { turma: sT.value, comp: sC.value, aula: sA.value }; }
      function mostra(cls, titulo, sub) { res.textContent = ''; res.appendChild(el('div', { cls: 'res ' + cls }, [el('span', { txt: titulo }), el('small', { txt: sub || '' })])); if (navigator.vibrate) navigator.vibrate(cls === 'ok' ? 80 : [60, 60, 60]); }
      function enviar(code) {
        var p = Object.assign(params(), { code: code, ts: Date.now() });
        api('presenca', p).then(function (r) {
          if (r.dup) mostra('amb', r.nome + ' · já registrado', 'Presença repetida ignorada (' + r.turma + ')');
          else { vistos[r.matricula] = 1; n++; cont.textContent = 'Presentes lidos nesta sessão: ' + n; mostra(r.alerta ? 'amb' : 'ok', '✔ ' + r.nome, (r.turma || '') + (r.alerta ? ' · ' + r.alerta : '')); }
        }).catch(function (e) {
          if (offline(e)) { var f = fila(); f.push(p); salvaFila(f); atualizaPend(); mostra('amb', 'Sem internet', 'Leitura guardada; envio automático quando voltar.'); }
          else mostra('rec', 'QR não aceito', String(e.message).replace('Error:', '') === 'QR_INVALIDO' ? 'Código inválido ou vencido. Peça para o aluno atualizar o QR.' : String(e.message));
        });
      }
      function varrer() {
        if (!stream) return;
        decodificar(video, canvas, detector).then(function (v) {
          if (v) { var agora = Date.now(); if (!ultimo[v] || agora - ultimo[v] > 6000) { ultimo[v] = agora; enviar(v); } }
          loop = setTimeout(varrer, 250);
        });
      }
      btnCam.onclick = function () {
        if (stream) { pararCam(); btnCam.textContent = '📷 Abrir câmera e ler QR'; video.style.display = 'none'; return; }
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
          stream = s; video.srcObject = s; video.style.display = 'block'; video.play(); btnCam.textContent = '■ Parar câmera'; varrer();
        }).catch(function () { mostra('rec', 'Câmera bloqueada', 'Permita o uso da câmera no navegador.'); });
      };
      video.style.display = 'none';
      btnLista.onclick = function () {
        lista.textContent = 'Carregando…';
        api('chamada', params()).then(function (c) {
          lista.textContent = ''; lista.appendChild(el('h2', { txt: c.presentes + ' presentes · ' + c.faltantes + ' faltantes' }));
          c.alunos.forEach(function (a) { lista.appendChild(el('div', { cls: 'pres' }, [el('span', { txt: a.nome }), el('span', { cls: a.presente ? 'ok' : 'rec', txt: a.presente ? 'Presente' : 'Falta' })])); });
        }).catch(function (e) { lista.textContent = ''; lista.appendChild(erroBox(e)); });
      };
      box.textContent = ''; box.appendChild(el('h2', { txt: 'Chamada' }));
      [['Turma', sT], ['Componente', sC], ['Aula', sA]].forEach(function (x) { box.appendChild(el('label', { txt: x[0] })); box.appendChild(x[1]); });
      box.appendChild(pend); box.appendChild(btnCam); box.appendChild(el('div', { style: 'margin-top:10px' }, [video])); box.appendChild(res); box.appendChild(cont); box.appendChild(btnLista);
      $app.appendChild(el('div', { cls: 'card' }, [lista])); atualizaPend();
    }).catch(function (e) { box.textContent = ''; box.appendChild(erroBox(e)); });
  }

  // ---------- início ----------
  if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); }); }
  if (S.tok) iniciar(); else telaLogin();
})();
