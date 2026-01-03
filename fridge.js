const $ = (s) => document.querySelector(s);

// DOM ready（原生）
document.addEventListener("DOMContentLoaded", () => {
  const navIcon = $("#nav-icon");
  const overlay = document.querySelector(".overlay");

  if (!navIcon || !overlay) {
    console.error("找不到 nav-icon 或 overlay");
    return;
  }

  navIcon.addEventListener("click", () => {
    console.log("nav clicked"); // ← 一定要看到
    navIcon.classList.toggle("open");
    overlay.classList.toggle("open");

    overlay.querySelectorAll("a").forEach(a =>
      a.classList.toggle("open")
    );
    overlay.querySelector("p")?.classList.toggle("open");
  });
});







// 讀取 localStorage
let allItems = JSON.parse(localStorage.getItem("fridgeItems") || "[]");
let currentMode = "all";      // all / expiring / expired
let currentCategory = null;

// 渲染列表
function renderFridgeList(items){
  const now = new Date();
  const twoDaysLater = new Date();
  twoDaysLater.setDate(now.getDate() + 2);

  const list = $("#fridgeList");
  list.innerHTML = "";

  const title = document.createElement("h3");
  let titleText = "全部食材";
  if(currentMode === "expiring") titleText = "即期食材（2天內到期）";
  if(currentMode === "expired") titleText = "已到期食材";
  if(currentCategory) titleText = `分類：${currentCategory}`;
  title.textContent = titleText;
  list.appendChild(title);

  if(items.length === 0){
    list.innerHTML += "<p>沒有資料 🥲</p>";
    return;
  }

  items.forEach(item => {
    const idx = allItems.indexOf(item); // 找到原始全域索引
    const row = document.createElement("div");
    row.className = "fridge-row";

    // 背景色
    switch(item.category){
      case "蔬菜": row.style.backgroundColor = "#d4edda"; break;
      case "海鮮": row.style.backgroundColor = "#d1ecf1"; break;
      case "肉": row.style.backgroundColor = "#f8d7da"; break;
      case "澱粉": row.style.backgroundColor = "#fff3cd"; break;
      case "其他": row.style.backgroundColor = "#e2e3e5"; break;
      default: row.style.backgroundColor = "#ffffff"; break;
    }

    // 判斷是否即期或已到期
    let isExpiring = false;
    let isExpired = false;
    if(item.expire_date){
      const d = new Date(item.expire_date);
      if(d < now) isExpired = true;
      else if(d <= twoDaysLater) isExpiring = true;
    }

    // 設定文字樣式
    let displayText = item.name;
    let textColor = "inherit";
    let fontWeight = "normal";
    if(isExpired){
      displayText = `💀 ${item.name}`;
      textColor = "red";
      fontWeight = "bold";
    } else if(isExpiring){
      textColor = "red";
    }

    row.innerHTML = `
      <span style="color:${textColor}; font-weight:${fontWeight}">
        ${displayText}（${item.category}） 到期：${item.expire_date || "未填"}
      </span>
      <span class="delete-cross" data-idx="${idx}" style="cursor:pointer">❌</span>
    `;

    list.appendChild(row);
  });

  // 刪除事件
  list.querySelectorAll(".delete-cross").forEach(span => {
    span.addEventListener("click", () => {
      const index = parseInt(span.dataset.idx);
      if(!isNaN(index)){
        allItems.splice(index,1);
        localStorage.setItem("fridgeItems", JSON.stringify(allItems));
        applyFilter();
      }
    });
  });
}

// 篩選函式
function applyFilter(){
  let list = [...allItems];
  const now = new Date();
  const twoDaysLater = new Date();
  twoDaysLater.setDate(now.getDate() + 2);

  if(currentMode === "expiring"){
    list = list.filter(s => s.expire_date && new Date(s.expire_date) >= now && new Date(s.expire_date) <= twoDaysLater);
  } else if(currentMode === "expired"){
    list = list.filter(s => s.expire_date && new Date(s.expire_date) < now);
  }

  if(currentCategory){
    list = list.filter(s => s.category === currentCategory);
  }

  renderFridgeList(list);
  updateAIBtn();
}

// 按鈕元素
const btnAll = $("#btnAll");
const btnExpiring = $("#btnExpiring");
const btnExpired = $("#btnExpired");
const btnBack = $("#btnBack");
const btnCategory = $("#btnCategory");
const categoryGroup = $("#categoryGroup");

// AI 按鈕
const btnAIAll = $("#btnAIAll");
const btnAIExpiring = $("#btnAIExpiring");

// 更新 AI 按鈕顯示
function updateAIBtn(){
  if(currentCategory || currentMode === "expired"){
    btnAIAll.style.display = "none";
    btnAIExpiring.style.display = "none";
    return;
  }
  if(currentMode === "all"){
    btnAIAll.style.display = "inline-block";
    btnAIExpiring.style.display = "none";
  } else if(currentMode === "expiring"){
    btnAIAll.style.display = "none";
    btnAIExpiring.style.display = "inline-block";
  }
}


// AI 按鈕點擊
async function fetchRecipes(filteredItems){
  if(filteredItems.length === 0){
    alert("沒有食材可用來找料理");
    return;
  }

  const foodNames = filteredItems.map(f => f.name);
}

// 切換模式按鈕
btnAll.addEventListener("click", ()=>{
  currentMode = "all";
  currentCategory = null;
  btnAll.classList.add("active");
  btnExpiring.classList.remove("active");
  btnExpired.classList.remove("active");
  applyFilter();
});

btnExpiring.addEventListener("click", ()=>{
  currentMode = "expiring";
  currentCategory = null;
  btnAll.classList.remove("active");
  btnExpiring.classList.add("active");
  btnExpired.classList.remove("active");
  applyFilter();
});

btnExpired.addEventListener("click", ()=>{
  currentMode = "expired";
  currentCategory = null;
  btnAll.classList.remove("active");
  btnExpiring.classList.remove("active");
  btnExpired.classList.add("active");
  applyFilter();
});

// 返回按鈕
if(btnBack){
  btnBack.addEventListener("click", () => {
    window.location.href = "input.html";
  });
}

// 類別展開 / 收起
btnCategory.addEventListener("click", ()=>{
  const isOpen = categoryGroup.style.display === "flex";
  categoryGroup.style.display = isOpen ? "none" : "flex";
  btnCategory.textContent = isOpen ? "類別 ▾" : "類別 ▴";
});

// 分類篩選
categoryGroup.querySelectorAll(".category-btn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    currentCategory = btn.dataset.category;
    currentMode = "all"; // 分類時顯示全部該分類
    categoryGroup.style.display = "none";
    btnCategory.textContent = "類別 ▾";
    btnAll.classList.remove("active");
    btnExpiring.classList.remove("active");
    btnExpired.classList.remove("active");
    applyFilter();
  });
});

// 預設顯示
applyFilter();