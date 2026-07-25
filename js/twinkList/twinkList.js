/**
 * Список твинков — форма для HvScriptManager.
 * автор: Человек-Шаман
 * version: 1.0.0
 *
 * Storage: ключ twinkList — JSON number[][] (группы связанных аккаунтов).
 * Чтение: HvScriptManager.get('twinkList').then(function (data) { ... });
 * Запись: HvScriptManager.set('twinkList', data).then(function () { ... });
 */
(function hvssTwinkListSettings() {
  const FORM_ID = 'twink-list';
  const STORAGE_KEY = 'twinkList';
  const STYLE_ID = 'hvss-twink-list-styles';

  function normalizeList(stored, defaults) {
    const source = Array.isArray(stored)
      ? stored
      : (Array.isArray(defaults) ? defaults : []);
    return source
      .map(function (group) {
        if (!Array.isArray(group)) {
          return [];
        }
        return group
          .map(function (id) {
            return parseInt(id, 10);
          })
          .filter(function (id) {
            return Number.isFinite(id) && id > 0;
          });
      })
      .filter(function (group) {
        return group.length > 0;
      });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
.hvss-twink-list { list-style: none; margin: 0; padding: 0; }
#pun-admain .adformal .hvss-twink-list-item {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px;
  padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,.08);
}
.hvss-twink-list-item > span:first-child {font-weight: bold;}
.hvss-twink-list-item-name { display: inline-flex; align-items: center; gap: 4px; }
.hvss-twink-list-item-remove,
.hvss-twink-list-item-add {
  cursor: pointer; border: 0; background: transparent; padding: 0 4px; line-height: 1; font: inherit;
}
.hvss-twink-list-item-remove { opacity: .55; }
.hvss-twink-list-item-remove:hover { opacity: 1; }
.hvss-twink-list-empty { margin: 0; font-style: italic; opacity: .75; }
.hvss-twink-list-dialog {
  position: fixed; inset: 0; margin: auto; width: min(360px, calc(100vw - 32px)); max-width: 360px; height: fit-content;
  border: 1px solid #888; border-radius: 4px; padding: 16px;top: 50%;left: 50%;transform: translate(-50%);
}
.hvss-twink-list-dialog::backdrop { background: rgba(0,0,0,.35); }
#pun-admain .hvss-twink-list-dialog .hvss-twink-list-dialog-title {
  margin: 0 0 12px; font-weight: 700; font-size: 16px; line-height: 1.3; text-align: center;
}
#pun-admain .hvss-twink-list-dialog .hv-control { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
.hvss-twink-list-dialog select { width: 100%; }
`;
    document.head.appendChild(style);
  }

  function createTwinkAdmin(ctx) {
    const escapeHtml = ctx.escapeHtml;
    const escapeAttr = ctx.escapeAttr;

    const admin = {
      storage: normalizeList(ctx.settings, []),
      users: [],
      list: [],
      focusedUser: null,
      panel: ctx.panel,
      modal: null,

      mount: async function () {
        injectStyles();
        await this.loadUsers();
        this.formList();
        this.renderShell();
        this.render();
        this.addListeners();
      },

      loadUsers: async function () {
        try {
          const result = await $.get('/api.php', {
            method: 'users.orderedList',
            fields: 'user_id,username,group_id',
            limit: 500,
          });
          const users = result
            && result.response
            && Array.isArray(result.response.users)
            ? result.response.users
            : [];
          this.users = users;
        } catch (e) {
          console.error(e);
          this.users = [];
          if (window.$ && $.jGrowl) {
            $.jGrowl('Не удалось загрузить список пользователей');
          }
        }
      },

      resolveUser: function (id) {
        const userId = +id;
        const found = this.users.find(function (u) {
          return +u.user_id === userId;
        });
        if (found) {
          return found;
        }
        return {
          user_id: String(userId),
          username: '#' + userId,
          group_id: '9',
        };
      },

      formList: function () {
        const self = this;
        this.list = this.storage.map(function (userIds) {
          const profiles = userIds.map(function (id) {
            return self.resolveUser(id);
          });
          const active = profiles.filter(function (profile) {
            return Boolean(profile.group_id) && profile.group_id !== '9';
          });
          const inactive = profiles.filter(function (profile) {
            return !profile.group_id || profile.group_id === '9';
          });
          return { active: active, inactive: inactive };
        }).sort(function (a, b) {
          return b.active.length - a.active.length;
        });
      },

      saveTwinks: async function () {
        try {
          await ctx.save(this.storage);
          ctx.settings = this.storage;
        } catch (e) {
          console.error(e);
          if (window.$ && $.jGrowl) {
            $.jGrowl(e.message || 'Ошибка сохранения');
          }
        }
      },

      renderShell: function () {
        this.panel.innerHTML =
          '<div class="hvwrapper hvss-twink-form">'
          + '<p class="adinfofield">Группы связанных аккаунтов (твинков).</p>'
          + '<fieldset><legend><span>Твинки</span></legend><div class="adfs-box">'
          + '<ul class="hvss-twink-list"></ul>'
          + '<p class="hvss-twink-list-empty" hidden>Список пуст.</p>'
          + '<p class="adinfofield" style="margin-top:12px">'
          + '<input type="button" class="button" id="hvss-twink-add-new" value="+ Добавить игрока" />'
          + '</p>'
          + '</div></fieldset>'
          + '<dialog class="hvss-twink-list-dialog" id="hvss-twink-add-dialog">'
          + '<form method="dialog" id="hvss-twink-add-form">'
          + '<div class="hvss-twink-list-dialog-title" id="hvss-twink-add-title">Новый игрок</div>'
          + '<p><label class="adlabel" for="hvss-twink-add-select">Пользователь</label>'
          + '<select id="hvss-twink-add-select" required>'
          + '<option value="" disabled selected hidden>Добавить твинка</option>'
          + '</select></p>'
          + '<div class="hv-control">'
          + '<input type="button" class="button" id="hvss-twink-add-cancel" value="Отмена" />'
          + '<input type="submit" class="button" id="hvss-twink-add-confirm" value="Добавить" />'
          + '</div>'
          + '</form>'
          + '</dialog>'
          + '</div>';

        this.modal = this.panel.querySelector('#hvss-twink-add-dialog');
      },

      renderProfileSpan: function (item) {
        return '<span class="hvss-twink-list-item-name group_' + escapeAttr(item.group_id) + '">'
          + '<a href="/profile.php?id=' + escapeAttr(item.user_id) + '" target="_blank" rel="noopener">'
          + escapeHtml(item.username)
          + '</a> '
          + '<button type="button" class="hvss-twink-list-item-remove" data-user="'
          + escapeAttr(item.user_id)
          + '" title="Удалить">×</button>'
          + '</span>';
      },

      render: function () {
        const list = this.panel.querySelector('.hvss-twink-list');
        const empty = this.panel.querySelector('.hvss-twink-list-empty');
        if (!list) {
          return;
        }
        list.innerHTML = '';
        if (!this.list.length) {
          if (empty) {
            empty.hidden = false;
          }
          return;
        }
        if (empty) {
          empty.hidden = true;
        }

        this.list.forEach(function (user, index) {
          const li = document.createElement('li');
          li.className = 'hvss-twink-list-item';
          li.dataset.index = String(index);
          const anchorId = user.active[0]
            ? user.active[0].user_id
            : (user.inactive[0] ? user.inactive[0].user_id : '');
          li.innerHTML = user.active.map(admin.renderProfileSpan).join('')
            + user.inactive.map(admin.renderProfileSpan).join('')
            + '<button type="button" class="hvss-twink-list-item-add" data-user="'
            + escapeAttr(anchorId)
            + '" title="Добавить твинка в группу">+</button>';
          list.appendChild(li);
        });
      },

      fillSelect: function () {
        const select = this.panel.querySelector('#hvss-twink-add-select');
        if (!select) {
          return;
        }
        const flattened = this.storage.reduce(function (acc, group) {
          return acc.concat(group);
        }, []);
        select.innerHTML = '<option value="" disabled selected hidden>Добавить твинка</option>';
        this.users
          .filter(function (user) {
            return flattened.indexOf(+user.user_id) === -1;
          })
          .sort(function (a, b) {
            return a.username.localeCompare(b.username, 'ru');
          })
          .forEach(function (user) {
            const option = document.createElement('option');
            option.value = user.user_id;
            option.textContent = user.username;
            select.appendChild(option);
          });
      },

      openModal: function (userIndex) {
        const isNewGroup = userIndex == null
          || userIndex < 0
          || !this.storage[userIndex]
          || !this.storage[userIndex].length;
        this.focusedUser = isNewGroup ? this.storage.length : userIndex;

        const title = this.panel.querySelector('#hvss-twink-add-title');
        if (title) {
          if (isNewGroup) {
            title.textContent = 'Новый игрок';
          } else {
            const profiles = this.storage[userIndex].map(this.resolveUser.bind(this));
            const firstUser = profiles.find(function (profile) {
              return Boolean(profile.group_id) && profile.group_id !== '9';
            }) || profiles[0];
            title.textContent = 'Твинк игрока ' + (firstUser.username || '#' + firstUser.user_id);
          }
        }

        this.fillSelect();
        if (this.modal && typeof this.modal.showModal === 'function') {
          this.modal.showModal();
        }
      },

      closeModal: function () {
        if (this.modal && this.modal.open) {
          this.modal.close();
        }
        this.focusedUser = null;
      },

      refresh: async function () {
        this.formList();
        this.render();
        await this.saveTwinks();
      },

      removeUser: async function (userId) {
        const confirmed = window.confirm(
          'Вы уверены, что хотите удалить этот аккаунт из списка твинков?'
        );
        if (!confirmed) {
          return;
        }
        const userIndex = this.storage.findIndex(function (group) {
          return group.indexOf(userId) !== -1;
        });
        if (userIndex === -1) {
          return;
        }
        this.storage[userIndex] = this.storage[userIndex].filter(function (id) {
          return id !== userId;
        });
        if (!this.storage[userIndex].length) {
          this.storage.splice(userIndex, 1);
        }
        await this.refresh();
      },

      addUser: async function (userId) {
        if (!userId) {
          return;
        }
        const index = this.focusedUser == null ? this.storage.length : this.focusedUser;
        if (!this.storage[index]) {
          this.storage[index] = [];
        }
        if (this.storage[index].indexOf(userId) === -1) {
          this.storage[index].push(userId);
        }
        this.closeModal();
        await this.refresh();
      },

      addListeners: function () {
        const root = this.panel.querySelector('.hvss-twink-form');
        if (!root) {
          return;
        }

        root.addEventListener('click', function (event) {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }

          if (target.matches('.hvss-twink-list-item-remove')) {
            event.preventDefault();
            admin.removeUser(+target.getAttribute('data-user'));
            return;
          }

          if (target.matches('.hvss-twink-list-item-add')) {
            event.preventDefault();
            const anchorId = +target.getAttribute('data-user');
            const userIndex = admin.storage.findIndex(function (group) {
              return group.indexOf(anchorId) !== -1;
            });
            admin.openModal(userIndex === -1 ? null : userIndex);
            return;
          }

          if (target.matches('#hvss-twink-add-new')) {
            event.preventDefault();
            admin.openModal();
            return;
          }

          if (target.matches('#hvss-twink-add-cancel')) {
            event.preventDefault();
            admin.closeModal();
          }
        });

        const form = root.querySelector('#hvss-twink-add-form');
        if (form) {
          form.addEventListener('submit', function (event) {
            event.preventDefault();
            const select = root.querySelector('#hvss-twink-add-select');
            admin.addUser(select ? +select.value : 0);
          });
        }

        if (this.modal) {
          this.modal.addEventListener('close', function () {
            admin.focusedUser = null;
          });
        }
      },
    };

    return admin;
  }

  window.HvScriptManager = window.HvScriptManager || [];
  HvScriptManager.push({
    id: FORM_ID,
    title: 'Список твинков',
    storageKey: STORAGE_KEY,
    defaults: [],
    normalize: function (stored, defaults) {
      return normalizeList(stored, defaults);
    },
    render: async function (panel, ctx) {
      const admin = createTwinkAdmin(ctx);
      await admin.mount();
    },
  });
})();
