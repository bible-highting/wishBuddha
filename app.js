const SLOTS_PER_PAGE = 20;
const SUPABASE_URL = "https://ijypbjylwikzxyrqxkdv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3yZMrj62wfssVPwCtq_AlA_MsAWkBMg";
const STORAGE_KEYS = {
  participantId: "wishBuddha:participantId",
  theme: "wishBuddha:theme",
};

const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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

function fromDbWish(wish) {
  return {
    id: wish.id,
    slotIndex: wish.slot_index,
    name: wish.name,
    content: wish.content,
    color: wish.color,
    participantId: wish.participant_id,
    createdAt: wish.created_at,
  };
}

function toDbWish(wish) {
  return {
    slot_index: wish.slotIndex,
    name: wish.name,
    content: wish.content,
    color: wish.color,
    participant_id: wish.participantId,
  };
}

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
  wishFormTitle: document.querySelector("#wishFormTitle"),
  wishFormLine: document.querySelector(".dialogue-line"),
  slotIndex: document.querySelector("#slotIndex"),
  wishName: document.querySelector("#wishName"),
  wishContent: document.querySelector("#wishContent"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmPreview: document.querySelector("#confirmPreview"),
  confirmBack: document.querySelector("#confirmBack"),
  confirmSubmit: document.querySelector("#confirmSubmit"),
  wishViewDialog: document.querySelector("#wishViewDialog"),
  wishViewTitle: document.querySelector("#wishViewTitle"),
  wishViewContent: document.querySelector("#wishViewContent"),
  toast: document.querySelector("#toast"),
};

let wishes = [];
let pendingWish = null;
let toastTimer = 0;
let typewriterTimer = 0;
let currentPage = 1;
let isSaving = false;

function setConfirmSaving(saving) {
  isSaving = saving;
  elements.confirmSubmit.disabled = saving;
  elements.confirmSubmit.textContent = saving ? "담는 중..." : "소원 담기";
}

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

async function loadWishes({ silent = false } = {}) {
  if (!supabaseClient) {
    if (!silent) showToast("Supabase 연결 스크립트를 불러오지 못했어요.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("wishes")
    .select("id, slot_index, name, content, color, participant_id, created_at")
    .order("slot_index", { ascending: true });

  if (error) {
    if (!silent) showToast("소원 목록을 불러오지 못했어요. Supabase 테이블을 확인해 주세요.");
    console.error("Failed to load wishes:", error);
    return;
  }

  wishes = data.map(fromDbWish);
  renderLanternGrid();
}

function subscribeToWishChanges() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("public:wishes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "wishes" },
      () => loadWishes({ silent: true })
    )
    .subscribe();
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

function stopWishPrompt() {
  window.clearTimeout(typewriterTimer);
  typewriterTimer = 0;
}

function typeText(target, text, onDone) {
  let index = 0;
  target.textContent = "";
  target.classList.remove("is-done");

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    target.textContent = text;
    target.classList.add("is-done");
    onDone?.();
    return;
  }

  const tick = () => {
    target.textContent = text.slice(0, index);
    index += 1;

    if (index <= text.length) {
      typewriterTimer = window.setTimeout(tick, 38);
      return;
    }

    target.classList.add("is-done");
    onDone?.();
  };

  tick();
}

function playWishPrompt() {
  stopWishPrompt();
  const title = elements.wishFormTitle.dataset.prompt;
  const line = elements.wishFormLine.dataset.prompt;

  elements.wishFormLine.textContent = "";
  elements.wishFormLine.classList.remove("is-done");
  typeText(elements.wishFormTitle, title, () => {
    typeText(elements.wishFormLine, line);
  });
}

function resetForm() {
  elements.wishForm.reset();
  elements.slotIndex.value = "";
}

function openWishForm(slotIndex) {
  resetForm();
  elements.slotIndex.value = String(slotIndex);
  openDialog(elements.wishFormDialog);
  playWishPrompt();
  window.setTimeout(() => elements.wishName.focus(), 80);
}

function openWishView(wish) {
  elements.wishViewTitle.textContent = `${wish.name}님의 소원`;
  elements.wishViewContent.textContent = wish.content;
  openDialog(elements.wishViewDialog);
}

function restorePendingWishForm() {
  if (!pendingWish) {
    closeDialog(elements.confirmDialog);
    return;
  }

  closeDialog(elements.confirmDialog);
  resetForm();
  elements.slotIndex.value = String(pendingWish.slotIndex);
  elements.wishName.value = pendingWish.name;
  elements.wishContent.value = pendingWish.content;

  const colorInput = elements.wishForm.querySelector(
    `input[name="color"][value="${CSS.escape(pendingWish.color)}"]`
  );
  if (colorInput) colorInput.checked = true;

  openDialog(elements.wishFormDialog);
  playWishPrompt();
  window.setTimeout(() => elements.wishContent.focus(), 80);
}

function getSaveErrorMessage(error) {
  if (error.code === "23505") {
    return "방금 다른 분이 이 연등에 소원을 달았어요. 다른 연등을 골라 주세요.";
  }

  if (error.code === "42501") {
    return "Supabase 입력 정책이 저장을 막고 있어요. insert policy를 확인해 주세요.";
  }

  return "소원을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
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

  stopWishPrompt();
  closeDialog(elements.wishFormDialog);
  openDialog(elements.confirmDialog);
}

async function savePendingWish() {
  if (!pendingWish || isSaving) return;

  if (!supabaseClient) {
    showToast("Supabase 연결 스크립트를 불러오지 못했어요.");
    return;
  }

  const wishToSave = pendingWish;
  setConfirmSaving(true);

  try {
    const { error } = await supabaseClient.from("wishes").insert(toDbWish(wishToSave));

    if (error) {
      console.error("Failed to save wish:", error);

      if (error.code === "23505") {
        pendingWish = null;
        closeDialog(elements.confirmDialog);
        await loadWishes({ silent: true });
        showToast(getSaveErrorMessage(error));
        return;
      }

      showToast(getSaveErrorMessage(error));
      return;
    }

    wishes = [
      ...wishes.filter((wish) => wish.slotIndex !== wishToSave.slotIndex),
      wishToSave,
    ];
    currentPage = Math.floor(wishToSave.slotIndex / SLOTS_PER_PAGE) + 1;
    pendingWish = null;
    closeDialog(elements.confirmDialog);
    renderLanternGrid();
    await loadWishes({ silent: true });
    showToast("소원이 연등에 담겼어요.");
  } catch (error) {
    console.error("Failed to save wish:", error);
    showToast("소원을 저장하지 못했어요. 인터넷 연결을 확인해 주세요.");
  } finally {
    setConfirmSaving(false);
  }
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
      if (dialog === elements.wishFormDialog) stopWishPrompt();
      closeDialog(dialog);
    });
  });

  document.querySelectorAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        if (dialog === elements.wishFormDialog) stopWishPrompt();
        closeDialog(dialog);
      }
    });

    dialog.addEventListener("cancel", () => {
      if (dialog === elements.wishFormDialog) stopWishPrompt();
    });
  });
}

elements.grid.addEventListener("click", handleGridClick);
elements.prevPage.addEventListener("click", () => movePage(-1));
elements.nextPage.addEventListener("click", () => movePage(1));
elements.themeToggle.addEventListener("click", handleThemeToggle);
elements.wishForm.addEventListener("submit", handleFormSubmit);
elements.confirmBack.addEventListener("click", restorePendingWishForm);
elements.confirmSubmit.addEventListener("click", savePendingWish);
bindDialogControls();
store.getParticipantId();
updateThemeText();
renderLanternGrid();
loadWishes();
subscribeToWishChanges();
