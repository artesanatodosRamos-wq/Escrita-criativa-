import { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-init.js?v=12';
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
let interagindoComBloco = false;

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
    // Só recarrega o canvas se ele não estiver em uso agora —
    // evita clonar blocos enquanto você arrasta ou redimensiona.
    const estaEditando = document.activeElement === personagemNomeInput ||
      (document.activeElement && document.activeElement.closest && document.activeElement.closest('.canvas-block-text'));
    if (!estaEditando && !interagindoComBloco) {
      renderCanvas();
    }
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
  const areaW = canvasAreaEl.clientWidth || 600;
  const areaH = canvasAreaEl.clientHeight || 420;
  const larguraEstimada = bloco.w || 150;
  const alturaEstimada = bloco.h || 110;
  const xSeguro = Math.min(Math.max(0, bloco.x || 20), Math.max(0, areaW - larguraEstimada));
  const ySeguro = Math.min(Math.max(0, bloco.y || 20), Math.max(0, areaH - alturaEstimada));
  bloco.x = xSeguro;
  bloco.y = ySeguro;
  el.style.left = xSeguro + 'px';
  el.style.top = ySeguro + 'px';
  if (bloco.w) el.style.width = bloco.w + 'px';
  if (bloco.h) el.style.height = bloco.h + 'px';
  el.dataset.id = bloco.id;

  const handle = document.createElement('div');
  handle.className = 'canvas-block-handle';
  handle.innerHTML = '<span>' + (bloco.tipo === 'imagem' ? 'imagem' : 'texto') + '</span>';

  const actions = document.createElement('div');
  actions.className = 'canvas-block-handle-actions';

  const maisBtn = document.createElement('button');
  maisBtn.className = 'canvas-block-layer-btn';
  maisBtn.textContent = '+';
  maisBtn.title = 'Aumentar';
  maisBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  maisBtn.addEventListener('click', (e) => { e.stopPropagation(); ajustarTamanho(bloco.id, 24); });

  const menosBtn = document.createElement('button');
  menosBtn.className = 'canvas-block-layer-btn';
  menosBtn.textContent = '−';
  menosBtn.title = 'Diminuir';
  menosBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  menosBtn.addEventListener('click', (e) => { e.stopPropagation(); ajustarTamanho(bloco.id, -24); });

  actions.appendChild(maisBtn);
  actions.appendChild(menosBtn);

  const frenteBtn = document.createElement('button');
  frenteBtn.className = 'canvas-block-layer-btn';
  frenteBtn.textContent = '▲';
  frenteBtn.title = 'Trazer para frente';
  frenteBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  frenteBtn.addEventListener('click', (e) => { e.stopPropagation(); moverCamada(bloco.id, 'frente'); });

  const fundoBtn = document.createElement('button');
  fundoBtn.className = 'canvas-block-layer-btn';
  fundoBtn.textContent = '▼';
  fundoBtn.title = 'Enviar para trás';
  fundoBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  fundoBtn.addEventListener('click', (e) => { e.stopPropagation(); moverCamada(bloco.id, 'fundo'); });

  actions.appendChild(frenteBtn);
  actions.appendChild(fundoBtn);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'canvas-block-remove';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remover bloco';
  removeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removerBloco(bloco.id);
  });
  actions.appendChild(removeBtn);
  handle.appendChild(actions);
  el.appendChild(handle);

  if (bloco.tipo === 'imagem') {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'canvas-block-image';
    if (bloco.conteudo) {
      const img = document.createElement('img');
      img.src = bloco.conteudo;
      img.draggable = false;
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
  tornarRedimensionavel(el, bloco);
  canvasAreaEl.appendChild(el);
}

function tornarRedimensionavel(el, bloco) {
  const alca = document.createElement('div');
  alca.className = 'canvas-resize-handle';
  el.appendChild(alca);

  let redimensionando = false, startX = 0, startY = 0, startW = 0, startH = 0;
  alca.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    redimensionando = true;
    interagindoComBloco = true;
    startX = e.clientX;
    startY = e.clientY;
    startW = el.offsetWidth;
    startH = el.offsetHeight;
    alca.setPointerCapture(e.pointerId);
  });
  alca.addEventListener('pointermove', (e) => {
    if (!redimensionando) return;
    const novaW = Math.max(120, startW + (e.clientX - startX));
    const novaH = Math.max(60, startH + (e.clientY - startY));
    el.style.width = novaW + 'px';
    el.style.height = novaH + 'px';
    bloco.w = novaW;
    bloco.h = novaH;
  });
  alca.addEventListener('pointerup', () => {
    if (redimensionando) { redimensionando = false; schedulePersonagemSave(); }
    interagindoComBloco = false;
  });
}

function ajustarTamanho(blocoId, delta) {
  const p = personagemAtiva();
  if (!p) return;
  const bloco = (p.blocos || []).find(b => b.id === blocoId);
  if (!bloco) return;
  const elAtual = canvasAreaEl.querySelector('[data-id="' + blocoId + '"]');
  const larguraAtual = bloco.w || (elAtual ? elAtual.offsetWidth : 150);
  const alturaAtual = bloco.h || (elAtual ? elAtual.offsetHeight : 110);
  bloco.w = Math.max(90, larguraAtual + delta);
  bloco.h = Math.max(60, alturaAtual + Math.round(delta * 0.7));
  renderCanvas();
  schedulePersonagemSave();
}

function moverCamada(blocoId, direcao) {
  const p = personagemAtiva();
  if (!p || !p.blocos) return;
  const idx = p.blocos.findIndex(b => b.id === blocoId);
  if (idx === -1) return;
  const [bloco] = p.blocos.splice(idx, 1);
  if (direcao === 'frente') {
    p.blocos.push(bloco); // vai para o fim do array = renderizado por último = fica visualmente por cima
  } else {
    p.blocos.unshift(bloco); // vai para o início = renderizado primeiro = fica visualmente por baixo
  }
  renderCanvas();
  schedulePersonagemSave();
}

function tornarArrastavel(el, bloco) {
  const handle = el.querySelector('.canvas-block-handle');
  let dragging = false, offX = 0, offY = 0;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true;
    interagindoComBloco = true;
    el.classList.add('dragging');
    offX = e.clientX - el.offsetLeft;
    offY = e.clientY - el.offsetTop;
    handle.setPointerCapture(e.pointerId);
  });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const larguraBloco = el.offsetWidth;
    const alturaBloco = el.offsetHeight;
    const maxX = Math.max(0, canvasAreaEl.clientWidth - larguraBloco);
    const maxY = Math.max(0, canvasAreaEl.clientHeight - alturaBloco);
    const novoX = Math.min(maxX, Math.max(0, e.clientX - offX));
    const novoY = Math.min(maxY, Math.max(0, e.clientY - offY));
    el.style.left = novoX + 'px';
    el.style.top = novoY + 'px';
    bloco.x = novoX;
    bloco.y = novoY;
  });
  handle.addEventListener('pointerup', () => {
    if (dragging) { dragging = false; el.classList.remove('dragging'); schedulePersonagemSave(); }
    interagindoComBloco = false;
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

function comprimirImagem(file, maxDim, qualidade) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = Math.round(height * (maxDim / width));
        width = maxDim;
      } else if (height > maxDim) {
        width = Math.round(width * (maxDim / height));
        height = maxDim;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', qualidade),
        width,
        height
      });
    };
    img.onerror = reject;
    img.src = url;
  });
}

function escolherImagem(blocoId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      let resultado = await comprimirImagem(file, 900, 0.72);
      // Se ainda ficar grande, comprime mais uma vez, menor e com mais qualidade reduzida
      if (resultado.dataUrl.length > 900000) {
        resultado = await comprimirImagem(file, 600, 0.55);
      }
      const p = personagemAtiva();
      const bloco = (p.blocos || []).find(b => b.id === blocoId);
      if (bloco) {
        bloco.conteudo = resultado.dataUrl;

        // Calcula um tamanho de exibição que sempre cabe na área, mantendo a proporção da foto
        const areaW = canvasAreaEl.clientWidth || 600;
        const areaH = canvasAreaEl.clientHeight || 420;
        const alturaHandle = 28; // espaço ocupado pelo cabeçalho do bloco
        const maxCaixaW = Math.min(280, areaW - 24);
        const maxCaixaH = Math.min(280, areaH - 24 - alturaHandle);
        const proporcao = resultado.width / resultado.height;
        let novaW = maxCaixaW;
        let novaH = Math.round(novaW / proporcao) + alturaHandle;
        if (novaH > maxCaixaH + alturaHandle) {
          novaH = maxCaixaH + alturaHandle;
          novaW = Math.round((novaH - alturaHandle) * proporcao);
        }
        bloco.w = novaW;
        bloco.h = novaH;
        bloco.x = Math.max(0, Math.round((areaW - novaW) / 2));
        bloco.y = Math.max(0, Math.round((areaH - novaH) / 2));

        renderCanvas();
        schedulePersonagemSave();
      }
    } catch (err) {
      alert('Não foi possível processar essa imagem.');
    }
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
  linkAlvoEl._blocoRef = bloco || null;
  const x = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0;
  const y = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0;
  linkMenuEl.style.left = x + 'px';
  linkMenuEl.style.top = y + 'px';
  linkMenuEl.hidden = false;
  linkBuscaBoxEl.hidden = true;
}

// Também disponível na área de Escritos: selecionar um texto e clicar com o
// botão direito (ou tocar e segurar no celular) abre o mesmo menu de vínculo.
editorEl.addEventListener('contextmenu', (e) => abrirMenuLink(e, editorEl, null));

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
  } else if (linkAlvoEl === editorEl) {
    updateWordCount();
    scheduleSave();
  }
  linkBuscaBoxEl.hidden = true;
}

linkBuscaInputEl.addEventListener('input', () => renderLinkSugestoes(linkBuscaInputEl.value));

document.addEventListener('click', (e) => {
  if (!linkMenuEl.contains(e.target)) linkMenuEl.hidden = true;
  if (!linkBuscaBoxEl.contains(e.target) && e.target !== linkBuscaInputEl) linkBuscaBoxEl.hidden = true;
});

function irParaPersonagemLinkado(id) {
  activePersonagemId = id;
  const btn = document.querySelector('.icon-btn[data-section="personagens"]');
  if (btn) btn.click();
  renderPersonagemList();
  renderCanvas();
}

// Clicar num texto já linkado abre o personagem correspondente
canvasAreaEl.addEventListener('click', (e) => {
  const span = e.target.closest('.texto-linkado');
  if (span && span.dataset.linkTipo === 'personagem') {
    irParaPersonagemLinkado(span.dataset.linkId);
  }
});

editorEl.addEventListener('click', (e) => {
  const span = e.target.closest('.texto-linkado');
  if (span && span.dataset.linkTipo === 'personagem') {
    irParaPersonagemLinkado(span.dataset.linkId);
  }
});
