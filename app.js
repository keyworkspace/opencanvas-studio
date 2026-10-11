import { getRepo, listTree, getFile, putFile, deleteFile } from './github.js';

const $ = (sel) => document.querySelector(sel);

const state = {
  owner: '',
  repo: '',
  branch: 'main',
  token: '',
  filePath: null,
  fileSha: null,
  mode: 'select',
  selectedEl: null,
  originalHtml: '',
  files: [],
  navLinks: [],
  loading: false,
  stopInteraction: null
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
  t._timer = setTimeout(() => (t.hidden = true), 3200);
}
function setLoginMsg(msg, kind = '') {
  const el = $('#login-msg');
  el.textContent = msg;
  el.className = 'msg ' + kind;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  if (state.files.length && !state.filePath) {
    await openFile(state.files[0].path);
  }
}

function logout() {
  clearSession();
  Object.assign(state, {
    owner: '', repo: '', branch: 'main', token: '',
    filePath: null, fileSha: null, selectedEl: null, originalHtml: '',
    files: [], navLinks: [], loading: false
  });
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
  const ul = $('#pages-list');
  ul.innerHTML = '';
  state.files.forEach((f) => {
    const li = document.createElement('li');
    if (f.path === state.filePath) li.classList.add('active');
    li.innerHTML = `
      <span class="name" title="${escapeHtml(f.path)}">${escapeHtml(f.path)}</span>
      <button class="del" title="Eliminar">✕</button>
    `;
    li.onclick = () => {
      if (state.loading) return;
      if (f.path === state.filePath) return;
      openFile(f.path);
    };
    li.querySelector('.del').onclick = (e) => {
      e.stopPropagation();
      deletePage(f.path);
    };
    ul.appendChild(li);
  });
}

function renderFileSelect() {
  const select = $('#file-select');
  select.innerHTML = '';
  if (!state.files.length) {
    const o = document.createElement('option');
    o.textContent = '— no hay archivos HTML —';
    o.disabled = true;
    select.appendChild(o);
    return;
  }
  state.files.forEach((f) => {
    const o = document.createElement('option');
    o.value = f.path;
    o.textContent = f.path;
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
    state.filePath = path;
    state.fileSha = sha;
    state.originalHtml = content;
    state.selectedEl = null;
    $('#props').hidden = true;

    renderSidebar();
    renderFileSelect();
    renderHtml(content);
    toast('Cargado: ' + path, 'ok');
  } catch (err) {
    toast('Error al abrir: ' + err.message, 'error');
  } finally {
    state.loading = false;
  }
}

/* ---------------- Render con srcdoc ---------------- */
function renderHtml(html) {
  const iframe = $('#preview');
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

  const onLoad = () => {
    iframe.removeEventListener('load', onLoad);
    const doc = iframe.contentDocument;
    if (!doc || !doc.body) return;
    injectStyles(doc);
    createHandleLayer(doc);
    installInspector(doc);
    setMode(state.mode);
  };
  iframe.addEventListener('load', onLoad);
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
  `;
  doc.head.appendChild(style);
}

/* ---------------- Handles de redimensionado ---------------- */
const HANDLE_SIZE = 12;

function createHandleLayer(doc) {
  if (doc.getElementById('oc-handle-layer')) return;
  const layer = doc.createElement('div');
  layer.id = 'oc-handle-layer';
  layer.setAttribute('data-oc-injected', '');
  layer.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647;';

  const dirs = ['nw','n','ne','e','se','s','sw','w'];
  const cursors = {
    nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
    se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize'
  };
  dirs.forEach((d) => {
    const h = doc.createElement('div');
    h.className = 'oc-handle';
    h.dataset.dir = d;
    h.style.cssText = `
      position: fixed;
      width: ${HANDLE_SIZE}px;
      height: ${HANDLE_SIZE}px;
      margin-left: -${HANDLE_SIZE/2}px;
      margin-top: -${HANDLE_SIZE/2}px;
      background: #ffffff;
      border: 2px solid #4c8bf5;
      border-radius: 50%;
      box-sizing: border-box;
      pointer-events: auto;
      display: none;
      cursor: ${cursors[d]};
      box-shadow: 0 1px 3px rgba(0,0,0,.35);
    `;
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
    nw: [r.left, r.top],
    n:  [r.left + r.width / 2, r.top],
    ne: [r.left + r.width, r.top],
    e:  [r.left + r.width, r.top + r.height / 2],
    se: [r.left + r.width, r.top + r.height],
    s:  [r.left + r.width / 2, r.top + r.height],
    sw: [r.left, r.top + r.height],
    w:  [r.left, r.top + r.height / 2]
  };
  handles.forEach((h) => {
    const [x, y] = pos[h.dataset.dir];
    h.style.left = x + 'px';
    h.style.top = y + 'px';
    h.style.display = 'block';
  });
}

function hideHandles(doc) {
  const layer = doc.getElementById('oc-handle-layer');
  if (!layer) return;
  layer.querySelectorAll('.oc-handle').forEach((h) => (h.style.display = 'none'));
}

/* ---------------- Inspector ---------------- */
function installInspector(doc) {
  let hoverEl = null;
  let dragging = null;
  let dragStarted = false;
  let startX = 0, startY = 0, origX = 0, origY = 0;

  let resizing = null;
  let rsStartX = 0, rsStartY = 0;
  let rsStartW = 0, rsStartH = 0;
  let rsStartTx = 0, rsStartTy = 0;

  const isEditable = (el) =>
    el && el.nodeType === 1 &&
    el !== doc.body && el !== doc.documentElement &&
    !el.classList.contains('oc-handle') &&
    !el.closest('#oc-handle-layer');

  const clearHover = () => {
    if (hoverEl) hoverEl.classList.remove('oc-hover');
    hoverEl = null;
  };

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
    dragging = null;
    dragStarted = false;
    resizing = null;
  };
  state.stopInteraction = stop;

  /* Bloquear navegación */
  doc.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) e.preventDefault();
  }, true);

  /* HOVER */
  doc.addEventListener('mouseover', (e) => {
    if (state.mode !== 'select' || dragging || resizing) return;
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
    const target = e.target;

    /* Resize: mousedown sobre un handle */
    if (target.classList?.contains('oc-handle')) {
      e.preventDefault();
      e.stopPropagation();
      const el = state.selectedEl;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      resizing = { el, dir: target.dataset.dir };
      rsStartX = e.clientX;
      rsStartY = e.clientY;
      rsStartW = rect.width;
      rsStartH = rect.height;
      rsStartTx = parseFloat(el.dataset.ocX || '0');
      rsStartTy = parseFloat(el.dataset.ocY || '0');
      el.style.willChange = 'transform, width, height';
      return;
    }

    if (!isEditable(target)) return;
    if (state.mode === 'text') return;
    if (e.button !== 0) return;

    select(target);
    dragging = target;
    dragStarted = false;
    startX = e.clientX;
    startY = e.clientY;
    origX = parseFloat(target.dataset.ocX || '0');
    origY = parseFloat(target.dataset.ocY || '0');
  });

  /* MOUSEMOVE */
  doc.addEventListener('mousemove', (e) => {
    /* Resize activo */
    if (resizing) {
      e.preventDefault();
      const dx = e.clientX - rsStartX;
      const dy = e.clientY - rsStartY;
      const dir = resizing.dir;
      const el = resizing.el;

      let w = rsStartW, h = rsStartH;
      let tx = rsStartTx, ty = rsStartTy;

      if (dir.includes('e')) w = rsStartW + dx;
      if (dir.includes('w')) { w = rsStartW - dx; tx = rsStartTx + dx; }
      if (dir.includes('s')) h = rsStartH + dy;
      if (dir.includes('n')) { h = rsStartH - dy; ty = rsStartTy + dy; }

      w = Math.max(8, w);
      h = Math.max(8, h);

      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.dataset.ocX = tx;
      el.dataset.ocY = ty;
      el.style.transform = `translate(${tx}px, ${ty}px)`;

      positionHandles(doc, el);
      updatePropsPanel(el);
      return;
    }

    /* Drag activo */
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
    positionHandles(doc, dragging);
  });

  /* MOUSEUP */
  doc.addEventListener('mouseup', () => {
    stop();
  });

  /* Si el usuario suelta fuera del iframe, el parent lo captura */
  window.addEventListener('mouseup', () => {
    if (state.stopInteraction) state.stopInteraction();
  });

  /* DOBLE CLIC → modo texto */
  doc.addEventListener('dblclick', (e) => {
    if (state.mode !== 'select') return;
    const el = e.target;
    if (!isEditable(el)) return;
    e.preventDefault();
    setMode('text');
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
    if (e.key === 'Escape' && state.mode === 'text') {
      setMode('select');
      return;
    }
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
    positionHandles(doc, el);
  });

  /* Scroll y resize del iframe → reposicionar handles */
  const reposition = () => {
    if (state.selectedEl) positionHandles(doc, state.selectedEl);
  };
  doc.defaultView?.addEventListener('scroll', reposition, { passive: true });
  doc.defaultView?.addEventListener('resize', reposition);
}

/* ---------------- Panel de propiedades ---------------- */
function updatePropsPanel(el) {
  const panel = $('#props');
  if (!el) { panel.hidden = true; return; }
  panel.hidden = false;

  const focused = document.activeElement;
  const fid = focused ? focused.id : null;

  $('#props-title').textContent = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '');

  const ta = $('#prop-text');
  const isSimple = el.children.length === 0;
  ta.disabled = !isSimple;
  if (fid !== 'prop-text') ta.value = isSimple ? el.textContent : '(elemento con hijos)';

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
  if (rgb.includes('rgba(0, 0, 0, 0)')) return '#ffffff';
  const m = rgb.match(/\d+/g);
  if (!m) return '#ffffff';
  return '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
}

function bindPropsEvents() {
  const sel = () => state.selectedEl;
  const doc = () => $('#preview').contentDocument;

  $('#prop-text').oninput = (e) => {
    const el = sel();
    if (!el || el.children.length > 0) return;
    el.textContent = e.target.value;
    positionHandles(doc(), el);
  };
  $('#prop-x').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.dataset.ocX = e.target.value;
    const x = parseFloat(el.dataset.ocX || '0');
    const y = parseFloat(el.dataset.ocY || '0');
    el.style.transform = `translate(${x}px, ${y}px)`;
    positionHandles(doc(), el);
  };
  $('#prop-y').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.dataset.ocY = e.target.value;
    const x = parseFloat(el.dataset.ocX || '0');
    const y = parseFloat(el.dataset.ocY || '0');
    el.style.transform = `translate(${x}px, ${y}px)`;
    positionHandles(doc(), el);
  };
  $('#prop-w').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.style.width = e.target.value + 'px';
    positionHandles(doc(), el);
  };
  $('#prop-h').oninput = (e) => {
    const el = sel(); if (!el) return;
    el.style.height = e.target.value + 'px';
    positionHandles(doc(), el);
  };
  $('#prop-bg').oninput = (e) => { const el = sel(); if (el) el.style.backgroundColor = e.target.value; };
  $('#prop-color').oninput = (e) => { const el = sel(); if (el) el.style.color = e.target.value; };
  $('#prop-delete').onclick = () => {
    const el = sel(); if (!el) return;
    el.remove();
    state.selectedEl = null;
    $('#props').hidden = true;
    hideHandles(doc());
  };
  $('#props-close').onclick = () => {
    if (state.selectedEl) state.selectedEl.classList.remove('oc-selected');
    state.selectedEl = null;
    $('#props').hidden = true;
    hideHandles(doc());
  };
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
  }
}

/* ---------------- Detección de menú ---------------- */
function findNav(doc) {
  const selectors = [
    'nav', '[role="navigation"]',
    '.navbar', '.nav', '.menu', '.main-nav', '.navigation',
    '.site-nav', '.topnav', '.header-nav', '.menu-principal', '.navegacion'
  ];
  for (const s of selectors) {
    const el = doc.querySelector(s);
    if (el) return el;
  }
  const header = doc.querySelector('header');
  if (header && header.querySelector('a')) return header;
  return null;
}

function getNavContainer(nav) {
  if (!nav) return null;
  return nav.querySelector('ul') || nav;
}

/* ---------------- Editor de menú ---------------- */
function openNavEditor() {
  const doc = $('#preview').contentDocument;
  const nav = findNav(doc);

  if (!nav) {
    state.navLinks = [];
  } else {
    const container = getNavContainer(nav);
    state.navLinks = [...container.querySelectorAll(':scope > a, :scope > li > a')].map((a) => ({
      text: a.textContent.trim(),
      href: a.getAttribute('href') || '#'
    }));
  }

  renderNavEditor();
  $('#nav-modal').hidden = false;
}

function renderNavEditor() {
  const ul = $('#nav-list');
  ul.innerHTML = '';
  $('#nav-empty').hidden = state.navLinks.length > 0;

  state.navLinks.forEach((link, i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <input type="text" data-field="text" placeholder="Texto" value="${escapeHtml(link.text)}" />
      <input type="text" data-field="href" placeholder="enlace.html" value="${escapeHtml(link.href)}" />
      <button data-act="up" title="Subir">↑</button>
      <button data-act="down" title="Bajar">↓</button>
      <button data-act="del" class="del" title="Eliminar">✕</button>
    `;
    li.querySelectorAll('input').forEach((inp) => {
      inp.oninput = (e) => {
        state.navLinks[i][e.target.dataset.field] = e.target.value;
        applyNavToIframe();
      };
    });
    li.querySelector('[data-act="up"]').onclick = () => {
      if (i === 0) return;
      [state.navLinks[i - 1], state.navLinks[i]] = [state.navLinks[i], state.navLinks[i - 1]];
      renderNavEditor();
      applyNavToIframe();
    };
    li.querySelector('[data-act="down"]').onclick = () => {
      if (i === state.navLinks.length - 1) return;
      [state.navLinks[i + 1], state.navLinks[i]] = [state.navLinks[i], state.navLinks[i + 1]];
      renderNavEditor();
      applyNavToIframe();
    };
    li.querySelector('[data-act="del"]').onclick = () => {
      state.navLinks.splice(i, 1);
      renderNavEditor();
      applyNavToIframe();
    };
    ul.appendChild(li);
  });
}

function applyNavToIframe() {
  const doc = $('#preview').contentDocument;
  if (!doc) return;
  let nav = findNav(doc);

  if (!nav) {
    if (state.navLinks.length === 0) return;
    nav = doc.createElement('nav');
    doc.body.insertBefore(nav, doc.body.firstChild);
  }

  let container = getNavContainer(nav);
  if (!container) {
    container = doc.createElement('ul');
    nav.appendChild(container);
  }
  const isUl = container.tagName === 'UL';

  container.innerHTML = '';
  state.navLinks.forEach((link) => {
    const a = doc.createElement('a');
    a.textContent = link.text || 'Enlace';
    a.setAttribute('href', link.href || '#');
    if (isUl) {
      const li = doc.createElement('li');
      li.appendChild(a);
      container.appendChild(li);
    } else {
      container.appendChild(a);
    }
  });
}

async function saveNavChanges() {
  const applyAll = $('#nav-apply-all').checked;
  const links = state.navLinks.map((l) => ({ ...l }));

  $('#nav-save').disabled = true;
  try {
    await saveCurrent(true);
    toast('Menú de esta página guardado ✓', 'ok');
  } catch (err) {
    toast('Error guardando esta página: ' + err.message, 'error');
    $('#nav-save').disabled = false;
    return;
  }

  if (applyAll) {
    const others = state.files.filter((f) => f.path !== state.filePath);
    let count = 0;
    for (const f of others) {
      try {
        const { content, sha } = await getFile({ ...state, path: f.path });
        const updated = replaceNavInHtml(content, links);
        await putFile({
          ...state,
          path: f.path,
          content: updated,
          sha,
          message: `Update menu in ${f.path} via OpenCanvas Studio`
        });
        count++;
      } catch (e) {
        console.warn('No se pudo actualizar', f.path, e);
      }
    }
    toast(`Menú aplicado a ${count + 1} páginas ✓`, 'ok');
  } else {
    toast('Menú guardado ✓', 'ok');
  }

  $('#nav-modal').hidden = true;
  $('#nav-save').disabled = false;
  await refreshFileList();
}

function replaceNavInHtml(html, links) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  let nav = findNav(doc);
  if (!nav) {
    if (links.length === 0) return html;
    nav = doc.createElement('nav');
    doc.body.insertBefore(nav, doc.body.firstChild);
  }
  let container = getNavContainer(nav);
  if (!container) {
    container = doc.createElement('ul');
    nav.appendChild(container);
  }
  const isUl = container.tagName === 'UL';
  container.innerHTML = '';
  links.forEach((link) => {
    const a = doc.createElement('a');
    a.textContent = link.text || 'Enlace';
    a.setAttribute('href', link.href || '#');
    if (isUl) {
      const li = doc.createElement('li');
      li.appendChild(a);
      container.appendChild(li);
    } else {
      container.appendChild(a);
    }
  });
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}

/* ---------------- Nueva página ---------------- */
function openPageModal() {
  $('#page-title').value = '';
  $('#page-slug').value = '';
  $('#page-slug').dataset.touched = '';
  $('#page-modal').hidden = false;
  $('#page-title').focus();
}

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function createPage() {
  const title = $('#page-title').value.trim();
  let slug = $('#page-slug').value.trim();
  if (!slug && title) slug = slugify(title) + '.html';
  if (!slug.endsWith('.html') && !slug.endsWith('.htm')) slug += '.html';

  if (!title || !slug) { toast('Pon título y nombre de archivo', 'error'); return; }
  if (state.files.some((f) => f.path === slug)) {
    toast('Ya existe una página con ese nombre', 'error'); return;
  }

  const addToCurrent = $('#page-add-nav').checked;
  const addToAll = $('#page-add-nav-all').checked;

  $('#page-create').disabled = true;
  toast('Creando página…');

  try {
    const currentHtml = state.filePath
      ? (await getFile({ ...state, path: state.filePath })).content
      : defaultTemplate(title);
    const newHtml = buildNewPage(title, currentHtml, addToCurrent ? { text: title, href: slug } : null);

    await putFile({
      ...state,
      path: slug,
      content: newHtml,
      message: `Create ${slug} via OpenCanvas Studio`
    });

    if (addToAll) {
      const others = state.files.filter((f) => f.path !== slug);
      let count = 0;
      for (const f of others) {
        try {
          const { content, sha } = await getFile({ ...state, path: f.path });
          const updated = addLinkToNav(content, { text: title, href: slug });
          if (updated !== content) {
            await putFile({
              ...state,
              path: f.path,
              content: updated,
              sha,
              message: `Add ${slug} to menu via OpenCanvas Studio`
            });
            count++;
          }
        } catch (e) {
          console.warn('No se pudo actualizar', f.path, e);
        }
      }
      toast(`Página creada y menú actualizado en ${count} páginas ✓`, 'ok');
    } else {
      toast('Página creada ✓', 'ok');
    }

    $('#page-modal').hidden = true;
    await refreshFileList();
    await openFile(slug);
  } catch (err) {
    toast('Error al crear: ' + err.message, 'error');
  } finally {
    $('#page-create').disabled = false;
  }
}

function buildNewPage(title, currentHtml, navLink) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(currentHtml, 'text/html');

  const headParts = [];
  doc.head.querySelectorAll('link[rel="stylesheet"], style:not([data-oc-injected])').forEach((el) => {
    headParts.push(el.outerHTML);
  });

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
        a.textContent = navLink.text;
        a.setAttribute('href', navLink.href);
        if (isUl) {
          const li = doc.createElement('li');
          li.appendChild(a);
          container.appendChild(li);
        } else {
          container.appendChild(a);
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

function findNavInElement(root) {
  const selectors = [
    'nav', '[role="navigation"]', '.navbar', '.nav', '.menu',
    '.main-nav', '.navigation', '.site-nav', '.topnav', '.header-nav'
  ];
  for (const s of selectors) {
    const el = root.querySelector?.(s);
    if (el) return el;
  }
  const header = root.querySelector?.('header');
  if (header && header.querySelector('a')) return header;
  if (root.tagName === 'HEADER' && root.querySelector('a')) return root;
  return null;
}

function addLinkToNav(html, link) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const nav = findNav(doc);
  if (!nav) return html;
  const container = getNavContainer(nav);
  const isUl = container.tagName === 'UL';
  const exists = [...container.querySelectorAll('a')].some(
    (a) => (a.getAttribute('href') || '') === link.href
  );
  if (exists) return html;

  const a = doc.createElement('a');
  a.textContent = link.text;
  a.setAttribute('href', link.href);
  if (isUl) {
    const li = doc.createElement('li');
    li.appendChild(a);
    container.appendChild(li);
  } else {
    container.appendChild(a);
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
body { font-family: system-ui, sans-serif; max-width: 760px; margin: 0 auto; padding: 40px 20px; line-height: 1.6; color: #222; }
nav ul { list-style: none; padding: 0; display: flex; gap: 16px; }
nav a { text-decoration: none; color: #4c8bf5; }
</style>
</head>
<body>
<header>
<nav>
<ul><li><a href="index.html">Inicio</a></li></ul>
</nav>
</header>
<main>
<h1>${escapeHtml(title)}</h1>
<p>Escribe aquí el contenido de esta página.</p>
</main>
</body>
</html>`;
}

/* ---------------- Eliminar página ---------------- */
async function deletePage(path) {
  if (state.files.length <= 1) {
    toast('No puedes eliminar la única página', 'error');
    return;
  }
  if (!confirm(`¿Eliminar "${path}"? Esta acción no se puede deshacer.`)) return;

  try {
    const { sha } = await getFile({ ...state, path });
    await deleteFile({
      ...state, path, sha,
      message: `Delete ${path} via OpenCanvas Studio`
    });
    toast('Página eliminada', 'ok');

    if (state.filePath === path) {
      state.filePath = null;
      state.fileSha = null;
      $('#preview').srcdoc = '';
    }
    await refreshFileList();
    if (!state.filePath && state.files.length) {
      await openFile(state.files[0].path);
    }
  } catch (err) {
    toast('Error al eliminar: ' + err.message, 'error');
  }
}

/* ---------------- Guardar ---------------- */
function serializeCurrentIframe() {
  const doc = $('#preview').contentDocument;
  // Clonar para no tocar el DOM real
  const clone = doc.documentElement.cloneNode(true);
  // Quitar inyecciones del editor
  clone.querySelectorAll('[data-oc-injected]').forEach((el) => el.remove());
  clone.querySelector('#oc-handle-layer')?.remove();

  let newContent = '<!DOCTYPE html>\n' + clone.outerHTML;
  newContent = newContent
    .replace(/<base[^>]*>\s*/i, '')
    .replace(/\s*\boc-hover\b/g, '')
    .replace(/\s*\boc-selected\b/g, '')
    .replace(/\s*\boc-text-mode\b/g, '')
    .replace(/\s*\boc-select-mode\b/g, '')
    .replace(/\s*contenteditable="true"/g, '')
    .replace(/\s*contenteditable="false"/g, '')
    .replace(/\s*data-oc-x="[^"]*"/g, '')
    .replace(/\s*data-oc-y="[^"]*"/g, '')
    .replace(/\s*style="will-change:\s*transform[^"]*"/g, '');
  return newContent;
}

async function saveCurrent(silent = false) {
  if (!state.filePath) return;
  if (!state.fileSha) throw new Error('No hay SHA. Recarga la página primero.');

  const newContent = serializeCurrentIframe();
  const res = await putFile({
    ...state,
    path: state.filePath,
    content: newContent,
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
  try {
    await saveCurrent(false);
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
$('#btn-nav').onclick = openNavEditor;
$('#btn-new-page').onclick = openPageModal;
$('#sidebar-new').onclick = openPageModal;
$('#btn-undo').onclick = () => { if (state.originalHtml) renderHtml(state.originalHtml); };
$('#file-select').onchange = (e) => {
  const path = e.target.value;
  if (path && path !== state.filePath) openFile(path);
};
$('#btn-sidebar').onclick = () => $('#sidebar').classList.toggle('collapsed');

/* Modal menú */
$('#nav-close').onclick = () => { $('#nav-modal').hidden = true; };
$('#nav-add').onclick = () => {
  state.navLinks.push({ text: 'Nueva', href: '#' });
  renderNavEditor();
  applyNavToIframe();
};
$('#nav-save').onclick = saveNavChanges;

/* Modal nueva página */
$('#page-close').onclick = () => { $('#page-modal').hidden = true; };
$('#page-cancel').onclick = () => { $('#page-modal').hidden = true; };
$('#page-create').onclick = createPage;
$('#page-title').oninput = () => {
  const slugInput = $('#page-slug');
  if (!slugInput.dataset.touched) {
    slugInput.value = slugify($('#page-title').value) + '.html';
  }
};
$('#page-slug').oninput = () => { $('#page-slug').dataset.touched = '1'; };

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
