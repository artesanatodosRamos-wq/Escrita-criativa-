import { auth, db, provider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from './firebase-init.js?v=3';
import {
  collection, doc, setDoc, onSnapshot, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// ---------- Elementos ----------
const loginGate = document.getElementById('login-gate');
const appShell = document.getElementById('app-shell');
const logoutBtn = document.getElementById('logout-btn');
const loginBtn2 = document.getElementById('login-btn-2');
const topbarStatus = document.getElementById('topbar-status');

let currentUser = null;
let unsubscribeChapters = null;

// ---------- Login / Logout ----------
function doLogin() {
  signInWithRedirect(auth, provider);
}
getRedirectResult(auth).catch(err => {
  alert('Não foi possível entrar: ' + err.message);
});
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
  } else {
    loginGate.hidden = false;
    appShell.hidden = true;
    logoutBtn.hidden = true;
    topbarStatus.textContent = '';
    if (unsubscribeChapters) unsubscribeChapters();
    chapters = [];
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
