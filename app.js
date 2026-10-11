import { getRepo, listTree, getFile, putFile } from './github.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  owner: '',
  repo: '',
  branch: 'main',
  token: '',
  filePath: null,
  fileSha: null,
  mode: 'select',       // 'select' | 'text'
  selectedEl: null,
  originalHtml: ''
};

const STORAGE_KEY = 'opencanvas.session';

/* ---------------- Sesión ---------------- */
function saveSession() {
  const { owner, repo, branch, token } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, repo, branch, token }));
}
function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearSession() { localStorage.removeItem(STORAGE_KEY); }

/* ---------------- UI ---------------- */
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  t.hidden = false;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => (t.hidden = true), 2600);
}
function setLoginMsg(msg, kind = '') {
  const el = $('#login-msg');
  el.textContent = msg;
  el.className = 'msg ' + kind;
}

/* ---------------- Conexión ---------------- */
async function connect(silent = false) {
  const owner = $('#inp-owner').value.trim();
  const repo = $('#inp-repo').value.trim();
  const branch = $('#inp-branch').value.trim() || 'main';
  const token = $('#inp-token').value.trim();

  if (!owner || !repo || !token) {
    if (!silent) setLoginMsg('Completa todos los campos.', 'error');
    return false;
  }
  if (!silent) setLoginMsg('Conectando…');

  try {
    const info = await getRepo({ owner, repo, token });
    Object.assign(state, { owner, repo, branch, token });
    saveSession();
    if (!silent) setLoginMsg('✓ ' + info.full_name, 'ok');
    await enterEditor();
    return true;
  } catch (err) {
    if (!silent) setLoginMsg('Error: ' + err.message, 'error');
    return false;
  }
}

async function enterEditor() {
  $('#login').hidden = true;
  $('#editor').hidden = false;
  await loadFileList();
}

function logout() {
  clearSession();
  Object.assign(state, {
    owner: '', repo: '', branch: 'main', token: '',
    filePath: null, fileSha: null, selectedEl: null, originalHtml: ''
  });
  $('#editor').hidden = true;
  $('#login').hidden = false;
  $('#props').hidden = true;
  $('#inp-token').value = '';
  setLoginMsg('');
}

/* ---------------- Lista de archivos ---------------- */
async function loadFileList() {
  const tree = await listTree(state);
  const files = tree
    .filter((n) => /\.(html?)$/i.test(n.path))
    .sort((a, b) => {
      if (a.path === 'index.html') return -1;
      if (b.path === 'index.html') return 1;
      return a.path.localeCompare(b.path);
    });

  const select = $('#file-select');
  select.innerHTML = '';
  if (!files.length) {
    const o = document.createElement('option');
    o.textContent = '— no hay archivos HTML —';
    o.disabled = true;
    select.appendChild(o);
    return;
  }
  files.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.path;
    o.textContent = f.path;
    select.appendChild(o);
  });
  await openFile(files[0].path);
}

/* ---------------- Abrir archivo ---------------- */
async function openFile(path) {
  try {
    const { content, sha } = await getFile({ ...state, path });
    state.filePath = path;
    state.fileSha = sha;
    state.originalHtml = content;
    state.selectedEl = null;
    $('#props').hidden = true;
    renderHtml(content);
    toast('Cargado: ' + path, 'ok');
  } catch (err) {
    toast('Error al abrir: ' + err.message, 'error');
  }
}

/* ---------------- Render ---------------- */
function renderHtml(html) {
  const iframe = $('#preview');
  const doc = iframe.contentDocument;

  const baseUrl = `https://${state.owner}.github.io/${state.repo}/`;
  const baseTag = `<base href="${baseUrl}">`;

  let prepared;
  if (/<head[^>]*>/i.test(html)) {
    prepared = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  } else if (/<html[^>]*>/i.test(html)) {
    prepared = html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  } else {
    prepared = `<head>${baseTag}</head>${html}`;
  }

  doc.open();
  doc.write(prepared);
  doc.close();

  injectStyles(doc);
  installInspector(doc);
  setMode(state.mode);
}

function injectStyles(doc) {
  const style = doc.createElement('style');
  style.setAttribute('data-oc-injected', '');
  style.textContent = `
    .oc-hover { outline: 2px dashed #4c8bf5 !important; outline-offset: 2px !important; }
    .oc-selected { outline: 2px solid #4c8bf5 !important; outline-offset: 2px !important; }
    body.oc-select-mode { user-select: none !important; -webkit-user-select: none !important; }
    body.oc-select-mode * { cursor: move !important; }
    body.oc-select-mode a,
    body.oc-select-mode button,
    body.oc-select-mode input,
    body.oc-select-mode textarea { cursor: move !important; }
    body.oc-text-mode { cursor: text !important; }
    body.oc-text-mode * { cursor: text !important; }
  `;
  doc.head.appendChild(style);
}

/* ---------------- Inspector ---------------- */
function installInspector(doc) {
  let hoverEl = null;
  let dragging = null;
  let startX = 0, startY = 0, origX = 0, origY = 0;
  let dragStarted = false;

  const isEditable = (el) =>
    el && el.nodeType === 1 && el !== doc.body && el !== doc.documentElement;

  const clearHover = () => {
    if (hoverEl) hoverEl.classList.remove('oc-hover');
    hoverEl = null;
  };

  const select = (el) => {
    if (state.selectedEl) state.selectedEl.classList.remove('oc-selected');
    state.selectedEl = el;
    if (el) el.classList.add('oc-selected');
    updatePropsPanel(el);
  };

  /* Bloquear navegación de enlaces siempre */
  doc.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) e.preventDefault();
  }, true);

  /* HOVER (solo en modo select) */
  doc.addEventListener('mouseover', (e) => {
    if (state.mode !== 'select' || dragging) return;
    const el = e.target;
    if (!isEditable(el) || el === state.selectedEl) return;
    clearHover();
    hoverEl = el;
    el.classList.add('oc-hover');
  });
  doc.addEventListener('mouseout', () => {
    if (state.mode !== 'select') return;
    clearHover();
  });

  /* MOUSEDOWN */
  doc.addEventListener('mousedown', (e) => {
    const el = e.target;
    if (!isEditable(el)) return;

    if (state.mode === 'text') {
      // Modo texto: el navegador coloca el caret naturalmente.
      // Nada que hacer, designMode ya hace todo el trabajo.
      return;
    }

    // Modo select: preparar arrastre
    if (e.button !== 0) return;
    select(el);
    dragging = el;
    dragStarted = false;
    startX = e.clientX;
    startY = e.clientY;
    origX = parseFloat(el.dataset.ocX || '0');
    origY = parseFloat(el.dataset.ocY || '0');
  });

  /* MOUSEMOVE (arrastre) */
  doc.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragStarted) {
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      dragStarted = true;
      clearHover();
      dragging.style.willChange = 'transform';
    }
    e.preventDefault();
    const x = origX + dx;
    const y = origY + dy;
    dragging.dataset.ocX = x;
    dragging.dataset.ocY = y;
    dragging.style.transform = `translate(${x}px, ${y}px)`;
    updatePropsPanel(dragging);
  });

  /* MOUSEUP */
  doc.addEventListener('mouseup', () => {
    if (dragging) dragging.style.willChange = '';
    dragging = null;
    dragStarted = false;
  });

  /* DOBLE CLIC en modo select → entrar a modo texto donde se hizo clic */
  doc.addEventListener('dblclick', (e) => {
    if (state.mode !== 'select') return;
    const el = e.target;
    if (!isEditable(el)) return;
    e.preventDefault();
    setMode('text');
    // Colocar el cursor donde se hizo doble clic
    setTimeout(() => {
      try {
        const range = doc.caretRangeFromPoint
          ? doc.caretRangeFromPoint(e.clientX, e.clientY)
          : null;
        if (range) {
          const sel = doc.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch {}
    }, 0);
  });

  /* TECLADO */
  doc.addEventListener('keydown', (e) => {
    // Escape sale del modo texto
    if (e.key === 'Escape' && state.mode === 'text') {
      setMode('select');
      return;
    }
    // En modo texto no interceptamos nada más (dejar escribir normal)
    if (state.mode === 'text') return;

    if (!state.selectedEl) return;
    const step = e.shiftKey ? 10 : 1;
    let dx = 0, dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      state.selectedEl.remove();
      select(null);
      return;
    } else return;
    e.preventDefault();
    const el = state.selectedEl;
    const x = parseFloat(el.dataset.ocX || '0') + dx;
    const y = parseFloat(el.dataset.ocY || '0') + dy;
    el.dataset.ocX = x;
    el.dataset.ocY = y;
    el.style.transform = `translate(${x}px, ${y}px)`;
    updatePropsPanel(el);
  });
}

/* ---------------- Panel de propiedades ---------------- */
function updatePropsPanel(el) {
  const panel = $('#props');
  if (!el) { panel.hidden = true; return; }
  panel.hidden = false;

  // No sobreescribir el campo que el usuario está editando
  const focused = document.activeElement;
  const fid = focused ? focused.id : null;

  $('#props-title').textContent = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');

  const ta = $('#prop-text');
  const isSimple = el.children.length === 0;
  ta.disabled = !isSimple;
  if (fid !== 'prop-text') {
    ta.value = isSimple ? el.textContent : '(elemento con hijos)';
  }

  if (fid !== 'prop-x') $('#prop-x').value = Math.round(parseFloat(el.dataset.ocX || '0'));
  if (fid !== 'prop-y') $('#prop-y').value = Math.round(parseFloat(el.dataset.ocY || '0'));

  const rect = el.getBoundingClientRect();
  if (fid !== 'prop-w') $('#prop-w').value = Math.round(rect.width);
  if (fid !== 'prop-h') $('#prop-h').value = Math.round(rect.height);

  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  if (fid !== 'prop-bg') $('#prop-bg').value = rgbToHex(cs.backgroundColor);
  if (fid !== 'prop-color') $('#prop-color').value = rgbToHex(cs.color);
}

function rgbToHex(rgb) {
  if (!rgb) return '#ffffff';
  const m = rgb.match(/\d+/g);
  if (!m) return '#ffffff';
  if (rgb.includes('rgba(0, 0, 0, 0)')) return '#ffffff';
  return '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
}

function bindPropsEvents() {
  const sel = () => state.selectedEl;

  $('#prop-text').oninput = (e) => {
    const el = sel();
    if (!el || el.children.length > 0) return;
    el.textContent = e.target.value;
  };
  $('#prop-x').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.dataset.ocX = e.target.value;
    const x = parseFloat(el.dataset.ocX || '0');
    const y = parseFloat(el.dataset.ocY || '0');
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
  $('#prop-y').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.dataset.ocY = e.target.value;
    const x = parseFloat(el.dataset.ocX || '0');
    const y = parseFloat(el.dataset.ocY || '0');
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
  $('#prop-w').oninput = (e) => { const el = sel(); if (el) el.style.width = e.target.value + 'px'; };
  $('#prop-h').oninput = (e) => { const el = sel(); if (el) el.style.height = e.target.value + 'px'; };
  $('#prop-bg').oninput = (e) => { const el = sel(); if (el) el.style.backgroundColor = e.target.value; };
  $('#prop-color').oninput = (e) => { const el = sel(); if (el) el.style.color = e.target.value; };
  $('#prop-delete').onclick = () => {
    const el = sel(); if (!el) return;
    el.remove();
    state.selectedEl = null;
    $('#props').hidden = true;
  };
  $('#props-close').onclick = () => {
    if (state.selectedEl) state.selectedEl.classList.remove('oc-selected');
    state.selectedEl = null;
    $('#props').hidden = true;
  };
}

/* ---------------- Modo ---------------- */
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.tool').forEach((b) => b.classList.remove('active'));
  $(mode === 'select' ? '#btn-select' : '#btn-text').classList.add('active');

  const doc = $('#preview').contentDocument;
  if (!doc || !doc.body) return;

  if (mode === 'text') {
    // Modo texto: designMode hace todo el documento editable.
    // El caret se coloca donde el usuario hace clic, de forma natural.
    doc.designMode = 'on';
    doc.body.classList.add('oc-text-mode');
    doc.body.classList.remove('oc-select-mode');

    // Deseleccionar y ocultar panel en modo texto
    $('#props').hidden = true;
    if (state.selectedEl) {
      state.selectedEl.classList.remove('oc-selected');
      state.selectedEl = null;
    }
  } else {
    doc.designMode = 'off';
    doc.body.classList.remove('oc-text-mode');
    doc.body.classList.add('oc-select-mode');
  }
}

/* ---------------- Guardar ---------------- */
async function save() {
  if (!state.filePath) return;
  const doc = $('#preview').contentDocument;
  let newContent = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;

  // Limpieza de todo lo que inyectamos
  newContent = newContent
    .replace(/<base[^>]*>\s*/i, '')
    .replace(/<style[^>]*data-oc-injected[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/\s*\boc-hover\b/g, '')
    .replace(/\s*\boc-selected\b/g, '')
    .replace(/\s*\boc-dragging\b/g, '')
    .replace(/\s*\boc-text-mode\b/g, '')
    .replace(/\s*\boc-select-mode\b/g, '')
    .replace(/\s*contenteditable="true"/g, '')
    .replace(/\s*contenteditable="false"/g, '')
    .replace(/\s*data-oc-x="[^"]*"/g, '')
    .replace(/\s*data-oc-y="[^"]*"/g, '')
    .replace(/\s*style="will-change: transform;?"/g, '');

  $('#btn-save').disabled = true;
  try {
    const res = await putFile({ ...state, path: state.filePath, content: newContent });
    state.fileSha = res.content.sha;
    state.originalHtml = newContent;
    toast('Guardado ✓', 'ok');
  } catch (err) {
    toast('Error al guardar: ' + err.message, 'error');
  } finally {
    $('#btn-save').disabled = false;
  }
}

/* ---------------- Eventos ---------------- */
$('#btn-connect').onclick = () => connect(false);
$('#btn-logout').onclick = logout;
$('#btn-save').onclick = save;
$('#btn-reload').onclick = () => state.filePath && openFile(state.filePath);
$('#btn-select').onclick = () => setMode('select');
$('#btn-text').onclick = () => setMode('text');
$('#btn-undo').onclick = () => { if (state.originalHtml) renderHtml(state.originalHtml); };
$('#file-select').onchange = (e) => openFile(e.target.value);
bindPropsEvents();

/* ---------------- Arranque ---------------- */
(async function boot() {
  const session = loadSession();
  if (session && session.token) {
    Object.assign(state, session);
    $('#inp-owner').value = session.owner;
    $('#inp-repo').value = session.repo;
    $('#inp-branch').value = session.branch;
    $('#inp-token').value = session.token;
    const ok = await connect(true);
    if (!ok) setLoginMsg('La sesión guardada ya no es válida. Vuelve a conectar.', 'error');
  }
})();
