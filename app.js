import { getRepo, listTree, getFile, putFile, deleteFile } from './github.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  owner: '', repo: '', branch: 'main', token: '',
  filePath: null, fileSha: null,
  mode: 'select',
  selectedEl: null,
  originalHtml: '',
  files: [], loading: false,
  suppressHistory: false,
  device: 'desktop',
  gradient: { use: false, text: false, type: 'linear', angle: 135, stops: [] }
};

const STORAGE_KEY = 'opencanvas.session';

/* =================================================
   ANIMACIONES
   ================================================= */
const ANIMATIONS = {
  'fade-in':    { name: 'oc-fadeIn',    kf: '@keyframes oc-fadeIn{from{opacity:0}to{opacity:1}}' },
  'slide-up':   { name: 'oc-slideUp',   kf: '@keyframes oc-slideUp{from{opacity:0;transform:translate(var(--oc-tx,0px),calc(var(--oc-ty,0px) + 40px))}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px))}}' },
  'slide-down': { name: 'oc-slideDown', kf: '@keyframes oc-slideDown{from{opacity:0;transform:translate(var(--oc-tx,0px),calc(var(--oc-ty,0px) - 40px))}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px))}}' },
  'slide-left': { name: 'oc-slideLeft', kf: '@keyframes oc-slideLeft{from{opacity:0;transform:translate(calc(var(--oc-tx,0px) + 40px),var(--oc-ty,0px))}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px))}}' },
  'slide-right':{ name: 'oc-slideRight',kf: '@keyframes oc-slideRight{from{opacity:0;transform:translate(calc(var(--oc-tx,0px) - 40px),var(--oc-ty,0px))}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px))}}' },
  'zoom-in':    { name: 'oc-zoomIn',    kf: '@keyframes oc-zoomIn{from{opacity:0;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(.85)}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(1)}}' },
  'bounce-in':  { name: 'oc-bounceIn',  kf: '@keyframes oc-bounceIn{0%{opacity:0;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(.3)}50%{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(1.05)}70%{transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(.95)}100%{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) scale(1)}}' },
  'rotate-in':  { name: 'oc-rotateIn',  kf: '@keyframes oc-rotateIn{from{opacity:0;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) rotate(-180deg)}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) rotate(0)}}' },
  'flip-in':    { name: 'oc-flipIn',    kf: '@keyframes oc-flipIn{from{opacity:0;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) rotateY(90deg)}to{opacity:1;transform:translate(var(--oc-tx,0px),var(--oc-ty,0px)) rotateY(0)}}' },
  'pulse':      { name: 'oc-pulse',     kf: '@keyframes oc-pulse{0%,100%{opacity:1}50%{opacity:.5}}', loop: true }
};

/* =================================================
   PRESETS DE GRADIENTES
   ================================================= */
const GRADIENT_PRESETS = {
  rainbow: { type: 'linear', angle: 90, stops: [{c:'#ff0000',p:0},{c:'#ff8800',p:17},{c:'#ffee00',p:33},{c:'#00cc44',p:50},{c:'#0088ff',p:67},{c:'#8800ff',p:83},{c:'#ff00aa',p:100}] },
  sunset:  { type: 'linear', angle: 135, stops: [{c:'#ff6b6b',p:0},{c:'#ffa94d',p:33},{c:'#ffd93d',p:66},{c:'#c77dff',p:100}] },
  ocean:   { type: 'linear', angle: 135, stops: [{c:'#0066ff',p:0},{c:'#00c2ff',p:50},{c:'#00ffd1',p:100}] },
  fire:    { type: 'linear', angle: 135, stops: [{c:'#ff0000',p:0},{c:'#ff6600',p:50},{c:'#ffcc00',p:100}] },
  pastel:  { type: 'linear', angle: 135, stops: [{c:'#ffb3ba',p:0},{c:'#ffdfba',p:25},{c:'#ffffba',p:50},{c:'#baffc9',p:75},{c:'#bae1ff',p:100}] },
  neon:    { type: 'linear', angle: 135, stops: [{c:'#ff00e5',p:0},{c:'#00fff0',p:50},{c:'#aaff00',p:100}] },
  aurora:  { type: 'linear', angle: 135, stops: [{c:'#00ffa3',p:0},{c:'#22d3ee',p:50},{c:'#7c5cfc',p:100}] },
  forest:  { type: 'linear', angle: 135, stops: [{c:'#0a3d2a',p:0},{c:'#1f8a4c',p:50},{c:'#8ce99a',p:100}] },
  galaxy:  { type: 'linear', angle: 135, stops: [{c:'#1a0033',p:0},{c:'#4d0099',p:50},{c:'#c77dff',p:100}] },
  mono:    { type: 'linear', angle: 135, stops: [{c:'#000000',p:0},{c:'#666666',p:50},{c:'#ffffff',p:100}] }
};

/* =================================================
   BIBLIOTECA DE ELEMENTOS
   ================================================= */
const ELEMENT_LIBRARY = [
  {
    id: 'text',
    label: 'Texto',
    icon: '📝',
    items: [
      { id: 'h1', label: 'Título H1', desc: 'Encabezado principal', preview: '<div class="ep-h1">Título</div>', html: '<h1>Título principal</h1>' },
      { id: 'h2', label: 'Título H2', desc: 'Encabezado de sección', preview: '<div class="ep-h2">Título</div>', html: '<h2>Título de sección</h2>' },
      { id: 'h3', label: 'Título H3', desc: 'Subtítulo', preview: '<div class="ep-h3">Título</div>', html: '<h3>Subtítulo</h3>' },
      { id: 'p', label: 'Párrafo', desc: 'Texto de cuerpo', preview: '<div class="ep-p">Texto de párrafo</div>', html: '<p>Escribe aquí tu texto. Puedes editarlo directamente en la vista previa.</p>' },
      { id: 'ul', label: 'Lista', desc: 'Lista con viñetas', preview: '<div class="ep-ul">• Item<br>• Item</div>', html: '<ul>\n  <li>Primer item</li>\n  <li>Segundo item</li>\n  <li>Tercer item</li>\n</ul>' },
      { id: 'ol', label: 'Lista numerada', desc: 'Lista ordenada', preview: '<div class="ep-ul">1. Item<br>2. Item</div>', html: '<ol>\n  <li>Primer item</li>\n  <li>Segundo item</li>\n  <li>Tercer item</li>\n</ol>' },
      { id: 'quote', label: 'Cita', desc: 'Blockquote', preview: '<div class="ep-quote">"Cita"</div>', html: '<blockquote style="border-left: 3px solid #7c5cfc; padding-left: 16px; margin: 16px 0; font-style: italic; color: #555;">"Una cita inspiradora aquí."</blockquote>' }
    ]
  },
  {
    id: 'layout',
    label: 'Diseño',
    icon: '▦',
    items: [
      { id: 'section', label: 'Sección', desc: 'Bloque con padding', preview: '<div class="ep-section"><div></div></div>', html: '<section style="padding: 60px 20px;"><div style="max-width: 1100px; margin: 0 auto;"><h2>Nueva sección</h2><p>Contenido de la sección.</p></div></section>' },
      { id: 'box', label: 'Caja', desc: 'Contenedor destacado', preview: '<div class="ep-box"></div>', html: '<div style="padding: 24px; border-radius: 12px; background: #f4f4f7; border: 1px solid #e2e2e7;"><p style="margin: 0;">Contenido de la caja</p></div>' },
      { id: 'cols-2', label: '2 columnas', desc: 'Grid de 2', preview: '<div class="ep-cols"><div></div><div></div></div>', html: '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px;">\n  <div><h3>Columna 1</h3><p>Contenido.</p></div>\n  <div><h3>Columna 2</h3><p>Contenido.</p></div>\n</div>' },
      { id: 'cols-3', label: '3 columnas', desc: 'Grid de 3', preview: '<div class="ep-cols3"><div></div><div></div><div></div></div>', html: '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;">\n  <div><h3>Columna 1</h3><p>Contenido.</p></div>\n  <div><h3>Columna 2</h3><p>Contenido.</p></div>\n  <div><h3>Columna 3</h3><p>Contenido.</p></div>\n</div>' },
      { id: 'spacer', label: 'Espacio', desc: 'Separación vertical', preview: '<div class="ep-spacer"></div>', html: '<div style="height: 60px;"></div>' },
      { id: 'hr', label: 'Separador', desc: 'Línea horizontal', preview: '<div class="ep-hr"></div>', html: '<hr style="border: 0; border-top: 1px solid #e2e2e7; margin: 32px 0;">' }
    ]
  },
  {
    id: 'visual',
    label: 'Visual',
    icon: '🎨',
    items: [
      { id: 'img', label: 'Imagen', desc: 'Imagen responsive', preview: '<div class="ep-img">🖼</div>', html: '<img src="https://placehold.co/800x400/7c5cfc/ffffff?text=Imagen" alt="Imagen" style="width: 100%; height: auto; border-radius: 12px; display: block;">' },
      { id: 'btn', label: 'Botón', desc: 'Enlace con estilo', preview: '<div class="ep-btn">Botón</div>', html: '<a href="#" style="display: inline-block; padding: 12px 24px; background: #7c5cfc; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Botón</a>' },
      { id: 'icon', label: 'Ícono', desc: 'Emoji o símbolo', preview: '<div class="ep-icon">★</div>', html: '<div style="font-size: 48px; line-height: 1;">★</div>' },
      { id: 'badge', label: 'Etiqueta', desc: 'Badge / pill', preview: '<div class="ep-badge">Nuevo</div>', html: '<span style="display: inline-block; padding: 4px 12px; background: #7c5cfc; color: #fff; border-radius: 999px; font-size: 13px; font-weight: 600;">Nuevo</span>' },
      { id: 'card', label: 'Tarjeta', desc: 'Imagen + texto', preview: '<div class="ep-card"><div></div><div></div></div>', html: '<div style="border: 1px solid #e2e2e7; border-radius: 12px; overflow: hidden; background: #fff; max-width: 320px;">\n  <img src="https://placehold.co/400x200/7c5cfc/ffffff?text=Imagen" alt="" style="width: 100%; display: block;">\n  <div style="padding: 20px;">\n    <h3 style="margin: 0 0 8px;">Título de la tarjeta</h3>\n    <p style="margin: 0; color: #555;">Descripción breve de la tarjeta.</p>\n  </div>\n</div>' }
    ]
  },
  {
    id: 'blocks',
    label: 'Bloques',
    icon: '🧩',
    items: [
      { id: 'hero', label: 'Hero', desc: 'Portada principal', preview: '<div class="ep-hero"><div></div></div>', html: '<section style="padding: 100px 20px; text-align: center; background: linear-gradient(135deg, #7c5cfc, #22d3ee); color: #fff;">\n  <h1 style="font-size: 48px; margin: 0 0 16px;">Título principal</h1>\n  <p style="font-size: 20px; margin: 0 0 32px;">Subtítulo descriptivo que explica de qué va esto.</p>\n  <a href="#" style="display: inline-block; padding: 14px 32px; background: #fff; color: #7c5cfc; text-decoration: none; border-radius: 8px; font-weight: 700;">Empezar</a>\n</section>' },
      { id: 'cta', label: 'Llamada a la acción', desc: 'Bloque CTA', preview: '<div class="ep-cta"><div></div></div>', html: '<section style="padding: 60px 20px; background: #f4f4f7; border-radius: 16px; text-align: center;">\n  <h2 style="margin: 0 0 12px;">¿Listo para empezar?</h2>\n  <p style="margin: 0 0 24px; color: #555;">Únete a las personas que ya lo están usando.</p>\n  <a href="#" style="display: inline-block; padding: 12px 28px; background: #7c5cfc; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Comenzar ahora</a>\n</section>' },
      { id: 'features', label: 'Grid de features', desc: '3 features con icono', preview: '<div class="ep-grid"><div></div><div></div><div></div></div>', html: '<section style="padding: 60px 20px;">\n  <h2 style="text-align: center; margin: 0 0 40px;">Características</h2>\n  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; max-width: 1100px; margin: 0 auto;">\n    <div><div style="font-size: 32px;">⚡</div><h3>Rápido</h3><p>Carga al instante.</p></div>\n    <div><div style="font-size: 32px;">🎨</div><h3>Bonito</h3><p>Diseño limpio.</p></div>\n    <div><div style="font-size: 32px;">🔒</div><h3>Seguro</h3><p>Sin riesgos.</p></div>\n  </div>\n</section>' },
      { id: 'split', label: 'Split image + texto', desc: 'Dos columnas', preview: '<div class="ep-cols"><div></div><div></div></div>', html: '<section style="padding: 60px 20px;">\n  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; align-items: center; max-width: 1100px; margin: 0 auto;">\n    <div>\n      <img src="https://placehold.co/600x400/7c5cfc/ffffff?text=Imagen" alt="" style="width: 100%; border-radius: 12px; display: block;">\n    </div>\n    <div>\n      <h2>Título de la sección</h2>\n      <p>Descripción del contenido que aparece junto a la imagen. Editable.</p>\n      <a href="#" style="display: inline-block; margin-top: 12px; padding: 10px 22px; background: #7c5cfc; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600;">Saber más</a>\n    </div>\n  </div>\n</section>' }
    ]
  }
];

/* =================================================
   SESIÓN
   ================================================= */
function saveSession() {
  const { owner, repo, branch, token } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, repo, branch, token }));
}
function loadSession() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}
function clearSession() { localStorage.removeItem(STORAGE_KEY); }

/* =================================================
   UI HELPERS
   ================================================= */
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(t._timer); t._timer = setTimeout(() => (t.hidden = true), 3000);
}
function setLoginMsg(msg, kind = '') {
  const el = $('#login-msg'); el.textContent = msg; el.className = 'login-msg ' + kind;
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
function nameFromPath(p) { return p.replace(/\.html?$/i, ''); }

/* =================================================
   UNDO / REDO
   ================================================= */
const history = { stack: [], index: -1, max: 60 };
function initHistory(html) { history.stack = [html]; history.index = 0; updateHistoryButtons(); }
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
  history.index--; restoreHistory();
}
function redo() {
  if (history.index >= history.stack.length - 1) { toast('Nada que rehacer'); return; }
  history.index++; restoreHistory();
}
function restoreHistory() {
  const html = history.stack[history.index];
  state.suppressHistory = true;
  clearSelection();
  renderHtml(html);
  updateHistoryButtons();
  setTimeout(() => { state.suppressHistory = false; }, 300);
}
function updateHistoryButtons() {
  $('#btn-undo').disabled = history.index <= 0;
  $('#btn-redo').disabled = history.index >= history.stack.length - 1;
}
let _snapTimer = null;
function scheduleSnapshot() {
  clearTimeout(_snapTimer);
  _snapTimer = setTimeout(snapshotNow, 400);
}
function snapshotNow() {
  clearTimeout(_snapTimer);
  if (state.suppressHistory || !state.filePath) return;
  pushHistory(serializeCurrentIframe());
}

/* =================================================
   CONEXIÓN
   ================================================= */
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
    files: [], loading: false
  });
  history.stack = []; history.index = -1;
  $('#editor').hidden = true;
  $('#login').hidden = false;
  $('#props').hidden = true;
  $('#inp-token').value = '';
  setLoginMsg('');
}

/* =================================================
   LISTA DE PÁGINAS
   ================================================= */
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
    const isIndex = f.path === 'index.html';
    li.innerHTML = `
      <span class="page-icon">${isIndex ? '★' : '◻'}</span>
      <span class="name" title="${escapeHtml(f.path)}">${escapeHtml(nameFromPath(f.path))}</span>
      <button class="del" title="Eliminar">✕</button>
    `;
    li.onclick = () => { if (state.loading || f.path === state.filePath) return; openFile(f.path); };
    li.querySelector('.del').onclick = (e) => { e.stopPropagation(); deletePage(f.path); };
    ul.appendChild(li);
  });
}
function renderFileSelect() {
  const select = $('#file-select'); select.innerHTML = '';
  if (!state.files.length) {
    const o = document.createElement('option');
    o.textContent = 'Sin páginas'; o.disabled = true; select.appendChild(o); return;
  }
  state.files.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.path;
    o.textContent = nameFromPath(f.path);
    if (f.path === state.filePath) o.selected = true;
    select.appendChild(o);
  });
}

/* =================================================
   ABRIR ARCHIVO
   ================================================= */
async function openFile(path) {
  if (state.loading) return;
  state.loading = true;
  try {
    state.mode = 'select';
    const { content, sha } = await getFile({ ...state, path });
    state.filePath = path; state.fileSha = sha; state.originalHtml = content;
    clearSelection();
    renderSidebar(); renderFileSelect();
    $('#canvas-empty').hidden = true;
    renderHtml(content, () => initHistory(content));
    toast('Cargada: ' + nameFromPath(path), 'ok');
  } catch (err) {
    toast('Error al abrir: ' + err.message, 'error');
  } finally { state.loading = false; }
}

/* =================================================
   RENDER
   ================================================= */
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
  let style = doc.getElementById('oc-injected');
  if (!style) {
    style = doc.createElement('style');
    style.id = 'oc-injected';
    style.setAttribute('data-oc-injected', '');
    doc.head.appendChild(style);
  }
  style.textContent = `
    .oc-hover { outline: 2px dashed #7c5cfc !important; outline-offset: 2px !important; }
    .oc-selected { outline: 2px solid #7c5cfc !important; outline-offset: 2px !important; }
    body.oc-select-mode { user-select: none !important; -webkit-user-select: none !important; }
    body.oc-select-mode * { cursor: move !important; }
    body.oc-text-mode, body.oc-text-mode * { cursor: text !important; }
    body.oc-editing [class*="oc-anim-"] { animation: none !important; }
  `;
}

function buildRuntimeCss(usedKeys) {
  const kfs = [], cls = [];
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

/* =================================================
   HANDLES
   ================================================= */
const HANDLE_SIZE = 11;
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
    h.style.cssText = `position:fixed;width:${HANDLE_SIZE}px;height:${HANDLE_SIZE}px;margin-left:-${HANDLE_SIZE/2}px;margin-top:-${HANDLE_SIZE/2}px;background:#fff;border:2px solid #7c5cfc;border-radius:50%;box-sizing:border-box;pointer-events:auto;display:none;cursor:${cursors[d]};box-shadow:0 1px 3px rgba(0,0,0,.35);`;
    layer.appendChild(h);
  });
  doc.body.appendChild(layer);
}
function positionHandles(doc, el) {
  const layer = doc.getElementById('oc-handle-layer');
  if (!layer) return;
  const handles = layer.querySelectorAll('.oc-handle');
  if (!el || state.mode !== 'select') {
    handles.forEach((h) => (h.style.display = 'none')); return;
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

/* =================================================
   POSICIÓN
   ================================================= */
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

/* =================================================
   INSPECTOR
   ================================================= */
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
  const stop = () => {
    if (dragging) dragging.style.willChange = '';
    if (resizing) resizing.el.style.willChange = '';
    dragging = null; dragStarted = false; resizing = null;
  };
  state._stopInteraction = stop;
  state._select = select;

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
  doc.addEventListener('mouseout', () => { if (state.mode === 'select') clearHover(); });

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
      const dx = e.clientX - rsStartX, dy = e.clientY - rsStartY;
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
    setPosition(dragging, origX + dx, origY + dy);
    updatePropsPanel(dragging);
    positionHandles(doc, dragging);
  });

  doc.addEventListener('mouseup', () => {
    const was = dragStarted || !!resizing;
    stop();
    if (was) snapshotNow();
  });
  window.addEventListener('mouseup', () => state._stopInteraction?.());

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
          const sel = doc.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        }
      } catch {}
    }, 0);
  });

  doc.addEventListener('keydown', (e) => {
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
      state.selectedEl.remove(); clearSelection(); snapshotNow(); return;
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

/* =================================================
   SELECCIÓN
   ================================================= */
function clearSelection() {
  const doc = $('#preview').contentDocument;
  if (state.selectedEl) state.selectedEl.classList.remove('oc-selected');
  state.selectedEl = null;
  $('#props').hidden = true;
  if (doc) hideHandles(doc);
}

/* =================================================
   GRADIENTES
   ================================================= */
function gradientCss(g) {
  if (!g.stops.length) return '';
  const stops = [...g.stops].sort((a, b) => a.p - b.p).map((s) => `${s.c} ${s.p}%`).join(', ');
  if (g.type === 'radial') return `radial-gradient(circle, ${stops})`;
  if (g.type === 'conic') return `conic-gradient(from ${g.angle}deg, ${stops})`;
  return `linear-gradient(${g.angle}deg, ${stops})`;
}

function parseGradient(el, cs) {
  const bg = cs.backgroundImage || '';
  const clip = cs.backgroundClip || cs.webkitBackgroundClip || '';
  const text = clip.includes('text');
  if (!bg || !bg.includes('gradient')) {
    return { use: false, text, type: 'linear', angle: 135, stops: [{c:'#7c5cfc',p:0},{c:'#22d3ee',p:100}] };
  }
  const isRadial = bg.includes('radial-gradient');
  const isConic = bg.includes('conic-gradient');
  const angleMatch = bg.match(/(?:from\s+)?(-?\d+(?:\.\d+)?)deg/);
  const angle = angleMatch ? Math.round(parseFloat(angleMatch[1])) : 135;

  const stops = [];
  const innerMatch = bg.match(/gradient\([^,]+,\s*(.+)\)/i);
  if (innerMatch) {
    const stopsStr = innerMatch[1];
    const parts = [];
    let depth = 0, cur = '';
    for (const ch of stopsStr) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    if (cur.trim()) parts.push(cur.trim());

    parts.forEach((part, i) => {
      const colorMatch = part.match(/(rgba?\([^)]+\)|#[0-9a-f]{3,8})/i);
      const posMatch = part.match(/([\d.]+)%/);
      if (colorMatch) {
        let c = colorMatch[1];
        if (c.startsWith('rgb')) {
          const nums = c.match(/\d+/g);
          if (nums) c = rgbToHex(`rgb(${nums[0]},${nums[1]},${nums[2]})`);
        } else if (c.length === 4) {
          c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
        } else if (c.length > 7) c = c.slice(0, 7);
        const p = posMatch ? parseFloat(posMatch[1]) : Math.round((i / (parts.length - 1)) * 100);
        stops.push({ c, p });
      }
    });
  }
  if (!stops.length) stops.push({ c: '#7c5cfc', p: 0 }, { c: '#22d3ee', p: 100 });

  return { use: true, text, type: isRadial ? 'radial' : isConic ? 'conic' : 'linear', angle, stops };
}

function applyGradient(el, g) {
  if (!g.use || !g.stops.length) {
    el.style.removeProperty('background-image');
    el.style.removeProperty('-webkit-background-clip');
    el.style.removeProperty('background-clip');
    el.style.removeProperty('-webkit-text-fill-color');
    return;
  }
  el.style.backgroundImage = gradientCss(g);
  if (g.text) {
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

function renderGradientStops() {
  const wrap = $('#grad-stops'); wrap.innerHTML = '';
  state.gradient.stops.forEach((stop, i) => {
    const row = document.createElement('div');
    row.className = 'grad-stop';
    row.innerHTML = `
      <input type="color" data-i="${i}" value="${stop.c}" />
      <input type="range" data-i="${i}" min="0" max="100" value="${stop.p}" />
      <span class="stop-pos">${stop.p}%</span>
      <button class="stop-remove" data-i="${i}" ${state.gradient.stops.length <= 2 ? 'disabled' : ''}>✕</button>
    `;
    row.querySelector('input[type="color"]').oninput = (e) => {
      state.gradient.stops[i].c = e.target.value;
      updateGradPreview(); applyGradFromUI();
    };
    row.querySelector('input[type="range"]').oninput = (e) => {
      state.gradient.stops[i].p = parseInt(e.target.value);
      row.querySelector('.stop-pos').textContent = e.target.value + '%';
      updateGradPreview(); applyGradFromUI();
    };
    row.querySelector('.stop-remove').onclick = () => {
      if (state.gradient.stops.length <= 2) return;
      state.gradient.stops.splice(i, 1);
      renderGradientStops(); updateGradPreview(); applyGradFromUI();
    };
    wrap.appendChild(row);
  });
}
function updateGradPreview() {
  const pv = $('#prop-grad-preview');
  if (!state.gradient.use) { pv.style.background = 'transparent'; return; }
  pv.style.background = gradientCss(state.gradient);
}
function applyGradFromUI() {
  const el = state.selectedEl; if (!el) return;
  applyGradient(el, state.gradient);
  scheduleSnapshot();
}

/* =================================================
   PANEL DE PROPIEDADES
   ================================================= */
function updatePropsPanel(el) {
  const panel = $('#props');
  if (!el) { panel.hidden = true; return; }
  panel.hidden = false;
  const fid = document.activeElement?.id || null;

  $('#props-title').textContent = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');

  const ta = $('#prop-text');
  const isSimple = el.children.length === 0;
  ta.disabled = !isSimple;
  if (fid !== 'prop-text') ta.value = isSimple ? el.textContent : '(contenido anidado)';

  const p = getPosition(el);
  if (fid !== 'prop-x') $('#prop-x').value = Math.round(p.x);
  if (fid !== 'prop-y') $('#prop-y').value = Math.round(p.y);

  const r = el.getBoundingClientRect();
  if (fid !== 'prop-w') $('#prop-w').value = Math.round(r.width);
  if (fid !== 'prop-h') $('#prop-h').value = Math.round(r.height);

  const cs = el.ownerDocument.defaultView.getComputedStyle(el);
  const bgHex = rgbToHex(cs.backgroundColor);
  const fgHex = rgbToHex(cs.color);
  if (fid !== 'prop-bg' && fid !== 'prop-bg-hex') { $('#prop-bg').value = bgHex; $('#prop-bg-hex').value = bgHex; }
  if (fid !== 'prop-color' && fid !== 'prop-color-hex') { $('#prop-color').value = fgHex; $('#prop-color-hex').value = fgHex; }

  const grad = parseGradient(el, cs);
  state.gradient = { ...grad };
  $('#prop-grad-use').checked = grad.use;
  $('#prop-grad-fields').hidden = !grad.use;
  $('#prop-grad-text').checked = grad.text;
  $('#prop-grad-angle').value = grad.angle;
  $('#grad-angle-val').textContent = grad.angle;
  $$('.seg[data-grad-type]').forEach((b) => b.classList.toggle('active', b.dataset.gradType === grad.type));
  $('#grad-angle-wrap').hidden = grad.type === 'radial';
  renderGradientStops();
  updateGradPreview();

  const anim = readAnimation(el);
  if (fid !== 'prop-anim-name') $('#prop-anim-name').value = anim.name;
  if (fid !== 'prop-anim-dur') $('#prop-anim-dur').value = anim.dur;
  if (fid !== 'prop-anim-delay') $('#prop-anim-delay').value = anim.delay;
}

function readAnimation(el) {
  const cls = [...el.classList].find((c) => c.startsWith('oc-anim-'));
  if (!cls) return { name: '', dur: 600, delay: 0 };
  const dur = parseInt(el.style.getPropertyValue('--oc-dur')) || 600;
  const delay = parseInt(el.style.getPropertyValue('--oc-delay')) || 0;
  return { name: cls.slice('oc-anim-'.length), dur, delay };
}
function applyAnimation(el, key, dur, delay) {
  [...el.classList].forEach((c) => { if (c.startsWith('oc-anim-')) el.classList.remove(c); });
  el.style.removeProperty('--oc-dur');
  el.style.removeProperty('--oc-delay');
  if (!key) return;
  el.classList.add('oc-anim-' + key);
  el.style.setProperty('--oc-dur', (dur || 600) + 'ms');
  el.style.setProperty('--oc-delay', (delay || 0) + 'ms');
  ensureRuntimeStyles($('#preview').contentDocument);
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
  $('#prop-bg').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.style.backgroundColor = e.target.value;
    $('#prop-bg-hex').value = e.target.value;
    scheduleSnapshot();
  };
  $('#prop-bg-hex').oninput = (e) => {
    const v = e.target.value.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) {
      const el = sel(); if (!el) return;
      el.style.backgroundColor = v;
      $('#prop-bg').value = v;
      scheduleSnapshot();
    }
  };
  $('#prop-color').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.style.color = e.target.value;
    $('#prop-color-hex').value = e.target.value;
    scheduleSnapshot();
  };
  $('#prop-color-hex').oninput = (e) => {
    const v = e.target.value.trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) {
      const el = sel(); if (!el) return;
      el.style.color = v;
      $('#prop-color').value = v;
      scheduleSnapshot();
    }
  };

  $$('.tab').forEach((tab) => {
    tab.onclick = () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      $$('.props-body').forEach((p) => p.hidden = p.dataset.panel !== tab.dataset.tab);
    };
  });

  $('#prop-grad-use').onchange = (e) => {
    state.gradient.use = e.target.checked;
    $('#prop-grad-fields').hidden = !e.target.checked;
    updateGradPreview(); applyGradFromUI();
  };
  $('#prop-grad-text').onchange = (e) => {
    state.gradient.text = e.target.checked;
    applyGradFromUI();
  };
  $$('.seg[data-grad-type]').forEach((b) => {
    b.onclick = () => {
      state.gradient.type = b.dataset.gradType;
      $$('.seg[data-grad-type]').forEach((x) => x.classList.toggle('active', x === b));
      $('#grad-angle-wrap').hidden = b.dataset.gradType === 'radial';
      updateGradPreview(); applyGradFromUI();
    };
  });
  $('#prop-grad-angle').oninput = (e) => {
    state.gradient.angle = parseInt(e.target.value);
    $('#grad-angle-val').textContent = e.target.value;
    updateGradPreview(); applyGradFromUI();
  };
  $('#grad-add-stop').onclick = () => {
    const last = state.gradient.stops[state.gradient.stops.length - 1];
    const prev = state.gradient.stops[state.gradient.stops.length - 2] || { p: 0 };
    const p = Math.round(((prev.p || 0) + (last?.p || 100)) / 2);
    state.gradient.stops.push({ c: '#ffffff', p });
    state.gradient.stops.sort((a, b) => a.p - b.p);
    renderGradientStops(); updateGradPreview(); applyGradFromUI();
  };
  $$('.preset-chip').forEach((chip) => {
    chip.onclick = () => {
      const preset = GRADIENT_PRESETS[chip.dataset.preset];
      if (!preset) return;
      state.gradient = { ...state.gradient, ...preset, use: true };
      $('#prop-grad-use').checked = true;
      $('#prop-grad-fields').hidden = false;
      $('#prop-grad-angle').value = state.gradient.angle;
      $('#grad-angle-val').textContent = state.gradient.angle;
      $$('.seg[data-grad-type]').forEach((b) => b.classList.toggle('active', b.dataset.gradType === state.gradient.type));
      renderGradientStops(); updateGradPreview(); applyGradFromUI();
    };
  });

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
    doc.body.classList.remove('oc-editing');
    const inline = el.style.animation;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = inline || '';
    ensureRuntimeStyles(doc);
    clearTimeout(el._ocPlayTimer);
    el._ocPlayTimer = setTimeout(() => doc.body.classList.add('oc-editing'), a.dur + a.delay + 300);
  };

  $('#prop-delete').onclick = () => {
    const el = sel(); if (!el) return;
    el.remove(); clearSelection(); snapshotNow();
  };
  $('#props-close').onclick = clearSelection;
}

/* =================================================
   MODO
   ================================================= */
function setMode(mode) {
  state.mode = mode;
  $$('.tool').forEach((b) => b.classList.remove('active'));
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
    scheduleSnapshot();
  }
}

/* =================================================
   BIBLIOTECA DE ELEMENTOS — UI
   ================================================= */
let currentCategory = 'text';

function openElementsModal() {
  if (!state.filePath) { toast('Abre una página primero', 'error'); return; }
  renderElementsCategories();
  renderElementsGrid();
  updateElementsHint();
  $('#elements-modal').hidden = false;
}

function updateElementsHint() {
  const hint = $('#elements-hint');
  if (state.selectedEl) {
    hint.textContent = `Se insertará después de <${state.selectedEl.tagName.toLowerCase()}>.`;
  } else {
    hint.textContent = 'Se insertará al final de la página.';
  }
}

function renderElementsCategories() {
  const wrap = $('#elements-cats');
  wrap.innerHTML = '';
  ELEMENT_LIBRARY.forEach((cat) => {
    const btn = document.createElement('button');
    btn.className = 'elements-cat' + (cat.id === currentCategory ? ' active' : '');
    btn.innerHTML = `<span class="cat-icon">${cat.icon}</span><span>${cat.label}</span>`;
    btn.onclick = () => {
      currentCategory = cat.id;
      renderElementsCategories();
      renderElementsGrid();
    };
    wrap.appendChild(btn);
  });
}

function renderElementsGrid() {
  const grid = $('#elements-grid');
  grid.innerHTML = '';
  const cat = ELEMENT_LIBRARY.find((c) => c.id === currentCategory);
  if (!cat) return;
  cat.items.forEach((item) => {
    const btn = document.createElement('button');
    btn.className = 'element-btn';
    btn.innerHTML = `
      <div class="element-preview">${item.preview}</div>
      <div>
        <div class="element-label">${escapeHtml(item.label)}</div>
        <div class="element-desc">${escapeHtml(item.desc)}</div>
      </div>
    `;
    btn.onclick = () => insertElement(item.html);
    grid.appendChild(btn);
  });
}

/* =================================================
   INSERCIÓN DE ELEMENTOS
   ================================================= */
function insertElement(html) {
  const doc = $('#preview').contentDocument;
  if (!doc || !doc.body) { toast('No hay página abierta', 'error'); return; }

  // Parsear HTML
  const temp = doc.createElement('div');
  temp.innerHTML = html.trim();
  const newEl = temp.firstElementChild;
  if (!newEl) { toast('Elemento inválido', 'error'); return; }

  // Determinar punto de inserción
  let container, reference;
  if (state.selectedEl && doc.body.contains(state.selectedEl) && state.selectedEl !== doc.body) {
    container = state.selectedEl.parentElement;
    reference = state.selectedEl.nextSibling;
  } else {
    const main = doc.querySelector('main');
    container = main || doc.body;
    reference = null;
  }

  container.insertBefore(newEl, reference);

  // Actualizar estilos de animación (por si el nuevo elemento las tiene)
  ensureRuntimeStyles(doc);

  // Seleccionar el nuevo elemento
  if (state._select) state._select(newEl);

  // Guardar snapshot
  snapshotNow();

  // Cerrar modal y volver a modo selección
  $('#elements-modal').hidden = true;
  if (state.mode !== 'select') setMode('select');

  // Scroll hacia el elemento insertado
  setTimeout(() => {
    try { newEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
  }, 100);

  toast('Elemento añadido ✓', 'ok');
}

/* =================================================
   DETECCIÓN DE MENÚS
   ================================================= */
function detectMenus(doc) {
  const menus = [];
  const header = doc.querySelector('header') || doc.querySelector('[role="banner"]');
  if (header) {
    const navs = header.querySelectorAll('nav, [role="navigation"], ul');
    const nav = pickBestNav(navs, header);
    if (nav) menus.push({ id: 'header', label: 'Menú del header', el: nav });
  }
  const footer = doc.querySelector('footer') || doc.querySelector('[role="contentinfo"]');
  if (footer) {
    const navs = footer.querySelectorAll('nav, [role="navigation"], ul');
    const nav = pickBestNav(navs, footer);
    if (nav) menus.push({ id: 'footer', label: 'Menú del footer', el: nav });
  }
  if (!menus.length) {
    const nav = doc.querySelector('nav, [role="navigation"]');
    if (nav) menus.push({ id: 'main', label: 'Menú principal', el: nav });
  }
  return menus;
}
function pickBestNav(navs, parent) {
  if (!navs.length) return null;
  let best = null, bestScore = -1;
  navs.forEach((el) => {
    if (!el.querySelector('a')) return;
    let score = 0;
    if (el.tagName === 'NAV') score += 10;
    if (el.getAttribute('role') === 'navigation') score += 8;
    score += Math.min(el.querySelectorAll('a').length, 10);
    const depth = (() => { let d = 0, p = el; while (p && p !== parent) { d++; p = p.parentElement; } return d; })();
    score -= depth * 0.5;
    if (score > bestScore) { bestScore = score; best = el; }
  });
  return best;
}
function readMenuTree(navEl) {
  const rootList = navEl.tagName === 'UL' || navEl.tagName === 'OL' ? navEl : navEl.querySelector('ul, ol') || navEl;
  const items = [];
  const topLis = rootList.children;
  if (rootList.tagName === 'A') return [{ text: rootList.textContent.trim(), href: rootList.getAttribute('href') || '#', children: [] }];
  for (const li of topLis) {
    if (li.tagName !== 'LI') {
      if (li.tagName === 'A') items.push({ text: li.textContent.trim(), href: li.getAttribute('href') || '#', children: [] });
      continue;
    }
    const a = li.querySelector(':scope > a');
    const subUl = li.querySelector(':scope > ul, :scope > ol');
    items.push({
      text: a ? a.textContent.trim() : (li.firstChild?.textContent?.trim() || 'Item'),
      href: a ? (a.getAttribute('href') || '#') : '#',
      children: subUl ? readMenuChildren(subUl) : []
    });
  }
  if (!items.length) {
    [...rootList.querySelectorAll(':scope > a')].forEach((a) => {
      items.push({ text: a.textContent.trim(), href: a.getAttribute('href') || '#', children: [] });
    });
  }
  return items;
}
function readMenuChildren(ul) {
  const items = [];
  for (const li of ul.children) {
    if (li.tagName !== 'LI') continue;
    const a = li.querySelector(':scope > a');
    const subUl = li.querySelector(':scope > ul, :scope > ol');
    items.push({
      text: a ? a.textContent.trim() : 'Item',
      href: a ? (a.getAttribute('href') || '#') : '#',
      children: subUl ? readMenuChildren(subUl) : []
    });
  }
  return items;
}
function writeMenuTree(navEl, items, doc) {
  const rootList = navEl.tagName === 'UL' || navEl.tagName === 'OL' ? navEl : navEl.querySelector('ul, ol') || navEl;
  const isUl = rootList.tagName === 'UL' || rootList.tagName === 'OL';
  rootList.innerHTML = '';
  if (!isUl) {
    items.forEach((item) => {
      const a = doc.createElement('a');
      a.textContent = item.text; a.setAttribute('href', item.href);
      rootList.appendChild(a);
    });
    return;
  }
  const writeItems = (parentUl, arr) => {
    arr.forEach((item) => {
      const li = doc.createElement('li');
      const a = doc.createElement('a');
      a.textContent = item.text; a.setAttribute('href', item.href);
      li.appendChild(a);
      if (item.children && item.children.length) {
        const subUl = doc.createElement('ul');
        writeItems(subUl, item.children);
        li.appendChild(subUl);
      }
      parentUl.appendChild(li);
    });
  };
  writeItems(rootList, items);
}

/* =================================================
   MENÚ EDITOR
   ================================================= */
let navState = [];

function openNavEditor() {
  const doc = $('#preview').contentDocument;
  const menus = detectMenus(doc);
  navState = menus.map((m) => ({ id: m.id, label: m.label, items: readMenuTree(m.el) }));
  renderNavEditor();
  $('#nav-modal').hidden = false;
}
function renderNavEditor() {
  const wrap = $('#nav-menus'); wrap.innerHTML = '';
  if (!navState.length) {
    wrap.innerHTML = '<div class="nav-group-empty">No se detectó ningún menú en esta página.</div>';
    return;
  }
  navState.forEach((menu, mi) => {
    const group = document.createElement('div');
    group.className = 'nav-group';
    group.innerHTML = `
      <div class="nav-group-head">
        <span class="nav-group-title">${escapeHtml(menu.label)}</span>
        <button class="btn btn-sm" data-add="${mi}">+ Añadir item</button>
      </div>
      ${menu.items.length ? '<ul class="nav-tree"></ul>' : '<div class="nav-group-empty">Sin enlaces todavía</div>'}
    `;
    const ul = group.querySelector('.nav-tree');
    if (ul) renderNavItems(ul, menu.items, mi);
    wrap.appendChild(group);
  });
  wrap.querySelectorAll('[data-add]').forEach((btn) => {
    btn.onclick = () => {
      const mi = parseInt(btn.dataset.add);
      navState[mi].items.push({ text: 'Nuevo', href: '#', children: [] });
      renderNavEditor();
    };
  });
}
function renderNavItems(ul, items) {
  items.forEach((item, i) => {
    const li = document.createElement('li');
    const wrapper = document.createElement('div');
    wrapper.className = 'nav-item';
    const row = document.createElement('div');
    row.className = 'nav-item-row';

    const textInp = document.createElement('input');
    textInp.type = 'text'; textInp.value = item.text; textInp.placeholder = 'Texto';
    textInp.oninput = () => { item.text = textInp.value; };

    const hrefInp = document.createElement('input');
    hrefInp.type = 'text'; hrefInp.value = item.href; hrefInp.placeholder = 'enlace';
    hrefInp.oninput = () => { item.href = hrefInp.value; };

    const btnUp = document.createElement('button');
    btnUp.className = 'nav-mini-btn'; btnUp.textContent = '↑';
    btnUp.onclick = () => { if (i > 0) { [items[i-1], items[i]] = [items[i], items[i-1]]; renderNavEditor(); } };

    const btnDown = document.createElement('button');
    btnDown.className = 'nav-mini-btn'; btnDown.textContent = '↓';
    btnDown.onclick = () => { if (i < items.length - 1) { [items[i+1], items[i]] = [items[i], items[i+1]]; renderNavEditor(); } };

    const btnChild = document.createElement('button');
    btnChild.className = 'nav-mini-btn'; btnChild.textContent = '↳';
    btnChild.onclick = () => {
      item.children = item.children || [];
      item.children.push({ text: 'Subitem', href: '#', children: [] });
      renderNavEditor();
    };

    const btnDel = document.createElement('button');
    btnDel.className = 'nav-mini-btn del'; btnDel.textContent = '✕';
    btnDel.onclick = () => { items.splice(i, 1); renderNavEditor(); };

    row.append(textInp, hrefInp, btnUp, btnDown, btnChild, btnDel);
    wrapper.appendChild(row);
    if (item.children && item.children.length) {
      const subUl = document.createElement('ul');
      subUl.className = 'nav-tree';
      renderNavItems(subUl, item.children);
      wrapper.appendChild(subUl);
    }
    li.appendChild(wrapper);
    ul.appendChild(li);
  });
}
function applyNavStateToIframe() {
  const doc = $('#preview').contentDocument;
  if (!doc) return;
  const currentMenus = detectMenus(doc);
  navState.forEach((menu) => {
    const found = currentMenus.find((m) => m.id === menu.id);
    if (found) writeMenuTree(found.el, menu.items, doc);
  });
}
async function saveNavChanges() {
  const applyAll = $('#nav-apply-all').checked;
  $('#nav-save').disabled = true;
  try {
    applyNavStateToIframe();
    await saveCurrent(true);
    toast('Menús guardados en esta página ✓', 'ok');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    $('#nav-save').disabled = false;
    return;
  }
  if (applyAll) {
    const others = state.files.filter((f) => f.path !== state.filePath);
    let count = 0;
    for (const f of others) {
      try {
        const { content, sha } = await getFile({ ...state, path: f.path });
        const updated = replaceMenusInHtml(content, navState);
        if (updated !== content) {
          await putFile({ ...state, path: f.path, content: updated, sha,
            message: `Update menus in ${f.path} via OpenCanvas Studio` });
          count++;
        }
      } catch (e) { console.warn('No se pudo actualizar', f.path, e); }
    }
    toast(`Menús aplicados a ${count + 1} páginas ✓`, 'ok');
  }
  $('#nav-modal').hidden = true;
  $('#nav-save').disabled = false;
  await refreshFileList();
}
function replaceMenusInHtml(html, menus) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const currentMenus = detectMenus(doc);
  menus.forEach((menu) => {
    const found = currentMenus.find((m) => m.id === menu.id);
    if (found) writeMenuTree(found.el, menu.items, doc);
  });
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

/* =================================================
   NUEVA PÁGINA
   ================================================= */
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
    const currentHtml = state.filePath
      ? (await getFile({ ...state, path: state.filePath })).content
      : defaultTemplate(title);
    const newHtml = buildNewPage(title, currentHtml, addToCurrent ? { text: title, href: slug } : null);
    await putFile({ ...state, path: slug, content: newHtml,
      message: `Create ${slug} via OpenCanvas Studio` });

    if (addToAll) {
      const others = state.files.filter((f) => f.path !== slug);
      let count = 0;
      for (const f of others) {
        try {
          const { content, sha } = await getFile({ ...state, path: f.path });
          const updated = addLinkToMenus(content, { text: title, href: slug });
          if (updated !== content) {
            await putFile({ ...state, path: f.path, content: updated, sha,
              message: `Add ${slug} to menus via OpenCanvas Studio` });
            count++;
          }
        } catch (e) { console.warn('No se pudo actualizar', f.path, e); }
      }
      toast(`Página creada y menús actualizados en ${count} páginas ✓`, 'ok');
    } else toast('Página creada ✓', 'ok');

    $('#page-modal').hidden = true;
    await refreshFileList();
    await openFile(slug);
  } catch (err) {
    toast('Error al crear: ' + err.message, 'error');
  } finally { $('#page-create').disabled = false; }
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
      const navs = clone.querySelectorAll('nav, [role="navigation"], ul');
      const nav = pickBestNav(navs, clone);
      if (nav) {
        const rootList = nav.tagName === 'UL' || nav.tagName === 'OL' ? nav : nav.querySelector('ul, ol') || nav;
        if (rootList.tagName === 'UL' || rootList.tagName === 'OL') {
          const li = doc.createElement('li');
          const a = doc.createElement('a');
          a.textContent = navLink.text; a.setAttribute('href', navLink.href);
          li.appendChild(a);
          rootList.appendChild(li);
        }
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
function addLinkToMenus(html, link) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const menus = detectMenus(doc);
  const header = menus.find((m) => m.id === 'header');
  if (!header) return html;
  const rootList = header.el.tagName === 'UL' || header.el.tagName === 'OL' ? header.el : header.el.querySelector('ul, ol') || header.el;
  if (rootList.tagName === 'UL' || rootList.tagName === 'OL') {
    const exists = [...rootList.querySelectorAll('a')].some((a) => (a.getAttribute('href') || '') === link.href);
    if (exists) return html;
    const li = doc.createElement('li');
    const a = doc.createElement('a');
    a.textContent = link.text; a.setAttribute('href', link.href);
    li.appendChild(a);
    rootList.appendChild(li);
  }
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
function defaultTemplate(title) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:system-ui,sans-serif;max-width:960px;margin:0 auto;padding:40px 20px;line-height:1.6;color:#222}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:40px}
nav ul{list-style:none;padding:0;display:flex;gap:16px;margin:0}
nav a{text-decoration:none;color:#7c5cfc;font-weight:500}
</style>
</head>
<body>
<header>
<nav><ul><li><a href="index.html">Inicio</a></li></ul></nav>
</header>
<main>
<h1>${escapeHtml(title)}</h1>
<p>Escribe aquí el contenido de esta página.</p>
</main>
</body>
</html>`;
}

/* =================================================
   ELIMINAR PÁGINA
   ================================================= */
async function deletePage(path) {
  if (state.files.length <= 1) { toast('No puedes eliminar la única página', 'error'); return; }
  if (!confirm(`¿Eliminar "${nameFromPath(path)}"? Esta acción no se puede deshacer.`)) return;
  try {
    const { sha } = await getFile({ ...state, path });
    await deleteFile({ ...state, path, sha, message: `Delete ${path} via OpenCanvas Studio` });
    toast('Página eliminada', 'ok');
    if (state.filePath === path) {
      state.filePath = null; state.fileSha = null;
      $('#preview').srcdoc = '';
      $('#canvas-empty').hidden = false;
    }
    await refreshFileList();
    if (!state.filePath && state.files.length) await openFile(state.files[0].path);
  } catch (err) { toast('Error al eliminar: ' + err.message, 'error'); }
}

/* =================================================
   SERIALIZAR / GUARDAR
   ================================================= */
function serializeCurrentIframe() {
  const doc = $('#preview').contentDocument;
  if (!doc) return '';
  const clone = doc.documentElement.cloneNode(true);
  clone.querySelectorAll('[data-oc-injected]').forEach((el) => el.remove());
  clone.querySelector('#oc-handle-layer')?.remove();
  clone.querySelectorAll('.oc-selected,.oc-hover').forEach((el) => {
    el.classList.remove('oc-selected', 'oc-hover');
  });
  clone.querySelectorAll('body').forEach((b) => {
    b.classList.remove('oc-text-mode','oc-select-mode','oc-editing');
  });

  const used = new Set();
  clone.querySelectorAll('[class*="oc-anim-"]').forEach((el) => {
    [...el.classList].forEach((c) => { if (c.startsWith('oc-anim-')) used.add(c.slice('oc-anim-'.length)); });
  });
  clone.querySelector('#oc-runtime')?.remove();
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

/* =================================================
   EVENTOS GLOBALES
   ================================================= */
$('#btn-connect').onclick = () => connect(false);
$('#btn-logout').onclick = logout;
$('#btn-save').onclick = save;
$('#btn-reload').onclick = () => state.filePath && openFile(state.filePath);
$('#btn-select').onclick = () => setMode('select');
$('#btn-text').onclick = () => setMode('text');
$('#btn-add-element').onclick = openElementsModal;
$('#btn-nav').onclick = openNavEditor;
$('#btn-new-page').onclick = openPageModal;
$('#sidebar-new').onclick = openPageModal;
$('#btn-undo').onclick = undo;
$('#btn-redo').onclick = redo;
$('#file-select').onchange = (e) => {
  const p = e.target.value;
  if (p && p !== state.filePath) openFile(p);
};

$$('.device').forEach((btn) => {
  btn.onclick = () => {
    $$('.device').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.device = btn.dataset.device;
    $('#canvas-frame').dataset.device = state.device;
  };
});

$('#btn-more').onclick = (e) => {
  e.stopPropagation();
  const m = $('#more-menu');
  m.hidden = !m.hidden;
};
document.addEventListener('click', () => { $('#more-menu').hidden = true; });

$('#elements-close').onclick = () => { $('#elements-modal').hidden = true; };

$('#nav-close').onclick = () => { $('#nav-modal').hidden = true; };
$('#nav-cancel').onclick = () => { $('#nav-modal').hidden = true; };
$('#nav-save').onclick = saveNavChanges;

$('#page-close').onclick = () => { $('#page-modal').hidden = true; };
$('#page-cancel').onclick = () => { $('#page-modal').hidden = true; };
$('#page-create').onclick = createPage;
$('#page-title').oninput = () => {
  const s = $('#page-slug');
  if (!s.dataset.touched) s.value = slugify($('#page-title').value) + '.html';
};
$('#page-slug').oninput = () => { $('#page-slug').dataset.touched = '1'; };

/* Atajos globales */
window.addEventListener('keydown', (e) => {
  if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault(); undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
    e.preventDefault(); redo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault(); save();
  } else if (e.key === 'v' || e.key === 'V') {
    setMode('select');
  } else if (e.key === 't' || e.key === 'T') {
    setMode('text');
  } else if (e.key === 'a' || e.key === 'A') {
    if (!$('#editor').hidden) { e.preventDefault(); openElementsModal(); }
  }
});

bindPropsEvents();

/* Arranque */
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
