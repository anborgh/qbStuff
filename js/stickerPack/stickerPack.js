/**
 * Скрипт стикеров
 * автор: Человек-Шаман
 * version: 1.0.8
 *
 * Что нового:
 * 1. Фикс совместимости со скриптом визуального редактора
 */
const hvStickerPack = {
  loading: false,
  data: [],
  userData: [],
  isOpened: false,
  activeTab: '',

  init: function (url) {
    if ($("#button-smile").length === 0) return;
    this.url = url;
    this.handleTdClick = this.handleTdClick.bind(this);
    this.setLoading = this.setLoading.bind(this);
    this.parseLoadedData = this.parseLoadedData.bind(this);
    this.handleTabsClick = this.handleTabsClick.bind(this);
    this.handleOutsideClick = this.handleOutsideClick.bind(this);
    this.handleAddButtonClick = this.handleAddButtonClick.bind(this);
    this.handleContentClick = this.handleContentClick.bind(this);
    this.closeModal = this.closeModal.bind(this);
    this.addStyle();
    this.addButton();
  },
  addStyle: function () {
    const style = $('<link rel="stylesheet" href="https://forumstatic.ru/files/0019/37/10/94202.css">');
    $("head").append(style);
  },
  addButton: function () {
    this.button = $('<td title="Стикеры" id="button-sticker"></td>');
    this.button.on("click", this.handleTdClick);

    const smile = $("#button-smile");
    smile.after(this.button);
  },
  renderModal: function () {
    if (this.modal) {
      this.toggleModal(true);
      return;
    }

    this.modalContainer = $('<div class="hvStickerPackModalContainer"></div>');
    this.modal = $('<div class="hvStickerPackModal"></div>');
    this.modalTabs = $('<div class="hvStickerPackModalTabs"></div>');
    this.modalContent = $('<div class="hvStickerPackModalContent"></div>');
    this.addContainer = $('<div class="hvStickerPackModalAdd hidden"></div>');
    this.stickerInput = $(
      '<input class="hvStickerPackModalInput" type="text" placeholder="Url стикера">'
    );
    this.addStickerButton = $(
      '<input class="hvStickerPackModalAddButton" type="button" value="+">'
    );
    this.addContainer.append(this.stickerInput);
    this.addContainer.append(this.addStickerButton);

    this.modal.append(this.modalContent);
    this.modal.append(this.addContainer);
    this.modal.append(this.modalTabs);
    this.modalContainer.append(this.modal);

    this.data.forEach(pack => {
      if (pack.stickers.length === 0) {
        return;
      }
      hvStickerPack.modalTabs.append(`<div class="hvStickerPackModalTab" data-pack="${pack.name}">${pack.name}</div>`);
    });
    if (GroupID !== 3) {
      hvStickerPack.modalTabs.append(
        '<div class="hvStickerPackModalTab" data-pack="Свои">Свои</div>'
      );
    }

    this.modalTabs.on("click", this.handleTabsClick);
    this.modalContent.on("click", this.handleContentClick);
    this.addStickerButton.on("click", this.handleAddButtonClick);

    $("body").append(this.modalContainer);
    this.toggleModal(true);
  },
  closeModal: function () {
    this.toggleModal(false);
  },
  toggleModal: function (isOpened) {
    const open = typeof isOpened !== "undefined" ? Boolean(isOpened) : !this.isOpened;

    if (open) {
      const offset = $("#wysi-reply:visible,#main-reply:visible").offset() || $("#post-form").offset();
      this.modalContainer.css({
        position: "absolute",
        top: offset.top,
        left: offset.left
      });
      this.modal.css({
        width: $("#wysi-reply:visible,#main-reply:visible").width() || $("#post-form").width(),
      });

      this.setTab(this.activeTab);
      $(document).on("click", this.handleOutsideClick);
      $(document).on("pun_post", this.closeModal);
      $(document).on("pun_preview", this.closeModal);
      $(document).on("pun_preedit", this.closeModal);
      $(document).on("pun_edit", this.closeModal);
      $(document).on("messenger:post", this.closeModal);
    } else {
      $(document).off("pun_post", this.closeModal);
      $(document).off("pun_preview", this.closeModal);
      $(document).off("pun_preedit", this.closeModal);
      $(document).off("pun_edit", this.closeModal);
      $(document).off("messenger:post", this.closeModal);
      $(document).off("click", this.handleOutsideClick);
    }

    this.modal.toggleClass("active", open);
    this.isOpened = open;
  },
  setTab: function (tabName) {
    const self = this;
    this.activeTab = tabName;
    const isCustomTab = this.activeTab === "Свои";
    $(this.modalTabs)
      .find(".hvStickerPackModalTab")
      .removeClass("active");
    $(this.modalTabs)
      .find(`.hvStickerPackModalTab[data-pack="${this.activeTab}"]`)
      .addClass("active");

    const pack = isCustomTab
      ? {
        name: "Свои",
        stickers: this.userData
      }
      : this.data.find(pack => pack.name === self.activeTab);
    $(self.modalContent).empty();
    pack.stickers.forEach(url => {
      const removeButton = isCustomTab
        ? '<span class="hvStickerPackRemoveItem" title="Удалить">x</span>'
        : '';
      $(self.modalContent).append(
        `<div class="hvStickerPackItem" data-sticker="${url}"><img src="${url}" onClick="smile('[img]${url}[/img]')">${removeButton}</div>`
      );
    });
    this.toggleAddTab(isCustomTab);
  },
  toggleAddTab: function (isCustom) {
    this.addContainer.toggleClass("hidden", !isCustom);
  },
  setLoading: function (isLoading) {
    this.loading = Boolean(isLoading);
    this.button.toggleClass("loading", isLoading);
  },
  parseLoadedData: function (data) {
    const stickerArray = data.split(/\r?\n/);
    let pointer = 0;
    let pointerName = "Pack 1";

    stickerArray.forEach(str => {
      str = str
        .replace(String.fromCharCode(13), '')
        // в 2025 году внутренний хостинг файлов mybb сменился, фикс автоматически заменяет ссылки
        .replace(/^https?:\/\/forumupload.ru\//, 'https://upforme.ru/');
      const isImg = /\.(gif|jpe?g|png|webp)/i.test(str);

      if (isImg) {
        if (!hvStickerPack.data[pointer]) {
          hvStickerPack.data[pointer] = {
            name: pointerName,
            stickers: []
          };
        }
        hvStickerPack.data[pointer].stickers.push(str);
      } else {
        if (str === "") {
          pointerName = `Pack ${hvStickerPack.data.length + 1}`;
          if (hvStickerPack.data[pointer]) {
            pointer++;
          }
        } else {
          pointerName = str;
        }
      }
    });
    hvStickerPack.activeTab = hvStickerPack.data[0].name
  },
  handleTdClick: function (event) {
    event.stopPropagation();
    if (this.loading) {
      return;
    }

    if (this.data.length) {
      this.toggleModal();
      return;
    }

    this.setLoading(true);
    this.loadForumStickers();
    if (GroupID !== 3) {
      this.loadUserStickers();
    }
  },
  handleTabsClick: function (event) {
    const target = $(event.target).closest(".hvStickerPackModalTab");
    if (target.length) {
      this.setTab(target.attr("data-pack"));
    }
  },
  handleContentClick: function (event) {
    event.stopPropagation();
    const target = $(event.target).closest(".hvStickerPackRemoveItem");
    if (target.length) {
      const link = target.closest(".hvStickerPackItem").attr("data-sticker");
      const index = this.userData.indexOf(link);
      this.userData.splice(index, 1);
      this.setTab("Свои");
      this.setUserData();
    }
  },
  handleAddButtonClick: function () {
    const link = $(this.stickerInput).val();
    const isImg = /(^https?:\/\/.*\.(?:png|jpg|gif|webp))$/.test(link);

    if (isImg && !this.userData.includes(link)) {
      this.userData.push(link);
      this.setUserData();
      this.setTab("Свои");
      $(this.stickerInput).val("");
    }
  },
  setUserData() {
    const value = this.checkedUserData(this.userData);
    $.post("/api.php", {
      method: "storage.set",
      token: ForumAPITicket,
      key: "hvStickerPack",
      value,
    });
  },
  checkedUserData(userData) {
    const string = JSON.stringify(userData);
    if (string.length >= 65000) {
      $.jGrowl("Слишком много стикеров, последний не был сохранён 😔");
      userData.pop();
      return this.checkedUserData(userData)
    } else {
      return string;
    }
  },
  handleOutsideClick: function (event) {
    var target = $(event.target);
    if (!target.closest(".hvStickerPackModal").length) {
      hvStickerPack.toggleModal(false);
    }
  },
  loadForumStickers: function () {
    $.get(this.url, data => {
      hvStickerPack.parseLoadedData(data);
      hvStickerPack.setLoading(false);
      hvStickerPack.renderModal();
    }).fail(() => {
      $.jGrowl("Стикеры не грузятся, что-то пошло не так 😔 Может, поможет перезагрузка страницы?");
    });
  },
  loadUserStickers: function () {
    if (UserID === 1) {
      return;
    }

    $.ajax({
      async: false,
      url: "/api.php",
      data: {
        method: "storage.get",
        key: "hvStickerPack"
      },
      success: result => {
        const response = result.response?.storage?.data?.hvStickerPack || '';

        if (response) {
          try {
            const userData = JSON.parse(response);
            // в 2025 году внутренний хостинг файлов mybb сменился, фикс автоматически заменяет ссылки
            const clearedData = userData.map(item => item.replace(/^https?:\/\/forumupload.ru\//, 'https://upforme.ru/'));
            hvStickerPack.userData = clearedData;
          } catch (err) {
            if (err.name === 'SyntaxError' && response.length > 65000) {
              this.setUserData();
              $.jGrowl("Стикеры сохранились критично неправильно, мне пришлось очистить хранилище. Очень извиняюсь 😥");
            }
          }
        }
      },
      error: () => {
        $.jGrowl("Твои стикеры не прогрузились, придется пользоваться форумными 😒");
      }
    });
  }
};