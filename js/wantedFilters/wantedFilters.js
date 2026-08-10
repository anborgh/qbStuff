/**
 * Добавляет в тему поиска персонажей список, сгруппированный по фандому.
 * Список даёт возможность фильтровать тему по фендому или по персонажу.
 *
 * author: Человек-Шаман
 * version: 1.6
 * status: DONE
 *
 * что нового:
 * 1. Форма для удобного добавления заявок в ответ на тему
 * 2. Теги для заявок с возможностью фильтрации по ним
 *
 * instruction:
 * 1. Добавить в html-низ, заменить 999, 998 на номера тем поиска
 *    Скрипт будет запущен в каждой теме по отдельности
 *    <script>
 *      hvWantedFilters.init(999, 998, 997);
 *    </script>
 * 1.1 Если хочется, чтобы в одной теме выводились заявки, собранные из нескольких тем,
 *    вместо её номера нужно ввести массив [999, 998]
 *    <script>
 *      hvWantedFilters.init([999, 998], 997);
 *    </script>
 *    в этом примере в тему 999 выведутся заявки из неё и из темы 998
 *    количество тем для сбора не ограничено.
 * 2. Добавить в первое сообщение темы поиска
 *    [block=charlist][/block]
 *    там, где нужно отрисовать список ролей
 * 2.1 Для облака тегов добавить
 *    [block=tags][/block]
 * 3. Убедитесь, что [block=charlist][/block] и [block=tags][/block] не поставлены в спойлере
 *    для медиа или html-блоке, так они не будут работать
 * 4. В заявке:
 *    — фандом: элемент с классом .fd
 *    — имя персонажа: элемент с классом .nm
 *    — тег: элемент с классом .tg (можно несколько; через запятую в одном .tg тоже можно)
 *    Несколько фандомов в одной заявке: перед каждой группой персонажей указывайте свой .fd,
 *    персонажи (.nm) относятся к ближайшему предыдущему фандому.
 * 4.1 После #form-buttons появляется компактная форма:
 *    фандом / имя / тэги → кнопка ↓ вставляет [block=fd|nm|tg]...[/block] в позицию курсора.
 *    Поле тегов в форме есть только если в стартовом посте есть [block=tags][/block].
 *    Без возможности ответа (нет textarea) форма не показывается. * 5. Для стилизации используйте стили
 *    .post .charlist { стили блока списка ролей }
 *    .post .charlist .charlist_fd { стили блока фандома }
 *    .post .charlist .charlist_item { стили элемента списка фандома }
 *    .post .charlist .charlist_title { стили заголовка фандома }
 *    .post .tags { стили облака тегов }
 *    .post .tags .tags_item { стили тега }
 */

const hvWantedFilters = {
  hasRun: false,
  topicId: 0,
  topicData: {
    postCount: 0,
    posts: [],
  },
  filteredPosts: [],
  fandoms: {},
  tags: {},
  filterList: null,
  replyHelper: null,
  replyHelperFandoms: [],
  replyHelperTags: [],
  replySuggest: null,
  replyHelperMaxFandoms: 3,
  filters: {
    fandom: null,
    post: null,
    tag: null,
  },
  callbacks: [],
  callback: function (fn) {
    this.callbacks.push(fn);
  },
  init: function (...topicIds) {
    const $topic = $("#pun-viewtopic");
    const currentTopicId = $topic.length
      ? Number($("#pun-viewtopic").attr("data-topic-id"))
      : 0;

    topicIds.forEach(item => {
      if (this.hasRun) return;
      if (
        (Array.isArray(item) && item[0] === currentTopicId)
        || item === currentTopicId
      ) {
        $(document).on('pun_main_ready', () => this.run(item));
        this.hasRun = true;
      }
    });
  },
  // topicId: number | number[]
  run: async function(args) {
    const topicIds = Array.isArray(args) ? args : [args];
    const topicId = Array.isArray(args) ? args[0] : args;
    this.bindHandlers();
    this.setNeddfulElements();
    this.renderReplyHelper();

    this.topicId = topicId;
    for (let i = 0; i < topicIds.length; i++) {
      const numReplies = await this.getTopicData(topicIds[i]);
      await this.getPosts(topicIds[i], numReplies);
    }

    this.getFandoms();
    this.renderSummary();
    this.renderTags();
    this.updateReplyHelperSuggestions();

    this.initList();
  },
  bindHandlers: function() {
    this.handleListClick = this.handleListClick.bind(this);
    this.handleTagsClick = this.handleTagsClick.bind(this);
    this.handleReplyHelperClick = this.handleReplyHelperClick.bind(this);
    this.handleReplyHelperInput = this.handleReplyHelperInput.bind(this);
    this.handleReplyHelperKeydown = this.handleReplyHelperKeydown.bind(this);
    this.handleReplySuggestClick = this.handleReplySuggestClick.bind(this);
    this.handleReplyHelperFocusOut = this.handleReplyHelperFocusOut.bind(this);
  },
  setNeddfulElements: function () {
    $('head').append('<link rel="stylesheet" href="https://forumstatic.ru/files/0017/95/29/69365.css?v=1.6" />');
    this.filterList = $('<div class="hvFilteredList"></div>');
    $('.topicpost').after(this.filterList);
  },
  renderReplyHelper: function () {
    const $textarea = $('#main-reply:visible');
    const $formButtons = $('#form-buttons');
    if (!$textarea.length || !$formButtons.length || this.replyHelper) return;

    const hasTagsBlock = $(".topicpost").find(".tags").length > 0;
    const tagsFieldHtml = hasTagsBlock
      ? (
        '<div class="hvWantedHelper_field">'
        + '<input class="hvWantedHelper_tg" type="text" placeholder="тэги" autocomplete="off" data-suggest="tags">'
        + '</div>'
      )
      : '';

    this.replyHelper = $(
      '<div class="hvWantedHelper">'
      + '<div class="hvWantedHelper_groups">'
      + this.getReplyHelperGroupHtml()
      + '</div>'
      + '<button type="button" class="button hvWantedHelper_add" title="Ещё фандом">+</button>'
      + tagsFieldHtml
      + '<button type="button" class="button hvWantedHelper_insert" title="Вставить в ответ">↓</button>'
      + '</div>'
    );
    this.replySuggest = $('<ul class="hvWantedSuggest hidden"></ul>');
    $('body').append(this.replySuggest);

    $formButtons.after(this.replyHelper);
    this.replyHelper.on('click', this.handleReplyHelperClick);
    this.replyHelper.on('input', this.handleReplyHelperInput);
    this.replyHelper.on('keydown', this.handleReplyHelperKeydown);
    this.replyHelper.on('focusin', this.handleReplyHelperInput);
    this.replyHelper.on('focusout', this.handleReplyHelperFocusOut);
    this.replySuggest.on('mousedown', this.handleReplySuggestClick);
    this.syncReplyHelperRemoveButtons();
  },
  getReplyHelperGroupHtml: function () {
    return (
      '<div class="hvWantedHelper_group">'
      + '<div class="hvWantedHelper_field">'
      + '<input class="hvWantedHelper_fd" type="text" placeholder="фандом" autocomplete="off" data-suggest="fandom">'
      + '</div>'
      + '<input class="hvWantedHelper_nm" type="text" placeholder="имя" autocomplete="off">'
      + '<button type="button" class="hvWantedHelper_remove" title="Убрать">×</button>'
      + '</div>'
    );
  },
  syncReplyHelperRemoveButtons: function () {
    if (!this.replyHelper) return;
    const $groups = this.replyHelper.find('.hvWantedHelper_group');
    $groups.find('.hvWantedHelper_remove').prop('disabled', $groups.length < 2);
    this.replyHelper
      .find('.hvWantedHelper_add')
      .prop('disabled', $groups.length >= this.replyHelperMaxFandoms);
  },
  updateReplyHelperSuggestions: function () {
    this.replyHelperFandoms = Object.keys(this.fandoms)
      .filter((key) => key !== 'other')
      .sort((a, b) => a.localeCompare(b))
      .map((key) => this.fandoms[key].name);

    this.replyHelperTags = Object.keys(this.tags)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => this.tags[key].name);
  },
  getSuggestSource: function (type) {
    return type === 'tags' ? this.replyHelperTags : this.replyHelperFandoms;
  },
  getSuggestQuery: function ($input) {
    const value = String($input.val() || '');
    if ($input.attr('data-suggest') === 'tags') {
      const parts = value.split(/[,;]/);
      return parts[parts.length - 1].trim();
    }
    return value.trim();
  },
  filterSuggestItems: function (items, query) {
    const q = String(query || '').toLowerCase();
    if (!q) return items.slice(0, 8);
    return items
      .filter((item) => item.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.localeCompare(b);
      })
      .slice(0, 8);
  },
  positionReplySuggest: function ($input) {
    if (!this.replySuggest || !$input || !$input.length) return;
    const rect = $input[0].getBoundingClientRect();
    this.replySuggest.css({
      top: `${rect.bottom + window.scrollY + 2}px`,
      left: `${rect.left + window.scrollX}px`,
      minWidth: `${Math.max(rect.width, 120)}px`,
    });
  },
  showReplySuggest: function ($input) {
    if (!this.replySuggest || !$input || !$input.length) return;

    const type = $input.attr('data-suggest');
    if (!type) {
      this.hideReplySuggest();
      return;
    }

    const query = this.getSuggestQuery($input);
    const items = this.filterSuggestItems(this.getSuggestSource(type), query);
    if (!items.length) {
      this.hideReplySuggest();
      return;
    }

    this.replySuggest
      .empty()
      .attr('data-for', type)
      .data('input', $input)
      .removeClass('hidden');

    items.forEach((item, index) => {
      const $item = $(
        `<li class="hvWantedSuggest_item${index === 0 ? ' active' : ''}"></li>`
      ).text(item);
      this.replySuggest.append($item);
    });
    this.positionReplySuggest($input);
  },
  hideReplySuggest: function () {
    if (!this.replySuggest) return;
    this.replySuggest.addClass('hidden').empty().removeData('input').removeAttr('data-for');
  },
  moveReplySuggestActive: function (delta) {
    if (!this.replySuggest || this.replySuggest.hasClass('hidden')) return;
    const $items = this.replySuggest.find('.hvWantedSuggest_item');
    if (!$items.length) return;

    let index = $items.index($items.filter('.active'));
    index = index < 0 ? 0 : (index + delta + $items.length) % $items.length;
    $items.removeClass('active').eq(index).addClass('active');
  },
  applyReplySuggestValue: function (value) {
    if (!this.replySuggest) return false;
    const $input = this.replySuggest.data('input');
    if (!$input || !$input.length || !value) return false;

    if ($input.attr('data-suggest') === 'tags') {
      const raw = String($input.val() || '');
      const parts = raw.split(/[,;]/);
      parts[parts.length - 1] = value;
      const next = parts
        .map((item) => item.trim())
        .filter(Boolean)
        .join(', ');
      $input.val(`${next}, `);
    } else {
      $input.val(value);
    }

    this.hideReplySuggest();
    $input.focus();
    return true;
  },
  applyActiveReplySuggest: function () {
    if (!this.replySuggest || this.replySuggest.hasClass('hidden')) return false;
    const $active = this.replySuggest.find('.hvWantedSuggest_item.active');
    if (!$active.length) return false;
    return this.applyReplySuggestValue($active.text());
  },
  escapeHtml: function (value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
  splitHelperValues: function (value) {
    return String(value || '')
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  },
  buildReplyHelperMarkup: function () {
    if (!this.replyHelper) return '';

    const chunks = [];
    this.replyHelper.find('.hvWantedHelper_group').each((_, group) => {
      const $group = $(group);
      const fandom = $group.find('.hvWantedHelper_fd').val().trim();
      const names = this.splitHelperValues($group.find('.hvWantedHelper_nm').val());
      if (!fandom && !names.length) return;
      if (fandom) chunks.push(`[block=fd]${this.escapeHtml(fandom)}[/block]`);
      names.forEach((name) => {
        chunks.push(`[block=nm]${this.escapeHtml(name)}[/block]`);
      });
    });

    const tags = this.splitHelperValues(this.replyHelper.find('.hvWantedHelper_tg').val());
    if (tags.length) {
      chunks.push(`[block=tg]${this.escapeHtml(tags.join(', '))}[/block]`);
    }

    return chunks.join(' ');
  },
  insertIntoMainReply: function (markup) {
    if (!markup) return;
    const textarea = document.getElementById('main-reply');
    if (!textarea) return;

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const value = textarea.value;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const needsSpaceBefore = before && !/\s$/.test(before);
    const needsSpaceAfter = after && !/^\s/.test(after);
    const insert =
      (needsSpaceBefore ? ' ' : '')
      + markup
      + (needsSpaceAfter ? ' ' : '');

    textarea.value = before + insert + after;
    const caret = before.length + insert.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    $(textarea).trigger('input').trigger('change');
  },
  handleReplyHelperInput: function (event) {
    const $input = $(event.target).closest('input[data-suggest]');
    if (!$input.length) {
      this.hideReplySuggest();
      return;
    }
    this.showReplySuggest($input);
  },
  handleReplyHelperKeydown: function (event) {
    const $input = $(event.target).closest('input[data-suggest]');
    const suggestOpen = this.replySuggest && !this.replySuggest.hasClass('hidden');

    if (suggestOpen && $input.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.moveReplySuggestActive(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.moveReplySuggestActive(-1);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        this.hideReplySuggest();
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (this.applyActiveReplySuggest()) {
          event.preventDefault();
          return;
        }
      }
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.hideReplySuggest();
      this.insertIntoMainReply(this.buildReplyHelperMarkup());
    }
  },
  handleReplySuggestClick: function (event) {
    const $item = $(event.target).closest('.hvWantedSuggest_item');
    if (!$item.length) return;
    event.preventDefault();
    this.applyReplySuggestValue($item.text());
  },
  handleReplyHelperFocusOut: function () {
    setTimeout(() => {
      const active = document.activeElement;
      if (
        $(active).closest('.hvWantedHelper').length
        || $(active).closest('.hvWantedSuggest').length
      ) {
        return;
      }
      this.hideReplySuggest();
    }, 0);
  },
  handleReplyHelperClick: function (event) {
    const $target = $(event.target);
    if ($target.closest('.hvWantedHelper_add').length) {
      const $groups = this.replyHelper.find('.hvWantedHelper_group');
      if ($groups.length >= this.replyHelperMaxFandoms) return;
      this.replyHelper.find('.hvWantedHelper_groups').append(this.getReplyHelperGroupHtml());
      this.syncReplyHelperRemoveButtons();
      return;
    }
    if ($target.closest('.hvWantedHelper_remove').length) {
      const $groups = this.replyHelper.find('.hvWantedHelper_group');
      if ($groups.length < 2) return;
      $target.closest('.hvWantedHelper_group').remove();
      this.syncReplyHelperRemoveButtons();
      this.hideReplySuggest();
      return;
    }
    if ($target.closest('.hvWantedHelper_insert').length) {
      this.hideReplySuggest();
      this.insertIntoMainReply(this.buildReplyHelperMarkup());
    }
  },
  getTopicData: async function(topicId) {
    const topicData = await $.get(
      `/api.php?method=topic.get&topic_id=${topicId}`
    );
    const postCount = Number(topicData.response[0]?.num_replies);
    return isNaN(postCount) ? this.topicData.postCount : postCount;
  },
  getPosts: async function(topicId, numReplies) {
    const reqestCount = Math.ceil(numReplies / 100);
    for (let i = 0; i < reqestCount; i++) {
      const { response } = await $.get(
        `/api.php?method=post.get&topic_id=${topicId}&skip=${i * 100}&limit=100`
      );
      this.topicData.posts = this.topicData.posts.concat(response);
    }
  },
  addCharToFandom: function(fandomName, item) {
    const key = fandomName.toLowerCase();
    if (!this.fandoms[key]) {
      this.fandoms[key] = {
        name: fandomName,
        items: [],
      };
    }
    this.fandoms[key].items.push(item);
  },
  addTag: function(tagName, post) {
    const key = tagName.toLowerCase();
    if (!this.tags[key]) {
      this.tags[key] = {
        name: tagName,
        postIds: [],
        count: 0,
      };
    }
    if (!this.tags[key].postIds.includes(post.id)) {
      this.tags[key].postIds.push(post.id);
      this.tags[key].count += 1;
    }
  },
  getFandoms: function() {
    this.topicData.posts.forEach((post, index) => {
      if (index === 0) return;

      const message = $(`<div>${post.message}</div>`);
      const elements = message.find(".fd, .nm");
      let currentFandom = 'Other';
      let hasChars = false;

      elements.each((_, el) => {
        const $el = $(el);
        if ($el.hasClass('fd')) {
          const name = $el.text().trim();
          if (name) currentFandom = name;
          return;
        }
        if ($el.hasClass('nm')) {
          const name = $el.text().trim();
          if (!name) return;
          hasChars = true;
          this.addCharToFandom(currentFandom, {
            name,
            postId: post.id,
            author: post.username,
            rating: post.rating,
          });
        }
      });

      if (!hasChars && currentFandom !== 'Other') {
        this.addCharToFandom(currentFandom, {
          name: null,
          postId: post.id,
          author: post.username,
          rating: post.rating,
        });
      }

      message.find('.tg').each((_, el) => {
        const raw = $(el).text().trim();
        if (!raw) return;
        raw.split(/[,;]/).forEach((part) => {
          const tagName = part.trim();
          if (tagName) this.addTag(tagName, post);
        });
      });
    });
  },
  renderSummary: function() {
    const $charlist = $(".topicpost").find(".charlist");
    const filteredFandomNames = Object.keys(this.fandoms).sort((a, b) => a.localeCompare(b));

    let activeLetter = '';

    $charlist.append('<span class="hvClearFilters">x Сбросить фильтр</span>');

    filteredFandomNames.forEach((fandom, index) => {
      if (fandom === 'other' && this.fandoms[fandom].items.length === 0) {
        return;
      }
      if (fandom[0].toLowerCase() !== activeLetter.toLowerCase()) {
        $charlist.append(`<div class="charlist_divider">${fandom[0].toUpperCase()}</div>`);
        activeLetter = fandom[0];
      }
      const ul = $(`<ul class="charlist_fd fd${index}"></ul>`);
      ul.append(`<li class="charlist_item charlist_title" data-fandom="${fandom}">${this.fandoms[fandom].name}</li>`);
      const sortedNames = this.fandoms[fandom].items.sort((a, b) => {
        if (!a.name) return 1;
        if (!b.name) return -1;
        return a.name.localeCompare(b.name);
      });
      sortedNames.forEach((char) => {
        if (!char.name) return;
        ul.append(
          `<li class="charlist_item" data-character="${char.postId}"><a href="viewtopic.php?pid=${char.postId}#p${char.postId}" data-post-id="${char.postId}" title="by ${char.author}">${char.name}</a></li>`
        );
      });
      $charlist.append(ul);
    });

    $charlist.on('click', this.handleListClick);
  },
  renderTags: function() {
    const $tags = $(".topicpost").find(".tags");
    if (!$tags.length) return;

    const tagKeys = Object.keys(this.tags).sort((a, b) => a.localeCompare(b));
    if (!tagKeys.length) return;

    tagKeys.forEach((key) => {
      const tag = this.tags[key];
      $tags.append(
        `<span class="tags_item" data-tag="${key}" title="${tag.count}">${tag.name}</span>`
      );
    });

    $tags.on('click', this.handleTagsClick);
  },
  handleListClick: function(event) {
    const $target = $(event.target);
    if ($target.closest('a').length) {
      event.preventDefault();
    }
    if ($target.closest('li').length) {
      const fandom = $target.closest('li').attr('data-fandom');
      const post = $target.closest('li').attr('data-character');
      if (fandom) this.setFilters({ fandom });
      else if (post) this.setFilters({ post });
    } else if ($target.closest('.hvClearFilters').length) {
      this.setFilters({ clear: true });
    }
  },
  handleTagsClick: function(event) {
    const $tag = $(event.target).closest('.tags_item');
    if (!$tag.length) return;
    this.setFilters({ tag: $tag.attr('data-tag') });
  },

  initList: function() {
    this.getFilters();
    this.filterPosts();
    this.renderFilteredList();
  },
  getFilters: function() {
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    this.filters.fandom = urlParams.get('fandom');
    this.filters.post = urlParams.get('post');
    this.filters.tag = urlParams.get('tag');

    $(`.charlist li`).removeClass('active');
    $(`.tags .tags_item`).removeClass('active');
    $(`.charlist li[data-fandom="${this.filters.fandom}"]`).addClass('active');
    $(`.charlist li[data-character="${this.filters.post}"]`).addClass('active');
    $(`.tags .tags_item[data-tag="${this.filters.tag}"]`).addClass('active');
    $('.topic').toggleClass(
      'filtered',
      Boolean(this.filters.fandom || this.filters.post || this.filters.tag)
    );
  },
  setFilters: function({ fandom, post, tag, clear } = {}) {
    let nextFandom = this.filters.fandom;
    let nextPost = this.filters.post;
    let nextTag = this.filters.tag;

    if (clear) {
      nextFandom = null;
      nextPost = null;
      nextTag = null;
    } else if (post) {
      nextPost = post === this.filters.post ? null : post;
      nextFandom = null;
      nextTag = null;
    } else if (fandom) {
      nextPost = null;
      nextFandom = fandom === this.filters.fandom ? null : fandom;
    } else if (tag) {
      nextPost = null;
      nextTag = tag === this.filters.tag ? null : tag;
    }

    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    urlParams.delete('fandom');
    urlParams.delete('post');
    urlParams.delete('tag');

    if (nextFandom) urlParams.set('fandom', nextFandom);
    if (nextPost) urlParams.set('post', nextPost);
    if (nextTag) urlParams.set('tag', nextTag);

    if (nextFandom || nextPost || nextTag) this.scrollToList();

    window.history.replaceState( {} , 'title', window.location.pathname + '?' + urlParams.toLocaleString() );
    this.initList();
  },
  scrollToList() {
    $([document.documentElement, document.body]).animate({
      scrollTop: $(this.filterList).offset().top
    }, 500);
  },
  filterPosts: function() {
    if (this.filters.post) {
      this.filteredPosts = this.topicData.posts.filter(post => this.filters.post === post.id);
      return;
    }

    let postIds = null;

    if (this.filters.fandom) {
      const fandom = this.fandoms[this.filters.fandom];
      postIds = fandom ? fandom.items.map(item => item.postId) : [];
    }

    if (this.filters.tag) {
      const tag = this.tags[this.filters.tag];
      const tagIds = tag ? tag.postIds : [];
      postIds = postIds
        ? postIds.filter(id => tagIds.includes(id))
        : tagIds;
    }

    if (postIds) {
      this.filteredPosts = this.topicData.posts.filter(post => postIds.includes(post.id));
    } else {
      this.filteredPosts = [];
    }
  },
  renderFilteredList: function() {
    this.filterList.empty();
    this.filteredPosts.forEach(post => {
      const posted = new Date(+post.posted*1000).toLocaleDateString("ru-RU", {
        hour: "numeric",
        minute: "numeric",
      });
      this.filterList.append(`<div class="post filteredPost">
      <h3><span><strong>+${post.rating}</strong><a class="permalink" rel="nofollow" href="/viewtopic.php?pid=${post.id}#p${post.id}" target="_blank" rel="nofollow">${posted}</a></span></h3>
      <div class="container"><div class="post-author"><ul>
        <li class="pa-author"><span class="acchide">Автор:&nbsp;</span><a href="/profile.php?id=${post.user_id}" target="_blank" rel="nofollow">${post.username}</a></li>
			</ul></div><div class="post-body"><div class="post-box"><div class="post-content">
        ${post.message}
      </div></div></div></div>`);
    });
    if (this.filteredPosts.length) {
      this.callbackScripts();
    }
  },
  callbackScripts: function () {
    this.callbacks.forEach(fn => {
      if (typeof fn !== 'function') return;
      fn(this.filterList);
    })
  }
};
