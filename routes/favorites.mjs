import { Router } from "express";
import pool from "../db.mjs";

const router = Router();

router.get("/", async (req, res) => {
    const userId = req.query.userId || 1;

    try {
        const { rows } = await pool.query(
            "SELECT item_type, item_id FROM user_favorites WHERE user_id = $1",
            [userId]
        );

        // จัดรูปแบบข้อมูลให้ตรงกับโครงสร้างที่ Frontend ใช้งาน: { teams: [...], players: [...] }
        const favorites = { teams: [], players: [] };
        for (const row of rows) {
            if (row.item_type === "teams" || row.item_type === "players") {
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
router.put("/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    const userId = req.body?.userId || 1;

    if (!["teams", "players"].includes(type) || !/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({ error: "Invalid favorite type or ID" });
    }

    try {
        await pool.query(
            `INSERT INTO user_favorites (user_id, item_type, item_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, item_type, item_id) DO NOTHING`,
            [userId, type, id]
        );
        res.json({ success: true, isFav: true });
    } catch (err) {
        console.error("PUT /api/favorites error:", err);
        res.status(500).json({ error: "Failed to add favorite" });
    }
});

// 3. DELETE: ลบรายการโปรดออกจากฐานข้อมูล
router.delete("/:type/:id", async (req, res) => {
    const { type, id } = req.params;
    const userId = req.query.userId || 1;

    if (!["teams", "players"].includes(type) || !/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({ error: "Invalid favorite type or ID" });
    }

    try {
        await pool.query(
            `DELETE FROM user_favorites
             WHERE user_id = $1 AND item_type = $2 AND item_id = $3`,
            [userId, type, id]
        );
        res.json({ success: true, isFav: false });
    } catch (err) {
        console.error("DELETE /api/favorites error:", err);
        res.status(500).json({ error: "Failed to remove favorite" });
    }
});

export default router;
