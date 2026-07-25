# HvScriptManager — библиотека «Настройка скриптов»

Даёт общий интерфейс настроек для пользовательских скриптов форума (MyBB / QuadroBoards).
Сохранение в forum storage и API чтения/записи.

Интерфейс доступен администраторам. В `#pun-ulinks` появляется ссылка **Скрипты** на `/scripts_settings`.

Демо: [Демо-форум](https://houngan.mybb.ru/scripts_settings)

---

## Подключение

В html-верх / объявление / html-низ:

```html
<!-- ОБЩИЕ НАСТРОЙКИ СКРИПТОВ от Человека-Шамана -->
<script src="https://example.com/hvss-settings.js"></script>
<!-- Остальные скрипты с настройками желательно ниже -->
```

---

## Быстрый старт для разработчиков

### Стандартные поля

```js
window.HvScriptManager = window.HvScriptManager || [];
HvScriptManager.push({
  id: 'my-script',
  title: 'Мой скрипт',
  storageKey: 'myScriptSettings',
  defaults: {
    title: '',
    limit: 10,
    enabled: true,
    mode: 'a',
    forums: [],
    groups: [],
    note: '',
  },
  fields: [
    { key: 'title', type: 'text', label: 'Заголовок', placeholder: '...' },
    { key: 'note', type: 'textarea', label: 'Заметка', rows: 4 },
    { key: 'enabled', type: 'checkbox', label: 'Статус', checkboxLabel: 'Включено' },
    { key: 'limit', type: 'number', label: 'Лимит', min: 1, max: 100 },
    {
      key: 'mode',
      type: 'select',
      label: 'Режим',
      options: [
        { value: 'a', label: 'А' },
        { value: 'b', label: 'Б' },
      ],
    },
    { key: 'forums', type: 'forumlist', label: 'Форумы' },
    { key: 'groups', type: 'grouplist', label: 'Группы' },
  ],
});
```

Кнопка «Сохранить» появляется сама: значения собираются из полей и пишутся в storage под `storageKey`.

### Своя форма (custom render)

```js
window.HvScriptManager = window.HvScriptManager || [];
HvScriptManager.push({
  id: 'complex-script',
  title: 'Сложный скрипт',
  storageKey: 'complexScriptSettings',
  styleUrl: 'https://example.com/complex-script-settings.css',
  defaults: { foo: 1 },
  normalize: function (stored, defaults) {
    return Object.assign({}, defaults, stored || {});
  },
  render: async function (panel, ctx) {
    panel.innerHTML =
      '<p><label>Foo <input id="x_foo" type="number" /></label></p>' +
      '<p><input type="button" class="button" id="x_save" value="Сохранить" /></p>';

    panel.querySelector('#x_foo').value = ctx.settings.foo;

    panel.querySelector('#x_save').onclick = async function () {
      try {
        await ctx.save({
          foo: parseInt(panel.querySelector('#x_foo').value, 10) || 0,
        });
      } catch (e) {
        $.jGrowl(e.message || 'Ошибка сохранения');
      }
    };
  },
});
```

Если задан `render`, стандартные `fields` не рисуются — форма полностью ваша.

`styleUrl` (алиас `stylesheet`) — прямая ссылка на CSS формы. При активации формы библиотека ставит один `<link id="hvss-form-style">` с этим `href`.

---



## Описание формы (`push`)


| Поле         | Тип                                           | Обязательно | Описание                                                |
| ------------ | --------------------------------------------- | ----------- | ------------------------------------------------------- |
| `id`         | string                                        | да          | Уникальный id формы (навигация, hash)                   |
| `title`      | string                                        | да          | Название в левой колонке                                |
| `storageKey` | string                                        | да          | Уникальный ключ forum storage                           |
| `styleUrl`   | string                                        | нет         | URL CSS активной формы (`stylesheet` — алиас); см. выше |
| `defaults`   | object                                        | нет         | Значения по умолчанию                                   |
| `fields`     | array                                         | нет*        | Список стандартных полей                                |
| `render`     | function `(panel, ctx) => void|Promise`       | нет*        | Полностью своя вёрстка                                  |
| `normalize`  | function `(stored, defaults) => object`       | нет         | Нормализация данных из storage перед показом            |
| `collect`    | function `(panel, data, ctx) => object|false` | нет         | Доп. сбор данных (только для `fields`)                  |
| `beforeSave` | function `(data, ctx) => data|false|Promise`  | нет         | Хук до записи; `false` — отмена                         |
| `onSave`     | function `(data, ctx) => void|Promise`        | нет         | Хук после успешной записи                               |


 Нужен либо `fields`, либо `render` (или оба, но при `render` поля игнорируются).

`push` принимает один или несколько объектов формы. При ошибке форма не добавляется, запись уходит в список «Ошибки».

---



## Типы полей

Общие свойства поля:


| Свойство      | Описание                                                     |
| ------------- | ------------------------------------------------------------ |
| `key`         | Путь в объекте настроек (`'limit'`, можно вложенный `'a.b'`) |
| `type`        | См. ниже                                                     |
| `label`       | Подпись                                                      |
| `description` | Пояснение под лейблом                                        |



| `type`      | Поведение                                         | Доп. свойства                                 |
| ----------- | ------------------------------------------------- | --------------------------------------------- |
| `text`      | однострочный ввод                                 | `placeholder`                                 |
| `textarea`  | многострочный                                     | `rows`                                        |
| `checkbox`  | флаг                                              | `checkboxLabel`                               |
| `number`    | число                                             | `min`, `max`, `step`, `default`               |
| `select`    | выпадающий список                                 | `options`: `[{ value, label }]` или строки    |
| `forumlist` | чеклист форумов (`board.getForums`)               | значение — массив **id** форумов (`number[]`) |
| `grouplist` | чеклист групп из `select#fld2` на `/userlist.php` | значение — массив **id** групп (`number[]`)   |


---



## Контекст `ctx` в `render` / хуках


| Свойство / метод                    | Описание                                                      |
| ----------------------------------- | ------------------------------------------------------------- |
| `ctx.form`                          | Описание зарегистрированной формы                             |
| `ctx.settings`                      | Текущие настройки (defaults + storage, после `normalize`)     |
| `ctx.forums`                        | Список форумов `{ id, name, cat_id }`                         |
| `ctx.groups`                        | Список групп `{ id, name }`                                   |
| `ctx.panel`                         | DOM-контейнер правой колонки                                  |
| `ctx.get(key)`                      | `Promise` — чтение storage                                    |
| `ctx.set(key, value)`               | `Promise` — запись storage                                    |
| `ctx.save(payload)`                 | Запись в `form.storageKey` + `beforeSave` / `onSave` + jGrowl |
| `ctx.reload()`                      | Перерисовать активную форму                                   |
| `ctx.escapeHtml` / `ctx.escapeAttr` | Хелперы экранирования                                         |


---



## Чтение настроек из своего скрипта

Рекомендуемый способ:

```js
HvScriptManager.get('myScriptSettings').then(function (data) {
  if (!data) {
    // ключа ещё нет — используйте defaults
    return;
  }
  // data — уже распарсенный объект
});
```

Эквивалент на API форума (jQuery 1.7.2):

```js
$.get('/api.php', {
  method: 'storage.get',
  token: ForumAPITicket,
  key: 'myScriptSettings',
  app_id: 16777215,
}).then(function (result) {
  const raw = result.response
    && result.response.storage
    && result.response.storage.data
    && result.response.storage.data.myScriptSettings;
  const data = raw ? JSON.parse(raw) : null;
});
```

Запись:

```js
HvScriptManager.set('myScriptSettings', { enabled: true, limit: 10 });
```

---



## Публичный API `window.HvScriptManager`


| Метод / поле            | Описание                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `push(def[, ...])`      | Зарегистрировать форму(ы); работает и как очередь до старта                        |
| `register(def)`         | Алиас `push`                                                                       |
| `get(key)`              | Прочитать storage → `Promise<object|null>`                                         |
| `set(key, value)`       | Записать storage → `Promise`                                                       |
| `getForums()`           | Список форумов → `Promise`                                                         |
| `getGroups()`           | Список групп → `Promise`                                                           |
| `open()`                | Открыть UI `/scripts_settings`                                                     |
| `enableDemoMode(opts?)` | Демо-режим: UI для всех, сохранение блокируется; `opts.message` — текст оповещения |
| `isDemoMode()`          | `true`, если демо-режим включён                                                    |
| `list()`                | Массив зарегистрированных форм                                                     |
| `errors()`              | Массив ошибок регистрации / дублей                                                 |
| `length`                | Число успешно зарегистрированных форм                                              |
| `SETTINGS_PATH`         | `'/scripts_settings'`                                                              |


Флаги до загрузки библиотеки: `window.HvScriptManagerDemoMode = true`, опционально `window.HvScriptManagerDemoMessage = '…'`.

---



## UI и поведение страницы

- Левая колонка — список форм; правая — активная форма.
- Hash: `/scripts_settings#my-script`, `/scripts_settings#errors`.
- Рядом с «Сохранить» кнопка **?** — dialog с примером чтения настроек (`HvScriptManager.get('…')` / `storage.get`) с подставленным `storageKey` формы.



### Ошибки

Отдельный пункт **Ошибки** в левой колонке с бейджем-счётчиком. Типичные причины:

- повторный `id` формы;
- пересечение `storageKey`;
- один и тот же `.js` подключён дважды.

В тексте ошибки — подсказка, какую строку убрать из `#html-header`, `#pun-announcement` или `#html-footer`.

Правило: **один скрипт — один** `id` **— один** `storageKey`. Не дублируйте подключения в нескольких блоках шаблона.

---



## Ограничения

- Нужен админ (`GroupID === 1`) для UI и записи через токен.
- Список групп: парсинг `select#fld2` со страницы `/userlist.php` (`value` = id группы, текст = название).
- `forumlist` / `grouplist` хранят числовые **id**.

