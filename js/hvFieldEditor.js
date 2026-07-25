/**
 * Встраиваемый редактор полей профиля в стартовом посте темы.
 * Пример:
 * hvFieldEditor({
 *   topicId: 6070,
 *   fields: ['pa-title', 'pa-fld2', 'pa-fld4']
 * });
 */
(function initHvFieldEditor(global) {
  const STYLE_ID = 'hv-field-editor-style';
  const TOOLBAR_ID = 'hv-field-editor-toolbar';
  const FONT_SCALE_STEP = 1.1;

  function hvFieldEditor(options = {}) {
    const topicId = Number(options.topicId);
    const fieldClasses = normalizeFields(options.fields);

    if (!topicId || location.pathname !== '/viewtopic.php') return;

    const currentTopicId = Number(new URLSearchParams(location.search).get('id'));
    if (topicId !== currentTopicId) return;

    const starterProfile = document.querySelector('.topicpost .post-author');
    if (!starterProfile) return;

    injectStyle();
    patchProfileWithCurrentUser(starterProfile);

    const editableFields = makeFieldsEditable(starterProfile, fieldClasses);
    if (!editableFields.length) return;

    const toolbar = ensureToolbar();
    bindEditorEvents(toolbar, editableFields);
    ensureInsertButton(starterProfile, editableFields);
  }

  function normalizeFields(fields) {
    if (!Array.isArray(fields)) return [];
    return fields
      .map((entry) => String(entry || '').trim().replace(/^\./, ''))
      .filter(Boolean);
  }

  function patchProfileWithCurrentUser(root) {
    const avatar = root.querySelector('.pa-avatar img');
    if (avatar && typeof global.UserAvatar === 'string') {
      avatar.src = global.UserAvatar;
      if (typeof global.UserLogin === 'string' && global.UserLogin) {
        avatar.alt = global.UserLogin;
      }
    }

    const authorLink = root.querySelector('.pa-author a');
    if (authorLink && typeof global.UserLogin === 'string' && global.UserLogin) {
      authorLink.textContent = global.UserLogin;
      const escaped = global.UserLogin.replace(/'/g, "\\'");
      authorLink.setAttribute('href', "javascript:to('" + escaped + "')");
    }

    const title = root.querySelector('.pa-title');
    if (title && typeof global.UserTitle === 'string') {
      title.innerHTML = global.UserTitle;
    }

    const fieldItems = root.querySelectorAll('li[class*="pa-fld"]');
    fieldItems.forEach((item) => {
      const match = Array.from(item.classList).find((className) => /^pa-fld\d+$/.test(className));
      if (!match) return;

      const fieldIndex = match.match(/\d+$/)[0];
      const userValue = global['UserFld' + fieldIndex];
      if (typeof userValue !== 'string') return;

      setProfileFieldValue(item, userValue);
    });
  }

  function setProfileFieldValue(fieldNode, htmlValue) {
    const fldName = fieldNode.querySelector('.fld-name');
    if (!fldName) {
      fieldNode.innerHTML = htmlValue;
      return;
    }

    while (fldName.nextSibling) {
      fldName.parentNode.removeChild(fldName.nextSibling);
    }

    fldName.insertAdjacentText('afterend', ' ');
    fldName.insertAdjacentHTML('afterend', htmlValue);
  }

  function makeFieldsEditable(root, fieldClasses) {
    const result = [];

    fieldClasses.forEach((className) => {
      const fieldNode = root.querySelector('.' + cssEscape(className));
      if (!fieldNode) return;

      const editableNode = ensureEditableNode(fieldNode);
      if (!editableNode) return;

      result.push({
        className,
        fieldNode,
        editableNode,
        getInnerHTML: () => editableNode.innerHTML,
      });
    });

    return result;
  }

  function ensureEditableNode(fieldNode) {
    if (fieldNode.classList.contains('hvfe-editable')) {
      return fieldNode;
    }

    if (/^pa-fld\d+$/.test(getFieldClass(fieldNode))) {
      const existingEditable = fieldNode.querySelector('.hvfe-editable');
      if (existingEditable) return existingEditable;

      const label = fieldNode.querySelector('.fld-name');
      if (!label) {
        fieldNode.classList.add('hvfe-editable');
        fieldNode.setAttribute('contenteditable', 'true');
        return fieldNode;
      }

      const wrapper = document.createElement('span');
      wrapper.className = 'hvfe-editable';
      wrapper.setAttribute('contenteditable', 'true');

      const movedNodes = [];
      while (label.nextSibling) {
        movedNodes.push(label.nextSibling);
        fieldNode.removeChild(label.nextSibling);
      }

      if (!movedNodes.length) {
        wrapper.innerHTML = '';
      } else {
        movedNodes.forEach((node) => wrapper.appendChild(node));
      }

      label.insertAdjacentText('afterend', ' ');
      label.parentNode.insertBefore(wrapper, label.nextSibling.nextSibling);
      return wrapper;
    }

    fieldNode.classList.add('hvfe-editable');
    fieldNode.setAttribute('contenteditable', 'true');
    return fieldNode;
  }

  function getFieldClass(node) {
    return Array.from(node.classList).find((className) => /^pa-fld\d+$/.test(className)) || '';
  }

  function ensureInsertButton(profileNode, editableFields) {
    let button = profileNode.parentNode.querySelector('.hvfe-insert-btn');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'button hvfe-insert-btn';
      button.textContent = 'Вставить код';
      profileNode.insertAdjacentElement('afterend', button);
    }

    button.onclick = function onInsertClick() {
      if (typeof global.insert !== 'function') return;
      const payload = editableFields
        .map((entry) => '[code]' + entry.getInnerHTML() + '[/code]')
        .join('\n');
      global.insert(payload);
    };
  }

  function ensureToolbar() {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) return toolbar;

    toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.className = 'hvfe-toolbar hidden';
    toolbar.innerHTML = [
      '<button type="button" data-cmd="bold"><b>b</b></button>',
      '<button type="button" data-cmd="italic"><i>i</i></button>',
      '<button type="button" data-cmd="underline"><u>u</u></button>',
      '<button type="button" data-cmd="strikeThrough"><s>s</s></button>',
      '<button type="button" data-cmd="link">url</button>',
      '<button type="button" data-cmd="sizeUp">T+</button>',
      '<button type="button" data-cmd="sizeDown">T-</button>',
      '<button type="button" data-cmd="color">color</button>',
    ].join('');

    document.body.appendChild(toolbar);
    return toolbar;
  }

  function bindEditorEvents(toolbar, editableFields) {
    const editables = editableFields.map((entry) => entry.editableNode);

    document.addEventListener('selectionchange', () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        hideToolbar(toolbar);
        return;
      }

      const anchor = selection.anchorNode;
      const inside = editables.some((editable) => editable.contains(anchor));
      if (!inside) {
        hideToolbar(toolbar);
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return;
      showToolbar(toolbar, rect);
    });

    toolbar.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    toolbar.addEventListener('click', (event) => {
      const cmd = event.target && event.target.closest('button') && event.target.closest('button').dataset.cmd;
      if (!cmd) return;

      applyCommand(cmd);

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        hideToolbar(toolbar);
        return;
      }

      const rect = selection.getRangeAt(0).getBoundingClientRect();
      showToolbar(toolbar, rect);
    });

    document.addEventListener('click', (event) => {
      if (toolbar.contains(event.target)) return;
      const clickedEditable = editables.some((editable) => editable.contains(event.target));
      if (!clickedEditable) hideToolbar(toolbar);
    });
  }

  function applyCommand(cmd) {
    if (cmd === 'link') {
      const value = window.prompt('URL:', 'https://');
      if (!value) return;
      document.execCommand('createLink', false, value);
      return;
    }

    if (cmd === 'color') {
      const raw = window.prompt('Hex color (например ff6600 или #ff6600):', '#000000');
      if (!raw) return;
      const normalized = normalizeHexColor(raw);
      if (!normalized) return;
      document.execCommand('foreColor', false, normalized);
      return;
    }

    if (cmd === 'sizeUp') {
      applyFontScale(FONT_SCALE_STEP);
      return;
    }

    if (cmd === 'sizeDown') {
      applyFontScale(1 / FONT_SCALE_STEP);
      return;
    }

    document.execCommand(cmd, false, null);
  }

  function wrapSelection(startTag, endTag) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const fragment = range.extractContents();
    const container = document.createElement('div');
    container.appendChild(fragment);
    const html = container.innerHTML;
    range.insertNode(range.createContextualFragment(startTag + html + endTag));
  }

  function applyFontScale(scale) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    wrapSelection('<span class="hvfe-font-scale" style="font-size:' + scale + 'em;">', '</span>');

    const scope = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentNode;

    normalizeFontScaleSpans(scope);
  }

  function normalizeFontScaleSpans(scope) {
    if (!scope || !scope.querySelectorAll) return;

    let changed = true;
    while (changed) {
      changed = false;
      const nested = scope.querySelectorAll('span.hvfe-font-scale span.hvfe-font-scale');

      nested.forEach((inner) => {
        const outer = inner.parentElement;
        if (!outer || !outer.classList.contains('hvfe-font-scale')) return;
        if (outer.childNodes.length !== 1) return;

        const combined = parseFontScale(outer.style.fontSize) * parseFontScale(inner.style.fontSize);

        if (Math.abs(combined - 1) < 0.01) {
          const fragment = document.createDocumentFragment();
          while (inner.firstChild) fragment.appendChild(inner.firstChild);
          outer.replaceWith(fragment);
          changed = true;
          return;
        }

        inner.style.fontSize = trimFloat(combined) + 'em';
        outer.replaceWith(inner);
        changed = true;
      });
    }
  }

  function parseFontScale(value) {
    const match = String(value || '').trim().match(/^([0-9]*\.?[0-9]+)em$/i);
    if (!match) return 1;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  function trimFloat(value) {
    return Number(value.toFixed(4)).toString();
  }

  function normalizeHexColor(raw) {
    const color = String(raw || '').trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color)) return null;
    return '#' + color;
  }

  function showToolbar(toolbar, rect) {
    toolbar.classList.remove('hidden');
    toolbar.style.top = Math.max(window.scrollY + rect.top - 42, 8) + 'px';
    toolbar.style.left = Math.max(window.scrollX + rect.left, 8) + 'px';
  }

  function hideToolbar(toolbar) {
    toolbar.classList.add('hidden');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.hvfe-editable { outline: 1px dashed transparent; min-height: 1em; }',
      '.hvfe-editable:focus { outline-color: #7f9db9; }',
      '.hvfe-insert-btn { margin-top: 8px; }',
      '.hvfe-toolbar {',
      '  position: absolute;',
      '  z-index: 99999;',
      '  background: #fff;',
      '  border: 1px solid #c9c9c9;',
      '  box-shadow: 0 2px 8px rgba(0,0,0,0.15);',
      '  padding: 4px;',
      '  border-radius: 4px;',
      '}',
      '.hvfe-toolbar.hidden { display: none; }',
      '.hvfe-toolbar button { margin: 0 2px; min-width: 28px; cursor: pointer; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  function cssEscape(value) {
    if (global.CSS && typeof global.CSS.escape === 'function') {
      return global.CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  global.hvFieldEditor = hvFieldEditor;
})(window);
