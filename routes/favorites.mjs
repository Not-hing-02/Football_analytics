import { Router } from "express";
import { accountsDb, sessionUser } from "./auth.mjs";

const router = Router();
accountsDb.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL CHECK (item_type IN ('teams', 'players')),
        item_id INTEGER NOT NULL,
        PRIMARY KEY (user_id, item_type, item_id)
    )
`);
const list = accountsDb.prepare("SELECT item_type, item_id FROM favorites WHERE user_id = ?");
const add = accountsDb.prepare("INSERT OR IGNORE INTO favorites VALUES (?, ?, ?)");
const remove = accountsDb.prepare("DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?");

export function readFavorites(userId) {
    const favorites = { teams: [], players: [] };
    if (userId) {
        for (const row of list.all(userId)) favorites[row.item_type].push(row.item_id);
    }
    return favorites;
}

router.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ error: "Log in first." });
    res.locals.favoriteUserId = user.id;
    next();
});

router.get("/", (_req, res) => res.json(readFavorites(res.locals.favoriteUserId)));

function writeFavorite(req, res) {
    const { type, id } = req.params;
    const itemId = Number(id);
    if (!["teams", "players"].includes(type) || !/^[1-9][0-9]*$/.test(id) || itemId > 2147483647) {
        return res.status(400).json({ error: "Invalid favorite type or ID." });
    }
    const isFav = req.method === "PUT";
    (isFav ? add : remove).run(res.locals.favoriteUserId, type, itemId);
    res.json({ success: true, isFav });
}

router.put("/:type/:id", writeFavorite);
router.delete("/:type/:id", writeFavorite);

export default router;
