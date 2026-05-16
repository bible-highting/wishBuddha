const SLOTS_PER_PAGE = 20;
const STORAGE_KEYS = {
  wishes: "wishBuddha:wishes",
  participantId: "wishBuddha:participantId",
  theme: "wishBuddha:theme",
};

const lanternImages = {
  empty: "./img/lantern/empty.png",
  light: {
    red: "./img/lantern/red_light.png",
    green: "./img/lantern/green_light.png",
    blue: "./img/lantern/blue_light.png",
    yellow: "./img/lantern/yellow_light.png",
  },
  dark: {
    red: "./img/lantern/red_dark.png",
    green: "./img/lantern/green_dark.png",
    blue: "./img/lantern/blue_dark.png",
    yellow: "./img/lantern/yellow_dark.png",
  },
};

Object.values(lanternImages.light)
  .concat(Object.values(lanternImages.dark), lanternImages.empty)
  .forEach((src) => {
    const image = new Image();
    image.src = src;
  });

const store = {
  getWishes() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.wishes) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },
  saveWishes(wishes) {
    localStorage.setItem(STORAGE_KEYS.wishes, JSON.stringify(wishes));
  },
  getParticipantId() {
    const saved = localStorage.getItem(STORAGE_KEYS.participantId);
    if (saved) return saved;

    const participantId =
      crypto.randomUUID?.() || `participant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(STORAGE_KEYS.participantId, participantId);
    return participantId;
  },
  getTheme() {
    return document.documentElement.dataset.theme || "light";
  },
  saveTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  },
};

const elements = {
  grid: document.querySelector("#lanternGrid"),
  pageCount: document.querySelector("#pageCount"),
  pageStatus: document.querySelector("#pageStatus"),
  prevPage: document.querySelector("#prevPage"),
  nextPage: document.querySelector("#nextPage"),
  themeToggle: document.querySelector("#themeToggle"),
  themeToggleText: document.querySelector("#themeToggleText"),
  wishFormDialog: document.querySelector("#wishFormDialog"),
  wishForm: document.querySelector("#wishForm"),
  slotIndex: document.querySelector("#slotIndex"),
  wishName: document.querySelector("#wishName"),
  wishContent: document.querySelector("#wishContent"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmPreview: document.querySelector("#confirmPreview"),
  confirmSubmit: document.querySelector("#confirmSubmit"),
  wishViewDialog: document.querySelector("#wishViewDialog"),
  wishViewTitle: document.querySelector("#wishViewTitle"),
  wishViewContent: document.querySelector("#wishViewContent"),
  toast: document.querySelector("#toast"),
};

let wishes = store.getWishes();
let pendingWish = null;
let toastTimer = 0;
let currentPage = 1;

function getWishBySlot(slotIndex) {
  return wishes.find((wish) => wish.slotIndex === slotIndex);
}

function getHighestOccupiedSlot() {
  return wishes.reduce((highest, wish) => Math.max(highest, wish.slotIndex), -1);
}

function getTotalPages() {
  return Math.max(1, Math.ceil((getHighestOccupiedSlot() + 2) / SLOTS_PER_PAGE));
}

function getLanternImage(wish) {
  if (!wish) return lanternImages.empty;
  const theme = store.getTheme();
  return lanternImages[theme][wish.color] || lanternImages.light.red;
}

function updateThemeText() {
  const isDark = store.getTheme() === "dark";
  elements.themeToggleText.textContent = isDark ? "Light" : "Dark";
  elements.themeToggle.setAttribute("aria-label", `${isDark ? "라이트" : "다크"} 모드로 전환`);
}

function updatePagination() {
  const totalPages = getTotalPages();
  currentPage = Math.min(currentPage, totalPages);

  const label = `${currentPage} / ${totalPages}`;
  elements.pageCount.textContent = label;
  elements.pageStatus.textContent = label;
  elements.prevPage.disabled = currentPage === 1;
  elements.nextPage.disabled = currentPage === totalPages;
}

function renderLanternGrid() {
  updatePagination();

  const fragment = document.createDocumentFragment();
  const startIndex = (currentPage - 1) * SLOTS_PER_PAGE;
  const endIndex = startIndex + SLOTS_PER_PAGE;

  for (let index = startIndex; index < endIndex; index += 1) {
    const wish = getWishBySlot(index);
    const slot = document.createElement("button");
    slot.className = `lantern-slot${wish ? " is-filled" : ""}`;
    slot.type = "button";
    slot.dataset.slotIndex = index;
    slot.setAttribute(
      "aria-label",
      wish ? `${index + 1}번 입력된 소원 연등 보기` : `${index + 1}번 빈 연등에 소원 입력`
    );

    const inner = document.createElement("span");
    inner.className = "lantern-inner";

    const img = document.createElement("img");
    img.className = "lantern-img";
    img.src = getLanternImage(wish);
    img.alt = "";
    img.decoding = "sync";
    img.draggable = false;
    img.loading = "eager";

    const slotNumber = document.createElement("span");
    slotNumber.className = "slot-number";
    slotNumber.textContent = String(index + 1);

    inner.append(img, slotNumber);
    slot.append(inner);
    fragment.append(slot);
  }

  elements.grid.replaceChildren(fragment);
}

function refreshLanternImages() {
  document.querySelectorAll(".lantern-slot").forEach((slot) => {
    const slotIndex = Number(slot.dataset.slotIndex);
    const wish = getWishBySlot(slotIndex);
    const img = slot.querySelector(".lantern-img");
    img.src = getLanternImage(wish);
    slot.classList.toggle("is-filled", Boolean(wish));
  });
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function resetForm() {
  elements.wishForm.reset();
  elements.slotIndex.value = "";
}

function openWishForm(slotIndex) {
  resetForm();
  elements.slotIndex.value = String(slotIndex);
  openDialog(elements.wishFormDialog);
  window.setTimeout(() => elements.wishName.focus(), 80);
}

function openWishView(wish) {
  elements.wishViewTitle.textContent = `${wish.name}님의 소원`;
  elements.wishViewContent.textContent = wish.content;
  openDialog(elements.wishViewDialog);
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2800);
}

function handleGridClick(event) {
  const slot = event.target.closest(".lantern-slot");
  if (!slot) return;

  slot.classList.remove("is-tapping");
  void slot.offsetWidth;
  slot.classList.add("is-tapping");

  const slotIndex = Number(slot.dataset.slotIndex);
  const wish = getWishBySlot(slotIndex);

  if (wish) {
    openWishView(wish);
  } else {
    openWishForm(slotIndex);
  }
}

function handleFormSubmit(event) {
  event.preventDefault();

  const formData = new FormData(elements.wishForm);
  const name = String(formData.get("name") || "").trim();
  const content = String(formData.get("content") || "").trim();
  const color = String(formData.get("color") || "");
  const slotIndex = Number(formData.get("slotIndex"));

  if (!name || !content || !color || Number.isNaN(slotIndex)) {
    showToast("이름, 소원 내용, 연등 색상을 모두 입력해 주세요.");
    return;
  }

  if (getWishBySlot(slotIndex)) {
    showToast("방금 다른 소원이 들어온 연등이에요. 다른 연등을 골라 주세요.");
    closeDialog(elements.wishFormDialog);
    renderLanternGrid();
    return;
  }

  pendingWish = {
    id: crypto.randomUUID?.() || `wish-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    slotIndex,
    name,
    content,
    color,
    participantId: store.getParticipantId(),
    createdAt: new Date().toISOString(),
  };

  elements.confirmPreview.innerHTML = `
    <span><strong>${escapeHtml(name)}</strong>님의 ${getColorLabel(color)} 연등</span>
    <span>${escapeHtml(content).replaceAll("\n", "<br />")}</span>
  `;

  closeDialog(elements.wishFormDialog);
  openDialog(elements.confirmDialog);
}

function savePendingWish() {
  if (!pendingWish) return;

  const savedWish = pendingWish;
  wishes = [...wishes, savedWish];
  store.saveWishes(wishes);
  currentPage = Math.floor(savedWish.slotIndex / SLOTS_PER_PAGE) + 1;
  pendingWish = null;
  closeDialog(elements.confirmDialog);
  renderLanternGrid();
  showToast("소원이 연등에 담겼어요.");
}

function getColorLabel(color) {
  return {
    red: "빨간",
    green: "초록",
    blue: "파란",
    yellow: "노란",
  }[color];
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[char];
  });
}

function handleThemeToggle() {
  const nextTheme = store.getTheme() === "dark" ? "light" : "dark";
  store.saveTheme(nextTheme);
  updateThemeText();
  refreshLanternImages();
}

function movePage(direction) {
  const totalPages = getTotalPages();
  const nextPage = currentPage + direction;
  if (nextPage < 1 || nextPage > totalPages) return;

  currentPage = nextPage;
  renderLanternGrid();
}

function bindDialogControls() {
  document.querySelectorAll("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      const dialog = button.closest("dialog");
      closeDialog(dialog);
    });
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });
}

elements.grid.addEventListener("click", handleGridClick);
elements.prevPage.addEventListener("click", () => movePage(-1));
elements.nextPage.addEventListener("click", () => movePage(1));
elements.themeToggle.addEventListener("click", handleThemeToggle);
elements.wishForm.addEventListener("submit", handleFormSubmit);
elements.confirmSubmit.addEventListener("click", savePendingWish);
bindDialogControls();
store.getParticipantId();
updateThemeText();
renderLanternGrid();
