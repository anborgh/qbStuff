/**
 * Универсальная библиотека «Настройка скриптов».
 * автор: Человек-Шаман
 * version: 1.0.0
 * 
 * Регистрация формы:
 *   window.HvScriptManager = window.HvScriptManager || [];
 *   HvScriptManager.push({ id, title, storageKey, ... });
 *
 * Получение настроек из storage:
 *   HvScriptManager.get('myStorageKey').then(function (data) { ... });
 *   // эквивалент:
 *   $.get('/api.php', {
 *     method: 'storage.get',
 *     token: ForumAPITicket,
 *     key: 'myStorageKey',
 *     app_id: 16777215
 *   });
 */

(function hvssSettingsLib(global) {
  function isLiveApi(value) {
    return !!(value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.__booted === true
      && typeof value.push === 'function'
      && typeof value.get === 'function'
      && typeof value.open === 'function');
  }

  // защита от повторного <script> (в т.ч. async/defer гонки)
  if (global.__HvScriptManagerBooted || isLiveApi(global.HvScriptManager)) {
    const api = isLiveApi(global.HvScriptManager) ? global.HvScriptManager : null;
    if (api && typeof api.__reportDuplicateLoad === 'function') {
      api.__reportDuplicateLoad();
    } else if (global.console && typeof global.console.warn === 'function') {
      global.console.warn(
        'HvScriptManager: повторная загрузка библиотеки проигнорирована'
      );
    }
    return;
  }
  global.__HvScriptManagerBooted = true;

  const SETTINGS_PATH = '/scripts_settings';
  const APP_ID = 16777215;
  const SCRIPT_ZONES = [
    { id: 'HTML верх', label: '#html-header' },
    { id: 'HTML низ', label: '#pun-announcement' },
    { id: 'Объявление', label: '#html-footer' },
  ];

  const DEFAULT_DEMO_SAVE_MESSAGE =
    'На демо-форуме сохранение настроек недоступно';

  const state = {
    forms: [],
    errors: [],
    activeId: null,
    showErrors: false,
    forums: null,
    groups: null,
    originalTitle: null,
    shellMounted: false,
    demoMessage: null,
    inited: false,
  };

  const pending = [];
  if (Array.isArray(global.HvScriptManager)) {
    pending.push.apply(pending, global.HvScriptManager);
  }
  if (Array.isArray(global.HvScriptManagerQueue)) {
    pending.push.apply(pending, global.HvScriptManagerQueue);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/'/g, '&#39;');
  }

  function isAdmin() {
    return global.GroupID === 1;
  }

  function isDemoMode() {
    return global.HvScriptManagerDemoMode === true;
  }

  function canAccessSettings() {
    return isAdmin() || isDemoMode();
  }

  function getDemoSaveMessage() {
    if (state.demoMessage) {
      return state.demoMessage;
    }
    if (global.HvScriptManagerDemoMessage) {
      return String(global.HvScriptManagerDemoMessage);
    }
    return DEFAULT_DEMO_SAVE_MESSAGE;
  }

  async function storageGet(key) {
    const { response } = await $.get('/api.php', {
      method: 'storage.get',
      token: global.ForumAPITicket,
      key,
      app_id: APP_ID,
    });
    const raw = response && response.storage && response.storage.data
      ? response.storage.data[key]
      : null;
    if (raw == null || raw === '') {
      return null;
    }
    if (typeof raw === 'object') {
      return raw;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return raw;
    }
  }

  async function storageSet(key, value) {
    if (isDemoMode()) {
      throw new Error(getDemoSaveMessage());
    }
    const payload = typeof value === 'string' ? value : JSON.stringify(value);
    const result = await $.get('/api.php', {
      method: 'storage.set',
      token: global.ForumAPITicket,
      key,
      value: payload,
      app_id: APP_ID,
    });
    if (result && result.error) {
      throw new Error(result.error.message || 'Ошибка сохранения');
    }
    return true;
  }

  async function loadForums() {
    if (state.forums) {
      return state.forums;
    }
    try {
      const { response } = await $.get('/api.php', {
        method: 'board.getForums',
        fields: 'id,name,cat_id',
        limit: 100,
      });
      state.forums = Array.isArray(response) ? response : [];
    } catch (e) {
      console.error(e);
      state.forums = [];
    }
    return state.forums;
  }

  /**
   * Список групп: select#fld2 со страницы /userlist.php
   * (единственный полный список групп на платформе).
   */
  async function loadGroups() {
    if (state.groups) {
      return state.groups;
    }
    try {
      const html = await $.get('/userlist.php');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const select = doc.querySelector('select#fld2');
      const groups = [];
      if (select) {
        const options = select.querySelectorAll('option');
        for (let i = 0; i < options.length; i++) {
          const opt = options[i];
          const rawId = (opt.getAttribute('value') || '').trim();
          const name = (opt.textContent || '').replace(/\s+/g, ' ').trim();
          const id = parseInt(rawId, 10);
          // пропускаем «Все пользователи» и пустые/служебные значения
          if (!name || !Number.isFinite(id) || id < 1) {
            continue;
          }
          groups.push({ id: id, name: name });
        }
      }
      groups.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
      state.groups = groups;
    } catch (e) {
      console.error(e);
      state.groups = [];
    }
    return state.groups;
  }

  function locateMentions(needle) {
    const hits = [];
    if (!needle) {
      return hits;
    }
    SCRIPT_ZONES.forEach(zone => {
      const root = document.getElementById(zone.id);
      if (!root) {
        return;
      }
      const scripts = root.querySelectorAll('script');
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const src = script.getAttribute('src') || '';
        const text = (script.textContent || '').replace(/\s+/g, ' ').trim();
        if (src.indexOf(needle) !== -1 || text.indexOf(needle) !== -1) {
          hits.push({
            zone: zone.label,
            index: i + 1,
            snippet: src || text.slice(0, 100),
          });
        }
      }
    });
    return hits;
  }

  function formatFixHint(hits) {
    if (!hits.length) {
      return 'Проверьте дубли скриптов в #html-header, #pun-announcement или #html-footer и уберите лишнюю строку.';
    }
    return hits.map(hit => (
      'Уберите дублирующую строку из <a href="/admin_forms.php" target="_blank">' + hit.zone
      + '</a> (скрипт #' + hit.index + '): <code>' + escapeHtml(hit.snippet) + '</code>'
    )).join('<br>');
  }

  function addError(error) {
    const key = error.type + ':' + (error.subject || '') + ':' + (error.message || '');
    if (state.errors.some(item => item._key === key)) {
      return;
    }
    error._key = key;
    state.errors.push(error);
    if (state.shellMounted) {
      renderNav();
      if (state.showErrors) {
        renderErrorsPanel();
      }
    }
  }

  function scanDuplicateScriptSrc() {
    const seen = {};
    SCRIPT_ZONES.forEach(zone => {
      const root = document.getElementById(zone.id);
      if (!root) {
        return;
      }
      const scripts = root.querySelectorAll('script[src]');
      for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].getAttribute('src') || '';
        const file = src.split('?')[0].split('/').pop();
        if (!file || !/\.js$/i.test(file)) {
          continue;
        }
        if (!seen[file]) {
          seen[file] = [];
        }
        seen[file].push({
          zone: zone.label,
          index: i + 1,
          snippet: src,
        });
      }
    });
    Object.keys(seen).forEach(file => {
      if (seen[file].length < 2) {
        return;
      }
      addError({
        type: 'duplicate-script',
        subject: file,
        message: 'Скрипт «' + file + '» подключён несколько раз.',
        fixHtml: formatFixHint(seen[file].slice(1).concat(seen[file].slice(0, 1))),
      });
    });
  }

  function normalizeStyleUrl(value) {
    const url = String(value == null ? '' : value).trim();
    return url || null;
  }

  function normalizeFormDef(def) {
    if (!def || typeof def !== 'object') {
      throw new Error('HvScriptManager.register: нужен объект описания формы');
    }
    const id = String(def.id || '').trim();
    const title = String(def.title || id || '').trim();
    const storageKey = String(def.storageKey || '').trim();
    if (!id) {
      throw new Error('HvScriptManager.register: нужен id');
    }
    if (!storageKey) {
      throw new Error('HvScriptManager.register: нужен storageKey');
    }
    if (!title) {
      throw new Error('HvScriptManager.register: нужен title');
    }
    return {
      id,
      title,
      storageKey,
      styleUrl: normalizeStyleUrl(def.styleUrl != null ? def.styleUrl : def.stylesheet),
      defaults: def.defaults && typeof def.defaults === 'object' ? clone(def.defaults) : {},
      fields: Array.isArray(def.fields) ? def.fields : null,
      render: typeof def.render === 'function' ? def.render : null,
      collect: typeof def.collect === 'function' ? def.collect : null,
      onSave: typeof def.onSave === 'function' ? def.onSave : null,
      beforeSave: typeof def.beforeSave === 'function' ? def.beforeSave : null,
      normalize: typeof def.normalize === 'function' ? def.normalize : null,
    };
  }

  function register(rawDef) {
    let def;
    try {
      def = normalizeFormDef(rawDef);
    } catch (e) {
      addError({
        type: 'invalid-register',
        subject: String((rawDef && rawDef.id) || '?'),
        message: e.message || 'Некорректная регистрация формы',
        fixHtml: 'Исправьте вызов HvScriptManager.push(...) в #html-header, #pun-announcement или #html-footer.',
      });
      return false;
    }

    const dupId = state.forms.find(item => item.id === def.id);
    if (dupId) {
      const hits = locateMentions(def.id).concat(locateMentions(def.storageKey));
      addError({
        type: 'duplicate-id',
        subject: def.id,
        message: 'Форма с id «' + def.id + '» зарегистрирована повторно.',
        fixHtml: formatFixHint(hits),
      });
      return false;
    }

    const dupKey = state.forms.find(item => item.storageKey === def.storageKey);
    if (dupKey) {
      const hits = locateMentions(def.storageKey);
      addError({
        type: 'duplicate-key',
        subject: def.storageKey,
        message: 'Ключ storage «' + def.storageKey + '» уже занят формой «'
          + dupKey.title + '» (id: ' + dupKey.id + ').',
        fixHtml: formatFixHint(hits),
      });
      return false;
    }

    state.forms.push(def);
    if (!state.activeId) {
      state.activeId = def.id;
    }
    if (state.shellMounted) {
      renderNav();
      if (!state.showErrors && state.activeId === def.id) {
        openForm(def.id, false);
      }
    }
    return true;
  }

  function injectStyles() {
    if (document.getElementById('hvss-settings-lib-style')) {
      return;
    }
    const style = document.createElement('style');
    style.id = 'hvss-settings-lib-style';
    style.textContent = `
#pun-admain .hvss-nav-badge {
  display: inline-block;
  min-width: 1.2em;
  padding: 0 5px;
  margin-left: 6px;
  border-radius: 8px;
  background: #c44;
  color: #fff;
  font-size: .8em;
  line-height: 1.4;
  text-align: center;
}
#pun-admain .hvss-errors .hv-err-item {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid #e0a0a8;
  background: #f8d7da;
  color: #6a1a22;
}
#pun-admain .hvss-errors .hv-err-item code {
  background: rgba(0,0,0,.06);
  padding: 1px 4px;
}
#pun-admain .hvss-demo-notice {
  margin: 0 0 12px;
  padding: 10px 12px;
  border: 1px solid #e0c48a;
  background: #fff6df;
  color: #6a4b00;
}
#pun-admain .hvss-field { margin: 0 0 10px; }
#pun-admain .hvss-field label.hvss-label { display: block; margin-bottom: 2px; }
#pun-admain .hvss-field .hvss-desc { font-size: .9em; font-style: italic; margin: 0 0 4px; }
#pun-admain .hvss-field input[type="text"],
#pun-admain .hvss-field input[type="number"],
#pun-admain .hvss-field select,
#pun-admain .hvss-field textarea { width: 100%; max-width: 100%; box-sizing: border-box; }
#pun-admain .hvss-checklist {
  max-height: 220px;
  overflow: auto;
  border: 1px solid;
  padding: 6px 8px;
}
#pun-admain .hvss-checklist label { display: block; margin: 2px 0; }
#pun-admain .submitend .hvss-help-btn { margin-left: 8px; min-width: 2em; }
.hvss-help-dialog { display: none; }
.hvss-help-dialog .hv-bg {
  position: fixed; display: flex; align-items: center; justify-content: center;
  z-index: 1100; inset: 0; background: rgba(0,0,0,.4); cursor: pointer;
}
.hvss-help-dialog .inner {
  cursor: default; width: 560px; max-width: 96%; max-height: 90%; overflow: auto;
  padding: 12px 14px; box-shadow: 0 0 40px #222; background: #F4F5F6;
}
.hvss-help-dialog .hv-help-title { font-weight: 700; font-size: 16px; margin: 0 0 10px; text-align: center; }
.hvss-help-dialog pre {
  margin: 0 0 10px; padding: 8px 10px; overflow: auto; font-size: 12px;
  background: rgba(0,0,0,.06); white-space: pre-wrap; word-break: break-word;
}
.hvss-help-dialog .hv-control { text-align: center; margin-top: 8px; }
.hvss-help-dialog p { margin: 0 0 8px; }
`;
    document.head.appendChild(style);
  }

  function openStorageHelpDialog(storageKey) {
    const key = String(storageKey || '');
    let root = document.getElementById('hvss-help-dialog');
    if (!root) {
      root = document.createElement('div');
      root.id = 'hvss-help-dialog';
      root.className = 'hvss-help-dialog';
      root.innerHTML = '<div class="hv-bg"><div class="inner container"></div></div>';
      document.body.appendChild(root);
      const bg = root.querySelector('.hv-bg');
      bg.addEventListener('click', event => {
        if (event.target === bg) {
          root.style.display = 'none';
        }
      });
      if (!openStorageHelpDialog._esc) {
        openStorageHelpDialog._esc = true;
        document.addEventListener('keydown', e => {
          if ((e.key === 'Escape' || e.keyCode === 27) && root.style.display === 'block') {
            root.style.display = 'none';
          }
        });
      }
    }

    const sampleGet =
      "HvScriptManager.get('" + key + "').then(function (data) {\n"
      + "  if (!data) return; // ключа ещё нет\n"
      + "  // data — объект настроек\n"
      + "  console.log(data);\n"
      + "});";
    const sampleApi =
      "$.get('/api.php', {\n"
      + "  method: 'storage.get',\n"
      + "  token: ForumAPITicket,\n"
      + "  key: '" + key + "',\n"
      + "  app_id: " + APP_ID + "\n"
      + "}).then(function (result) {\n"
      + "  var raw = result.response && result.response.storage\n"
      + "    && result.response.storage.data\n"
      + "    && result.response.storage.data['" + key + "'];\n"
      + "  var data = raw ? JSON.parse(raw) : null;\n"
      + "});";

    root.querySelector('.inner').innerHTML =
      '<div class="hv-help-title">Как получить настройки в коде</div>'
      + '<p>Ключ storage: <code>' + escapeHtml(key) + '</code></p>'
      + '<p>Через библиотеку:</p>'
      + '<pre>' + escapeHtml(sampleGet) + '</pre>'
      + '<p>Напрямую через API форума (jQuery 1.7.2):</p>'
      + '<pre>' + escapeHtml(sampleApi) + '</pre>'
      + '<div class="hv-control">'
      + '<input type="button" class="button" id="hvss-help-close" value="Закрыть" />'
      + '</div>';

    root.querySelector('#hvss-help-close').onclick = () => {
      root.style.display = 'none';
    };
    root.style.display = 'block';
  }

  function attachStorageHelp(panel, storageKey) {
    if (!panel) {
      return;
    }
    let bar = panel.querySelector('.submitend');
    if (!bar) {
      bar = document.createElement('p');
      bar.className = 'submitend';
      panel.appendChild(bar);
    }
    if (bar.querySelector('.hvss-help-btn')) {
      return;
    }
    const btn = document.createElement('input');
    btn.type = 'button';
    btn.className = 'button hvss-help-btn';
    btn.value = '?';
    btn.title = 'Как получить настройки в коде';
    btn.addEventListener('click', () => {
      openStorageHelpDialog(storageKey);
    });
    bar.appendChild(btn);
  }

  function ensureAdminStyle() {
    if (document.getElementById('hvss-admin-style')) {
      return;
    }
    const link = document.createElement('link');
    link.id = 'hvss-admin-style';
    link.rel = 'stylesheet';
    link.href = '/style/admin.css';
    document.head.appendChild(link);
  }

  /**
   * Подключает stylesheet активной формы (один общий <link>).
   * При смене формы href меняется; без styleUrl — link снимается.
   */
  function applyFormStyle(styleUrl) {
    const id = 'hvss-form-style';
    let link = document.getElementById(id);
    if (!styleUrl) {
      if (link && link.parentNode) {
        link.parentNode.removeChild(link);
      }
      return;
    }
    if (!link) {
      link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.getAttribute('href') !== styleUrl) {
      link.href = styleUrl;
    }
  }

  function ensureSettingsPage() {
    const main = document.getElementById('pun-main');
    if (!main) {
      return null;
    }
    let section = main.querySelector('.section');
    if (!section) {
      section = document.createElement('div');
      section.className = 'section';
      main.innerHTML = '';
      main.appendChild(section);
    }
    let container = section.querySelector('.container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'container';
      section.innerHTML = '';
      section.appendChild(container);
    }
    return container;
  }

  function renderSettingsCrumbs(activeTitle) {
    const main = document.getElementById('pun-main');
    if (!main) {
      return;
    }
    let homeHref = '/';
    let homeText = 'Форум';
    const existingCrumbs = document.getElementById('pun-crumbs1');
    const homeLink = existingCrumbs && existingCrumbs.querySelector('a');
    if (homeLink) {
      homeHref = homeLink.getAttribute('href') || '/';
      homeText = homeLink.textContent || 'Форум';
    }
    let crumbsSection = existingCrumbs;
    if (!crumbsSection) {
      crumbsSection = document.createElement('div');
      crumbsSection.id = 'pun-crumbs1';
      main.insertAdjacentElement('beforebegin', crumbsSection);
    }
    crumbsSection.className = 'section';
    const p = document.createElement('p');
    p.className = 'container crumbs';
    p.innerHTML = '<strong>Вы здесь</strong> <em>»&nbsp;</em>';
    const link = document.createElement('a');
    link.href = homeHref;
    link.textContent = homeText;
    p.appendChild(link);
    const sep = document.createElement('em');
    sep.innerHTML = '»&nbsp;';
    p.appendChild(document.createTextNode(' '));
    p.appendChild(sep);
    p.appendChild(document.createTextNode(' '));
    p.appendChild(document.createTextNode(activeTitle ? ('Настройка скриптов: ' + activeTitle) : 'Настройка скриптов'));
    crumbsSection.innerHTML = '';
    crumbsSection.appendChild(p);
  }

  function setPageTitle(activeForm) {
    if (state.originalTitle == null) {
      state.originalTitle = document.title;
    }
    document.title = 'Настройка скриптов: ' + activeForm;
  }

  function mountShell(container) {
    container.innerHTML = '';
    injectStyles();
    const wrap = document.createElement('div');
    wrap.className = 'hvss-settings-root';
    wrap.innerHTML = `
<div id="pun-admain" class="adminmain">
  <div id="pun-adnav">
    <h2><span>Скрипты</span></h2>
    <div class="adcontainer">
      <ul id="hvss-settings-nav"></ul>
    </div>
  </div>
  <div id="pun-admain1" class="adformal">
    <h2><span id="hvss-settings-heading">Настройка скриптов</span></h2>
    <div class="adcontainer" id="hvss-settings-panel"></div>
  </div>
</div>`;
    container.appendChild(wrap);
    state.shellMounted = true;
    renderNav();
  }

  function renderNav() {
    const ul = document.getElementById('hvss-settings-nav');
    if (!ul) {
      return;
    }
    ul.innerHTML = '';
    state.forms.forEach((form, index) => {
      const li = document.createElement('li');
      li.className = 'item' + (index + 1)
        + (!state.showErrors && state.activeId === form.id ? ' isactive' : '');
      const a = document.createElement('a');
      a.href = SETTINGS_PATH + '#' + encodeURIComponent(form.id);
      a.textContent = form.title;
      a.addEventListener('click', event => {
        event.preventDefault();
        openForm(form.id, true);
      });
      li.appendChild(a);
      ul.appendChild(li);
    });

    if (state.errors.length) {
      const li = document.createElement('li');
      li.className = 'item-errors' + (state.showErrors ? ' isactive' : '');
      const a = document.createElement('a');
      a.href = SETTINGS_PATH + '#errors';
      a.innerHTML = 'Ошибки<span class="hvss-nav-badge" title="Найдено ошибок">'
        + state.errors.length + '</span>';
      a.addEventListener('click', event => {
        event.preventDefault();
        openErrors(true);
      });
      li.appendChild(a);
      ul.appendChild(li);
    }
  }

  function renderErrorsPanel() {
    const panel = document.getElementById('hvss-settings-panel');
    const heading = document.getElementById('hvss-settings-heading');
    if (!panel || !heading) {
      return;
    }
    heading.textContent = 'Ошибки регистрации настроек';
    setPageTitle('Ошибки');
    renderSettingsCrumbs('Ошибки');
    if (!state.errors.length) {
      panel.innerHTML = '<p class="adinfofield">Ошибок нет.</p>';
      return;
    }
    panel.innerHTML = '<div class="hvss-errors">' + state.errors.map(err => (
      '<div class="hv-err-item">'
      + '<b>' + escapeHtml(err.message) + '</b>'
      + '<div style="margin-top:6px">' + (err.fixHtml || '') + '</div>'
      + '</div>'
    )).join('') + '</div>';
  }

  function openErrors(pushHash) {
    state.showErrors = true;
    applyFormStyle(null);
    renderNav();
    renderErrorsPanel();
    if (pushHash) {
      try {
        global.history.replaceState({ hvssSettings: true }, '', SETTINGS_PATH + '#errors');
      } catch (e) { /* ignore */ }
    }
  }

  function getValueByPath(obj, path) {
    return path.split('.').reduce((acc, key) => (
      acc == null ? undefined : acc[key]
    ), obj);
  }

  function setValueByPath(obj, path, value) {
    const parts = path.split('.');
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!cur[key] || typeof cur[key] !== 'object') {
        cur[key] = {};
      }
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function renderField(field, settings, forums, groups) {
    const key = field.key;
    const id = 'hvss_f_' + String(key).replace(/[^\w-]/g, '_');
    const label = field.label || key;
    const desc = field.description
      ? '<div class="hvss-desc">' + escapeHtml(field.description) + '</div>'
      : '';
    const value = getValueByPath(settings, key);
    const type = field.type || 'text';
    let control = '';

    if (type === 'textarea') {
      control = '<textarea id="' + id + '" rows="' + (field.rows || 4) + '">'
        + escapeHtml(value == null ? '' : value) + '</textarea>';
    } else if (type === 'checkbox') {
      control = '<label><input type="checkbox" id="' + id + '"'
        + (value ? ' checked' : '') + ' /> '
        + escapeHtml(field.checkboxLabel || 'Включено') + '</label>';
    } else if (type === 'number') {
      control = '<input type="number" id="' + id + '" value="'
        + escapeAttr(value == null ? '' : value) + '"'
        + (field.min != null ? ' min="' + escapeAttr(field.min) + '"' : '')
        + (field.max != null ? ' max="' + escapeAttr(field.max) + '"' : '')
        + (field.step != null ? ' step="' + escapeAttr(field.step) + '"' : '')
        + ' />';
    } else if (type === 'select') {
      const options = Array.isArray(field.options) ? field.options : [];
      control = '<select id="' + id + '">' + options.map(opt => {
        const optValue = typeof opt === 'object' ? opt.value : opt;
        const optLabel = typeof opt === 'object' ? (opt.label || opt.value) : opt;
        const selected = String(optValue) === String(value) ? ' selected' : '';
        return '<option value="' + escapeAttr(optValue) + '"' + selected + '>'
          + escapeHtml(optLabel) + '</option>';
      }).join('') + '</select>';
    } else if (type === 'forumlist' || type === 'grouplist') {
      const list = type === 'forumlist' ? forums : groups;
      const selected = Array.isArray(value) ? value.map(String) : [];
      const items = (list || []).map(item => {
        const itemId = item.id;
        const checked = selected.indexOf(String(itemId)) !== -1 ? ' checked' : '';
        return '<label><input type="checkbox" data-hvss-list="' + escapeAttr(id)
          + '" value="' + escapeAttr(itemId) + '"' + checked + ' /> '
          + escapeHtml(item.name) + '</label>';
      }).join('');
      control = '<div class="hvss-checklist" id="' + id + '">'
        + (items || '<em>Список пуст</em>') + '</div>';
    } else {
      control = '<input type="text" id="' + id + '" value="'
        + escapeAttr(value == null ? '' : value) + '"'
        + (field.placeholder ? ' placeholder="' + escapeAttr(field.placeholder) + '"' : '')
        + ' />';
    }

    return '<div class="hvss-field" data-key="' + escapeAttr(key) + '" data-type="'
      + escapeAttr(type) + '" data-input="' + escapeAttr(id) + '">'
      + '<label class="hvss-label" for="' + id + '">' + escapeHtml(label) + '</label>'
      + desc + '<div class="hvss-control">' + control + '</div></div>';
  }

  function collectFields(panel, fields, settings) {
    const next = clone(settings);
    fields.forEach(field => {
      const key = field.key;
      const id = 'hvss_f_' + String(key).replace(/[^\w-]/g, '_');
      const type = field.type || 'text';
      if (type === 'checkbox') {
        const el = panel.querySelector('#' + id);
        setValueByPath(next, key, !!(el && el.checked));
      } else if (type === 'number') {
        const el = panel.querySelector('#' + id);
        const raw = el ? el.value : '';
        const num = parseFloat(raw);
        setValueByPath(next, key, Number.isFinite(num) ? num : (field.default != null ? field.default : 0));
      } else if (type === 'forumlist' || type === 'grouplist') {
        const boxes = panel.querySelectorAll('input[data-hvss-list="' + id + '"]:checked');
        const values = [];
        for (let i = 0; i < boxes.length; i++) {
          const num = parseInt(boxes[i].value, 10);
          if (Number.isFinite(num)) {
            values.push(num);
          }
        }
        setValueByPath(next, key, values);
      } else {
        const el = panel.querySelector('#' + id);
        setValueByPath(next, key, el ? el.value : '');
      }
    });
    return next;
  }

  async function openForm(formId, pushHash) {
    const form = state.forms.find(item => item.id === formId) || state.forms[0];
    if (!form) {
      applyFormStyle(null);
      const panel = document.getElementById('hvss-settings-panel');
      if (panel) {
        panel.innerHTML = '<p class="adinfofield">Пока нет зарегистрированных форм настроек.</p>';
      }
      setPageTitle('—');
      return;
    }

    state.showErrors = false;
    state.activeId = form.id;
    applyFormStyle(form.styleUrl);
    renderNav();

    const heading = document.getElementById('hvss-settings-heading');
    const panel = document.getElementById('hvss-settings-panel');
    if (!heading || !panel) {
      return;
    }
    heading.textContent = form.title;
    setPageTitle(form.title);
    renderSettingsCrumbs(form.title);
    panel.innerHTML = '<p class="adinfofield">Загрузка…</p>';

    if (pushHash) {
      try {
        global.history.replaceState(
          { hvssSettings: true },
          '',
          SETTINGS_PATH + '#' + encodeURIComponent(form.id)
        );
      } catch (e) { /* ignore */ }
    }

    const forums = await loadForums();
    const groups = await loadGroups();
    let settings = clone(form.defaults);
    try {
      const stored = await storageGet(form.storageKey);
      if (stored && typeof stored === 'object') {
        settings = form.normalize
          ? form.normalize(stored, clone(form.defaults))
          : Object.assign(clone(form.defaults), stored);
      }
    } catch (e) {
      console.error(e);
    }

    // пользователь уже переключил форму / открыл ошибки — не затираем панель
    if (state.activeId !== form.id || state.showErrors) {
      return;
    }
    applyFormStyle(form.styleUrl);

    const ctx = {
      form,
      settings,
      forums,
      groups,
      panel,
      get: storageGet,
      set: storageSet,
      appId: APP_ID,
      escapeHtml,
      escapeAttr,
      reload: function () {
        return openForm(form.id, false);
      },
      save: async function (payload) {
        let data = payload;
        if (form.beforeSave) {
          data = await form.beforeSave(data, ctx);
          if (data === false) {
            return false;
          }
        }
        await storageSet(form.storageKey, data);
        if (form.onSave) {
          await form.onSave(data, ctx);
        }
        if (global.$ && $.jGrowl) {
          $.jGrowl('Настройки сохранены');
        }
        return true;
      },
    };

    panel.innerHTML = '';

    function attachDemoNotice() {
      if (!isDemoMode()) {
        return;
      }
      const notice = document.createElement('p');
      notice.className = 'adinfofield hvss-demo-notice';
      notice.textContent = getDemoSaveMessage();
      panel.insertBefore(notice, panel.firstChild);
    }

    if (form.render) {
      await form.render(panel, ctx);
      attachDemoNotice();
      attachStorageHelp(panel, form.storageKey);
      return;
    }

    if (!form.fields || !form.fields.length) {
      panel.innerHTML = '<p class="adinfofield">У формы нет полей и нет custom render.</p>';
      attachDemoNotice();
      attachStorageHelp(panel, form.storageKey);
      return;
    }

    const fieldsHtml = form.fields.map(field => renderField(field, settings, forums, groups)).join('');
    panel.innerHTML = '<fieldset><legend><span>Настройки</span></legend>'
      + '<div class="adfs-box">' + fieldsHtml + '</div></fieldset>'
      + '<p class="submitend">'
      + '<input type="button" class="button" id="hvss-save-fields" value="Сохранить" />'
      + '</p>';
    attachDemoNotice();

    const saveBtn = panel.querySelector('#hvss-save-fields');
    saveBtn.addEventListener('click', async () => {
      try {
        let data = collectFields(panel, form.fields, settings);
        if (form.collect) {
          data = form.collect(panel, data, ctx);
          if (data === false) {
            return;
          }
        }
        await ctx.save(data);
      } catch (e) {
        console.error(e);
        if (global.$ && $.jGrowl) {
          $.jGrowl(e.message || 'Ошибка сохранения');
        }
      }
    });
    attachStorageHelp(panel, form.storageKey);
  }

  async function openSettings(pushUrl) {
    if (!canAccessSettings()) {
      return;
    }
    scanDuplicateScriptSrc();
    ensureAdminStyle();
    const container = ensureSettingsPage();
    if (!container) {
      return;
    }
    mountShell(container);

    const hash = (global.location.hash || '').replace(/^#/, '');
    if (hash === 'errors' && state.errors.length) {
      openErrors(false);
    } else if (hash && state.forms.some(item => item.id === hash)) {
      await openForm(hash, false);
    } else {
      await openForm(state.activeId || (state.forms[0] && state.forms[0].id), false);
    }

    if (pushUrl && global.location.pathname !== SETTINGS_PATH) {
      const suffix = state.showErrors
        ? '#errors'
        : (state.activeId ? '#' + encodeURIComponent(state.activeId) : '');
      global.history.pushState({ hvssSettings: true }, '', SETTINGS_PATH + suffix);
    }
  }

  function addMenuLink() {
    if (!canAccessSettings()) {
      return;
    }
    if (document.getElementById('hvscriptsettings')) {
      return;
    }
    const ulinks = document.querySelector('#pun-ulinks');
    if (!ulinks) {
      return;
    }
    // на типовой вёрстке пункт подписки: #h-subscribe
    // https://houngan.mybb.ru/
    const after = ulinks.querySelector('li#h-subscribe')
      || ulinks.querySelector('li#notify-link')
      || ulinks.querySelector('li:last-child');
    if (!after) {
      return;
    }

    const item = document.createElement('li');
    item.className = 'item8';
    item.id = 'hvscriptsettings';
    const link = document.createElement('a');
    link.href = SETTINGS_PATH;
    link.textContent = 'Скрипты';
    link.title = 'настройки пользовательских скриптов';
    link.addEventListener('click', event => {
      event.preventDefault();
      openSettings(true);
    });
    item.appendChild(link);
    after.insertAdjacentElement('afterend', item);

    if (global.$ && $.fn && typeof $.fn.tipsy === 'function') {
      $(link).tipsy({ gravity: 'n', fade: true });
    }
  }

  function enableDemoMode(options) {
    options = options || {};
    global.HvScriptManagerDemoMode = true;
    if (options.message != null && String(options.message).trim()) {
      state.demoMessage = String(options.message).trim();
      global.HvScriptManagerDemoMessage = state.demoMessage;
    } else if (global.HvScriptManagerDemoMessage) {
      state.demoMessage = String(global.HvScriptManagerDemoMessage);
    }
    addMenuLink();
    if (global.location.pathname === SETTINGS_PATH) {
      openSettings(false);
    }
    return true;
  }

  function reportDuplicateLoad() {
    const hits = locateMentions('hvss-settings')
      .concat(locateMentions('HvScriptManager'));
    addError({
      type: 'duplicate-library',
      subject: 'hvss-settings.js',
      message: 'Библиотека HvScriptManager подключена повторно. Повторная инициализация пропущена.',
      fixHtml: formatFixHint(hits),
    });
  }

  function init() {
    if (state.inited) {
      return;
    }
    state.inited = true;
    if (isDemoMode() && global.HvScriptManagerDemoMessage) {
      state.demoMessage = String(global.HvScriptManagerDemoMessage);
    }
    addMenuLink();
    if (global.location.pathname === SETTINGS_PATH) {
      openSettings(false);
    }
    global.addEventListener('popstate', () => {
      if (global.location.pathname === SETTINGS_PATH) {
        openSettings(false);
      }
    });
  }

  function push() {
    for (let i = 0; i < arguments.length; i++) {
      register(arguments[i]);
    }
    return state.forms.length;
  }

  const api = {
    __booted: true,
    __reportDuplicateLoad: reportDuplicateLoad,
    APP_ID,
    SETTINGS_PATH,
    push,
    register: push,
    get: storageGet,
    set: storageSet,
    getForums: loadForums,
    getGroups: loadGroups,
    open: openSettings,
    enableDemoMode,
    isDemoMode,
    list: function () {
      return state.forms.slice();
    },
    errors: function () {
      return state.errors.slice();
    },
    get length() {
      return state.forms.length;
    },
  };

  global.HvScriptManager = api;
  global.HvScriptManagerQueue = api;

  pending.forEach(item => {
    register(item);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
