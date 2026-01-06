/* ===============================
   基本工具
================================ */
const $ = (s) => document.querySelector(s);

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(dateStr) {
  if (!dateStr) return "未填";
  const d = new Date(dateStr);
  if (isNaN(d)) return "未填";
  return d.toISOString().slice(0, 10);
}

/* ===============================
   全域狀態
================================ */
let allItems = [];
let selectedItems = [];
let currentMode = "all";
let currentCategory = null;

/* ===============================
   Overlay 控制
================================ */
function openOverlay() {
  document.querySelector(".overlay")?.classList.add("open");
  document.querySelector("#nav-icon")?.classList.add("open");

  document.querySelectorAll(".overlay a")
    .forEach(a => a.classList.add("open"));

  document.querySelector(".overlay p")
    ?.classList.add("open");

  document.body.classList.add("menu-open");
}

function closeOverlay() {
  document.querySelector(".overlay")?.classList.remove("open");
  document.querySelector("#nav-icon")?.classList.remove("open");

  document.querySelectorAll(".overlay a")
    .forEach(a => a.classList.remove("open"));

  document.querySelector(".overlay p")
    ?.classList.remove("open");

  document.body.classList.remove("menu-open");
}

/* ===============================
   DOM Ready
================================ */
document.addEventListener("DOMContentLoaded", () => {

  /* --- 導覽列 --- */
  const navIcon = $("#nav-icon");
  const overlay = $(".overlay");
  const closeBtn = $(".overlay-close");

  navIcon?.addEventListener("click", () => {
    overlay.classList.contains("open")
      ? closeOverlay()
      : openOverlay();
  });

  closeBtn?.addEventListener("click", closeOverlay);

  overlay?.addEventListener("click", (e) => {
    if (e.target.classList.contains("overlay")) {
      closeOverlay();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeOverlay();
    }
  });

  /* --- 模式切換 --- */
  $("#btnAll")?.addEventListener("click", () => switchMode("all"));
  $("#btnExpiring")?.addEventListener("click", () => switchMode("expiring"));
  $("#btnExpired")?.addEventListener("click", () => switchMode("expired"));

  $("#btnCategory")?.addEventListener("click", () => {
    const g = $("#categoryGroup");
    g.style.display = g.style.display === "flex" ? "none" : "flex";
  });

  document.querySelectorAll(".category-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentCategory = btn.dataset.category;
      currentMode = "all";
      $("#categoryGroup").style.display = "none";
      applyFilter();
    });
  });

  /* --- AI --- */
  $("#btnAIAll")?.addEventListener("click", () => {
    if (!selectedItems.length) {
      alert("請先點選食材 🧊");
      return;
    }
    callAIFromFridge(selectedItems);
  });

  $("#btnAIExpiring")?.addEventListener("click", () => {
    const now = new Date();
    const twoDaysLater = new Date();
    twoDaysLater.setDate(now.getDate() + 2);

    const expiring = selectedItems.filter(s =>
      s.expire_date &&
      new Date(s.expire_date) >= now &&
      new Date(s.expire_date) <= twoDaysLater
    );

    if (!expiring.length) {
      alert("沒有即期食材 🥲");
      return;
    }

    callAIFromFridge(expiring);
  });

  loadFridgeFromDB();
});

/* ===============================
   模式切換
================================ */
function switchMode(mode) {
  currentMode = mode;
  currentCategory = null;

  $("#btnAll")?.classList.toggle("active", mode === "all");
  $("#btnExpiring")?.classList.toggle("active", mode === "expiring");
  $("#btnExpired")?.classList.toggle("active", mode === "expired");

  applyFilter();
}

/* ===============================
   讀取資料
================================ */
async function loadFridgeFromDB() {
  try {
    const res = await fetch("/api/fridge");
    const data = await res.json();
    allItems = data.items || [];
    selectedItems = [];
    applyFilter();
  } catch {
    alert("冰箱讀取失敗");
  }
}

/* ===============================
   篩選
================================ */
function applyFilter() {
  let list = [...allItems];
  const now = new Date();
  const twoDaysLater = new Date();
  twoDaysLater.setDate(now.getDate() + 2);

  if (currentMode === "expiring") {
    list = list.filter(s =>
      s.expire_date &&
      new Date(s.expire_date) >= now &&
      new Date(s.expire_date) <= twoDaysLater
    );
  } else if (currentMode === "expired") {
    list = list.filter(s =>
      s.expire_date &&
      new Date(s.expire_date) < now
    );
  }

  if (currentCategory) {
    list = list.filter(s => s.category === currentCategory);
  }

  renderFridgeList(list);
  updateAIBtn();
}

/* ===============================
   清單渲染
================================ */
function renderFridgeList(items) {
  const list = $("#fridgeList");
  list.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent =
    currentMode === "expiring" ? "即期食材" :
    currentMode === "expired" ? "已到期食材" :
    currentCategory ? `分類：${currentCategory}` :
    "全部食材";
  list.appendChild(title);

  if (!items.length) {
    list.innerHTML += "<p>沒有資料 🥲</p>";
    return;
  }

  const now = new Date();
  const twoDaysLater = new Date();
  twoDaysLater.setDate(now.getDate() + 2);

  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "fridge-row";
    row.style.cursor = "pointer";

    if (selectedItems.some(s => s.id === item.id)) {
      row.classList.add("selected");
    }

    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-cross")) return;

      const i = selectedItems.findIndex(s => s.id === item.id);
      i === -1 ? selectedItems.push(item) : selectedItems.splice(i, 1);
      renderFridgeList(items);
    });

    let name = escapeHtml(item.name);
    let style = "";

    if (item.expire_date) {
      const d = new Date(item.expire_date);
      if (d < now) {
        name = "💀 " + name;
        style = "color:red;font-weight:bold;";
      } else if (d <= twoDaysLater) {
        style = "color:red;";
      }
    }

// 分類背景色（一定要在 innerHTML 前面）
row.style.backgroundColor =
  item.category === "蔬菜" ? "#d4edda" :
  item.category === "海鮮" ? "#d1ecf1" :
  item.category === "肉" ? "#f8d7da" :
  item.category === "澱粉" ? "#fff3cd" :
  "#e2e3e5";

    row.innerHTML = `
      <span style="${style}">
        ${name}（${item.category}） 到期：${formatDate(item.expire_date)}
      </span>
      <span class="delete-cross" data-id="${item.id}">❌</span>
    `;

    list.appendChild(row);
  });

  list.querySelectorAll(".delete-cross").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("確定刪除？")) return;
      await fetch(`/api/fridge/${btn.dataset.id}`, { method: "DELETE" });
      loadFridgeFromDB();
    });
  });
}

/* ===============================
   AI 按鈕顯示
================================ */
function updateAIBtn() {
  $("#btnAIAll").style.display =
    !currentCategory && currentMode === "all" ? "inline-block" : "none";

  $("#btnAIExpiring").style.display =
    !currentCategory && currentMode === "expiring" ? "inline-block" : "none";
}

/* ===============================
   AI 呼叫
================================ */
async function callAIFromFridge(items) {
  const out = $("#out");
  const names = items.map(i => i.name).join("、");

  out.innerHTML = `<p class="muted">🍳 AI 生成中…</p>`;

  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: names })
    });

    const data = await res.json();
    renderRecipes(data.recipes || []);
  } catch {
    out.innerHTML = `<p style="color:red">AI 失敗</p>`;
  }
}

/* ===============================
   AI 食譜渲染
================================ */
function renderRecipes(recipes) {
  const out = $("#out");
  out.innerHTML = `<p class="muted">✨ AI 生成</p>`;

  recipes.forEach(r => {
    const card = document.createElement("div");
    card.className = "recipe-card reveal";
    card.innerHTML = `
      <div class="recipe-text">
        <h3>${escapeHtml(r.title)}</h3>
        <p>${escapeHtml(r.description)}</p>
        <pre>${escapeHtml(r.steps)}</pre>
      </div>
      <div class="recipe-image">
        ${r.image ? `<img src="${r.image}" loading="lazy">` : "無圖片"}
      </div>
    `;
    out.appendChild(card);
  });

  observeReveals();
  requestAnimationFrame(() => {
    out.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

/* ===============================
   動畫 Observer
================================ */
const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

function observeReveals() {
  document.querySelectorAll(".reveal:not(.show)")
    .forEach(el => observer.observe(el));
}
