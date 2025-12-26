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

      <select class="preview-select" data-idx="${idx}">
        ${["蔬菜","海鮮","肉","澱粉","其他"].map(c => `
          <option value="${c}" ${c===cat ? "selected" : ""}>${c}</option>
        `).join("")}
      </select>

      <input class="preview-date" data-idx="${idx}" type="date">
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
    expire_date: dates[i]?.value ? dates[i].value : null,
  }));
}

function renderRecipes(recipes, rawText){
  const out = $("#out");
  out.innerHTML = `<p class="muted">✨ 由 AI 生成</p>`;

  if (!recipes || recipes.length === 0) {
    out.innerHTML += `<p>找不到料理 🥲</p>`;
    if (rawText) out.innerHTML += `<pre>${escapeHtml(rawText)}</pre>`;
    return;
  }

  recipes.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <h3>${escapeHtml(r.title || "")}</h3>
      <p class="muted">${escapeHtml(r.description || "")}</p>
      <h4>步驟</h4>
      <pre>${escapeHtml(r.steps || "")}</pre>
    `;
    out.appendChild(card);
  });
}

function renderSaveResult(result){
  const out = $("#out");
  out.innerHTML = "";

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <h3>✅ 已存入冰箱</h3>
    <p class="muted">成功 ${result.success.length} 筆 / 失敗 ${result.failed.length} 筆</p>

    <h4>成功</h4>
    <pre>${escapeHtml(result.success.map(s =>
      `- ${s.name} (${s.category}) 到期:${s.expire_date || "未填"} #${s.insertedId}`
    ).join("\n") || "（無）")}</pre>

    <h4 class="mt12">失敗</h4>
    <pre>${escapeHtml(result.failed.map(f =>
      `- ${f.name} (${f.category}) → ${f.error}`
    ).join("\n") || "（無）")}</pre>
  `;
  out.appendChild(card);
}

// textarea 變動 → 更新預覽
$("#items").addEventListener("input", () => {
  renderPreview(splitItems($("#items").value.trim()));
});

// AI
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

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

    renderRecipes(data.recipes || [], data.raw);
  } catch (err) {
    renderRecipes([], String(err.message || err));
  } finally {
    setLoading(btn, false, "", "找料理 / 叫 AI");
  }
});

// ✅ 存冰箱（重點：不要重畫預覽，不然日期會被清掉）
$("#btnSave").addEventListener("click", async () => {
  const raw = $("#items").value.trim();
  if (!raw) return alert("你要先輸入食材才能存啦🥺");

  const items = splitItems(raw);
  if (!items.length) return alert("拆不到任何食材欸…😂");

  // ✅ 只有預覽區是空的才畫，避免清掉已選日期
  if (!document.querySelector(".preview-row")) {
    renderPreview(items);
  }

  const picked = readPreview(items);

  const btn = $("#btnSave");
  setLoading(btn, true, "存入中…🧊", "存到我的冰箱 🧊");

  const result = { success: [], failed: [] };

  try {
    for (const it of picked) {
      try {
        const res = await fetch("/api/fridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: it.name,
            quantity: null,
            expire_date: it.expire_date,      // ✅ 真的送到後端
            note: `category:${it.category}`
          })
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || data?.error || `HTTP ${res.status}`);

        result.success.push({
          name: it.name,
          category: it.category,
          expire_date: it.expire_date,
          insertedId: data.insertedId
        });
      } catch (e) {
        result.failed.push({
          name: it.name,
          category: it.category,
          error: e.message || String(e)
        });
      }
    }

    renderSaveResult(result);
  } finally {
    setLoading(btn, false, "", "存到我的冰箱 🧊");
  }
});
