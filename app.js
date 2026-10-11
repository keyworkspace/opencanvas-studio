import { getRepo, listTree, getFile, putFile, deleteFile } from './github.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  owner: '', repo: '', branch: 'main', token: '',
  filePath: null, fileSha: null,
  mode: 'select',
  selectedEl: null,
  originalHtml: '',
  files: [], navLinks: [], loading: false,
  suppressHistory: false
};

const STORAGE_KEY = 'opencanvas.session';

/* ---------------- Animaciones disponibles ---------------- */
const ANIMATIONS = {
  'fade-in':     { label: 'Fade In',     name: 'oc-fadeIn',    kf: '@keyframes oc-fadeIn{from{opacity:0}to{opacity:1}}' },
  'slide-up':    { label: 'Slide Up',    name: 'oc-slideUp',   kf: '@keyframes oc-slideUp{from{opacity:0;transform:translate(var(--oc-tx,0px),calc(var(--oc-ty,0px) + 40px))}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px))}}' },
  'slide-down':  { label: 'Slide Down',  name: 'oc-slideDown', kf: '@keyframes oc-slideDown{from{opacity:0;transform:translate(var(--oc-tx,0px),calc(var(--oc-ty,0px) - 40px))}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px))}}' },
  'slide-left':  { label: 'Slide Left',  name: 'oc-slideLeft', kf: '@keyframes oc-slideLeft{from{opacity:0;transform:translate(calc(var(--oc-tx,0px) + 40px),var(--oc-ty,0px))}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px))}}' },
  'slide-right': { label: 'Slide Right', name: 'oc-slideRight',kf: '@keyframes oc-slideRight{from{opacity:0;transform:translate(calc(var(--oc-tx,0px) - 40px),var(--oc-ty,0px))}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px))}}' },
  'zoom-in':     { label: 'Zoom In',     name: 'oc-zoomIn',    kf: '@keyframes oc-zoomIn{from{opacity:0;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(.85)}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(1)}}' },
  'bounce-in':   { label: 'Bounce In',   name: 'oc-bounceIn',  kf: '@keyframes oc-bounceIn{0%{opacity:0;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(.3)}50%{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(1.05)}70%{transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(.95)}100%{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(1)}}' },
  'rotate-in':   { label: 'Rotate In',   name: 'oc-rotateIn',  kf: '@keyframes oc-rotateIn{from{opacity:0;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) rotate(-180deg)}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) rotate(0)}}' },
  'flip-in':     { label: 'Flip In',     name: 'oc-flipIn',    kf: '@keyframes oc-flipIn{from{opacity:0;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) rotateY(90deg)}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) rotateY(0)}}' },
  'pulse':       { label: 'Pulse (loop)',name: 'oc-pulse',     kf: '@keyframes oc-pulse{0%,100%{opacity:1}50%{opacity:.5}}', loop: true }
};

/* ---------------- Sesión ---------------- */
function saveSession() {
  const { owner, repo, branch, token } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, repo, branch, token }));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
function clearSession() { localStorage.removeItem(STORAGE_KEY); }

/* ---------------- UI helpers ---------------- */
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(t._timer); t._timer = setTimeout(() => (t.hidden = true), 3200);
}
function setLoginMsg(msg, kind = '') {
  const el = $('#login-msg'); el.textContent = msg; el.className = 'msg ' + kind;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function rgbToHex(rgb) {
  if (!rgb) return '#ffffff';
  if (rgb.includes('rgba(0, 0, 0, 0)')) return '#ffffff';
  const m = rgb.match(/\d+/g);
  if (!m) return '#ffffff';
  return '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
}

/* ---------------- Undo / Redo ---------------- */
const history = { stack: [], index: -1, max: 60 };

function initHistory(html) {
  history.stack = [html];
  history.index = 0;
  updateHistoryButtons();
}
function pushHistory(html) {
  if (state.suppressHistory) return;
  history.stack = history.stack.slice(0, history.index + 1);
  history.stack.push(html);
  if (history.stack.length > history.max) history.stack.shift();
  history.index = history.stack.length - 1;
  updateHistoryButtons();
}
function undo() {
  if (history.index <= 0) { toast('Nada que deshacer'); return; }
  history.index--;
  restoreHistory();
}
function redo() {
  if (history.index >= history.stack.length - 1) { toast('Nada que rehacer'); return; }
  history.index++;
  restoreHistory();
}
function restoreHistory() {
  const html = history.stack[history.index];
  state.suppressHistory = true;
  clearSelection();
  renderHtml(html);
  updateHistoryButtons();
  setTimeout(() => { state.suppressHistory = false; }, 250);
}
function updateHistoryButtons() {
  $('#btn-undo').disabled = history.index <= 0;
  $('#btn-redo').disabled = history.index >= history.stack.length - 1;
}
let _snapTimer = null;
function scheduleSnapshot() {
  clearTimeout(_snapTimer);
  _snapTimer = setTimeout(() => snapshotNow(), 400);
}
function snapshotNow() {
  clearTimeout(_snapTimer);
  if (state.suppressHistory || !state.filePath) return;
  const html = serializeCurrentIframe();
  pushHistory(html);
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
  await refreshFileList();
  if (state.files.length && !state.filePath) await openFile(state.files[0].path);
}

function logout() {
  clearSession();
  Object.assign(state, {
    owner: '', repo: '', branch: 'main', token: '',
    filePath: null, fileSha: null, selectedEl: null, originalHtml: '',
    files: [], navLinks: [], loading: false
  });
  history.stack = []; history.index = -1;
  $('#editor').hidden = true;
  $('#login').hidden = false;
  $('#props').hidden = true;
  $('#inp-token').value = '';
  setLoginMsg('');
}

/* ---------------- Lista de archivos ---------------- */
async function refreshFileList() {
  const tree = await listTree(state);
  state.files = tree
    .filter((n) => /\.(html?)$/i.test(n.path))
    .sort((a, b) => {
      if (a.path === 'index.html') return -1;
      if (b.path === 'index.html') return 1;
      return a.path.localeCompare(b.path);
    });
  renderSidebar();
  renderFileSelect();
}
function renderSidebar() {
  const ul = $('#pages-list'); ul.innerHTML = '';
  state.files.forEach((f) => {
    const li = document.createElement('li');
    if (f.path === state.filePath) li.classList.add('active');
    li.innerHTML = `<span class="name" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span><button class="del" title="Eliminar">✕</button>`;
    li.onclick = () => { if (state.loading || f.path === state.filePath) return; openFile(f.path); };
    li.querySelector('.del').onclick = (e) => { e.stopPropagation(); deletePage(f.path); };
    ul.appendChild(li);
  });
}
function renderFileSelect() {
  const select = $('#file-select'); select.innerHTML = '';
  if (!state.files.length) {
    const o = document.createElement('option');
    o.textContent = '— no hay archivos HTML —'; o.disabled = true; select.appendChild(o); return;
  }
  state.files.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.path; o.textContent = f.path;
    if (f.path === state.filePath) o.selected = true;
    select.appendChild(o);
  });
}

/* ---------------- Abrir archivo ---------------- */
async function openFile(path) {
  if (state.loading) return;
  state.loading = true;
  try {
    state.mode = 'select';
    const { content, sha } = await getFile({ ...state, path });
    state.filePath = path; state.fileSha = sha; state.originalHtml = content;
    clearSelection();
    renderSidebar(); renderFileSelect();
    renderHtml(content, () => initHistory(content));
    toast('Cargado: ' + path, 'ok');
  } catch (err) {
    toast('Error al abrir: ' + err.message, 'error');
  } finally { state.loading = false; }
}

/* ---------------- Render ---------------- */
function renderHtml(html, onDone) {
  const iframe = $('#preview');
  const baseUrl = `https://${state.owner}.github.io/${state.repo}/`;
  const baseTag = `<base href="${baseUrl}">`;
  let prepared;
  if (/<head[^>]*>/i.test(html)) prepared = html.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
  else if (/<html[^>]*>/i.test(html)) prepared = html.replace(/<html([^>]*)>/i, `<html$1><head>${baseTag}</head>`);
  else prepared = `<head>${baseTag}</head>${html}`;

  const handler = () => {
    iframe.removeEventListener('load', handler);
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;
    doc.body.classList.add('oc-editing');
    injectStyles(doc);
    ensureRuntimeStyles(doc);
    createHandleLayer(doc);
    installInspector(doc);
    setMode(state.mode);
    if (onDone) onDone();
  };
  iframe.addEventListener('load', handler);
  iframe.srcdoc = prepared;
}

function injectStyles(doc) {
  const style = doc.createElement('style');
  style.setAttribute('data-oc-injected', '');
  style.textContent = `
    .oc-hover { outline: 2px dashed #4c8bf5 !important; outline-offset: 2px !important; }
    .oc-selected { outline: 2px solid #4c8bf5 !important; outline-offset: 2px !important; }
    body.oc-select-mode { user-select: none !important; -webkit-user-select: none !important; }
    body.oc-select-mode * { cursor: move !important; }
    body.oc-text-mode, body.oc-text-mode * { cursor: text !important; }
    body.oc-editing [class*="oc-anim-"] { animation: none !important; }
  `;
  doc.head.appendChild(style);
}

/* Runtime style: keyframes + class rules (persistente) */
function buildRuntimeCss(usedKeys) {
  const kfs = [];
  const cls = [];
  usedKeys.forEach((key) => {
    const a = ANIMATIONS[key];
    if (!a) return;
    kfs.push(a.kf);
    const iter = a.loop ? 'infinite' : '1';
    cls.push(`.oc-anim-${key}{animation:${a.name} var(--oc-dur,600ms) ease var(--oc-delay,0ms) ${iter} both;}`);
  });
  return [...kfs, ...cls].join('\n');
}

function ensureRuntimeStyles(doc) {
  const used = new Set();
  doc.querySelectorAll('[class*="oc-anim-"]').forEach((el) => {
    [...el.classList].forEach((c) => {
      if (c.startsWith('oc-anim-')) used.add(c.slice('oc-anim-'.length));
    });
  });
  let style = doc.getElementById('oc-runtime');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'oc-runtime';
    doc.head.appendChild(style);
  }
  style.textContent = buildRuntimeCss(used);
}

/* ---------------- Handles ---------------- */
const HANDLE_SIZE = 12;
function createHandleLayer(doc) {
  if (doc.getElementById('oc-handle-layer')) return;
  const layer = doc.createElement('div');
  layer.id = 'oc-handle-layer';
  layer.setAttribute('data-oc-injected', '');
  layer.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647;';
  const dirs = ['nw','n','ne','e','se','s','sw','w'];
  const cursors = { nw:'nwse-resize', n:'ns-resize', ne:'nesw-resize', e:'ew-resize', se:'nwse-resize', s:'ns-resize', sw:'nesw-resize', w:'ew-resize' };
  dirs.forEach((d) => {
    const h = doc.createElement('div');
    h.className = 'oc-handle'; h.dataset.dir = d;
    h.style.cssText = `position:fixed;width:${HANDLE_SIZE}px;height:${HANDLE_SIZE}px;margin-left:-${HANDLE_SIZE/2}px;margin-top:-${HANDLE_SIZE/2}px;background:#fff;border:2px solid #4c8bf5;border-radius:50%;box-sizing:border-box;pointer-events:auto;display:none;cursor:${cursors[d]};box-shadow:0 1px 3px rgba(0,0,0,.35);`;
    layer.appendChild(h);
  });
  doc.body.appendChild(layer);
}
function positionHandles(doc, el) {
  const layer = doc.getElementById('oc-handle-layer');
  if (!layer) return;
  const handles = layer.querySelectorAll('.oc-handle');
  if (!el || state.mode !== 'select') {
    handles.forEach((h) => (h.style.display = 'none'));
    return;
  }
  const r = el.getBoundingClientRect();
  const pos = {
    nw: [r.left, r.top], n: [r.left + r.width / 2, r.top], ne: [r.left + r.width, r.top],
    e: [r.left + r.width, r.top + r.height / 2], se: [r.left + r.width, r.top + r.height],
    s: [r.left + r.width / 2, r.top + r.height], sw: [r.left, r.top + r.height],
    w: [r.left, r.top + r.height / 2]
  };
  handles.forEach((h) => {
    const [x, y] = pos[h.dataset.dir];
    h.style.left = x + 'px'; h.style.top = y + 'px'; h.style.display = 'block';
  });
}
function hideHandles(doc) {
  const layer = doc.getElementById('oc-handle-layer');
  if (!layer) return;
  layer.querySelectorAll('.oc-handle').forEach((h) => (h.style.display = 'none'));
}

/* ---------------- Posición ---------------- */
function setPosition(el, x, y) {
  el.dataset.ocX = x; el.dataset.ocY = y;
  el.style.setProperty('--oc-tx', x + 'px');
  el.style.setProperty('--oc-ty', y + 'px');
  el.style.transform = `translate(${x}px, ${y}px)`;
}
function getPosition(el) {
  const dx = parseFloat(el.dataset.ocX);
  const dy = parseFloat(el.dataset.ocY);
  if (!isNaN(dx) || !isNaN(dy)) return { x: dx || 0, y: dy || 0 };
  const tx = el.style.getPropertyValue('--oc-tx');
  const ty = el.style.getPropertyValue('--oc-ty');
  if (tx || ty) return { x: parseFloat(tx) || 0, y: parseFloat(ty) || 0 };
  const m = (el.style.transform || '').match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/);
  if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
  return { x: 0, y: 0 };
}

/* ---------------- Inspector ---------------- */
function installInspector(doc) {
  let hoverEl = null;
  let dragging = null, dragStarted = false;
  let startX = 0, startY = 0, origX = 0, origY = 0;
  let resizing = null, rsStartX = 0, rsStartY = 0, rsStartW = 0, rsStartH = 0, rsStartTx = 0, rsStartTy = 0;

  const isEditable = (el) =>
    el && el.nodeType === 1 && el !== doc.body && el !== doc.documentElement &&
    !el.classList.contains('oc-handle') && !el.closest('#oc-handle-layer');

  const clearHover = () => { if (hoverEl) hoverEl.classList.remove('oc-hover'); hoverEl = null; };

  const select = (el) => {
    if (state.selectedEl) state.selectedEl.classList.remove('oc-selected');
    state.selectedEl = el;
    if (el) el.classList.add('oc-selected');
    updatePropsPanel(el);
    positionHandles(doc, el);
  };
  state._select = select;

  const stop = () => {
    if (dragging) dragging.style.willChange = '';
    if (resizing) resizing.el.style.willChange = '';
    dragging = null; dragStarted = false; resizing = null;
  };
  state._stopInteraction = stop;

  doc.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) e.preventDefault();
  }, true);

  doc.addEventListener('mouseover', (e) => {
    if (state.mode !== 'select' || dragging || resizing) return;
    const el = e.target;
    if (!isEditable(el) || el === state.selectedEl) return;
    clearHover(); hoverEl = el; el.classList.add('oc-hover');
  });
  doc.addEventListener('mouseout', () => {
    if (state.mode !== 'select') return;
    clearHover();
  });

  doc.addEventListener('mousedown', (e) => {
    const target = e.target;
    if (target.classList?.contains('oc-handle')) {
      e.preventDefault(); e.stopPropagation();
      const el = state.selectedEl; if (!el) return;
      const r = el.getBoundingClientRect();
      resizing = { el, dir: target.dataset.dir };
      rsStartX = e.clientX; rsStartY = e.clientY;
      rsStartW = r.width; rsStartH = r.height;
      const p = getPosition(el);
      rsStartTx = p.x; rsStartTy = p.y;
      el.style.willChange = 'transform, width, height';
      return;
    }
    if (!isEditable(target)) return;
    if (state.mode === 'text') return;
    if (e.button !== 0) return;
    select(target);
    dragging = target; dragStarted = false;
    startX = e.clientX; startY = e.clientY;
    const p = getPosition(target);
    origX = p.x; origY = p.y;
  });

  doc.addEventListener('mousemove', (e) => {
    if (resizing) {
      e.preventDefault();
      const dx = e.clientX - rsStartX;
      const dy = e.clientY - rsStartY;
      const dir = resizing.dir, el = resizing.el;
      let w = rsStartW, h = rsStartH, tx = rsStartTx, ty = rsStartTy;
      if (dir.includes('e')) w = rsStartW + dx;
      if (dir.includes('w')) { w = rsStartW - dx; tx = rsStartTx + dx; }
      if (dir.includes('s')) h = rsStartH + dy;
      if (dir.includes('n')) { h = rsStartH - dy; ty = rsStartTy + dy; }
      w = Math.max(8, w); h = Math.max(8, h);
      el.style.width = w + 'px'; el.style.height = h + 'px';
      setPosition(el, tx, ty);
      positionHandles(doc, el); updatePropsPanel(el);
      return;
    }
    if (!dragging) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!dragStarted) {
      if (Math.abs(dx) + Math.abs(dy) < 3) return;
      dragStarted = true; clearHover();
      dragging.style.willChange = 'transform';
    }
    e.preventDefault();
    const x = origX + dx, y = origY + dy;
    setPosition(dragging, x, y);
    updatePropsPanel(dragging);
    positionHandles(doc, dragging);
  });

  doc.addEventListener('mouseup', () => {
    const hadDrag = dragStarted, hadResize = !!resizing;
    stop();
    if (hadDrag || hadResize) snapshotNow();
  });
  window.addEventListener('mouseup', () => {
    if (state._stopInteraction) state._stopInteraction();
  });

  doc.addEventListener('dblclick', (e) => {
    if (state.mode !== 'select') return;
    const el = e.target;
    if (!isEditable(el)) return;
    e.preventDefault();
    setMode('text');
    setTimeout(() => {
      try {
        const range = doc.caretRangeFromPoint ? doc.caretRangeFromPoint(e.clientX, e.clientY) : null;
        if (range) {
          const sel = doc.getSelection();
          sel.removeAllRanges(); sel.addRange(range);
        }
      } catch {}
    }, 0);
  });

  doc.addEventListener('keydown', (e) => {
    // Undo/Redo globales en modo select
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      if (state.mode === 'select') { e.preventDefault(); undo(); return; }
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
      e.preventDefault(); redo(); return;
    }

    if (e.key === 'Escape' && state.mode === 'text') { setMode('select'); return; }
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
      clearSelection();
      snapshotNow();
      return;
    } else return;
    e.preventDefault();
    const el = state.selectedEl;
    const p = getPosition(el);
    setPosition(el, p.x + dx, p.y + dy);
    updatePropsPanel(el);
    positionHandles(doc, el);
    scheduleSnapshot();
  });

  const reposition = () => { if (state.selectedEl) positionHandles(doc, state.selectedEl); };
  doc.defaultView?.addEventListener('scroll', reposition, { passive: true });
  doc.defaultView?.addEventListener('resize', reposition);
}

/* ---------------- Panel de propiedades ---------------- */
function clearSelection() {
  const doc = $('#preview').contentDocument;
  if (state.selectedEl) state.selectedEl.classList.remove('oc-selected');
  state.selectedEl = null;
  $('#props').hidden = true;
  if (doc) hideHandles(doc);
}

function updatePropsPanel(el) {
  const panel = $('#props');
  if (!el) { panel.hidden = true; return; }
  panel.hidden = false;
  const fid = document.activeElement?.id || null;

  $('#props-title').textContent = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');

  const ta = $('#prop-text');
  const isSimple = el.children.length === 0;
  ta.disabled = !isSimple;
  if (fid !== 'prop-text') ta.value = isSimple ? el.textContent : '(elemento con hijos)';

  const p = getPosition(el);
  if (fid !== 'prop-x') $('#prop-x').value = Math.round(p.x);
  if (fid !== 'prop-y') $('#prop-y').value = Math.round(p.y);

  const r = el.getBoundingClientRect();
  if (fid !== 'prop-w') $('#prop-w').value = Math.round(r.width);
  if (fid !== 'prop-h') $('#prop-h').value = Math.round(r.height);

  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  if (fid !== 'prop-bg') $('#prop-bg').value = rgbToHex(cs.backgroundColor);
  if (fid !== 'prop-color') $('#prop-color').value = rgbToHex(cs.color);

  // Degradado
  const grad = parseGradient(el, cs);
  if (fid !== 'prop-grad-use') $('#prop-grad-use').checked = grad.use;
  $('#prop-grad-fields').hidden = !grad.use;
  if (fid !== 'prop-grad-type') $('#prop-grad-type').value = grad.type;
  if (fid !== 'prop-grad-angle') $('#prop-grad-angle').value = grad.angle;
  if (fid !== 'prop-grad-c1') $('#prop-grad-c1').value = grad.c1;
  if (fid !== 'prop-grad-c2') $('#prop-grad-c2').value = grad.c2;
  if (fid !== 'prop-grad-text') $('#prop-grad-text').checked = grad.text;
  updateGradPreview();

  // Animación
  const anim = readAnimation(el);
  if (fid !== 'prop-anim-name') $('#prop-anim-name').value = anim.name;
  if (fid !== 'prop-anim-dur') $('#prop-anim-dur').value = anim.dur;
  if (fid !== 'prop-anim-delay') $('#prop-anim-delay').value = anim.delay;
}

function parseGradient(el, cs) {
  const bg = cs.backgroundImage || '';
  const clip = cs.backgroundClip || cs.webkitBackgroundClip || '';
  const text = clip.includes('text');
  if (!bg || !bg.includes('gradient')) {
    return { use: false, text, type: 'linear', angle: 135, c1: '#4c8bf5', c2: '#6ee7a8' };
  }
  const isRadial = bg.includes('radial-gradient');
  const angleMatch = bg.match(/(-?\d+(?:\.\d+)?)deg/);
  const angle = angleMatch ? Math.round(parseFloat(angleMatch[1])) : 135;
  const colors = [];
  const rgbRe = /rgba?\(([^)]+)\)/g;
  let m;
  while ((m = rgbRe.exec(bg)) !== null) {
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    colors.push(rgbToHex(`rgb(${parts[0]},${parts[1]},${parts[2]})`));
  }
  const hexRe = /#([0-9a-f]{3,8})\b/gi;
  while ((m = hexRe.exec(bg)) !== null) colors.push('#' + m[1].slice(0, 6));
  return {
    use: true, text,
    type: isRadial ? 'radial' : 'linear',
    angle,
    c1: colors[0] || '#4c8bf5',
    c2: colors[1] || '#6ee7a8'
  };
}

function applyGradient(el, { use, text, type, angle, c1, c2 }) {
  if (!use) {
    el.style.removeProperty('background-image');
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
    return;
  }
  const grad = type === 'radial'
    ? `radial-gradient(circle, ${c1} 0%, ${c2} 100%)`
    : `linear-gradient(${angle}deg, ${c1} 0%, ${c2} 100%)`;
  el.style.backgroundImage = grad;
  if (text) {
    el.style.webkitBackgroundClip = 'text';
    el.style.backgroundClip = 'text';
    el.style.webkitTextFillColor = 'transparent';
    el.style.color = 'transparent';
  } else {
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
  }
}

function updateGradPreview() {
  const use = $('#prop-grad-use').checked;
  const pv = $('#prop-grad-preview');
  if (!use) { pv.style.background = 'transparent'; return; }
  const type = $('#prop-grad-type').value;
  const angle = $('#prop-grad-angle').value;
  const c1 = $('#prop-grad-c1').value;
  const c2 = $('#prop-grad-c2').value;
  pv.style.background = type === 'radial'
    ? `radial-gradient(circle, ${c1}, ${c2})`
    : `linear-gradient(${angle}deg, ${c1}, ${c2})`;
}

function readAnimation(el) {
  const cls = [...el.classList].find((c) => c.startsWith('oc-anim-'));
  if (!cls) return { name: '', dur: 600, delay: 0 };
  const key = cls.slice('oc-anim-'.length);
  const dur = parseInt(el.style.getPropertyValue('--oc-dur')) || 600;
  const delay = parseInt(el.style.getPropertyValue('--oc-delay')) || 0;
  return { name: key, dur, delay };
}

function applyAnimation(el, key, dur, delay) {
  [...el.classList].forEach((c) => { if (c.startsWith('oc-anim-')) el.classList.remove(c); });
  el.style.removeProperty('--oc-dur');
  el.style.removeProperty('--oc-delay');
  if (!key) return;
  el.classList.add('oc-anim-' + key);
  el.style.setProperty('--oc-dur', (dur || 600) + 'ms');
  el.style.setProperty('--oc-delay', (delay || 0) + 'ms');
  const doc = $('#preview').contentDocument;
  ensureRuntimeStyles(doc);
}

function bindPropsEvents() {
  const sel = () => state.selectedEl;
  const doc = () => $('#preview').contentDocument;

  $('#prop-text').oninput = (e) => {
    const el = sel(); if (!el || el.children.length > 0) return;
    el.textContent = e.target.value;
    positionHandles(doc(), el); scheduleSnapshot();
  };
  $('#prop-x').oninput = (e) => {
    const el = sel(); if (!el) return;
    const p = getPosition(el);
    setPosition(el, parseFloat(e.target.value) || 0, p.y);
    positionHandles(doc(), el); scheduleSnapshot();
  };
  $('#prop-y').oninput = (e) => {
    const el = sel(); if (!el) return;
    const p = getPosition(el);
    setPosition(el, p.x, parseFloat(e.target.value) || 0);
    positionHandles(doc(), el); scheduleSnapshot();
  };
  $('#prop-w').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.style.width = e.target.value + 'px';
    positionHandles(doc(), el); scheduleSnapshot();
  };
  $('#prop-h').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.style.height = e.target.value + 'px';
    positionHandles(doc(), el); scheduleSnapshot();
  };
  $('#prop-bg').oninput = (e) => { const el = sel(); if (el) { el.style.backgroundColor = e.target.value; scheduleSnapshot(); } };
  $('#prop-color').oninput = (e) => { const el = sel(); if (el) { el.style.color = e.target.value; scheduleSnapshot(); } };

  /* Degradado */
  const applyGradFromUI = () => {
    const el = sel(); if (!el) return;
    applyGradient(el, {
      use: $('#prop-grad-use').checked,
      text: $('#prop-grad-text').checked,
      type: $('#prop-grad-type').value,
      angle: parseFloat($('#prop-grad-angle').value) || 135,
      c1: $('#prop-grad-c1').value,
      c2: $('#prop-grad-c2').value
    });
    updateGradPreview(); scheduleSnapshot();
  };
  $('#prop-grad-use').onchange = () => {
    $('#prop-grad-fields').hidden = !$('#prop-grad-use').checked;
    applyGradFromUI();
  };
  ['#prop-grad-type','#prop-grad-angle','#prop-grad-c1','#prop-grad-c2','#prop-grad-text'].forEach((id) => {
    $(id).oninput = applyGradFromUI;
    $(id).onchange = applyGradFromUI;
  });

  /* Animación */
  const applyAnimFromUI = () => {
    const el = sel(); if (!el) return;
    applyAnimation(el,
      $('#prop-anim-name').value,
      parseInt($('#prop-anim-dur').value) || 600,
      parseInt($('#prop-anim-delay').value) || 0
    );
    scheduleSnapshot();
  };
  $('#prop-anim-name').onchange = applyAnimFromUI;
  $('#prop-anim-dur').oninput = applyAnimFromUI;
  $('#prop-anim-delay').oninput = applyAnimFromUI;

  $('#prop-anim-play').onclick = () => {
    const el = sel(); if (!el) return;
    const a = readAnimation(el); if (!a.name) { toast('Sin animación'); return; }
    const doc = $('#preview').contentDocument;
    const dur = a.dur, delay = a.delay;
    doc.body.classList.remove('oc-editing');
    const inline = el.style.animation;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = inline || '';
    ensureRuntimeStyles(doc);
    clearTimeout(el._ocPlayTimer);
    el._ocPlayTimer = setTimeout(() => doc.body.classList.add('oc-editing'), dur + delay + 300);
  };

  $('#prop-delete').onclick = () => {
    const el = sel(); if (!el) return;
    el.remove();
    clearSelection();
    snapshotNow();
  };
  $('#props-close').onclick = () => clearSelection();
}

/* ---------------- Modo ---------------- */
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.tool').forEach((b) => {
    if (b.id === 'btn-select' || b.id === 'btn-text') b.classList.remove('active');
  });
  $(mode === 'select' ? '#btn-select' : '#btn-text').classList.add('active');
  const doc = $('#preview').contentDocument;
  if (!doc || !doc.body) return;

  if (mode === 'text') {
    doc.designMode = 'on';
    doc.body.classList.add('oc-text-mode');
    doc.body.classList.remove('oc-select-mode');
    $('#props').hidden = true;
    hideHandles(doc);
    if (state.selectedEl) {
      state.selectedEl.classList.remove('oc-selected');
      state.selectedEl = null;
    }
  } else {
    doc.designMode = 'off';
    doc.body.classList.remove('oc-text-mode');
    doc.body.classList.add('oc-select-mode');
    if (state.selectedEl) positionHandles(doc, state.selectedEl);
    // Snapshot al salir del modo texto
    scheduleSnapshot();
  }
}

/* ---------------- Detección de menú ---------------- */
function findNav(doc) {
  const selectors = ['nav','[role="navigation"]','.navbar','.nav','.menu','.main-nav','.navigation','.site-nav','.topnav','.header-nav','.menu-principal','.navegacion'];
  for (const s of selectors) { const el = doc.querySelector(s); if (el) return el; }
  const header = doc.querySelector('header');
  if (header && header.querySelector('a')) return header;
  return null;
}
function getNavContainer(nav) { return nav ? (nav.querySelector('ul') || nav) : null; }
function findNavInElement(root) {
  const selectors = ['nav','[role="navigation"]','.navbar','.nav','.menu','.main-nav','.navigation','.site-nav','.topnav','.header-nav'];
  for (const s of selectors) { const el = root.querySelector?.(s); if (el) return el; }
  const header = root.querySelector?.('header');
  if (header && header.querySelector('a')) return header;
  if (root.tagName === 'HEADER' && root.querySelector('a')) return root;
  return null;
}

/* ---------------- Editor de menú ---------------- */
function openNavEditor() {
  const doc = $('#preview').contentDocument;
  const nav = findNav(doc);
  if (!nav) state.navLinks = [];
  else {
    const container = getNavContainer(nav);
    state.navLinks = [...container.querySelectorAll(':scope > a, :scope > li > a')].map((a) => ({
      text: a.textContent.trim(), href: a.getAttribute('href') || '#'
    }));
  }
  renderNavEditor();
  $('#nav-modal').hidden = false;
}
function renderNavEditor() {
  const ul = $('#nav-list'); ul.innerHTML = '';
  $('#nav-empty').hidden = state.navLinks.length > 0;
  state.navLinks.forEach((link, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <input type="text" data-field="text" placeholder="Texto" value="${escapeHtml(link.text)}" />
      <input type="text" data-field="href" placeholder="enlace.html" value="${escapeHtml(link.href)}" />
      <button data-act="up">↑</button><button data-act="down">↓</button><button data-act="del" class="del">✕</button>
    `;
    li.querySelectorAll('input').forEach((inp) => {
      inp.oninput = (e) => { state.navLinks[i][e.target.dataset.field] = e.target.value; applyNavToIframe(); };
    });
    li.querySelector('[data-act="up"]').onclick = () => { if (i === 0) return; [state.navLinks[i-1], state.navLinks[i]] = [state.navLinks[i], state.navLinks[i-1]]; renderNavEditor(); applyNavToIframe(); };
    li.querySelector('[data-act="down"]').onclick = () => { if (i === state.navLinks.length - 1) return; [state.navLinks[i+1], state.navLinks[i]] = [state.navLinks[i], state.navLinks[i+1]]; renderNavEditor(); applyNavToIframe(); };
    li.querySelector('[data-act="del"]').onclick = () => { state.navLinks.splice(i, 1); renderNavEditor(); applyNavToIframe(); };
    ul.appendChild(li);
  });
}
function applyNavToIframe() {
  const doc = $('#preview').contentDocument; if (!doc) return;
  let nav = findNav(doc);
  if (!nav) {
    if (!state.navLinks.length) return;
    nav = doc.createElement('nav');
    doc.body.insertBefore(nav, doc.body.firstChild);
  }
  let container = getNavContainer(nav);
  if (!container) { container = doc.createElement('ul'); nav.appendChild(container); }
  const isUl = container.tagName === 'UL';
  container.innerHTML = '';
  state.navLinks.forEach((l) => {
    const a = doc.createElement('a');
    a.textContent = l.text || 'Enlace'; a.setAttribute('href', l.href || '#');
    if (isUl) { const li = doc.createElement('li'); li.appendChild(a); container.appendChild(li); }
    else container.appendChild(a);
  });
}
async function saveNavChanges() {
  const applyAll = $('#nav-apply-all').checked;
  const links = state.navLinks.map((l) => ({ ...l }));
  $('#nav-save').disabled = true;
  try { await saveCurrent(true); toast('Menú de esta página guardado ✓', 'ok'); }
  catch (err) { toast('Error: ' + err.message, 'error'); $('#nav-save').disabled = false; return; }

  if (applyAll) {
    const others = state.files.filter((f) => f.path !== state.filePath);
    let count = 0;
    for (const f of others) {
      try {
        const { content, sha } = await getFile({ ...state, path: f.path });
        const updated = replaceNavInHtml(content, links);
        await putFile({ ...state, path: f.path, content: updated, sha, message: `Update menu in ${f.path} via OpenCanvas Studio` });
        count++;
      } catch (e) { console.warn('No se pudo actualizar', f.path, e); }
    }
    toast(`Menú aplicado a ${count + 1} páginas ✓`, 'ok');
  } else toast('Menú guardado ✓', 'ok');

  $('#nav-modal').hidden = true;
  $('#nav-save').disabled = false;
  await refreshFileList();
}
function replaceNavInHtml(html, links) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  let nav = findNav(doc);
  if (!nav) {
    if (!links.length) return html;
    nav = doc.createElement('nav');
    doc.body.insertBefore(nav, doc.body.firstChild);
  }
  let container = getNavContainer(nav);
  if (!container) { container = doc.createElement('ul'); nav.appendChild(container); }
  const isUl = container.tagName === 'UL';
  container.innerHTML = '';
  links.forEach((l) => {
    const a = doc.createElement('a');
    a.textContent = l.text || 'Enlace'; a.setAttribute('href', l.href || '#');
    if (isUl) { const li = doc.createElement('li'); li.appendChild(a); container.appendChild(li); }
    else container.appendChild(a);
  });
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

/* ---------------- Nueva página ---------------- */
function openPageModal() {
  $('#page-title').value = ''; $('#page-slug').value = '';
  $('#page-slug').dataset.touched = '';
  $('#page-modal').hidden = false;
  $('#page-title').focus();
}
function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
async function createPage() {
  const title = $('#page-title').value.trim();
  let slug = $('#page-slug').value.trim();
  if (!slug && title) slug = slugify(title) + '.html';
  if (!slug.endsWith('.html') && !slug.endsWith('.htm')) slug += '.html';
  if (!title || !slug) { toast('Pon título y nombre de archivo', 'error'); return; }
  if (state.files.some((f) => f.path === slug)) { toast('Ya existe una página con ese nombre', 'error'); return; }

  const addToCurrent = $('#page-add-nav').checked;
  const addToAll = $('#page-add-nav-all').checked;
  $('#page-create').disabled = true;
  toast('Creando página…');
  try {
    const currentHtml = state.filePath ? (await getFile({ ...state, path: state.filePath })).content : defaultTemplate(title);
    const newHtml = buildNewPage(title, currentHtml, addToCurrent ? { text: title, href: slug } : null);
    await putFile({ ...state, path: slug, content: newHtml, message: `Create ${slug} via OpenCanvas Studio` });

    if (addToAll) {
      const others = state.files.filter((f) => f.path !== slug);
      let count = 0;
      for (const f of others) {
        try {
          const { content, sha } = await getFile({ ...state, path: f.path });
          const updated = addLinkToNav(content, { text: title, href: slug });
          if (updated !== content) {
            await putFile({ ...state, path: f.path, content: updated, sha, message: `Add ${slug} to menu via OpenCanvas Studio` });
            count++;
          }
        } catch (e) { console.warn('No se pudo actualizar', f.path, e); }
      }
      toast(`Página creada y menú actualizado en ${count} páginas ✓`, 'ok');
    } else toast('Página creada ✓', 'ok');

    $('#page-modal').hidden = true;
    await refreshFileList();
    await openFile(slug);
  } catch (err) { toast('Error al crear: ' + err.message, 'error'); }
  finally { $('#page-create').disabled = false; }
}
function buildNewPage(title, currentHtml, navLink) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(currentHtml, 'text/html');
  const headParts = [];
  doc.head.querySelectorAll('link[rel="stylesheet"], style:not([data-oc-injected])').forEach((el) => headParts.push(el.outerHTML));
  const header = doc.querySelector('header');
  const footer = doc.querySelector('footer');
  const lang = doc.documentElement.lang || 'es';

  let headerHtml = '';
  if (header) {
    const clone = header.cloneNode(true);
    if (navLink) {
      const realNav = findNavInElement(clone);
      if (realNav) {
        const container = getNavContainer(realNav);
        const isUl = container.tagName === 'UL';
        const a = doc.createElement('a');
        a.textContent = navLink.text; a.setAttribute('href', navLink.href);
        if (isUl) { const li = doc.createElement('li'); li.appendChild(a); container.appendChild(li); }
        else container.appendChild(a);
      }
    }
    headerHtml = clone.outerHTML;
  }
  const footerHtml = footer ? footer.outerHTML : '';
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
${headParts.join('\n')}
</head>
<body>
${headerHtml}
<main>
<h1>${escapeHtml(title)}</h1>
<p>Escribe aquí el contenido de esta página.</p>
</main>
${footerHtml}
</body>
</html>`;
}
function addLinkToNav(html, link) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const nav = findNav(doc);
  if (!nav) return html;
  const container = getNavContainer(nav);
  const isUl = container.tagName === 'UL';
  const exists = [...container.querySelectorAll('a')].some((a) => (a.getAttribute('href') || '') === link.href);
  if (exists) return html;
  const a = doc.createElement('a');
  a.textContent = link.text; a.setAttribute('href', link.href);
  if (isUl) { const li = doc.createElement('li'); li.appendChild(a); container.appendChild(li); }
  else container.appendChild(a);
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
function defaultTemplate(title) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:760px;margin:0 auto;padding:40px 20px;line-height:1.6;color:#222}
nav ul{list-style:none;padding:0;display:flex;gap:16px}nav a{text-decoration:none;color:#4c8bf5}</style>
</head><body><header><nav><ul><li><a href="index.html">Inicio</a></li></ul></nav></header>
<main><h1>${escapeHtml(title)}</h1><p>Escribe aquí el contenido de esta página.</p></main></body></html>`;
}

/* ---------------- Eliminar página ---------------- */
async function deletePage(path) {
  if (state.files.length <= 1) { toast('No puedes eliminar la única página', 'error'); return; }
  if (!confirm(`¿Eliminar "${path}"? Esta acción no se puede deshacer.`)) return;
  try {
    const { sha } = await getFile({ ...state, path });
    await deleteFile({ ...state, path, sha, message: `Delete ${path} via OpenCanvas Studio` });
    toast('Página eliminada', 'ok');
    if (state.filePath === path) {
      state.filePath = null; state.fileSha = null; $('#preview').srcdoc = '';
    }
    await refreshFileList();
    if (!state.filePath && state.files.length) await openFile(state.files[0].path);
  } catch (err) { toast('Error al eliminar: ' + err.message, 'error'); }
}

/* ---------------- Serializar / Guardar ---------------- */
function serializeCurrentIframe() {
  const doc = $('#preview').contentDocument;
  if (!doc) return '';
  const clone = doc.documentElement.cloneNode(true);
  // Quitar inyecciones del editor
  clone.querySelectorAll('[data-oc-injected]').forEach((el) => el.remove());
  clone.querySelector('#oc-handle-layer')?.remove();
  // Quitar clases de selección/hover
  clone.querySelectorAll('.oc-selected,.oc-hover').forEach((el) => {
    el.classList.remove('oc-selected', 'oc-hover');
  });
  clone.querySelectorAll('body').forEach((b) => {
    b.classList.remove('oc-text-mode','oc-select-mode','oc-editing');
  });

  // Rebuild runtime styles solo con animaciones usadas
  const used = new Set();
  clone.querySelectorAll('[class*="oc-anim-"]').forEach((el) => {
    [...el.classList].forEach((c) => { if (c.startsWith('oc-anim-')) used.add(c.slice('oc-anim-'.length)); });
  });
  const oldRt = clone.querySelector('#oc-runtime');
  if (oldRt) oldRt.remove();
  if (used.size) {
    const style = doc.createElement('style');
    style.id = 'oc-runtime';
    style.textContent = buildRuntimeCss(used);
    clone.querySelector('head')?.appendChild(style);
  }

  let out = '<!DOCTYPE html>\n' + clone.outerHTML;
  out = out
    .replace(/<base[^>]*>\s*/i, '')
    .replace(/\s*contenteditable="true"/g, '')
    .replace(/\s*contenteditable="false"/g, '')
    .replace(/\s*data-oc-x="[^"]*"/g, '')
    .replace(/\s*data-oc-y="[^"]*"/g, '')
    .replace(/\s*style="will-change:\s*transform[^"]*"/g, '');
  return out;
}

async function saveCurrent(silent = false) {
  if (!state.filePath) return;
  if (!state.fileSha) throw new Error('No hay SHA. Recarga la página primero.');
  const newContent = serializeCurrentIframe();
  const res = await putFile({
    ...state, path: state.filePath, content: newContent,
    sha: state.fileSha,
    message: `Update ${state.filePath} via OpenCanvas Studio`
  });
  state.fileSha = res.content.sha;
  state.originalHtml = newContent;
  if (!silent) toast('Guardado ✓', 'ok');
}
async function save() {
  if (!state.filePath) return;
  $('#btn-save').disabled = true;
  try { await saveCurrent(false); }
  catch (err) { toast('Error al guardar: ' + err.message, 'error'); }
  finally { $('#btn-save').disabled = false; }
}

/* ---------------- Eventos ---------------- */
$('#btn-connect').onclick = () => connect(false);
$('#btn-logout').onclick = logout;
$('#btn-save').onclick = save;
$('#btn-reload').onclick = () => state.filePath && openFile(state.filePath);
$('#btn-select').onclick = () => setMode('select');
$('#btn-text').onclick = () => setMode('text');
$('#btn-nav').onclick = openNavEditor;
$('#btn-new-page').onclick = openPageModal;
$('#sidebar-new').onclick = openPageModal;
$('#btn-undo').onclick = undo;
$('#btn-redo').onclick = redo;
$('#file-select').onchange = (e) => { const p = e.target.value; if (p && p !== state.filePath) openFile(p); };
$('#btn-sidebar').onclick = () => $('#sidebar').classList.toggle('collapsed');

$('#nav-close').onclick = () => { $('#nav-modal').hidden = true; };
$('#nav-add').onclick = () => { state.navLinks.push({ text: 'Nueva', href: '#' }); renderNavEditor(); applyNavToIframe(); };
$('#nav-save').onclick = saveNavChanges;

$('#page-close').onclick = () => { $('#page-modal').hidden = true; };
$('#page-cancel').onclick = () => { $('#page-modal').hidden = true; };
$('#page-create').onclick = createPage;
$('#page-title').oninput = () => {
  const s = $('#page-slug');
  if (!s.dataset.touched) s.value = slugify($('#page-title').value) + '.html';
};
$('#page-slug').oninput = () => { $('#page-slug').dataset.touched = '1'; };

/* Atajos globales (fuera del iframe) */
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault(); undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
    e.preventDefault(); redo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault(); save();
  }
});

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
