import { getRepo, listTree, getFile, putFile } from './github.js';

const $ = (sel) => document.querySelector(sel);

/* --- estado --- */
const state = {
  owner: '',
  repo: '',
  branch: 'main',
  token: '',
  filePath: null,
  fileSha: null
};

/* --- persistencia de sesión --- */
const STORAGE_KEY = 'opencanvas.session';

function saveSession() {
  const { owner, repo, branch, token } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, repo, branch, token }));
}
function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

/* --- UI helpers --- */
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2600);
}
function setConnectMsg(msg, kind = '') {
  const el = $('#connect-msg');
  el.textContent = msg;
  el.className = 'msg ' + kind;
}

/* --- conexión --- */
async function connect() {
  const owner = $('#inp-owner').value.trim();
  const repo = $('#inp-repo').value.trim();
  const branch = $('#inp-branch').value.trim() || 'main';
  const token = $('#inp-token').value.trim();

  if (!owner || !repo || !token) {
    setConnectMsg('Completa usuario, repositorio y token.', 'error');
    return;
  }

  setConnectMsg('Conectando…');
  try {
    const info = await getRepo({ owner, repo, token });
    Object.assign(state, { owner, repo, branch, token });
    saveSession();
    setConnectMsg(`Conectado a ${info.full_name}`, 'ok');
    await enterEditor();
  } catch (err) {
    setConnectMsg('Error: ' + err.message, 'error');
  }
}

async function enterEditor() {
  $('#connect-panel').hidden = true;
  $('#editor-panel').hidden = false;
  $('#btn-logout').hidden = false;
  $('#btn-reload').disabled = false;
  await renderTree();
}

function logout() {
  clearSession();
  Object.assign(state, { owner: '', repo: '', branch: 'main', token: '', filePath: null, fileSha: null });
  $('#editor-panel').hidden = true;
  $('#connect-panel').hidden = false;
  $('#btn-logout').hidden = true;
  $('#btn-reload').disabled = true;
  $('#btn-save').disabled = true;
  $('#file-tree').innerHTML = '';
  $('#current-file').textContent = '— sin archivo —';
  $('#preview').srcdoc = '';
}

/* --- árbol de archivos --- */
async function renderTree() {
  const tree = await listTree(state);
  const ul = $('#file-tree');
  ul.innerHTML = '';
  const editableExt = /\.(html?|md|css|js|json|txt)$/i;

  tree
    .filter((n) => editableExt.test(n.path))
    .sort((a, b) => a.path.localeCompare(b.path))
    .forEach((node) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="icon">${iconFor(node.path)}</span>${node.path}`;
      li.title = node.path;
      li.onclick = () => openFile(node.path);
      li.dataset.path = node.path;
      ul.appendChild(li);
    });
}

function iconFor(path) {
  if (path.endsWith('.html') || path.endsWith('.htm')) return '📄';
  if (path.endsWith('.css')) return '🎨';
  if (path.endsWith('.js')) return '⚙️';
  if (path.endsWith('.md')) return '📝';
  if (path.endsWith('.json')) return '🧩';
  return '📁';
}

/* --- abrir archivo --- */
async function openFile(path) {
  try {
    const { content, sha } = await getFile({ ...state, path });
    state.filePath = path;
    state.fileSha = sha;

    // marcar activo
    document.querySelectorAll('#file-tree li').forEach((li) => {
      li.classList.toggle('active', li.dataset.path === path);
    });
    $('#current-file').textContent = path;
    $('#btn-save').disabled = false;

    if (path.endsWith('.html') || path.endsWith('.htm')) {
      renderHtml(content);
    } else {
      renderText(content);
    }
  } catch (err) {
    toast('Error al abrir: ' + err.message, 'error');
  }
}

/* Renderiza HTML en el iframe con contenteditable */
function renderHtml(html) {
  const iframe = $('#preview');
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();

  // base para que recursos relativos funcionen
  const base = doc.createElement('base');
  base.href = `https://${state.owner}.github.io/${state.repo}/`;
  doc.head.appendChild(base);

  applyEditMode();

  // evita que se navegue al hacer clic en enlaces
  doc.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) e.preventDefault();
  });
}

function renderText(text) {
  const iframe = $('#preview');
  const doc = iframe.contentDocument;
  doc.open();
  const escaped = text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  doc.write(`<pre style="padding:16px;font:13px/1.6 ui-monospace,Consolas,monospace;white-space:pre-wrap;">${escaped}</pre>`);
  doc.close();
  applyEditMode();
}

function applyEditMode() {
  const editable = $('#chk-editable').checked;
  const doc = $('#preview').contentDocument;
  if (!doc || !doc.body) return;
  // Solo activamos edición en archivos HTML
  const isHtml = state.filePath?.match(/\.html?$/i);
  doc.body.contentEditable = editable && isHtml ? 'true' : 'false';
  doc.body.style.outline = 'none';
}

/* --- guardar --- */
async function save() {
  if (!state.filePath) return;
  const doc = $('#preview').contentDocument;
  let newContent;

  if (state.filePath.match(/\.html?$/i)) {
    newContent = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    // limpia la etiqueta <base> que inyectamos
    newContent = newContent.replace(/<base[^>]*>\s*/i, '');
  } else {
    newContent = doc.body.innerText;
  }

  $('#btn-save').disabled = true;
  try {
    const res = await putFile({ ...state, path: state.filePath, content: newContent });
    state.fileSha = res.content.sha;
    toast('Guardado ✓', 'ok');
  } catch (err) {
    toast('Error al guardar: ' + err.message, 'error');
  } finally {
    $('#btn-save').disabled = false;
  }
}

/* --- eventos --- */
$('#btn-connect').onclick = connect;
$('#btn-logout').onclick = logout;
$('#btn-save').onclick = save;
$('#btn-reload').onclick = () => state.filePath && openFile(state.filePath);
$('#chk-editable').onchange = applyEditMode;

/* --- autoarranque --- */
(function boot() {
  const session = loadSession();
  if (session && session.token) {
    Object.assign(state, session);
    $('#inp-owner').value = session.owner;
    $('#inp-repo').value = session.repo;
    $('#inp-branch').value = session.branch;
    $('#inp-token').value = session.token;
    setConnectMsg('Sesión guardada detectada. Pulsa Conectar.', '');
  }
})();
