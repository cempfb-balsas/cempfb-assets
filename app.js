/* Painel Escolar CEMPFB - PWA de teste (v0.1). Dados ficam no Google Sheets; esta página só mostra e envia. */
(function () {
  'use strict';
  var Q = new URLSearchParams(location.search);
  var S = { tok: sessionStorage.getItem('tok') || '', perfil: sessionStorage.getItem('perfil') || '', papel: sessionStorage.getItem('papel') || '', nome: sessionStorage.getItem('nome') || '',
            modo: Q.get('modo') === 'prof' ? 'prof' : 'aluno', mat: (Q.get('m') || Q.get('c') || '').replace(/[^0-9A-Za-z._-]/g, '').slice(0, 40), trocado: sessionStorage.getItem('pt') === '1' };
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
    var id = el('input', { id: 'id', autocomplete: 'username', maxlength: '40', value: S.mat }), pin = el('input', { id: 'pin', cls: 'pin', type: 'password', maxlength: '12', autocomplete: 'current-password' });
    var msg = el('div', { cls: 'msg', txt: aviso || '' }), btn = el('button', { txt: 'Entrar' });
    function go() {
      msg.textContent = ''; btn.disabled = true;
      api('login', { id: id.value, pin: pin.value, modo: S.modo }).then(function (r) { aposLogin(r); }).catch(function () { btn.disabled = false; msg.textContent = 'Sem conexão ou endereço do app não configurado.'; });
    }
    function aposLogin(r) {
        btn.disabled = false;
        if (!r.ok) { msg.textContent = r.msg; pin.value = ''; return; }
        S.tok = r.token; S.perfil = r.perfil; S.nome = r.nome; S.trocado = !!r.pinTrocado; sessionStorage.setItem('pt', S.trocado ? '1' : '0'); sessionStorage.removeItem('aviso');
        sessionStorage.setItem('tok', S.tok); sessionStorage.setItem('perfil', S.perfil); sessionStorage.setItem('nome', S.nome);
        S.papel = r.papel || ''; sessionStorage.setItem('papel', S.papel);
        iniciar();
    }
    btn.onclick = go; pin.onkeydown = function (e) { if (e.key === 'Enter') go(); };
    var troca = el('button', { cls: 'sec', txt: prof ? 'Sou aluno' : 'Sou professor' });
    troca.onclick = function () { S.modo = prof ? 'aluno' : 'prof'; telaLogin(); };
    var demoBox = null;
    if (Q.get('demo')) {
      demoBox = el('div', { cls: 'card' }, [el('h2', { txt: 'Experimente a demonstração' }), el('div', { cls: 'muted', txt: 'Dados fictícios (cientistas, pintores e escritores). Nenhum aluno real.' })]);
      [['aluno', '🎓 Entrar como aluno (demonstração)'], ['prof', '👩‍🏫 Entrar como professor (demonstração)']].forEach(function (d) {
        var b = el('button', { txt: d[1] }); b.onclick = function () { api('demo', { modo: d[0] }).then(aposLogin).catch(function () { msg.textContent = 'Sem conexão.'; }); }; demoBox.appendChild(b);
      });
    }
    $app.textContent = '';
    if (demoBox) $app.appendChild(demoBox);
    $app.appendChild(el('div', { cls: 'card' }, [el('h1', { txt: prof ? 'Acesso do professor' : 'Acesso do aluno' }),
      el('div', { cls: 'muted', txt: prof ? 'Informe seu código e o PIN da coordenação.' : 'Informe sua matrícula SIAEP e o PIN da sua etiqueta.' }),
      el('label', { txt: prof ? 'Código do professor' : 'Matrícula SIAEP' }), id, el('label', { txt: 'PIN' }), pin, btn, msg, el('div', { style: 'margin-top:10px' }, [troca]),
      el('div', { cls: 'muted', style: 'margin-top:12px', txt: 'Primeiro acesso: use o PIN da etiqueta. Depois você pode trocar por um mais fácil. Esqueceu? Procure a coordenação.' }),
      el('div', { cls: 'muted', style: 'margin-top:6px', txt: 'Consulta informativa. O registro oficial é o SIAEP. Não compartilhe seu PIN.' })]));
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
    var pp = (S.papel || 'PROF').toUpperCase();
    if (S.perfil === 'prof' && pp === 'PORTARIA') { var P = [['es', '📟 Estação', function () { telaEstacao('P'); }], ['mn', '✍ Manual', telaPortaria], ['fd', '📅 Sáb/Dom', telaFds], ['hj', '📊 Hoje', telaHoje]]; P[0][2](); abas(P, 'es'); }
    else if (S.perfil === 'prof' && pp === 'CANTINA') { var C = [['es', '📟 Estação', function () { telaEstacao('C'); }], ['ls', '📋 Lista', telaListaCantina], ['hj', '📊 Hoje', telaHoje], ['ca', 'Cardápio', telaCardapio], ['pq', '📋 Pesquisas', function () { telaPesquisas(null); }]]; C[0][2](); abas(C, 'es'); }
    else if (S.perfil === 'prof' && pp === 'ADMIN') { var M = [['gs', '⚙ Gestão', telaGestao], ['hj', '📊 Hoje', telaHoje], ['ca', '🍽 Cardápio', telaCardapio]]; M[0][2](); abas(M, 'gs'); }
    else if (S.perfil === 'prof' && pp === 'DIRECAO') { var D = [['hj', '📊 Hoje', telaHoje], ['ch', '✔ Chamada', telaChamada], ['bo', 'Boletim', telaBoletim], ['es', '📟 Estação', function () { telaEstacao('D'); }], ['en', '✍ Manual', telaPortaria], ['fd', '📅 Sáb/Dom', telaFds], ['rf', '🍽 Refeição', telaRefeicao], ['gs', '⚙ Gestão', telaGestao]]; D[0][2](); abas(D, 'hj'); }
    else if (S.perfil === 'prof') { var L = [['ch', '✔ Chamada', telaChamada], ['bo', '📊 Boletim', telaBoletim], ['ca', '🍽 Cardápio', telaCardapio]]; L[0][2](); abas(L, 'ch'); }
    else { var A = [['rg', '📲 Registrar', telaRegistrar], ['no', '📚 Notas', telaNotas], ['qr', '▣ Meu QR', telaQR], ['ca', '🍽 Cardápio', telaCardapio], ['pq', '📋 Pesquisa', telaPesqAluno]]; A[0][2](); abas(A, 'rg'); }
    sincronizarFila();
  }
  function topo(sub) {
    var bs = el('button', { cls: 'sec', txt: 'Sair' }); bs.onclick = function () { sair(); };
    var bp = el('button', { cls: 'sec', style: 'margin-right:6px', txt: '🔑 Trocar PIN' }); bp.onclick = function () { telaTrocarPin(); };
    var kids = [el('div', { cls: 'top' }, [el('div', {}, [el('h1', { txt: S.nome }), el('div', { cls: 'muted', txt: sub || '' })]), el('div', {}, [bp, bs])])];
    if (!S.trocado && !sessionStorage.getItem('aviso')) {
      var av = el('div', { cls: 'msg', style: 'margin-top:10px;background:#FFF8DC;border:1px solid #F5C518;border-radius:8px;padding:8px;color:#0B1F4B', txt: 'Dica: troque o PIN da etiqueta por um mais fácil de lembrar. Toque em "Trocar PIN".' });
      kids.push(av); sessionStorage.setItem('aviso', '1');
    }
    return el('div', { cls: 'card' }, kids);
  }
  // ---------- trocar PIN (sem e-mail) ----------
  function telaTrocarPin() {
    limpaTimers(); var nav = document.querySelector('.tabs'); if (nav) nav.style.display = 'none';
    var atual = el('input', { type: 'password', maxlength: '12', autocomplete: 'current-password' }), novo = el('input', { type: 'password', maxlength: '12', autocomplete: 'new-password' }), rep = el('input', { type: 'password', maxlength: '12', autocomplete: 'new-password' });
    var mostrar = el('input', { type: 'checkbox', id: 'ver' }); mostrar.onchange = function () { [atual, novo, rep].forEach(function (i) { i.type = mostrar.checked ? 'text' : 'password'; }); };
    var msg = el('div', { cls: 'msg' }), ok = el('button', { txt: 'Salvar novo PIN' }), cancel = el('button', { cls: 'sec', style: 'margin-top:8px;width:100%', txt: 'Cancelar' });
    function volta() { if (nav) nav.style.display = ''; iniciar(); }
    cancel.onclick = volta;
    ok.onclick = function () {
      msg.style.color = ''; msg.textContent = '';
      if (!/^[0-9A-Za-z]{4,12}$/.test(novo.value)) { msg.textContent = 'O novo PIN deve ter de 4 a 12 letras (sem acento) ou números, sem espaços.'; return; }
      if (novo.value !== rep.value) { msg.textContent = 'Os dois campos do novo PIN não são iguais.'; return; }
      ok.disabled = true;
      api('trocarpin', { atual: atual.value, novo: novo.value }).then(function (r) {
        ok.disabled = false;
        if (!r.ok) { msg.textContent = r.msg; return; }
        S.trocado = true; sessionStorage.setItem('pt', '1'); msg.style.color = '#1B7F3B'; msg.textContent = 'PIN alterado! Use o novo PIN no próximo acesso.'; ok.style.display = 'none'; cancel.textContent = 'Voltar';
      }).catch(function (e) { ok.disabled = false; msg.textContent = offline(e) ? 'Sem internet.' : 'Não foi possível salvar.'; });
    };
    $app.textContent = '';
    $app.appendChild(el('div', { cls: 'card' }, [el('h1', { txt: 'Trocar PIN' }), el('div', { cls: 'muted', txt: 'Escolha algo fácil para você lembrar: 4 a 12 letras ou números. Evite datas óbvias, 1234 e sua matrícula.' }),
      el('label', { txt: 'PIN atual (o da etiqueta ou o último que você usou)' }), atual, el('label', { txt: 'Novo PIN' }), novo, el('label', { txt: 'Repita o novo PIN' }), rep,
      el('label', { style: 'display:flex;gap:8px;align-items:center;margin-top:8px' }, [mostrar, el('span', { txt: 'Mostrar o que estou digitando' })]), el('div', { style: 'margin-top:10px' }, [ok]), msg, cancel,
      el('div', { cls: 'muted', style: 'margin-top:10px', txt: 'Esqueceu o PIN? Procure a coordenação: ela emite um novo.' })]));
  }
  function erroBox(e) { return el('div', { cls: 'msg', txt: offline(e) ? 'Sem internet.' : 'Não foi possível carregar.' }); }

  // ---------- aluno: notas ----------
  function telaNotas() {
    $app.textContent = ''; $app.appendChild(el('div', { cls: 'card', txt: 'Carregando…' }));
    api('aluno').then(function (d) {
      $app.textContent = ''; $app.appendChild(topo('Matrícula ' + d.matricula + ' · ' + d.turma));
      if (d.frase) $app.appendChild(el('div', { cls: 'card', style: 'border-left:4px solid #F5C518' }, [el('div', { cls: 'muted', txt: 'Personagem' }), el('div', { style: 'font-style:italic;color:#0B1F4B;margin-top:4px', txt: d.frase })]));
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

  // ---------- portaria: achar o aluno pelo nome (esqueceu / perdeu o celular) ----------
  function buscaNome(acaoFn, extra, res, aoOk) {
    var q = el('input', { placeholder: 'Digite o nome (3 letras ou mais)', autocomplete: 'off' }), b = el('button', { cls: 'sec', style: 'margin-top:8px;width:100%', txt: 'Buscar aluno pelo nome' }), lista = el('div');
    function busca() {
      if (q.value.trim().length < 3) { lista.textContent = ''; lista.appendChild(el('div', { cls: 'muted', txt: 'Digite pelo menos 3 letras.' })); return; }
      lista.textContent = 'Buscando…';
      api('buscaaluno', { q: q.value }).then(function (d) {
        lista.textContent = ''; if (!d.itens.length) { lista.appendChild(el('div', { cls: 'muted', txt: 'Nenhum aluno encontrado.' })); return; }
        d.itens.forEach(function (x) {
          var bt = el('button', { style: 'width:100%;margin-top:6px;text-align:left;padding:12px', txt: x.nome + ' · ' + x.turma }); bt.onclick = function () { lista.textContent = ''; q.value = ''; enviarComFila(acaoFn(), Object.assign({ manual: x.mat }, extra()), res, aoOk); }; lista.appendChild(bt);
        });
      }).catch(function (e) { lista.textContent = ''; lista.appendChild(erroBox(e)); });
    }
    b.onclick = busca; q.onkeydown = function (e) { if (e.key === 'Enter') busca(); };
    return el('div', { style: 'margin-top:14px' }, [el('label', { txt: 'Sem celular: buscar pelo nome' }), q, b, lista]);
  }

  // ---------- gestão (Trio Gestor e Administrativo): PINs, cardápio e pesquisas ----------
  function btnVoltar() { var b = el('button', { cls: 'sec', style: 'margin-bottom:10px', txt: '← Gestão' }); b.onclick = telaGestao; return b; }
  function telaGestao() {
    limpaTimers(); $app.textContent = ''; $app.appendChild(topo((S.papel === 'DIRECAO' ? 'Trio Gestor' : 'Administrativo') + ' · gestão'));
    var c = el('div', { cls: 'card' }, [el('h2', { txt: 'O que você quer fazer?' })]);
    [['🔑  PINs: renovar senha de aluno ou da equipe', telaPins], ['🍽  Cardápio: publicar ou corrigir', telaCardapioAdm], ['📋  Pesquisas sobre o cardápio', function () { telaPesquisas(telaGestao); }]].concat(S.papel === 'DIRECAO' ? [['📟  Estação (QR do tablet)', function () { telaEstacao('D'); }]] : []).forEach(function (x) {
      var b = el('button', { style: 'width:100%;margin-top:10px;text-align:left;padding:15px', txt: x[0] }); b.onclick = x[1]; c.appendChild(b);
    });
    $app.appendChild(c);
  }
  function telaPins() {
    limpaTimers(); $app.textContent = ''; $app.appendChild(topo('PINs'));
    var q = el('input', { placeholder: 'Nome, matrícula ou código (2 letras ou mais)', autocomplete: 'off' }), b = el('button', { txt: 'Buscar', style: 'margin-top:8px;width:100%' }), lista = el('div'), aviso = el('div', { cls: 'msg' }), resumo = el('div', { cls: 'muted', style: 'margin-top:10px' });
    function mostraPin(r) {
      lista.textContent = ''; aviso.textContent = '';
      var ok = el('button', { cls: 'sec', style: 'margin-top:10px', txt: 'Entendi, buscar outra pessoa' }); ok.onclick = function () { lista.textContent = ''; q.value = ''; };
      lista.appendChild(el('div', { cls: 'res ok' }, [el('span', { txt: 'Novo PIN de ' + r.nome + ' (' + r.id + ')' }), el('div', { style: 'font-size:36px;font-weight:800;letter-spacing:5px;margin:8px 0', txt: r.pin }),
        el('small', { txt: 'Entregue em mãos. Este PIN não fica salvo e não aparece de novo. A pessoa deve trocá-lo no primeiro acesso ("Trocar PIN").' })])); lista.appendChild(ok);
    }
    function linha(x) {
      var rb = el('button', { cls: 'sec', txt: 'Renovar PIN' }), acoes = [rb];
      rb.onclick = function () {
        if (!confirm('Renovar o PIN de ' + x.nome + '? O PIN atual deixa de valer.')) return; rb.disabled = true; aviso.textContent = '';
        api('pinsrenovar', { perfil: x.perfil, id: x.id }).then(function (r) { if (!r.ok) { rb.disabled = false; aviso.textContent = r.msg; return; } mostraPin(r); })
          .catch(function (e) { rb.disabled = false; aviso.textContent = offline(e) ? 'Sem internet.' : 'Não foi possível renovar.'; });
      };
      if (x.perfil === 'aluno') {
        var bb = el('button', { cls: 'sec', style: 'margin-left:6px', txt: x.status === 'BLOQUEADO' ? 'Desbloquear' : 'Bloquear' });
        bb.onclick = function () { api('pinsbloq', { id: x.id, bloquear: x.status !== 'BLOQUEADO' }).then(function (r) { if (r.ok) { x.status = r.status; bb.textContent = r.status === 'BLOQUEADO' ? 'Desbloquear' : 'Bloquear'; aviso.style.color = '#1B7F3B'; aviso.textContent = x.nome + ': ' + (r.status === 'BLOQUEADO' ? 'bloqueado.' : 'desbloqueado.'); } else { aviso.style.color = ''; aviso.textContent = r.msg; } }); };
        acoes.push(bb);
      }
      lista.appendChild(el('div', { cls: 'pres', style: 'flex-direction:column;gap:8px' }, [el('div', {}, [el('b', { txt: x.nome }), el('div', { cls: 'muted', txt: x.id + ' · ' + x.sub + (x.status === 'BLOQUEADO' ? ' · BLOQUEADO' : '') })]), el('div', {}, acoes)]));
    }
    function busca() {
      aviso.style.color = ''; aviso.textContent = ''; lista.textContent = 'Buscando…';
      api('pinsbusca', { q: q.value }).then(function (d) { lista.textContent = ''; if (!d.itens.length) { aviso.textContent = 'Ninguém encontrado.'; return; } d.itens.forEach(linha); }).catch(function (e) { lista.textContent = ''; lista.appendChild(erroBox(e)); });
    }
    b.onclick = busca; q.onkeydown = function (e) { if (e.key === 'Enter') busca(); };
    $app.appendChild(el('div', { cls: 'card' }, [btnVoltar(), el('h2', { txt: 'Renovar PIN' }), el('div', { cls: 'muted', txt: 'Use quando alguém esqueceu o PIN. O novo PIN aparece uma vez, na sua tela.' }), q, b, aviso, lista, resumo]));
    api('pinsresumo').then(function (d) { resumo.textContent = 'Acessos da equipe: ' + d.equipe.map(function (e) { return e.nome + ' ' + e.usados + '/' + e.max; }).join(' · '); }).catch(function () {});
  }
  function telaCardapioAdm() {
    limpaTimers(); $app.textContent = ''; $app.appendChild(topo('Cardápio'));
    var hoje = new Date(), iso = hoje.getFullYear() + '-' + ('0' + (hoje.getMonth() + 1)).slice(-2) + '-' + ('0' + hoje.getDate()).slice(-2);
    var dt = el('input', { type: 'date', min: iso, value: iso }), ref = el('select'), prato = el('input', { maxlength: '120', placeholder: 'Ex.: Arroz, feijão e frango assado' }), obs = el('input', { maxlength: '200', placeholder: 'Observação (opcional)' });
    var msg = el('div', { cls: 'msg' }), lista = el('div'), ok = el('button', { style: 'margin-top:10px;width:100%', txt: 'Publicar no cardápio' });
    function carrega() {
      api('cardadm').then(function (d) {
        if (!ref.options.length) d.refeicoes.forEach(function (x) { ref.appendChild(el('option', { value: x, txt: x })); });
        lista.textContent = ''; if (!d.itens.length) lista.appendChild(el('div', { cls: 'muted', txt: 'Nada publicado de hoje em diante.' }));
        d.itens.forEach(function (i) {
          var ex = el('button', { cls: 'sec', txt: 'Excluir' });
          ex.onclick = function () { if (!confirm('Excluir ' + i.data + ' · ' + i.refeicao + '?')) return; api('cardexcluir', { data: i.data, refeicao: i.refeicao }).then(function (r) { if (r.ok) carrega(); else msg.textContent = r.msg; }); };
          lista.appendChild(el('div', { cls: 'pres' }, [el('div', {}, [el('b', { txt: i.data.slice(0, 5) + ' · ' + i.refeicao }), el('div', { txt: i.prato }), i.obs ? el('div', { cls: 'muted', txt: i.obs }) : null]), ex]));
        });
      }).catch(function (e) { lista.textContent = ''; lista.appendChild(erroBox(e)); });
    }
    ok.onclick = function () {
      msg.style.color = ''; msg.textContent = ''; if (!dt.value) { msg.textContent = 'Escolha a data.'; return; }
      var p = dt.value.split('-'); ok.disabled = true;
      api('cardsalvar', { data: p[2] + '/' + p[1] + '/' + p[0], refeicao: ref.value, prato: prato.value, obs: obs.value }).then(function (r) {
        ok.disabled = false; if (!r.ok) { msg.textContent = r.msg; return; }
        msg.style.color = '#1B7F3B'; msg.textContent = r.alterado ? 'Cardápio atualizado.' : 'Publicado!'; prato.value = ''; obs.value = ''; carrega();
      }).catch(function (e) { ok.disabled = false; msg.textContent = offline(e) ? 'Sem internet.' : 'Não foi possível salvar.'; });
    };
    $app.appendChild(el('div', { cls: 'card' }, [btnVoltar(), el('h2', { txt: 'Publicar prato' }), el('label', { txt: 'Data' }), dt, el('label', { txt: 'Refeição' }), ref, el('label', { txt: 'Prato' }), prato, el('label', { txt: 'Observação' }), obs, ok, msg]));
    $app.appendChild(el('div', { cls: 'card' }, [el('h2', { txt: 'Já publicado' }), lista])); carrega();
  }
  // ---------- pesquisas do cardápio: resultados (gestão e cantina) e resposta do aluno ----------
  function barras(itens) {
    return el('div', {}, itens.map(function (c) {
      return el('div', { style: 'margin:6px 0' }, [el('div', { style: 'display:flex;justify-content:space-between;font-size:13px' }, [el('span', { txt: c.op }), el('b', { txt: c.n + ' · ' + c.pct + '%' })]),
        el('div', { cls: 'prog' }, [el('i', { style: 'width:' + c.pct + '%;background:#0B1F4B' })])]);
    }));
  }
  function telaPesquisas(voltar) {
    limpaTimers(); $app.textContent = ''; $app.appendChild(topo('Pesquisas do cardápio'));
    var topoBox = el('div', { cls: 'card' }), box = el('div', { txt: 'Carregando…' });
    if (voltar) { var bv = el('button', { cls: 'sec', style: 'margin-bottom:10px', txt: '← Gestão' }); bv.onclick = voltar; topoBox.appendChild(bv); }
    topoBox.appendChild(el('h2', { txt: 'Resultados' })); topoBox.appendChild(el('div', { cls: 'muted', txt: 'As respostas dos alunos são anônimas (ninguém vê quem respondeu).' })); $app.appendChild(topoBox); $app.appendChild(box);
    function form(tipos) {
      var tp = el('select'), ti = el('input', { maxlength: '120' }), op = el('textarea', { rows: '4', placeholder: 'Uma opção por linha (2 a 8)\nEx.:\nEscondidinho de carne\nStrogonoff de frango' }), fim = el('input', { type: 'date' }), ms = el('div', { cls: 'msg' }), go = el('button', { style: 'margin-top:10px;width:100%', txt: 'Publicar pesquisa' });
      var dicas = { AVALIAR: 'Ex.: Como você avalia o almoço de hoje?', NOVO: 'Ex.: Qual novo prato você quer no cardápio?', RETIRAR: 'Ex.: Qual prato você retiraria do cardápio?' };
      Object.keys(tipos).forEach(function (k) { tp.appendChild(el('option', { value: k, txt: tipos[k] })); });
      var opBox = el('div', { style: 'display:none' }, [el('label', { txt: 'Opções' }), op]);
      function muda() { opBox.style.display = tp.value === 'AVALIAR' ? 'none' : 'block'; ti.setAttribute('placeholder', dicas[tp.value] || ''); } tp.onchange = muda; muda();
      go.onclick = function () {
        ms.style.color = ''; ms.textContent = ''; var f = ''; if (fim.value) { var p = fim.value.split('-'); f = p[2] + '/' + p[1] + '/' + p[0]; } go.disabled = true;
        api('pesqcriar', { tipo: tp.value, titulo: ti.value, opcoes: op.value, fim: f }).then(function (r) { go.disabled = false; if (!r.ok) { ms.textContent = r.msg; return; } telaPesquisas(voltar); })
          .catch(function (e) { go.disabled = false; ms.textContent = offline(e) ? 'Sem internet.' : 'Não foi possível publicar.'; });
      };
      return el('div', { cls: 'card' }, [el('h2', { txt: 'Nova pesquisa' }), el('label', { txt: 'Tipo' }), tp, el('label', { txt: 'Pergunta' }), ti, opBox, el('label', { txt: 'Encerrar em (opcional)' }), fim, go, ms]);
    }
    api('pesqlista').then(function (d) {
      box.textContent = '';
      if (d.pode) box.appendChild(form(d.tipos));
      if (!d.itens.length) box.appendChild(el('div', { cls: 'card muted', txt: 'Nenhuma pesquisa ainda.' }));
      d.itens.forEach(function (p) {
        var k = [el('b', { txt: p.titulo }), el('div', { cls: 'muted', txt: p.rotulo + ' · ' + (p.aberta ? 'aberta' + (p.fim ? ' até ' + p.fim : '') : 'encerrada') + ' · ' + p.total + ' resposta(s) · ' + p.pctParticipacao + '% dos alunos' })];
        if (p.media !== null) k.push(el('div', { style: 'font-size:22px;font-weight:800;color:#0B1F4B;margin:6px 0', txt: '★ ' + String(p.media).replace('.', ',') + ' de 5' }));
        k.push(barras(p.contagem.map(function (c) { return { op: p.tipo === 'AVALIAR' ? c.op + ' ★' : c.op, n: c.n, pct: c.pct }; })));
        if (d.pode && p.aberta) { var en = el('button', { cls: 'sec', style: 'margin-top:8px', txt: 'Encerrar pesquisa' }); en.onclick = function () { if (confirm('Encerrar esta pesquisa?')) api('pesqencerrar', { id: p.id }).then(function () { telaPesquisas(voltar); }); }; k.push(en); }
        box.appendChild(el('div', { cls: 'card' }, k));
      });
    }).catch(function (e) { box.textContent = ''; box.appendChild(erroBox(e)); });
  }
  function telaPesqAluno() {
    limpaTimers(); $app.textContent = ''; $app.appendChild(topo('Sua opinião sobre o cardápio')); var box = el('div', { txt: 'Carregando…' }); $app.appendChild(box);
    api('pesqlista').then(function (d) {
      box.textContent = ''; if (!d.itens.length) { box.appendChild(el('div', { cls: 'card muted', txt: 'Nenhuma pesquisa aberta agora. Volte em breve!' })); return; }
      d.itens.forEach(function (p) {
        var c = el('div', { cls: 'card' }, [el('b', { txt: p.titulo }), el('div', { cls: 'muted', txt: p.rotulo + (p.fim ? ' · até ' + p.fim : '') + ' · resposta anônima' })]), ms = el('div', { cls: 'msg' });
        if (p.respondida) { c.appendChild(el('div', { cls: 'res ok', txt: '✔ Você já respondeu. Obrigado!' })); box.appendChild(c); return; }
        var rot = { '1': '1 · Ruim', '2': '2', '3': '3 · Regular', '4': '4', '5': '5 · Ótimo' };
        p.opcoes.forEach(function (o) {
          var b = el('button', { cls: 'sec', style: 'width:100%;margin-top:8px;text-align:left;padding:13px', txt: p.tipo === 'AVALIAR' ? '★ ' + rot[o] : o });
          b.onclick = function () {
            c.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
            api('pesqresp', { id: p.id, resp: o }).then(function (r) { if (r.ok) { c.textContent = ''; c.appendChild(el('b', { txt: p.titulo })); c.appendChild(el('div', { cls: 'res ok', txt: '✔ Resposta registrada. Obrigado!' })); } else { ms.textContent = r.msg; } })
              .catch(function (e) { c.querySelectorAll('button').forEach(function (x) { x.disabled = false; }); ms.textContent = offline(e) ? 'Sem internet. Tente de novo.' : 'Não foi possível enviar.'; });
          }; c.appendChild(b);
        });
        c.appendChild(ms); box.appendChild(c);
      });
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
    api(item.a || 'presenca', item).then(function () { var g = fila(); g.shift(); salvaFila(g); atualizaPend(); sincronizarFila(); })
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

  // ---------- leitor de QR reutilizável (portaria / cantina) ----------
  function leitor(aoLer, aoErro) {
    var video = el('video', { playsinline: '', muted: '', autoplay: '' }), canvas = document.createElement('canvas'), btn = el('button', { txt: '📷 Abrir câmera' }), loop = null, detector = null;
    try { if ('BarcodeDetector' in window) detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
    video.style.display = 'none';
    function varrer() {
      if (!stream) return;
      decodificar(video, canvas, detector).then(function (v) {
        if (v) { var agora = Date.now(); if (!ultimo[v] || agora - ultimo[v] > 8000) { ultimo[v] = agora; aoLer(v); } }
        loop = setTimeout(varrer, 250);
      });
    }
    btn.onclick = function () {
      if (stream) { pararCam(); btn.textContent = '📷 Abrir câmera'; video.style.display = 'none'; return; }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
        stream = s; video.srcObject = s; video.style.display = 'block'; video.play(); btn.textContent = '■ Parar câmera'; varrer();
      }).catch(function () { aoErro('Câmera bloqueada', 'Permita o uso da câmera no navegador.'); });
    };
    return [btn, el('div', { style: 'margin-top:10px' }, [video])];
  }
  function mostraRes(alvo, cls, titulo, sub) { alvo.textContent = ''; alvo.appendChild(el('div', { cls: 'res ' + cls }, [el('span', { txt: titulo }), el('small', { txt: sub || '' })])); if (navigator.vibrate) navigator.vibrate(cls === 'ok' ? 80 : [60, 60, 60]); }
  function enviarComFila(acao, p, res, aoOk) {
    p.a = acao; p.ts = Date.now();
    api(acao, p).then(aoOk).catch(function (e) {
      if (offline(e)) { if (acao === 'checkin') p.fila = true; var f = fila(); f.push(p); salvaFila(f); atualizaPend(); mostraRes(res, 'amb', 'Sem internet', 'Leitura guardada; envio automático quando voltar.'); }
      else { var m = String(e.message).replace('Error:', '').trim(); mostraRes(res, 'rec', 'Não registrado', m === 'QR_INVALIDO' ? 'Código inválido. Aponte para o QR do tablet.' : (m === 'QR_VENCIDO' ? 'Código vencido. Espere o QR do tablet mudar e leia de novo.' : m)); }
    });
  }
  function entradaManual(acaoFn, extra, res, aoOk) {
    var m = el('input', { inputmode: 'numeric', maxlength: '20', placeholder: 'Matrícula (aluno sem celular)' }), b = el('button', { cls: 'sec', style: 'margin-top:8px;width:100%', txt: 'Registrar pela matrícula' });
    b.onclick = function () { if (!m.value) return; enviarComFila(acaoFn(), Object.assign({ manual: m.value.trim() }, extra()), res, function (r) { m.value = ''; aoOk(r); }); };
    return el('div', { style: 'margin-top:14px' }, [el('label', { txt: 'Sem celular ou sem QR' }), m, b]);
  }
  // quantidade sem identificação (ex.: "3 alunos da 200 ADM sem celular"): entra nos totais, não em nomes
  function loteBox(titulo, turmas, acaoFn, extra, res, aoOk) {
    var t = el('select'), q = el('input', { type: 'number', min: '1', max: '100', value: '1', inputmode: 'numeric' }), b = el('button', { cls: 'sec', style: 'margin-top:8px;width:100%', txt: 'Registrar quantidade' });
    if (turmas) { t.appendChild(el('option', { value: '', txt: 'Turma…' })); turmas.forEach(function (x) { t.appendChild(el('option', { value: x, txt: x })); }); }
    b.onclick = function () { var n = parseInt(q.value, 10); if (!(n >= 1)) return; if (turmas && !t.value) { mostraRes(res, 'amb', 'Escolha a turma', ''); return; }
      enviarComFila(acaoFn(), Object.assign({ lote: { turma: t.value, qtd: n } }, extra()), res, function (r) { q.value = '1'; aoOk(r); }); };
    var kids = [el('label', { txt: titulo })]; if (turmas) kids.push(t); kids.push(el('label', { txt: 'Quantidade' })); kids.push(q); kids.push(b);
    return el('div', { style: 'margin-top:14px' }, kids);
  }

  // ---------- portaria: entrada e saída ----------
  function telaPortaria() {
    $app.textContent = ''; $app.appendChild(topo('Portaria · lançamento manual'));
    var modo = 'entrada', res = el('div'), cont = el('div', { cls: 'muted', txt: 'Lidos nesta sessão: 0' }), n = 0, pend = el('div', { id: 'pend', cls: 'off', style: 'display:none' });
    var bE = el('button', { txt: '↘ Entrada' }), bS = el('button', { cls: 'sec', style: 'width:100%;margin-top:12px;padding:13px', txt: '↗ Saída' }), seg = el('div', { cls: 'row' }, [bE, bS]);
    var motivo = el('select'); ['Liberação antecipada', 'Consulta / atendimento', 'Fim do turno', 'Outro motivo'].forEach(function (x) { motivo.appendChild(el('option', { value: x, txt: x })); });
    var motivoBox = el('div', { style: 'display:none' }, [el('label', { txt: 'Motivo da saída' }), motivo]);
    function marca() { crBox.style.display = modo === 'entrada' ? 'block' : 'none'; bE.className = modo === 'entrada' ? '' : 'sec'; bS.className = modo === 'saida' ? '' : 'sec'; bE.style.cssText = bS.style.cssText = 'width:100%;margin-top:12px;padding:13px'; motivoBox.style.display = modo === 'saida' ? 'block' : 'none'; res.textContent = ''; }
    bE.onclick = function () { modo = 'entrada'; marca(); }; bS.onclick = function () { modo = 'saida'; marca(); };
    var cr = el('select', {}, [el('option', { value: '', txt: 'Padrão (dia útil conta; sáb/dom a confirmar)' }), el('option', { value: 'sim', txt: 'Vai almoçar/comer (conta)' }), el('option', { value: 'nao', txt: 'Não conta refeição' })]);
    var crBox = el('div', {}, [el('label', { txt: 'Refeição deste aluno' }), cr]);
    function extra() { if (modo === 'saida') return { motivo: motivo.value }; return cr.value === 'sim' ? { contaRef: true } : (cr.value === 'nao' ? { contaRef: false } : {}); }
    function ok(r) {
      var tipo = r.tipo === 'saida' ? 'Saída' : 'Entrada';
      if (r.lote) { n += r.qtd; cont.textContent = 'Lidos nesta sessão: ' + n; mostraRes(res, 'ok', '✔ ' + r.qtd + ' aluno(s) · ' + r.turma, tipo + ' sem identificação · ' + r.hora); }
      else if (r.dup) mostraRes(res, 'amb', r.nome + ' · ' + tipo.toLowerCase() + ' já registrada', 'Às ' + r.hora + ' (' + r.turma + ')');
      else { n++; cont.textContent = 'Lidos nesta sessão: ' + n; mostraRes(res, 'ok', (r.tipo === 'saida' ? '↗ ' : '✔ ') + r.nome, (r.turma || '') + ' · ' + r.hora + (r.manual ? ' · manual' : '')); }
    }
    var box = el('div', { cls: 'card' }, [el('div', { cls: 'muted', txt: 'Para aluno sem celular, sem bateria ou que esqueceu. O aluno com celular lê o QR do tablet (aba Estação).' }), seg, motivoBox, crBox, pend].concat([res, cont, buscaNome(function () { return modo; }, extra, res, ok), entradaManual(function () { return modo; }, extra, res, ok)]));
    var loteHolder = el('div'); box.appendChild(loteHolder); $app.appendChild(box); marca(); atualizaPend();
    api('hoje').then(function (d) { loteHolder.appendChild(loteBox('Sem identificação (informe turma e quantidade)', d.turmas || [], function () { return modo; }, extra, res, ok)); }).catch(function () {});
  }

  // ---------- cantina: refeição servida ----------
  function telaRefeicao() {
    $app.textContent = ''; $app.appendChild(topo('Cantina · refeição servida'));
    var sel = el('select'); ['Café da manhã', 'Almoço', 'Lanche da tarde'].forEach(function (x) { sel.appendChild(el('option', { value: x, txt: x })); });
    var res = el('div'), cont = el('div', { cls: 'muted', txt: 'Servidos nesta sessão: 0' }), n = 0, pend = el('div', { id: 'pend', cls: 'off', style: 'display:none' });
    function ok(r) {
      if (r.lote) { n += r.qtd; cont.textContent = 'Servidos nesta sessão: ' + n; mostraRes(res, 'ok', '✔ ' + r.qtd + ' sem leitura', r.refeicao); }
      else if (r.dup) mostraRes(res, 'amb', r.nome + ' · já foi servido', sel.value + ' (' + r.turma + ')');
      else { n++; cont.textContent = 'Servidos nesta sessão: ' + n; mostraRes(res, r.aviso ? 'amb' : 'ok', '✔ ' + r.nome, (r.turma || '') + (r.aviso ? ' · ' + r.aviso : '')); }
    }
    function extra() { return { refeicao: sel.value }; }
    $app.appendChild(el('div', { cls: 'card' }, [el('h2', { txt: 'Refeição (direção)' }), el('label', { txt: 'Refeição em andamento' }), sel, pend].concat([res, cont,
      entradaManual(function () { return 'refeicao'; }, extra, res, ok), loteBox('Servidos sem leitura do QR (só quantidade)', null, function () { return 'refeicao'; }, extra, res, ok)])));
    atualizaPend();
  }


  // ---------- estação: QR fixo que muda a cada 30 s (tablet da portaria / cantina) ----------
  function hmacHex(msg, key) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']).then(function (k) { return crypto.subtle.sign('HMAC', k, enc.encode(msg)); })
      .then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
  }
  function telaEstacao(grupo) {
    var MODOS = { P: [['E', '↘ ENTRADA'], ['S', '↗ SAÍDA']], C: [['R0', '☕ Café'], ['R1', '🍽 Almoço'], ['R2', '🥪 Lanche']], D: [['E', '↘ Entrada'], ['S', '↗ Saída'], ['R0', '☕ Café'], ['R1', '🍽 Almoço'], ['R2', '🥪 Lanche']] }[grupo];
    var modo = MODOS[0][0], chave = '', off = 0, slotMs = 30000, ult = '', ocupado = false;
    var img = el('img', { alt: 'QR da estação', style: 'display:none' }), barra = el('i'), titulo = el('div', { cls: 'estt', txt: '' }), msg = el('div', { cls: 'muted', txt: 'Conectando…' });
    var seg = el('div', { cls: 'row' }, MODOS.map(function (m) { var b = el('button', { txt: m[1], cls: m[0] === modo ? '' : 'sec' }); b.onclick = function () { modo = m[0]; ult = ''; seg.querySelectorAll('button').forEach(function (x) { x.className = 'sec'; }); b.className = ''; tick(); }; return b; }));
    limpaTimers(); $app.textContent = ''; $app.appendChild(topo(grupo === 'C' ? 'Cantina · QR da refeição' : 'Estação · QR do tablet'));
    var fs = el('button', { cls: 'sec', style: 'margin-top:8px', txt: '⛶ Tela cheia' }); fs.onclick = function () { try { document.documentElement.requestFullscreen(); } catch (e) {} };
    $app.appendChild(el('div', { cls: 'card qrbox' }, [seg, titulo, img, el('div', { cls: 'bar' }, [barra]), msg, el('div', { cls: 'muted', style: 'margin-top:8px', txt: 'Deixe esta tela aberta e voltada para os alunos. O código muda sozinho a cada 30 segundos. Aluno: abra o app, toque em "Registrar" e aponte a câmera. Pode usar 2 tablets (entre com o login da portaria nos dois).' }), fs]));
    function carrega() {
      api('estacao').then(function (r) { chave = r.chave; slotMs = r.slotMs || 30000; off = r.agora - Date.now(); msg.textContent = 'Pronto.'; tick(); })
        .catch(function (e) { msg.textContent = offline(e) ? 'Sem internet para iniciar a estação. Tentando de novo…' : String(e.message); });
    }
    function tick() {
      if (!chave || ocupado) return;
      var agora = Date.now() + off, slot = Math.floor(agora / slotMs), chv = modo + '.' + slot;
      barra.style.width = (100 - (agora % slotMs) * 100 / slotMs) + '%';
      var m = MODOS.filter(function (x) { return x[0] === modo; })[0]; titulo.textContent = m[1];
      if (chv === ult) return; ocupado = true;
      hmacHex(chv, chave).then(function (h) { ult = chv; desenharQR(chv + '.' + h.slice(0, 16), img); img.style.display = 'inline-block'; ocupado = false; })
        .catch(function () { ocupado = false; msg.textContent = 'Este navegador não calcula o código (use Chrome com https).'; });
    }
    carrega(); timers.push(setInterval(tick, 500)); timers.push(setInterval(carrega, 1800000));
    try { if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(function () {}); } catch (e) {}
  }

  // ---------- aluno: lê o QR da estação ----------
  function telaRegistrar() {
    $app.textContent = ''; $app.appendChild(topo('Registrar presença ou refeição'));
    var res = el('div'), pend = el('div', { id: 'pend', cls: 'off', style: 'display:none' });
    function ok(r) {
      if (r.refeicao) { if (r.dup) mostraRes(res, 'amb', 'Refeição já registrada', r.refeicao); else mostraRes(res, r.aviso ? 'amb' : 'ok', '✔ ' + r.refeicao + ' registrado', r.aviso || r.hora || ''); return; }
      var t = r.tipo === 'saida' ? 'Saída' : 'Entrada';
      if (r.dup) mostraRes(res, 'amb', t + ' já registrada', 'Às ' + (r.hora || ''));
      else mostraRes(res, 'ok', '✔ ' + t + ' registrada', (r.hora || '') + (r.fds ? ' · fim de semana: a portaria confirma sua refeição' : ''));
    }
    var nodes = leitor(function (v) { enviarComFila('checkin', { code: v }, res, ok); }, function (t, s2) { mostraRes(res, 'rec', t, s2); });
    $app.appendChild(el('div', { cls: 'card' }, [el('h2', { txt: 'Aponte para o QR do tablet' }), el('div', { cls: 'muted', txt: 'Portaria: entrada ou saída. Cantina: refeição. Sem internet? A leitura fica guardada e é enviada quando voltar.' }), pend].concat(nodes).concat([res])));
    atualizaPend();
  }

  // ---------- portaria: fim de semana ----------
  function telaFds() {
    $app.textContent = ''; $app.appendChild(topo('Sábado e domingo · confirmar refeição'));
    var box = el('div', { cls: 'card', txt: 'Carregando…' }); $app.appendChild(box);
    function carrega() {
      api('fds').then(function (d) {
        box.textContent = ''; box.appendChild(el('h2', { txt: 'Quem vai comer hoje?' }));
        box.appendChild(el('div', { cls: 'muted', txt: d.fds ? 'Confirme com cada aluno. "Não" = não conta na previsão de refeições.' : 'Hoje não é sábado nem domingo: a confirmação só vale no fim de semana.' }));
        if (!d.itens.length) box.appendChild(el('div', { cls: 'muted', style: 'margin-top:10px', txt: 'Nenhum aluno registrado hoje.' }));
        d.itens.forEach(function (x) {
          var st = el('span', { cls: x.ok === 'SIM' ? 'ok' : (x.ok === 'NAO' ? 'rec' : 'amb'), txt: x.ok === 'SIM' ? 'Vai comer' : (x.ok === 'NAO' ? 'Não vai' : 'Pendente') });
          var bs = el('button', { style: 'padding:8px 14px', txt: 'Sim' }), bn = el('button', { cls: 'sec', style: 'padding:8px 14px;margin-left:6px', txt: 'Não' });
          function envia(v) { bs.disabled = bn.disabled = true; api('confirmaref', { mat: x.mat, ok: v }).then(function () { carrega(); }).catch(function (e) { bs.disabled = bn.disabled = false; st.textContent = offline(e) ? 'Sem internet' : String(e.message); }); }
          bs.onclick = function () { envia('SIM'); }; bn.onclick = function () { envia('NAO'); };
          box.appendChild(el('div', { cls: 'pres' }, [el('div', {}, [el('b', { txt: x.nome }), el('div', { cls: 'muted', txt: x.turma + ' · ' + x.hora }), st]), el('div', {}, [bs, bn])]));
        });
        var b = el('button', { cls: 'sec', style: 'margin-top:12px', txt: '↻ Atualizar' }); b.onclick = carrega; box.appendChild(b);
      }).catch(function (e) { box.textContent = ''; box.appendChild(erroBox(e)); });
    }
    carrega();
  }

  // ---------- cantina: lista da turma (só primeiro nome) ----------
  function telaListaCantina() {
    $app.textContent = ''; $app.appendChild(topo('Cantina · lista da turma'));
    var tSel = el('select'), rSel = el('select'), lista = el('div'), res = el('div'), turmasL = [];
    ['Café da manhã', 'Almoço', 'Lanche da tarde'].forEach(function (x) { rSel.appendChild(el('option', { value: x, txt: x })); }); rSel.value = 'Almoço';
    var card = el('div', { cls: 'card' }, [el('h2', { txt: 'Turma liberada ou lanche avulso' }), el('div', { cls: 'muted', txt: 'Use quando poucos alunos ficaram na escola. Só aparece número e primeiro nome. Cinza = já saiu ou não está na escola.' }),
      el('label', { txt: 'Turma' }), tSel, el('label', { txt: 'Refeição' }), rSel, res, lista]);
    $app.appendChild(card);
    function carrega() {
      if (!tSel.value) return; lista.textContent = 'Carregando…';
      api('cantturma', { turma: tSel.value, refeicao: rSel.value }).then(function (d) {
        lista.textContent = ''; if (!d.itens.length) lista.appendChild(el('div', { cls: 'muted', txt: 'Nenhum aluno nesta turma.' }));
        d.itens.forEach(function (i) {
          var b = el('button', { style: 'width:100%;margin-top:6px;text-align:left;padding:13px' + (i.estado === 'cinza' ? ';opacity:.45' : ''), cls: i.estado === 'servido' ? 'sec' : '', txt: i.n + ' · ' + i.nome + (i.estado === 'servido' ? '  ✔ servido' : '') });
          if (i.estado !== 'ativo') b.disabled = true;
          b.onclick = function () { b.disabled = true; api('cantregistra', { k: i.k, refeicao: rSel.value }).then(function (r) { if (r.dup) mostraRes(res, 'amb', i.nome + ' · já servido', rSel.value); else mostraRes(res, 'ok', '✔ ' + i.nome, rSel.value); carrega(); }).catch(function (e) { b.disabled = false; mostraRes(res, 'rec', 'Não registrado', offline(e) ? 'Sem internet.' : String(e.message)); }); };
          lista.appendChild(b);
        });
        var rb = el('button', { cls: 'sec', style: 'margin-top:10px', txt: '↻ Atualizar' }); rb.onclick = carrega; lista.appendChild(rb);
      }).catch(function (e) { lista.textContent = ''; lista.appendChild(erroBox(e)); });
    }
    tSel.onchange = carrega; rSel.onchange = carrega;
    api('hoje').then(function (d) {
      turmasL = d.turmas || []; tSel.appendChild(el('option', { value: '', txt: 'Escolha a turma…' })); turmasL.forEach(function (x) { tSel.appendChild(el('option', { value: x, txt: x })); });
      card.appendChild(loteBox('Só a quantidade (sem lista)', turmasL, function () { return 'refeicao'; }, function () { return { refeicao: rSel.value }; }, res, function (r) { mostraRes(res, 'ok', '✔ ' + r.qtd + ' servido(s)', rSel.value); }));
    }).catch(function (e) { lista.appendChild(erroBox(e)); });
  }

  // ---------- painel do dia (portaria, cantina e direção): gráficos ----------
  function kpi(v, l) { return el('div', { cls: 'kpi' }, [el('b', { txt: v }), el('span', { txt: l })]); }
  function barH(rot, v, tot, txt, cor) { var p = tot ? Math.min(100, v * 100 / tot) : 0; return el('div', { cls: 'hb' }, [el('div', { cls: 'hbt' }, [el('span', { txt: rot }), el('b', { txt: txt })]), el('div', { cls: 'prog' }, [el('i', { style: 'width:' + p + '%;background:' + (cor || 'var(--navy)') })])]); }
  function barsV(itens, cor) {
    var max = Math.max.apply(null, itens.map(function (x) { return x.n; }).concat([1])), box = el('div', { cls: 'vb' });
    itens.forEach(function (x) { box.appendChild(el('div', { cls: 'vbc' }, [el('small', { txt: x.n ? x.n : '' }), el('i', { style: 'height:' + Math.max(2, x.n * 100 / max) + '%;background:' + (cor || 'var(--navy)') }), el('small', { txt: x.faixa.slice(0, 5) })])); });
    return el('div', { cls: 'vbw' }, [box]);
  }
  function telaHoje() {
    $app.textContent = ''; $app.appendChild(topo('Painel de hoje'));
    var box = el('div', { cls: 'card', txt: 'Carregando…' }); $app.appendChild(box);
    function carrega() {
      api('hoje').then(function (d) {
        box.textContent = '';
        if (d.simulado) box.appendChild(el('div', { cls: 'off', txt: 'Dados de demonstração (simulados) · nenhum aluno real' }));
        box.appendChild(el('h2', { txt: d.data + ' · atualizado às ' + d.agora }));
        box.appendChild(el('div', { cls: 'kpis' }, [kpi(d.naEscola, 'Na escola agora'), kpi(d.presentes, 'Presentes (' + d.pctPresenca + '%)'), kpi(d.sairam, 'Já saíram'), kpi(d.ausentes, 'Ausentes')]));
        box.appendChild(el('div', { cls: 'muted', txt: d.media5 === null ? 'Sem dias anteriores para comparar.' : 'Média de presentes nos últimos ' + d.diasBase + ' dias: ' + d.media5 + '.' }));
        box.appendChild(el('h2', { style: 'margin-top:16px', txt: 'Refeições: servidos ÷ esperados' }));
        d.refeicoes.forEach(function (r) {
          var cls = r.status === 'encerrada' ? 'ok' : (r.status === 'em andamento' ? 'amb' : '');
          var linha = r.status === 'prevista' ? ('Esperados: ' + r.esperados + (r.previsao !== null ? ' · previsão de servidos: ~' + r.previsao : '')) : ('Esperados ' + r.esperados + ' · servidos ' + r.servidos);
          var c = el('div', { cls: 'meal' }, [el('div', { cls: 'hbt' }, [el('b', { txt: r.nome + ' · ' + r.hora }), el('span', { cls: 'chip ' + (cls || 'amb'), txt: r.status })]),
            el('div', { cls: 'big', txt: r.status === 'prevista' ? (r.previsao !== null ? '~' + r.previsao : '—') : r.servidos + (r.pct !== null ? ' · ' + r.pct + '%' : '') }),
            el('div', { cls: 'prog' }, [el('i', { style: 'width:' + Math.min(100, r.pct || 0) + '%;background:' + (r.pct >= 90 ? 'var(--grn)' : 'var(--yel)') })]),
            el('div', { cls: 'muted', txt: linha + (r.adesaoMedia !== null ? ' · adesão média: ' + r.adesaoMedia + '%' : '') })]);
          box.appendChild(c);
        });
        box.appendChild(el('div', { cls: 'muted', txt: 'Esperados = quem já tinha chegado e ainda não tinha saído até o horário da refeição (liberações antecipadas descontadas). Cada aluno conta uma vez por refeição.' }));
        if (d.chegadas.length) { box.appendChild(el('h2', { style: 'margin-top:16px', txt: 'Chegadas por horário (a cada 15 min)' })); box.appendChild(barsV(d.chegadas, 'var(--navy)')); }
        if (d.saidas.length) { box.appendChild(el('h2', { style: 'margin-top:16px', txt: 'Saídas por horário' })); box.appendChild(barsV(d.saidas, 'var(--red)')); }
        if (d.encerrado) box.appendChild(el('div', { cls: 'off', txt: 'Expediente encerrado (após ' + d.fim + '): sem lanche e sem registro de saída.' }));
        if (d.fds) box.appendChild(el('div', { cls: 'off', txt: 'Fim de semana: refeição só conta depois da confirmação da portaria. Pendentes: ' + d.pendFds }));
        function grupo(tit, arr) {
          box.appendChild(el('h2', { style: 'margin-top:16px', txt: tit }));
          arr.forEach(function (x) { box.appendChild(barH(x.k, x.presentes, x.total, x.presentes + '/' + x.total + ' · ' + x.pct + '%', x.pct >= 85 ? 'var(--grn)' : 'var(--navy)')); box.appendChild(el('div', { cls: 'muted', txt: 'Servidos: café ' + x.serv[0] + ' · almoço ' + x.serv[1] + ' · lanche ' + x.serv[2] })); });
        }
        if (d.porSerie && d.porSerie.length) grupo('Por série (100 / 200 / 300)', d.porSerie);
        if (d.porCurso && d.porCurso.length) grupo('Por curso (ADM / INT / MKT)', d.porCurso);
        box.appendChild(el('h2', { style: 'margin-top:16px', txt: 'Presença por turma' }));
        d.porTurma.forEach(function (x) { box.appendChild(barH(x.turma, x.presentes, x.total, x.presentes + '/' + x.total + ' · ' + x.pct + '%', x.pct >= 85 ? 'var(--grn)' : 'var(--navy)')); });
        if (d.ultimos && d.ultimos.length) { box.appendChild(el('h2', { style: 'margin-top:16px', txt: 'Últimas entradas' })); d.ultimos.forEach(function (u) { box.appendChild(el('div', { cls: 'pres' }, [el('span', { txt: u.nome + ' · ' + u.turma }), el('span', { cls: 'muted', txt: u.hora })])); }); }
        var b = el('button', { cls: 'sec', style: 'margin-top:12px', txt: '↻ Atualizar' }); b.onclick = carrega; box.appendChild(b);
        var mb = el('div'); box.appendChild(mb);
        api('mensal').then(function (m) {
          mb.appendChild(el('h2', { style: 'margin-top:18px', txt: 'Refeições por mês · ' + m.ano }));
          var t = el('table', { cls: 'tb' }, [el('tr', {}, ['Mês', 'Café', 'Almoço', 'Lanche', 'Total'].map(function (h) { return el('th', { txt: h }); }))]);
          m.meses.forEach(function (x) { t.appendChild(el('tr', {}, [x.rot.toUpperCase() + (x.fechado ? '' : '*'), x.cafe, x.almoco, x.lanche, x.total].map(function (v) { return el('td', { txt: String(v) }); }))); });
          var y = m.totalAno; t.appendChild(el('tr', { style: 'font-weight:800' }, ['TOTAL ' + m.ano, y.cafe, y.almoco, y.lanche, y.total].map(function (v) { return el('td', { txt: String(v) }); })));
          mb.appendChild(t); mb.appendChild(el('div', { cls: 'muted', txt: '* mês em andamento. Meses fechados ficam guardados só com os totais.' + (m.anoAnterior ? ' Ano anterior: ' + m.anoAnterior.total + ' refeições.' : '') }));
        }).catch(function () {});
      }).catch(function (e) { box.textContent = ''; box.appendChild(erroBox(e)); });
    }
    carrega(); timers.push(setInterval(carrega, 60000));
  }

  // ---------- início ----------
  if ('serviceWorker' in navigator) { window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); }); }
  if (S.tok) iniciar(); else telaLogin();
})();
