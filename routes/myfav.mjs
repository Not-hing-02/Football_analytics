import { sessionUser } from "./auth.mjs";
import { readFavorites } from "./favorites.mjs";
import express from "express";
import pool from "../db.mjs";

const router = express.Router();

// ==========================================
// SQL Queries
// ==========================================

// 1. ดึงข้อมูลทีมโปรด + ชื่อสนามเหย้าประจำฤดูกาล (home_stadium)
const FAVORITE_TEAMS_QUERY = `
    SELECT
        t.team_id,
        t.team_name,
        t.short_name,
        t.city,
        COALESCE(ts.home_stadium, 'Premier League Stadium') AS home_stadium
    FROM pl_history.teams t
    LEFT JOIN pl_history.team_seasons ts
        ON t.team_id = ts.team_id AND ts.season_id = $1
    WHERE t.team_id = ANY($2::int[])
    ORDER BY t.team_name ASC
`;

// 2. ดึงข้อมูลนักเตะโปรด + สโมสรและตำแหน่งล่าสุดในฤดูกาลที่เลือก
export const FAVORITE_PLAYERS_QUERY = `
    SELECT DISTINCT ON (p.player_id)
        p.player_id,
        p.display_name,
        p.player_name,
        COALESCE(t.team_name, 'Premier League') AS team_name,
        COALESCE(pms.position, '-') AS position
    FROM pl_history.players p
    LEFT JOIN pl_history.player_match_stats pms ON p.player_id = pms.player_id
    LEFT JOIN pl_history.matches m ON pms.match_id = m.match_id AND m.season_id = $1
    LEFT JOIN pl_history.teams t ON pms.team_id = t.team_id
    WHERE p.player_id = ANY($2::int[])
    ORDER BY p.player_id, m.kickoff_utc DESC NULLS LAST
`;

// ==========================================
// Route Handler: GET /api/myfav
// Query Params: ?season=2026&teams=17,3&players=118748,223094
// ==========================================
router.get("/myfav", async (req, res) => {
    const seasonId = parseInt(req.query.season, 10) || 2026;
    res.set("Cache-Control", "no-store");
    const user = sessionUser(req);
    if (!user) return res.status(401).json({ success: false });
    const { teams: teamIds, players: playerIds } = readFavorites(user.id);

    try {
        // ดึงข้อมูลทีมโปรดและนักเตะโปรดพร้อมกัน (เฉพาะหมวดที่มี ID ส่งมา)
        const [teamsRes, playersRes] = await Promise.all([
            teamIds.length > 0 ? pool.query(FAVORITE_TEAMS_QUERY, [seasonId, teamIds]) : { rows: [] },
            playerIds.length > 0 ? pool.query(FAVORITE_PLAYERS_QUERY, [seasonId, playerIds]) : { rows: [] }
        ]);

        res.json({
            success: true,
            season_id: seasonId,
            teams: teamsRes.rows,
            players: playersRes.rows
        });
    } catch (error) {
        console.error("MyFav API Error:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred while retrieving My Favorites.",
            error: error.message
        });
    }
});

export default router;
