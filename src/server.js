import dotenv from "dotenv";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { pool } from "./db.js";

// นำเข้า Router ของแต่ละหน้า
import dashboardRouter from "./server-dashboard.js";
import myfavRouter from "./server-myfav.js";
import searchRouter from "./server-search.js";
import standingRouter from "./server-standing.js";

// ตั้งค่า Path และโหลดตัวแปรสภาพแวดล้อม (.env)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = Number(process.env.PORT || 3000);

// ==========================================
// Middleware & Static Files
// ==========================================
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ==========================================
// Page API Routes
// ==========================================
app.use("/api", dashboardRouter); // -> /api/dashboard
app.use("/api", myfavRouter);     // -> /api/myfav
app.use("/api", searchRouter);    // -> /api/search
app.use("/api", standingRouter);  // -> /api/standing

// ==========================================
// Favorites API Routes
// ==========================================

// 1. GET: ดึงรายการโปรดทั้งหมดของผู้ใช้ แยกตามประเภท (teams / players)
app.get("/api/favorites", async (req, res) => {
    const userId = req.query.userId || 1;

    try {
        const { rows } = await pool.query(
            "SELECT item_type, item_id FROM user_favorites WHERE user_id = $1",
            [userId]
        );

        // จัดรูปแบบข้อมูลให้ตรงกับโครงสร้างที่ Frontend ใช้งาน: { teams: [...], players: [...] }
        const favorites = { teams: [], players: [] };
        for (const row of rows) {
            if (favorites[row.item_type]) {
                favorites[row.item_type].push(Number(row.item_id));
            }
        }

        res.json(favorites);
    } catch (err) {
        console.error("GET /api/favorites error:", err);
        res.status(500).json({ error: "Failed to load favorites" });
    }
});

// 2. PUT: เพิ่มรายการโปรด (ใช้ ON CONFLICT ป้องกัน Error หากบันทึกซ้ำ)
app.put("/api/favorites/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    const userId = req.body.userId || 1;

    if (!["teams", "players"].includes(type)) {
        return res.status(400).json({ error: "Invalid favorite type" });
    }

    try {
        await pool.query(
            `INSERT INTO user_favorites (user_id, item_type, item_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, item_type, item_id) DO NOTHING`,
            [userId, type, Number(id)]
        );
        res.json({ success: true, isFav: true });
    } catch (err) {
        console.error("PUT /api/favorites error:", err);
        res.status(500).json({ error: "Failed to add favorite" });
    }
});

// 3. DELETE: ลบรายการโปรดออกจากฐานข้อมูล
app.delete("/api/favorites/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    const userId = req.query.userId || 1;

    try {
        await pool.query(
            `DELETE FROM user_favorites
             WHERE user_id = $1 AND item_type = $2 AND item_id = $3`,
            [userId, type, Number(id)]
        );
        res.json({ success: true, isFav: false });
    } catch (err) {
        console.error("DELETE /api/favorites error:", err);
        res.status(500).json({ error: "Failed to remove favorite" });
    }
});

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});