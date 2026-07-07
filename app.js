const STORAGE_KEY = 'interview-cards-data';
const OPEN_KEY = 'interview-cards-open';

let data = { themes: [] };
let openState = { themes: {}, categories: {}, cards: {} };

const $ = (sel) => document.querySelector(sel);
const tree = $('#tree');
const modal = $('#modal');
const modalForm = $('#modal-form');
const modalBody = $('#modal-body');

function catKey(themeName, catName) {
  return `${themeName}::${catName}`;
}

function normalizeData(raw) {
  return {
    themes: (raw.themes || []).map((t) => ({
      name: t.name,
      categories: (t.categories || []).map((c) => ({
        name: c.name,
        cards: (c.cards || []).map((card) => ({
          id: String(card.id),
          question: card.question,
          answer: card.answer,
          mark: card.mark === 'at' || card.mark === 'star' ? card.mark : '',
        })),
      })),
    })),
  };
}

function nextCardId() {
  let max = 0;
  data.themes.forEach((t) =>
    t.categories.forEach((c) =>
      c.cards.forEach((card) => {
        const n = parseInt(card.id, 10);
        if (!Number.isNaN(n) && n > max) max = n;
      })
    )
  );
  return String(max + 1);
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  localStorage.setItem(OPEN_KEY, JSON.stringify(openState));
}

async function save() {
  saveLocal();
  try {
    await fetch('themes.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data, null, 2),
    });
  } catch { /* нет main.py */ }
}

function loadOpenState() {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (raw) openState = JSON.parse(raw);
  } catch {
    openState = { themes: {}, categories: {}, cards: {} };
  }
}

async function loadData() {
  loadOpenState();
  try {
    const res = await fetch('themes.json');
    if (res.ok) {
      data = normalizeData(await res.json());
      saveLocal();
      return;
    }
  } catch { /* no server */ }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      data = normalizeData(JSON.parse(stored));
      return;
    } catch { /* fall through */ }
  }
  data = { themes: [] };
}

function render() {
  tree.innerHTML = '';
  if (!data.themes.length) {
    tree.innerHTML = '<li class="tree-empty">пусто</li>';
    return;
  }
  data.themes.forEach((t) => tree.appendChild(renderTheme(t)));
}

function renderTheme(theme) {
  const open = openState.themes[theme.name] !== false;
  const li = document.createElement('li');

  li.innerHTML = `
    <div class="row row--theme${open ? ' row--open' : ''}">
      <span class="row__mark">▶</span>
      <span class="row__label">${esc(theme.name)}</span>
      <div class="row__actions">
        <button type="button" class="btn-icon btn-icon--delete" data-action="delete" title="удалить">×</button>
        <button type="button" class="btn btn--ghost" data-action="add-category">+ категория</button>
      </div>
    </div>
    <ul class="branch"></ul>
  `;

  const row = li.querySelector('.row');
  const branch = li.querySelector('.branch');
  theme.categories.forEach((c) => branch.appendChild(renderCategory(theme, c)));

  row.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return;
    const isOpen = row.classList.toggle('row--open');
    openState.themes[theme.name] = isOpen;
    save();
  });
  row.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-action]')) return;
    openThemeModal(theme);
  });
  const actions = li.querySelector('.row__actions');
  actions.addEventListener('mousedown', (e) => e.stopPropagation());
  actions.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.action === 'delete') armOrRunDelete(btn, () => deleteTheme(theme.name));
    else if (btn.dataset.action === 'add-category') openCategoryModal(theme.name);
  });

  return li;
}

function renderCategory(theme, cat) {
  const key = catKey(theme.name, cat.name);
  const open = openState.categories[key] !== false;
  const li = document.createElement('li');

  li.innerHTML = `
    <div class="row row--category${open ? ' row--open' : ''}">
      <span class="row__mark">▶</span>
      <span class="row__label">${esc(cat.name)}</span>
      <div class="row__actions">
        <button type="button" class="btn-icon btn-icon--delete" data-action="delete" title="удалить">×</button>
        <button type="button" class="btn btn--ghost" data-action="add-card">+ тема</button>
      </div>
    </div>
    <ul class="branch"></ul>
  `;

  const row = li.querySelector('.row');
  const branch = li.querySelector('.branch');
  cat.cards.forEach((card) => branch.appendChild(renderCard(theme, cat, card)));

  row.addEventListener('click', (e) => {
    if (e.target.closest('[data-action]')) return;
    const isOpen = row.classList.toggle('row--open');
    openState.categories[key] = isOpen;
    save();
  });
  row.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-action]')) return;
    openCategoryModal(theme.name, cat);
  });
  const actions = li.querySelector('.row__actions');
  actions.addEventListener('mousedown', (e) => e.stopPropagation());
  actions.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    if (btn.dataset.action === 'delete') armOrRunDelete(btn, () => deleteCategory(theme.name, cat.name));
    else if (btn.dataset.action === 'add-card') openCardModal(theme.name, cat.name);
  });

  return li;
}

let editingKey = null;
let armedDeleteBtn = null;

function clearArmedDelete() {
  if (armedDeleteBtn) {
    armedDeleteBtn.classList.remove('btn-icon--armed');
    armedDeleteBtn = null;
  }
}

function armOrRunDelete(btn, onConfirm) {
  if (!btn.classList.contains('btn-icon--armed')) {
    clearArmedDelete();
    btn.classList.add('btn-icon--armed');
    armedDeleteBtn = btn;
    return;
  }
  clearArmedDelete();
  onConfirm();
}

function bindTwoStepDelete(btn, onConfirm) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    armOrRunDelete(btn, onConfirm);
  });
}

function hasAnswer(text) {
  return !!text?.trim();
}

function cardDotHtml(card) {
  if (card.mark === 'at') return '<span class="card__dot card__dot--at">@</span>';
  if (card.mark === 'star') return '<span class="card__dot card__dot--star">*</span>';
  const cls = hasAnswer(card.answer) ? 'card__dot--filled' : 'card__dot--empty';
  return `<span class="card__dot ${cls}"></span>`;
}

function markButtonsHtml(card) {
  const atOn = card.mark === 'at' ? ' btn-icon--active' : '';
  const starOn = card.mark === 'star' ? ' btn-icon--active' : '';
  return `
    <button type="button" class="btn-icon btn-icon--mark-star${starOn}" data-mark="star" title="отложено">*</button>
    <button type="button" class="btn-icon btn-icon--mark-at${atOn}" data-mark="at" title="освоено">@</button>
  `;
}

function toggleCardMark(card, mark) {
  card.mark = card.mark === mark ? '' : mark;
  save();
}

function updateCardDot(li, card) {
  const dot = li.querySelector('.card__dot');
  if (!dot) return;
  const next = document.createElement('div');
  next.innerHTML = cardDotHtml(card);
  dot.replaceWith(next.firstElementChild);
}

function updateMarkButtons(li, card) {
  li.querySelectorAll('[data-mark]').forEach((btn) => {
    btn.classList.toggle('btn-icon--active', card.mark === btn.dataset.mark);
  });
}

function bindCardMarkButtons(container, li, card) {
  container.querySelectorAll('[data-mark]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCardMark(card, btn.dataset.mark);
      updateCardDot(li, card);
      updateMarkButtons(li, card);
    });
  });
}

function renderCard(theme, cat, card) {
  const open = !!openState.cards[card.id];
  const li = document.createElement('li');
  li.className = `card${open ? ' card--open' : ''}`;
  li.dataset.cardId = card.id;

  li.innerHTML = `
    <div class="card__head">
      <span class="row__mark">▶</span>
      ${cardDotHtml(card)}
      <div class="card__q">${formatText(card.question)}</div>
      <div class="card__head-actions">
        <button type="button" class="btn btn--answer" data-toggle>${open ? 'закрыть' : 'открыть'}</button>
      </div>
    </div>
    <div class="card__a">
      <div class="card__a-text">${formatText(card.answer)}</div>
    </div>
  `;

  li.querySelector('[data-toggle]').addEventListener('click', (e) => {
    e.stopPropagation();
    if (editingKey?.startsWith(`${card.id}:`)) return;
    openState.cards[card.id] = !openState.cards[card.id];
    li.classList.toggle('card--open', openState.cards[card.id]);
    e.target.textContent = openState.cards[card.id] ? 'закрыть' : 'открыть';
    save();
  });

  li.querySelector('.card__head').addEventListener('click', (e) => {
    if (blockCardClick) return;
    if (e.target.closest('[data-toggle], [data-mark]')) return;
    if (li.querySelector('.card__head').classList.contains('card__head--edit')) return;
    e.stopPropagation();
    openQuestionEdit(theme.name, cat.name, card.id);
  });

  li.querySelector('.card__a').addEventListener('click', (e) => {
    if (li.querySelector('.card__a').classList.contains('card__a--edit')) return;
    e.stopPropagation();
    openAnswerEdit(theme.name, cat.name, card.id);
  });

  bindCardDrag(li, cat);

  return li;
}

const CARD_DRAG_THRESHOLD = 6;
let blockCardClick = false;

function syncCardsOrderFromDom(branch, cat) {
  const ordered = [...branch.querySelectorAll(':scope > .card')].map((el) => el.dataset.cardId);
  const byId = new Map(cat.cards.map((c) => [c.id, c]));
  cat.cards = ordered.map((id) => byId.get(id)).filter(Boolean);
  save();
}

function bindCardDrag(li, cat) {
  const head = li.querySelector('.card__head');
  head.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || editingKey) return;
    if (e.target.closest('button, textarea, input, [data-delete], [data-cancel], [data-save], [data-mark], [data-toggle]')) return;
    if (head.classList.contains('card__head--edit')) return;

    const branch = li.parentElement;
    if (!branch) return;

    const drag = {
      li,
      branch,
      cat,
      pointerId: e.pointerId,
      startY: e.clientY,
      active: false,
      moved: false,
    };

    const onMove = (ev) => {
      if (ev.pointerId !== drag.pointerId) return;
      if (!drag.active && Math.abs(ev.clientY - drag.startY) < CARD_DRAG_THRESHOLD) return;

      if (!drag.active) {
        drag.active = true;
        drag.moved = true;
        li.classList.add('card--dragging');
        document.body.classList.add('card-drag-active');
      }

      ev.preventDefault();
      const siblings = [...branch.querySelectorAll(':scope > .card')].filter((el) => el !== li);
      const y = ev.clientY;
      let placed = false;
      for (const sib of siblings) {
        const rect = sib.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          branch.insertBefore(li, sib);
          placed = true;
          break;
        }
      }
      if (!placed) branch.appendChild(li);
    };

    const onUp = (ev) => {
      if (ev.pointerId !== drag.pointerId) return;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      li.classList.remove('card--dragging');
      document.body.classList.remove('card-drag-active');

      if (drag.moved) {
        syncCardsOrderFromDom(drag.branch, drag.cat);
        blockCardClick = true;
        requestAnimationFrame(() => { blockCardClick = false; });
        ev.preventDefault();
        ev.stopPropagation();
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  });
}

function autoResizeField(ta) {
  const min = parseFloat(ta.style.minHeight) || 0;
  ta.style.height = 'auto';
  ta.style.height = `${Math.max(ta.scrollHeight, min)}px`;
}

function bindFieldEdit(ta) {
  autoResizeField(ta);
  ta.addEventListener('input', () => autoResizeField(ta));
}

function enterQuestionEdit(li, theme, cat, card) {
  const qEl = li.querySelector('.card__q');
  const minH = qEl.offsetHeight;

  editingKey = `${card.id}:q`;
  const head = li.querySelector('.card__head');
  head.className = 'card__head card__head--edit';
  head.innerHTML = `
    <span class="row__mark">▶</span>
    ${cardDotHtml(card)}
    <textarea class="card__q card__field-edit" rows="1"></textarea>
    <div class="card__edit-actions card__edit-actions--icons">
      ${markButtonsHtml(card)}
      <button type="button" class="btn-icon btn-icon--delete" data-delete title="удалить карточку">×</button>
      <button type="button" class="btn-icon btn-icon--cancel" data-cancel title="отмена">○</button>
      <button type="button" class="btn-icon btn-icon--save" data-save title="сохранить">✓</button>
    </div>
  `;
  bindCardMarkButtons(head.querySelector('.card__edit-actions'), li, card);
  const field = head.querySelector('.card__field-edit');
  field.value = card.question;
  field.style.minHeight = `${minH}px`;
  bindFieldEdit(field);

  head.querySelector('[data-save]').addEventListener('click', (e) => {
    e.stopPropagation();
    card.question = field.value.trim();
    editingKey = null;
    li.replaceWith(renderCard(theme, cat, card));
    save();
  });

  head.querySelector('[data-cancel]').addEventListener('click', (e) => {
    e.stopPropagation();
    editingKey = null;
    li.replaceWith(renderCard(theme, cat, card));
  });

  bindTwoStepDelete(head.querySelector('[data-delete]'), () => {
    cat.cards = cat.cards.filter((c) => c.id !== card.id);
    delete openState.cards[card.id];
    editingKey = null;
    li.remove();
    save();
  });

  field.focus();
}

function enterAnswerEdit(li, theme, cat, card) {
  const block = li.querySelector('.card__a');
  const textEl = block.querySelector('.card__a-text');
  const blockH = block.getBoundingClientRect().height;
  const contentH = textEl.getBoundingClientRect().height;

  editingKey = `${card.id}:a`;
  openState.cards[card.id] = true;
  li.classList.add('card--open');

  block.className = 'card__a card__a--edit';
  block.style.height = `${blockH}px`;
  block.style.minHeight = `${blockH}px`;
  block.style.boxSizing = 'border-box';
  block.innerHTML = `
    <div class="card__edit-actions card__edit-actions--float">
      <button type="button" class="btn-icon btn-icon--delete" data-delete title="очистить ответ">×</button>
      <button type="button" class="btn-icon btn-icon--cancel" data-cancel title="отмена">○</button>
      <button type="button" class="btn-icon btn-icon--save" data-save title="сохранить">✓</button>
    </div>
    <textarea class="card__a-text card__field-edit" rows="1"></textarea>
  `;
  const field = block.querySelector('.card__field-edit');
  field.value = card.answer;
  field.style.height = 'auto';
  const fieldH = Math.max(contentH, field.scrollHeight);
  field.style.height = `${fieldH}px`;
  field.style.minHeight = `${fieldH}px`;
  field.style.overflowY = fieldH > blockH - 24 ? 'auto' : 'hidden';

  block.querySelector('[data-save]').addEventListener('click', (e) => {
    e.stopPropagation();
    card.answer = field.value.trim();
    editingKey = null;
    li.replaceWith(renderCard(theme, cat, card));
    save();
  });

  block.querySelector('[data-cancel]').addEventListener('click', (e) => {
    e.stopPropagation();
    editingKey = null;
    li.replaceWith(renderCard(theme, cat, card));
  });

  bindTwoStepDelete(block.querySelector('[data-delete]'), () => {
    card.answer = '';
    editingKey = null;
    li.replaceWith(renderCard(theme, cat, card));
    save();
  });

  field.focus();
}

function openQuestionEdit(themeName, catName, cardId) {
  if (editingKey) {
    editingKey = null;
    render();
  }
  const theme = findTheme(themeName);
  const cat = findCategory(themeName, catName);
  const card = cat?.cards.find((c) => c.id === cardId);
  const li = tree.querySelector(`[data-card-id="${cardId}"]`);
  if (theme && cat && card && li) enterQuestionEdit(li, theme, cat, card);
}

function openAnswerEdit(themeName, catName, cardId) {
  if (editingKey) {
    editingKey = null;
    render();
  }
  const theme = findTheme(themeName);
  const cat = findCategory(themeName, catName);
  const card = cat?.cards.find((c) => c.id === cardId);
  const li = tree.querySelector(`[data-card-id="${cardId}"]`);
  if (theme && cat && card && li) enterAnswerEdit(li, theme, cat, card);
}

const PLACEHOLDER = '...';

function orPlaceholder(value) {
  return value.trim() || PLACEHOLDER;
}

function uniqueName(name, exists) {
  if (!exists(name)) return name;
  let i = 2;
  while (exists(`${name} (${i})`)) i++;
  return `${name} (${i})`;
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

const PY_KW = /\b(and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield|True|False|None)\b/g;

function hlSpan(cls, text) {
  if (!text) return '';
  return `<span class="${cls}">${esc(text)}</span>`;
}

function highlightCodeChunk(text) {
  if (!text) return '';
  let s = esc(text);
  s = s.replace(PY_KW, '<span class="hl-kw">$1</span>');
  s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
  return s;
}

function readQuotedString(line, i) {
  const q = line[i];
  let j = i + 1;
  while (j < line.length) {
    if (line[j] === '\\') {
      j += 2;
      continue;
    }
    if (line[j] === q) return line.slice(i, j + 1);
    j++;
  }
  return line.slice(i);
}

function tripleCmtClass(triple) {
  return triple === '"""' ? 'hl-cmt-triple-dq' : 'hl-cmt-triple-sq';
}

function highlightPythonLineContent(line, ctx) {
  let out = '';
  let i = 0;

  while (i < line.length) {
    const triple = line.slice(i, i + 3);
    if (triple === '"""' || triple === "'''") {
      const cls = tripleCmtClass(triple);
      const rest = line.slice(i + 3);
      const closeIdx = rest.indexOf(triple);
      if (closeIdx === -1) {
        ctx.triple = triple;
        out += hlSpan(cls, triple + rest);
        return out;
      }
      out += hlSpan(cls, triple + rest.slice(0, closeIdx) + triple);
      i += 3 + closeIdx + 3;
      continue;
    }

    if (line[i] === '#') {
      out += hlSpan('hl-cmt-hash', line.slice(i));
      return out;
    }

    if (line[i] === '"' || line[i] === "'") {
      const quoted = readQuotedString(line, i);
      out += hlSpan('hl-str', quoted);
      i += quoted.length;
      continue;
    }

    let next = line.length;
    for (let k = i; k < line.length; k++) {
      const t = line.slice(k, k + 3);
      if (line[k] === '#' || line[k] === '"' || line[k] === "'" || t === '"""' || t === "'''") {
        next = k;
        break;
      }
    }

    if (next > i) out += highlightCodeChunk(line.slice(i, next));
    if (next === line.length) return out || '&nbsp;';
    i = next;
  }

  return out || '&nbsp;';
}

function highlightPythonLine(line, ctx) {
  if (ctx.triple) {
    const end = ctx.triple;
    const cls = tripleCmtClass(end);
    const closeIdx = line.indexOf(end);
    if (closeIdx === -1) return hlSpan(cls, line);
    const chunk = line.slice(0, closeIdx + end.length);
    const rest = line.slice(closeIdx + end.length);
    ctx.triple = null;
    return hlSpan(cls, chunk) + highlightPythonLineContent(rest, ctx);
  }
  return highlightPythonLineContent(line, ctx);
}

function highlightPythonLines(lines) {
  const ctx = { triple: null };
  return lines.map((line) => highlightPythonLine(line, ctx));
}

function renderCodeBlock(code) {
  const lines = code.replace(/\r\n/g, '\n').split('\n');
  const highlighted = highlightPythonLines(lines);
  const pad = String(lines.length).length;
  const rows = lines.map((line, i) => `
    <div class="code-line">
      <span class="code-line__n">${String(i + 1).padStart(pad, ' ')}</span>
      <span class="code-line__t">${highlighted[i]}</span>
    </div>
  `).join('');
  return `<div class="code-block">${rows}</div>`;
}

function termColorIndex(term) {
  let h = 0;
  for (let i = 0; i < term.length; i++) h = (h * 31 + term.charCodeAt(i)) | 0;
  return Math.abs(h) % 5;
}

function formatInline(text) {
  const chunks = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) chunks.push(esc(text.slice(last, m.index)));
    const i = termColorIndex(m[1]);
    chunks.push(`<strong class="hl-term hl-term--${i}">${esc(m[1])}</strong>`);
    last = re.lastIndex;
  }
  if (last < text.length) chunks.push(esc(text.slice(last)));
  return chunks.join('').replace(/\n/g, '<br>');
}

function formatText(text) {
  if (!text) return '';
  const parts = [];
  const re = /```([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index) });
    parts.push({ type: 'code', content: m[1].replace(/^\n|\n$/g, '') });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) });

  return parts.map((p, i) => {
    if (p.type === 'code') return renderCodeBlock(p.content);
    let content = p.content;
    if (i > 0 && parts[i - 1].type === 'code') content = content.replace(/^\n/, '');
    if (i < parts.length - 1 && parts[i + 1].type === 'code') content = content.replace(/\n$/, '');
    return formatInline(content);
  }).join('');
}

const SELECTABLE = '.card__field-edit, .field input, .field textarea';

function clearSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount) sel.removeAllRanges();
}

document.addEventListener('selectstart', (e) => {
  if (e.target.closest(SELECTABLE)) return;
  e.preventDefault();
});

document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('.btn-icon--delete')) clearArmedDelete();
  if (e.target.closest(SELECTABLE)) return;
  if (e.target.closest('.row__actions')) return;
  clearSelection();
  const active = document.activeElement;
  if (active && active !== document.body && !active.closest('.modal')) active.blur();
  if (!e.target.closest('button, input, textarea, label')) e.preventDefault();
});

function findTheme(name) {
  return data.themes.find((t) => t.name === name);
}

function findCategory(themeName, catName) {
  return findTheme(themeName)?.categories.find((c) => c.name === catName);
}

function renameThemeOpenState(oldName, newName) {
  if (openState.themes[oldName] !== undefined) {
    openState.themes[newName] = openState.themes[oldName];
    delete openState.themes[oldName];
  }
  Object.keys(openState.categories).forEach((key) => {
    if (key.startsWith(`${oldName}::`)) {
      const catName = key.slice(oldName.length + 2);
      openState.categories[`${newName}::${catName}`] = openState.categories[key];
      delete openState.categories[key];
    }
  });
}

function deleteThemeOpenState(themeName) {
  delete openState.themes[themeName];
  Object.keys(openState.categories).forEach((key) => {
    if (key.startsWith(`${themeName}::`)) delete openState.categories[key];
  });
}

function removeTheme(themeName) {
  deleteThemeOpenState(themeName);
  data.themes = data.themes.filter((t) => t.name !== themeName);
}

function deleteTheme(themeName) {
  removeTheme(themeName);
  render();
  save();
}

function removeCategory(themeName, catName) {
  const theme = findTheme(themeName);
  if (!theme) return;
  theme.categories = theme.categories.filter((c) => c.name !== catName);
  delete openState.categories[catKey(themeName, catName)];
}

function deleteCategory(themeName, catName) {
  removeCategory(themeName, catName);
  render();
  save();
}

/* ── Modal ── */

let modalCallback = null;

function openModal(fields, onSubmit) {
  modalBody.innerHTML = fields.map((f) => `
    <div class="field">
      <label for="f-${f.name}">${f.label}</label>
      ${f.type === 'textarea'
        ? `<textarea id="f-${f.name}" name="${f.name}" rows="4">${esc(f.value || '')}</textarea>`
        : `<input id="f-${f.name}" name="${f.name}" value="${esc(f.value || '')}">`}
    </div>
  `).join('');

  modalCallback = onSubmit;
  clearArmedDelete();
  modal.showModal();
  modalBody.querySelector('input, textarea')?.focus();
}

modalForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const values = {};
  modalBody.querySelectorAll('input, textarea').forEach((el) => {
    values[el.name] = el.value.trim();
  });
  if (modalCallback?.(values)) {
    modal.close();
    render();
    save();
  }
});

$('#modal-cancel').addEventListener('click', () => {
  clearArmedDelete();
  modal.close();
});

/* ── CRUD ── */

function openThemeModal(theme = null) {
  openModal(
    [{ name: 'name', label: 'тема', value: theme?.name }],
    (v) => {
      if (theme) {
        if (!v.name.trim()) return false;
        if (v.name !== theme.name) {
          if (findTheme(v.name)) return false;
          renameThemeOpenState(theme.name, v.name);
          theme.name = v.name;
        }
      } else {
        const name = uniqueName(orPlaceholder(v.name), findTheme);
        data.themes.push({ name, categories: [] });
        openState.themes[name] = true;
      }
      return true;
    }
  );
}

function openCategoryModal(themeName, cat = null) {
  openModal(
    [{ name: 'name', label: 'категория', value: cat?.name }],
    (v) => {
      const theme = findTheme(themeName);
      if (!theme) return false;
      if (cat) {
        if (!v.name.trim()) return false;
        if (v.name !== cat.name) {
          if (findCategory(themeName, v.name)) return false;
          const oldKey = catKey(themeName, cat.name);
          const newKey = catKey(themeName, v.name);
          if (openState.categories[oldKey] !== undefined) {
            openState.categories[newKey] = openState.categories[oldKey];
            delete openState.categories[oldKey];
          }
          cat.name = v.name;
        }
      } else {
        const name = uniqueName(orPlaceholder(v.name), (n) => findCategory(themeName, n));
        theme.categories.push({ name, cards: [] });
        openState.categories[catKey(themeName, name)] = true;
        openState.themes[themeName] = true;
      }
      return true;
    }
  );
}

function openCardModal(themeName, catName, card = null) {
  openModal(
    [
      { name: 'question', label: 'вопрос', value: card?.question },
      { name: 'answer', label: 'ответ', type: 'textarea', value: card?.answer },
    ],
    (v) => {
      const cat = findCategory(themeName, catName);
      if (!cat) return false;
      if (card) {
        card.question = v.question.trim();
        card.answer = v.answer.trim();
      } else {
        cat.cards.push({
          id: nextCardId(),
          question: v.question.trim(),
          answer: v.answer.trim(),
          mark: '',
        });
        openState.categories[catKey(themeName, catName)] = true;
        openState.themes[themeName] = true;
      }
      return true;
    }
  );
}

$('#btn-add-theme').addEventListener('click', () => openThemeModal());

loadData().then(render);
