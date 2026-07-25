/**
 * Демо-режим «Настройка скриптов» для гостевого демо-форума.
 *
 * Можно включить и до загрузки библиотеки:
 *   window.HvScriptManagerDemoMode = true;
 */
(function hvssSettingsDemo(global) {
  const MESSAGE =
    'На демо-форуме сохранение настроек недоступно. '
    + 'Формы можно просматривать и менять, но изменения не будут записаны.';

  global.HvScriptManagerDemoMode = true;
  global.HvScriptManagerDemoMessage = MESSAGE;

  function activate() {
    if (!global.HvScriptManager || typeof global.HvScriptManager.enableDemoMode !== 'function') {
      return false;
    }
    global.HvScriptManager.enableDemoMode({ message: MESSAGE });
    return true;
  }

  if (activate()) {
    return;
  }

  // библиотека ещё не загружена — флаг уже выставлен, enableDemoMode вызовется при появлении API
  const timer = global.setInterval(function () {
    if (activate()) {
      global.clearInterval(timer);
    }
  }, 50);

  global.setTimeout(function () {
    global.clearInterval(timer);
    if (!global.HvScriptManager || typeof global.HvScriptManager.enableDemoMode !== 'function') {
      console.error(
        'hvss-settings-demo.js: не найден HvScriptManager.enableDemoMode. '
        + 'Подключите hvss-settings.js на этой странице.'
      );
    }
  }, 10000);
})(window);


/**
 * Демо-форма настроек: все стандартные типы fields.
 */
(function hvssDemoSettings() {
  window.HvScriptManager = window.HvScriptManager || [];
  HvScriptManager.push({
    id: 'hvss-demo',
    title: 'Демо-форма',
    storageKey: 'hvssDemoSettings',
    defaults: {
      title: 'Пример',
      note: '',
      enabled: true,
      limit: 10,
      mode: 'normal',
      forums: [],
      groups: [],
    },
    fields: [
      {
        key: 'title',
        type: 'text',
        label: 'Заголовок',
        placeholder: 'Короткое название',
        description: 'type: text',
      },
      {
        key: 'note',
        type: 'textarea',
        label: 'Заметка',
        rows: 4,
        description: 'type: textarea',
      },
      {
        key: 'enabled',
        type: 'checkbox',
        label: 'Статус',
        checkboxLabel: 'Включено',
        description: 'type: checkbox',
      },
      {
        key: 'limit',
        type: 'number',
        label: 'Лимит',
        min: 1,
        max: 100,
        step: 1,
        description: 'type: number',
      },
      {
        key: 'mode',
        type: 'select',
        label: 'Режим',
        description: 'type: select',
        options: [
          { value: 'normal', label: 'Обычный' },
          { value: 'strict', label: 'Строгий' },
          { value: 'off', label: 'Выключен' },
        ],
      },
      {
        key: 'forums',
        type: 'forumlist',
        label: 'Форумы',
        description: 'type: forumlist — сохраняет number[] id форумов',
      },
      {
        key: 'groups',
        type: 'grouplist',
        label: 'Группы',
        description: 'type: grouplist — сохраняет number[] id групп',
      },
    ],
  });
})();

/**
 * Демо-форма с custom render: показывает содержимое ctx.
 */
(function hvssDemoRenderSettings() {
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function dump(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (e) {
      return String(value);
    }
  }

  window.HvScriptManager = window.HvScriptManager || [];
  HvScriptManager.push({
    id: 'hvss-demo-render',
    title: 'Демо формы с custom render',
    storageKey: 'hvssDemoRenderSettings',
    defaults: {
      label: 'hello',
      count: 1,
    },
    normalize: function (stored, defaults) {
      return Object.assign({}, defaults, stored || {});
    },
    render: async function (panel, ctx) {
      const formMeta = {
        id: ctx.form.id,
        title: ctx.form.title,
        storageKey: ctx.form.storageKey,
      };

      panel.innerHTML =
        '<div class="hvwrapper">'
        + '<p class="adinfofield">Custom <code>render(panel, ctx)</code>. Ниже — снимок ctx.</p>'

        + '<fieldset><legend><span>Быстрый редактор settings</span></legend><div class="adfs-box">'
        + '<p><label class="adlabel" for="demo_r_label">label</label>'
        + '<span class="adinput"><input type="text" id="demo_r_label" /></span></p>'
        + '<p><label class="adlabel" for="demo_r_count">count</label>'
        + '<span class="adinput"><input type="number" id="demo_r_count" min="0" /></span></p>'
        + '</div></fieldset>'

        + '<fieldset><legend><span>ctx.form</span></legend><div class="adfs-box">'
        + '<pre id="demo_r_form" style="white-space:pre-wrap;font-size:12px;margin:0"></pre>'
        + '</div></fieldset>'

        + '<fieldset><legend><span>ctx.settings</span></legend><div class="adfs-box">'
        + '<pre id="demo_r_settings" style="white-space:pre-wrap;font-size:12px;margin:0"></pre>'
        + '</div></fieldset>'

        + '<fieldset><legend><span>ctx.forums (' + (ctx.forums || []).length + ')</span></legend><div class="adfs-box">'
        + '<pre id="demo_r_forums" style="white-space:pre-wrap;font-size:12px;margin:0;max-height:180px;overflow:auto"></pre>'
        + '</div></fieldset>'

        + '<fieldset><legend><span>ctx.groups (' + (ctx.groups || []).length + ')</span></legend><div class="adfs-box">'
        + '<pre id="demo_r_groups" style="white-space:pre-wrap;font-size:12px;margin:0;max-height:180px;overflow:auto"></pre>'
        + '</div></fieldset>'

        + '<fieldset><legend><span>ctx helpers</span></legend><div class="adfs-box">'
        + '<pre style="white-space:pre-wrap;font-size:12px;margin:0">'
        + esc(dump({
          appId: ctx.appId,
          hasGet: typeof ctx.get === 'function',
          hasSet: typeof ctx.set === 'function',
          hasSave: typeof ctx.save === 'function',
          hasReload: typeof ctx.reload === 'function',
          hasEscapeHtml: typeof ctx.escapeHtml === 'function',
          hasEscapeAttr: typeof ctx.escapeAttr === 'function',
          panelIsNode: !!(ctx.panel && ctx.panel.nodeType),
        }))
        + '</pre>'
        + '</div></fieldset>'

        + '<p class="submitend">'
        + '<input type="button" class="button" id="demo_r_save" value="Сохранить" />'
        + '<input type="button" class="button" id="demo_r_reload" value="reload()" />'
        + '</p>'
        + '</div>';

      panel.querySelector('#demo_r_label').value = ctx.settings.label || '';
      panel.querySelector('#demo_r_count').value = ctx.settings.count != null ? ctx.settings.count : 0;
      panel.querySelector('#demo_r_form').textContent = dump(formMeta);
      panel.querySelector('#demo_r_settings').textContent = dump(ctx.settings);
      panel.querySelector('#demo_r_forums').textContent = dump(ctx.forums);
      panel.querySelector('#demo_r_groups').textContent = dump(ctx.groups);

      panel.querySelector('#demo_r_save').onclick = async function () {
        const next = {
          label: panel.querySelector('#demo_r_label').value,
          count: parseInt(panel.querySelector('#demo_r_count').value, 10) || 0,
        };
        try {
          await ctx.save(next);
          panel.querySelector('#demo_r_settings').textContent = dump(next);
        } catch (e) {
          if (window.$ && $.jGrowl) {
            $.jGrowl(e.message || 'Ошибка сохранения');
          }
        }
      };

      panel.querySelector('#demo_r_reload').onclick = function () {
        ctx.reload();
      };
    },
  });
})();
