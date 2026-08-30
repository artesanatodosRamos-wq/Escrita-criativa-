import { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-init.js?v=5';
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------- Elementos ----------
const loginGate = document.getElementById('login-gate');
const appShell = document.getElementById('app-shell');
const logoutBtn = document.getElementById('logout-btn');
const loginBtn2 = document.getElementById('login-btn-2');
const topbarStatus = document.getElementById('topbar-status');

let currentUser = null;
let unsubscribeChapters = null;
let unsubscribePersonagens = null;

// ---------- Login / Logout ----------
function doLogin() {
  signInWithPopup(auth, provider).catch(err => {
    alert('Não foi possível entrar.\nMotivo: ' + err.code + '\n' + err.message);
  });
}
loginBtn2.addEventListener('click', doLogin);
logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    loginGate.hidden = true;
    appShell.hidden = false;
    logoutBtn.hidden = false;
    topbarStatus.textContent = 'Logada como ' + (user.email || user.displayName || '');
    startChaptersListener();
    startPersonagensListener();
  } else {
    loginGate.hidden = false;
    appShell.hidden = true;
    logoutBtn.hidden = true;
    topbarStatus.textContent = '';
    if (unsubscribeChapters) unsubscribeChapters();
    if (unsubscribePersonagens) unsubscribePersonagens();
    chapters = [];
    personagens = [];
  }
});

// ---------- Navegação entre seções ----------
const iconButtons = document.querySelectorAll('.icon-btn[data-section]');
const views = document.querySelectorAll('[data-view]');

iconButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    iconButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.section;
    views.forEach(v => v.hidden = (v.id !== 'view-' + target));
  });
});

// ---------- Reposicionar a barra de ícones ----------
const shell = document.getElementById('app-shell');
const repositionBtn = document.getElementById('reposition-btn');
const positions = ['left', 'right', 'top'];

const savedPos = localStorage.getItem('kurogane_sidebar_pos');
if (savedPos) shell.dataset.sidebarPos = savedPos;

repositionBtn.addEventListener('click', () => {
  const current = shell.dataset.sidebarPos;
  const next = positions[(positions.indexOf(current) + 1) % positions.length];
  shell.dataset.sidebarPos = next;
  localStorage.setItem('kurogane_sidebar_pos', next);
});

// ---------- Escritos: capítulos + editor (Firestore) ----------
let chapters = [];
let activeId = null;

const chapterItemsEl = document.getElementById('chapter-items');
const titleInput = document.getElementById('chapter-title');
const editorEl = document.getElementById('editor');
const wordCountEl = document.getElementById('word-count');
const saveIndicatorEl = document.getElementById('save-indicator');
const newChapterBtn = document.getElementById('new-chapter-btn');

function chaptersCollection() {
  return collection(db, 'usuarios', currentUser.uid, 'capitulos');
}

function startChaptersListener() {
  const q = query(chaptersCollection(), orderBy('atualizadoEm', 'desc'));
  unsubscribeChapters = onSnapshot(q, (snapshot) => {
    chapters = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!activeId && chapters.length) activeId = chapters[0].id;
    if (!chapters.length) {
      createChapter();
      return;
    }
    renderChapterList();
    // Só recarrega o texto do editor se ele não estiver em uso agora —
    // evita que o cursor volte pro início enquanto você digita.
    const estaEditando = document.activeElement === editorEl || document.activeElement === titleInput;
    if (!estaEditando) {
      renderEditor();
    }
  }, (err) => {
    if (err.code === 'permission-denied') {
      saveIndicatorEl.textContent = 'Sem permissão de acesso';
    }
  });
}

function renderChapterList() {
  chapterItemsEl.innerHTML = '';
  chapters.forEach(ch => {
    const div = document.createElement('div');
    div.className = 'chapter-item' + (ch.id === activeId ? ' active' : '');
    div.textContent = ch.titulo || 'Sem título';
    div.addEventListener('click', () => {
      activeId = ch.id;
      renderChapterList();
      renderEditor();
    });
    chapterItemsEl.appendChild(div);
  });
}

function renderEditor() {
  const ch = chapters.find(c => c.id === activeId);
  if (!ch) {
    titleInput.value = '';
    editorEl.innerHTML = '';
    updateWordCount();
    return;
  }
  titleInput.value = ch.titulo || '';
  editorEl.innerHTML = ch.conteudo || '';
  updateWordCount();
}

function updateWordCount() {
  const text = editorEl.innerText.trim();
  const count = text ? text.split(/\s+/).length : 0;
  wordCountEl.textContent = count + (count === 1 ? ' palavra' : ' palavras');
}

async function createChapter() {
  if (!currentUser) {
    alert('Ainda não terminou de entrar — espera um instante e tenta de novo.');
    return;
  }
  const id = 'ch_' + Date.now();
  activeId = id;
  try {
    await setDoc(doc(chaptersCollection(), id), {
      titulo: 'Novo capítulo',
      conteudo: '',
      atualizadoEm: serverTimestamp()
    });
    titleInput.focus();
    titleInput.select();
  } catch (err) {
    activeId = null;
    if (err.code === 'permission-denied') {
      alert('Não foi possível salvar: este e-mail ainda não está liberado no banco de dados (coleção "permitidos").');
    } else {
      alert('Não foi possível criar o capítulo: ' + err.message);
    }
  }
}

newChapterBtn.addEventListener('click', createChapter);

async function salvarAgora() {
  clearTimeout(saveTimeout);
  if (!activeId || !currentUser) return;
  saveIndicatorEl.textContent = 'Salvando...';
  try {
    await setDoc(doc(chaptersCollection(), activeId), {
      titulo: titleInput.value,
      conteudo: editorEl.innerHTML,
      atualizadoEm: serverTimestamp()
    }, { merge: true });
    saveIndicatorEl.textContent = 'Salvo automaticamente';
  } catch (err) {
    saveIndicatorEl.textContent = 'Erro ao salvar!';
    if (err.code === 'permission-denied') {
      alert('Não foi possível salvar: este e-mail ainda não está liberado no banco de dados (coleção "permitidos").');
    }
  }
}

let saveTimeout = null;
function scheduleSave() {
  saveIndicatorEl.textContent = 'Salvando...';
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(salvarAgora, 700);
}

document.getElementById('save-now-btn').addEventListener('click', salvarAgora);

titleInput.addEventListener('input', scheduleSave);
editorEl.addEventListener('input', () => {
  updateWordCount();
  scheduleSave();
});

// ---------- Barra de formatação ----------
document.querySelectorAll('.editor-toolbar button').forEach(btn => {
  btn.addEventListener('click', () => {
    editorEl.focus();
    document.execCommand(btn.dataset.cmd, false, btn.dataset.val || null);
    scheduleSave();
  });
});

// ---------- Personagens: canvas livre ----------
let personagens = [];
let activePersonagemId = null;

const personagemItemsEl = document.getElementById('personagem-items');
const personagemNomeInput = document.getElementById('personagem-nome');
const canvasAreaEl = document.getElementById('canvas-area');
const newPersonagemBtn = document.getElementById('new-personagem-btn');
const addBlocoTextoBtn = document.getElementById('add-bloco-texto-btn');
const addBlocoImagemBtn = document.getElementById('add-bloco-imagem-btn');
const savePersonagemBtn = document.getElementById('save-personagem-btn');

function personagensCollection() {
  return collection(db, 'usuarios', currentUser.uid, 'personagens');
}

function startPersonagensListener() {
  const q = query(personagensCollection(), orderBy('atualizadoEm', 'desc'));
  unsubscribePersonagens = onSnapshot(q, (snapshot) => {
    personagens = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPersonagemList();
    const estaEditando = document.activeElement === personagemNomeInput ||
      (document.activeElement && document.activeElement.closest && document.activeElement.closest('.canvas-block-text'));
    if (!estaEditando) renderCanvas();
  }, (err) => {
    if (err.code === 'permission-denied') {
      personagemSaveStatus('Sem permissão de acesso');
    }
  });
}

function renderPersonagemList() {
  personagemItemsEl.innerHTML = '';
  personagens.forEach(p => {
    const div = document.createElement('div');
    div.className = 'chapter-item' + (p.id === activePersonagemId ? ' active' : '');
    div.textContent = p.nome || 'Sem nome';
    div.addEventListener('click', () => {
      activePersonagemId = p.id;
      renderPersonagemList();
      renderCanvas();
    });
    personagemItemsEl.appendChild(div);
  });
}

function personagemAtiva() {
  return personagens.find(p => p.id === activePersonagemId);
}

function personagemSaveStatus(texto) {
  savePersonagemBtn.textContent = texto;
  setTimeout(() => { savePersonagemBtn.textContent = 'Salvar agora'; }, 1600);
}

function renderCanvas() {
  canvasAreaEl.innerHTML = '';
  const p = personagemAtiva();
  personagemNomeInput.value = p ? (p.nome || '') : '';
  if (!p) return;
  (p.blocos || []).forEach(bloco => criarElementoBloco(bloco));
}

function criarElementoBloco(bloco) {
  const el = document.createElement('div');
  el.className = 'canvas-block';
  el.style.left = (bloco.x || 20) + 'px';
  el.style.top = (bloco.y || 20) + 'px';
  el.dataset.id = bloco.id;

  const handle = document.createElement('div');
  handle.className = 'canvas-block-handle';
  handle.innerHTML = '<span>' + (bloco.tipo === 'imagem' ? 'imagem' : 'texto') + '</span>';
  const removeBtn = document.createElement('button');
  removeBtn.className = 'canvas-block-remove';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remover bloco';
  removeBtn.addEventListener('click', () => removerBloco(bloco.id));
  handle.appendChild(removeBtn);
  el.appendChild(handle);

  if (bloco.tipo === 'imagem') {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'canvas-block-image';
    if (bloco.conteudo) {
      const img = document.createElement('img');
      img.src = bloco.conteudo;
      imgWrap.appendChild(img);
    } else {
      imgWrap.textContent = 'Toque para escolher imagem';
    }
    imgWrap.addEventListener('click', () => escolherImagem(bloco.id));
    el.appendChild(imgWrap);
  } else {
    const textEl = document.createElement('div');
    textEl.className = 'canvas-block-text';
    textEl.contentEditable = 'true';
    textEl.spellcheck = true;
    textEl.lang = 'pt-BR';
    textEl.innerHTML = bloco.conteudo || '';
    textEl.addEventListener('input', () => {
      bloco.conteudo = textEl.innerHTML;
      schedulePersonagemSave();
    });
    textEl.addEventListener('contextmenu', (e) => abrirMenuLink(e, textEl, bloco));
    el.appendChild(textEl);
  }

  tornarArrastavel(el, bloco);
  canvasAreaEl.appendChild(el);
}

function tornarArrastavel(el, bloco) {
  const handle = el.querySelector('.canvas-block-handle');
  let dragging = false, offX = 0, offY = 0;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    el.classList.add('dragging');
    offX = e.clientX - el.offsetLeft;
    offY = e.clientY - el.offsetTop;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const novoX = e.clientX - offX;
    const novoY = e.clientY - offY;
    el.style.left = novoX + 'px';
    el.style.top = novoY + 'px';
    bloco.x = novoX;
    bloco.y = novoY;
  });
  handle.addEventListener('pointerup', () => {
    if (dragging) { dragging = false; el.classList.remove('dragging'); schedulePersonagemSave(); }
  });
}

function novoBlocoBase(tipo) {
  return { id: 'bl_' + Date.now() + '_' + Math.floor(Math.random() * 1000), tipo, x: 20, y: 20, conteudo: '' };
}

function adicionarBloco(bloco) {
  const p = personagemAtiva();
  if (!p) return;
  if (!p.blocos) p.blocos = [];
  bloco.x = 20 + (p.blocos.length * 18) % 200;
  bloco.y = 20 + (p.blocos.length * 18) % 200;
  p.blocos.push(bloco);
  criarElementoBloco(bloco);
  schedulePersonagemSave();
}

addBlocoTextoBtn.addEventListener('click', () => {
  if (!personagemAtiva()) { alert('Crie ou selecione um personagem primeiro.'); return; }
  adicionarBloco(novoBlocoBase('texto'));
});

addBlocoImagemBtn.addEventListener('click', () => {
  if (!personagemAtiva()) { alert('Crie ou selecione um personagem primeiro.'); return; }
  adicionarBloco(novoBlocoBase('imagem'));
});

function escolherImagem(blocoId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 900000) {
      alert('Imagem muito grande — escolha uma menor que 900KB por enquanto.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const p = personagemAtiva();
      const bloco = (p.blocos || []).find(b => b.id === blocoId);
      if (bloco) {
        bloco.conteudo = reader.result;
        renderCanvas();
        schedulePersonagemSave();
      }
    };
    reader.readAsDataURL(file);
  });
  input.click();
}

function removerBloco(blocoId) {
  const p = personagemAtiva();
  if (!p) return;
  p.blocos = (p.blocos || []).filter(b => b.id !== blocoId);
  renderCanvas();
  schedulePersonagemSave();
}

async function criarPersonagem() {
  if (!currentUser) {
    alert('Ainda não terminou de entrar — espera um instante e tenta de novo.');
    return;
  }
  const id = 'pj_' + Date.now();
  activePersonagemId = id;
  try {
    await setDoc(doc(personagensCollection(), id), {
      nome: 'Novo personagem',
      blocos: [],
      atualizadoEm: serverTimestamp()
    });
    personagemNomeInput.focus();
    personagemNomeInput.select();
  } catch (err) {
    activePersonagemId = null;
    if (err.code === 'permission-denied') {
      alert('Não foi possível salvar: este e-mail ainda não está liberado no banco de dados.');
    } else {
      alert('Não foi possível criar o personagem: ' + err.message);
    }
  }
}
newPersonagemBtn.addEventListener('click', criarPersonagem);

let personagemSaveTimeout = null;
function schedulePersonagemSave() {
  clearTimeout(personagemSaveTimeout);
  personagemSaveTimeout = setTimeout(salvarPersonagemAgora, 700);
}

async function salvarPersonagemAgora() {
  clearTimeout(personagemSaveTimeout);
  const p = personagemAtiva();
  if (!p || !currentUser) return;
  try {
    await setDoc(doc(personagensCollection(), p.id), {
      nome: personagemNomeInput.value,
      blocos: p.blocos || [],
      atualizadoEm: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    if (err.code === 'permission-denied') {
      alert('Não foi possível salvar: este e-mail ainda não está liberado no banco de dados.');
    }
  }
}
savePersonagemBtn.addEventListener('click', salvarPersonagemAgora);
personagemNomeInput.addEventListener('input', schedulePersonagemSave);

// ---------- Vínculo por clique direito ----------
const linkMenuEl = document.getElementById('link-menu');
const linkBuscaBoxEl = document.getElementById('link-busca-box');
const linkBuscaInputEl = document.getElementById('link-busca-input');
const linkSugestoesEl = document.getElementById('link-sugestoes');

let linkAlvoEl = null;
let linkAlvoRange = null;
let linkTipoAtual = 'personagem';

function abrirMenuLink(e, textEl, bloco) {
  const selecao = window.getSelection();
  if (!selecao || selecao.isCollapsed || !textEl.contains(selecao.anchorNode)) return;
  e.preventDefault();
  linkAlvoRange = selecao.getRangeAt(0).cloneRange();
  linkAlvoEl = textEl;
  linkAlvoEl._blocoRef = bloco;
  linkMenuEl.style.left = e.clientX + 'px';
  linkMenuEl.style.top = e.clientY + 'px';
  linkMenuEl.hidden = false;
  linkBuscaBoxEl.hidden = true;
}

linkMenuEl.querySelectorAll('.link-menu-item').forEach(item => {
  item.addEventListener('click', () => {
    linkTipoAtual = item.dataset.tipo;
    linkMenuEl.hidden = true;
    linkBuscaBoxEl.style.left = linkMenuEl.style.left;
    linkBuscaBoxEl.style.top = linkMenuEl.style.top;
    linkBuscaBoxEl.hidden = false;
    linkBuscaInputEl.value = linkAlvoRange ? linkAlvoRange.toString() : '';
    linkBuscaInputEl.focus();
    renderLinkSugestoes(linkBuscaInputEl.value);
  });
});

function renderLinkSugestoes(termo) {
  const fonte = linkTipoAtual === 'personagem' ? personagens : []; // cenários entram quando essa seção existir
  const encontrados = fonte.filter(item =>
    (item.nome || '').toLowerCase().includes(termo.toLowerCase())
  );
  linkSugestoesEl.innerHTML = '';
  if (linkTipoAtual === 'cenario') {
    const aviso = document.createElement('div');
    aviso.className = 'link-vazio';
    aviso.textContent = 'A seção de Cenários ainda não existe — volta aqui quando ela estiver pronta.';
    linkSugestoesEl.appendChild(aviso);
    return;
  }
  if (termo && encontrados.length === 0) {
    const vazio = document.createElement('div');
    vazio.className = 'link-vazio';
    vazio.textContent = 'Nada encontrado no banco.';
    linkSugestoesEl.appendChild(vazio);
    return;
  }
  encontrados.forEach(item => {
    const div = document.createElement('div');
    div.className = 'link-sugestao-item';
    div.textContent = item.nome;
    div.addEventListener('click', () => aplicarLink(item));
    linkSugestoesEl.appendChild(div);
  });
}

function aplicarLink(itemAlvo) {
  if (!linkAlvoRange || !linkAlvoEl) return;
  const span = document.createElement('span');
  span.className = 'texto-linkado';
  span.dataset.linkTipo = linkTipoAtual;
  span.dataset.linkId = itemAlvo.id;
  span.textContent = linkAlvoRange.toString();
  linkAlvoRange.deleteContents();
  linkAlvoRange.insertNode(span);

  const bloco = linkAlvoEl._blocoRef;
  if (bloco) {
    bloco.conteudo = linkAlvoEl.innerHTML;
    schedulePersonagemSave();
  }
  linkBuscaBoxEl.hidden = true;
}

linkBuscaInputEl.addEventListener('input', () => renderLinkSugestoes(linkBuscaInputEl.value));

document.addEventListener('click', (e) => {
  if (!linkMenuEl.contains(e.target)) linkMenuEl.hidden = true;
  if (!linkBuscaBoxEl.contains(e.target) && e.target !== linkBuscaInputEl) linkBuscaBoxEl.hidden = true;
});

// Clicar num texto já linkado abre o personagem correspondente
canvasAreaEl.addEventListener('click', (e) => {
  const span = e.target.closest('.texto-linkado');
  if (span && span.dataset.linkTipo === 'personagem') {
    activePersonagemId = span.dataset.linkId;
    renderPersonagemList();
    renderCanvas();
  }
});
