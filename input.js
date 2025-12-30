const $ = (s) => document.querySelector(s);

function setLoading(btn, isLoading, textWhenLoading, textWhenDone){
  btn.disabled = isLoading;
  btn.textContent = isLoading ? textWhenLoading : textWhenDone;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function splitItems(raw){
  return raw
    .split(/[\n,，、/]+/g)
    .map(s => s.trim())
    .filter(Boolean);
}

/* ===============================
   食材分類
================================ */
const DICT = {
  "蔬菜": ["花椰菜","高麗菜","白菜","青江菜","菠菜","空心菜","地瓜葉","芥藍","羽衣甘藍","小黃瓜","黃瓜","番茄","茄子","洋蔥","青蔥","蔥","蒜","薑","香菜","九層塔","辣椒","甜椒","紅椒","黃椒","菇","香菇","杏鮑菇","金針菇","鴻喜菇","蘑菇","萵苣","生菜","玉米筍","豆芽","紅蘿蔔","胡蘿蔔","白蘿蔔","蘿蔔"],
  "海鮮": ["鮭魚","鮪魚","鱈魚","鯖魚","鰻魚","鯛魚","虱目魚","秋刀魚","蝦","蟹","干貝","蛤蜊","文蛤","牡蠣","章魚","魷魚","小卷","透抽","海苔","昆布"],
  "肉": ["雞","雞胸","雞腿","牛","牛肉","豬","豬肉","羊","羊肉","鴨","鴨腿","培根","火腿","香腸","絞肉","排骨","五花","里肌"],
  "澱粉": ["飯","白飯","糙米","米","麵","麵條","烏龍麵","拉麵","冬粉","米粉","麵包","吐司","饅頭","餅皮","馬鈴薯","地瓜","芋頭","南瓜"],
};

function guessCategory(name){
  for (const [cat, list] of Object.entries(DICT)) {
    if (list.some(k => name.includes(k))) return cat;
  }
  if (name.includes("魚") || name.includes("蝦") || name.includes("貝") || name.includes("蟹")) return "海鮮";
  if (name.includes("牛") || name.includes("豬") || name.includes("雞") || name.includes("鴨") || name.includes("羊")) return "肉";
  if (name.includes("麵") || name.includes("飯") || name.includes("米") || name.includes("薯") || name.includes("吐司")) return "澱粉";
  return "其他";
}

/* ===============================
   存冰箱預覽
================================ */
function renderPreview(items){
  const box = $("#preview");
  box.innerHTML = "";
  if (!items.length) return;

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>這次準備存進冰箱的食材（可改類別 / 有效日期可不填）</h3>
    <div id="previewList" class="preview-list"></div>
    <p class="muted mt10">（按「存到我的冰箱」就會逐筆寫入 MySQL）</p>
  `;
  box.appendChild(card);

  const list = card.querySelector("#previewList");
  items.forEach((name, idx) => {
    const cat = guessCategory(name);

    const row = document.createElement("div");
    row.className = "preview-row";
    row.innerHTML = `
      <div class="preview-name">${escapeHtml(name)}</div>
      <select class="preview-select">
        ${["蔬菜","海鮮","肉","澱粉","其他"].map(c =>
          `<option value="${c}" ${c===cat ? "selected" : ""}>${c}</option>`
        ).join("")}
      </select>
      <input class="preview-date" type="date">
    `;
    list.appendChild(row);
  });
}

function readPreview(items){
  const selects = Array.from(document.querySelectorAll(".preview-select"));
  const dates = Array.from(document.querySelectorAll(".preview-date"));

  return items.map((name, i) => ({
    name,
    category: selects[i]?.value || "其他",
    expire_date: dates[i]?.value || null,
  }));
}

/* ===============================
   AI 料理顯示（重點）
================================ */
function renderRecipes(recipes){
  const out = $("#out");
  out.innerHTML = `<p class="muted">✨ 由 AI 生成</p>`;

  if (!recipes || recipes.length === 0) {
    out.innerHTML += `<p>找不到料理 🥲</p>`;
    return;
  }

  recipes.forEach((r) => {
    const imageHtml = r.image
      ? `<img
  src="${r.image}"
  alt="${escapeHtml(r.title)}"
  class="fade-in-image"
  loading="lazy"
  onload="this.classList.add('loaded')"
>`
      : `<div class="no-image">AI 圖片生成失敗</div>`;

    const card = document.createElement("div");
    card.className = "recipe-card";
    card.className = "recipe-card reveal";

    card.innerHTML = `
      <div class="recipe-text">
        <h3>${escapeHtml(r.title)}</h3>
        <p class="muted">${escapeHtml(r.description)}</p>
        <h4>步驟</h4>
        <pre>${escapeHtml(r.steps)}</pre>
      </div>
      <div class="recipe-image">
        ${imageHtml}
      </div>
    `;

    out.appendChild(card);
  });

  observeReveals();

}

/* ===============================
   事件
================================ */
$("#items").addEventListener("input", () => {
  renderPreview(splitItems($("#items").value.trim()));
});

$("#btnAI").addEventListener("click", async () => {
  const items = $("#items").value.trim();
  if (!items) return alert("先輸入一些食材啦～🥺");

  const btn = $("#btnAI");
  setLoading(btn, true, "生成中…🍳", "找料理 / 叫 AI");

  try {
    const res = await fetch("/api/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items })
    });

    const data = await res.json();
    renderRecipes(data.recipes || []);
  } catch (err) {
    alert("AI 生成失敗：" + err.message);
  } finally {
    setLoading(btn, false, "", "找料理 / 叫 AI");
  }
});



const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("show");
        observer.unobserve(entry.target); // 只跑一次
      }
    });
  },
  {
    threshold: 0.2, // 滑到 20% 就觸發
  }
);

// 監聽所有 reveal 元素
function observeReveals() {
  document.querySelectorAll(".reveal").forEach((el) => {
    observer.observe(el);
  });
}
s
