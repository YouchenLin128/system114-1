import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

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

// 測試 DB
(async () => {
  try {
    await db.query("SELECT 1");
    console.log("✅ MySQL connected");
  } catch (err) {
    console.error("❌ MySQL failed:", err.message);
  }
})();

/* ------------------------------
   ✅ Gemini 設定
-------------------------------- */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;

if (!GEMINI_API_KEY) {
  console.warn("⚠️ 缺少 GEMINI_API_KEY");
}
if (!UNSPLASH_ACCESS_KEY) {
  console.warn("⚠️ 缺少 UNSPLASH_ACCESS_KEY（圖片會是 null）");
}

const genAI = GEMINI_API_KEY
  ? new GoogleGenerativeAI(GEMINI_API_KEY)
  : null;

const GEMINI_MODEL_NAME = "models/gemini-flash-latest";

/* ------------------------------
   ✅ Unsplash 搜圖（後端）
-------------------------------- */
async function searchUnsplashImage(query) {
  if (!UNSPLASH_ACCESS_KEY) return null;

  const url =
    "https://api.unsplash.com/search/photos" +
    `?query=${encodeURIComponent(query + " food")}` +
    "&per_page=1&orientation=landscape";

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
      },
    });

    const data = await res.json();
    return data?.results?.[0]?.urls?.regular || null;
  } catch (err) {
    console.error("❌ Unsplash error:", err.message);
    return null;
  }
}

/* ------------------------------
   ✅ 首頁
-------------------------------- */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "input.html"));
});

/* ------------------------------
   ✅ AI：生成料理 + 圖片
-------------------------------- */
app.post("/api/gemini", async (req, res) => {
  try {
    if (!genAI) {
      return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
    }

    const { items } = req.body;
    if (!items || !String(items).trim()) {
      return res.status(400).json({ error: "items is required" });
    }

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL_NAME,
    });

    const prompt = `
你是料理助理，請根據使用者提供的食材，產生「剛好 5 道」料理。

⚠️ 非常重要：
- 回覆內容必須是「純 JSON」
- 不要任何解釋文字
- 不要 markdown
- 開頭必須是 { 結尾必須是 }

格式：
{
  "recipes": [
    {
      "title": "",
      "description": "",
      "steps": ""
    }
  ]
}

食材：${items}
`.trim();

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    console.log("🤖 Gemini raw response:\n", text);

    let recipes = [];

    try {
      const parsed = JSON.parse(text);
      recipes = parsed.recipes || [];
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          const fixed = JSON.parse(match[0]);
          recipes = fixed.recipes || [];
        } catch {}
      }
    }

    if (!recipes.length) {
      return res.json({ recipes: [] });
    }

    for (const r of recipes) {
      r.image = await searchUnsplashImage(r.title);
    }

    res.json({ recipes });
  } catch (err) {
    console.error("❌ Gemini error:", err);
    res.status(500).json({ error: "Gemini error" });
  }
});
/* ------------------------------
   ✅ 冰箱：新增
-------------------------------- */
app.post("/api/fridge", async (req, res) => {
  try {
    const { name, quantity = null, expire_date = null, note = null } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "name is required" });
    }

    const [result] = await db.execute(
      `INSERT INTO fridge_items (name, quantity, expire_date, note)
       VALUES (?, ?, ?, ?)`,
      [name.trim(), quantity, expire_date || null, note]
    );

    return res.json({ ok: true, insertedId: result.insertId });
  } catch (err) {
    console.error("❌ fridge POST error:", err);
    return res.status(500).json({ error: "DB insert failed" });
  }
});

/* ------------------------------
   ✅ 冰箱：讀取
-------------------------------- */
app.get("/api/fridge", async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT * FROM fridge_items ORDER BY id DESC`
    );
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: "DB query failed" });
  }
});

/* ------------------------------
   ✅ 冰箱：刪除
-------------------------------- */
app.delete("/api/fridge/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "invalid id" });

    await db.execute(`DELETE FROM fridge_items WHERE id = ?`, [id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "DB delete failed" });
  }
});

/* ------------------------------
   ✅ 啟動
-------------------------------- */
app.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Server running → http://127.0.0.1:${PORT}`);
});