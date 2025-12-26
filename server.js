import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
const PORT = 3000;

/* ------------------------------
   ✅ ESM 取得 __dirname
-------------------------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------
   ✅ Middlewares
-------------------------------- */
app.use(cors());
app.use(express.json());

// ✅ 靜態檔：input.html / input.css / input.js 都放同資料夾就能讀到
app.use(express.static(__dirname));

/* ------------------------------
   ✅ MySQL 連線池
-------------------------------- */
const db = mysql.createPool({
  host: "127.0.0.1",
  user: "root",
  password: "1234",
  database: "leftover_app",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ✅ 啟動時測試 DB 是否連得上
(async () => {
  try {
    const [rows] = await db.query("SELECT 1");
    console.log("✅ MySQL connected:", rows);
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
  }
})();

/* ------------------------------
   ✅ Gemini 設定
-------------------------------- */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.warn("⚠️ 找不到 GEMINI_API_KEY（/api/gemini 會 500）");
}
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const GEMINI_MODEL_NAME = "models/gemini-flash-latest";

/* ------------------------------
   ✅ 首頁：送 input.html
-------------------------------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "input.html"));
});

/* ------------------------------
   ✅ AI：生成料理
   POST /api/gemini
   body: { items: "鮭魚, 蛋" }
-------------------------------- */
app.post("/api/gemini", async (req, res) => {
  try {
    if (!genAI) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

    const { items } = req.body;
    if (!items || !String(items).trim()) {
      return res.status(400).json({ error: "items is required" });
    }

    console.log("🔥 USING MODEL:", GEMINI_MODEL_NAME);

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL_NAME });

    const prompt = `
你是料理助理。請根據使用者提供的食材，產生「剛好 5 道」料理（一定要 5 道，不多不少）。
每道料理都要符合使用者食材；若食材不足可加「常見調味料」(鹽、胡椒、醬油、蒜、洋蔥、奶油等)，但不要新增主食材。

回覆規則（非常重要）：
1) 只能輸出「純 JSON」字串
2) 不要輸出 \`\`\`json 或 \`\`\` 任何 markdown
3) 不要加任何解釋文字
4) steps 用一般文字 + 換行，不要用陣列

請輸出以下格式：
{"recipes":[{"title":"","description":"","steps":""}]}

食材：${items}
`.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // ✅ 嘗試直接 JSON.parse
    try {
      const json = JSON.parse(text);
      return res.json({ recipes: json.recipes || [], raw: text });
    } catch {
      // ✅ 如果 Gemini 偶爾夾雜文字，就回傳 raw 給前端顯示 debug
      return res.status(200).json({ recipes: [], raw: text });
    }
  } catch (err) {
    console.error("❌ Gemini error:", err);
    return res.status(500).json({
      error: "Gemini error",
      message: err?.message || String(err),
    });
  }
});

/* ------------------------------
   ✅ 冰箱：新增食材到 MySQL（含 expire_date）
   POST /api/fridge
   body: { name, quantity?, expire_date?, note? }
-------------------------------- */
app.post("/api/fridge", async (req, res) => {
  // ✅ 這裡才能用 req（放外面會 req is not defined）
  console.log("📦 /api/fridge req.body =", req.body);

  try {
    const { name, quantity = null, expire_date = null, note = null } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    // ✅ 日期允許 null 或 "YYYY-MM-DD"
    //    (你前端 input type="date" 會給 YYYY-MM-DD)
    const normalizedExpire =
      expire_date && String(expire_date).trim()
        ? String(expire_date).trim()
        : null;

    const sql = `
      INSERT INTO fridge_items (name, quantity, expire_date, note)
      VALUES (?, ?, ?, ?)
    `;
    const params = [String(name).trim(), quantity, normalizedExpire, note];

    const [result] = await db.execute(sql, params);

    // ✅ 直接查回來印出來：驗證有沒有真的存到 expire_date
    const [rows] = await db.query(
      "SELECT id, name, quantity, expire_date, note, created_at FROM fridge_items WHERE id = ?",
      [result.insertId]
    );
    console.log("✅ inserted row =", rows[0]);

    return res.json({ ok: true, insertedId: result.insertId, row: rows[0] });
  } catch (err) {
    console.error("❌ /api/fridge POST error:", err);
    return res.status(500).json({ error: "DB insert failed", message: err.message });
  }
});

/* ------------------------------
   ✅ 冰箱：讀取冰箱內容
   GET /api/fridge
-------------------------------- */
app.get("/api/fridge", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, quantity, expire_date, note, created_at
       FROM fridge_items
       ORDER BY id DESC`
    );
    return res.json({ items: rows });
  } catch (err) {
    console.error("❌ /api/fridge GET error:", err);
    return res.status(500).json({ error: "DB query failed", message: err.message });
  }
});

/* ------------------------------
   ✅ 冰箱：刪除一筆
   DELETE /api/fridge/:id
-------------------------------- */
app.delete("/api/fridge/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    const [result] = await db.execute(`DELETE FROM fridge_items WHERE id = ?`, [id]);
    return res.json({ ok: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error("❌ /api/fridge DELETE error:", err);
    return res.status(500).json({ error: "DB delete failed", message: err.message });
  }
});

/* ------------------------------
   ✅ 啟動（建議綁 127.0.0.1）
-------------------------------- */
app.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Server running: http://127.0.0.1:${PORT}`);
});
