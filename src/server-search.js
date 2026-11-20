import express from "express";
import { pool } from "./db.js";

const router = express.Router();

// ==========================================
// SQL Queries
// ==========================================

// 1. ค้นหา Teams จากชื่อเต็ม ชื่อย่อ หรือเมือง พร้อมสนามเหย้าล่าสุด
const TEAMS_SEARCH_QUERY = `
    SELECT DISTINCT ON (t.team_id)
        t.team_id,
        t.team_name,
        t.short_name,
        t.city,
        COALESCE(ts.home_stadium, 'Premier League Stadium') AS home_stadium
    FROM pl_history.teams t
    LEFT JOIN pl_history.team_seasons ts ON t.team_id = ts.team_id
    WHERE (t.team_name ILIKE $1 OR t.short_name ILIKE $1 OR t.city ILIKE $1)
      AND ($2::int IS NULL OR ts.season_id = $2)
    ORDER BY t.team_id, ts.season_id DESC NULLS LAST
    LIMIT 20
`;

// 2. ค้นหา Players จากชื่อที่แสดงหรือชื่อเต็ม พร้อมสโมสรและตำแหน่งล่าสุด
const PLAYERS_SEARCH_QUERY = `
    SELECT DISTINCT ON (p.player_id)
        p.player_id,
        p.display_name,
        p.player_name,
        COALESCE(t.team_name, 'Premier League') AS team_name,
        COALESCE(pms.position, '-') AS position
    FROM pl_history.players p
    LEFT JOIN pl_history.player_match_stats pms ON p.player_id = pms.player_id
    LEFT JOIN pl_history.matches m ON pms.match_id = m.match_id
    LEFT JOIN pl_history.teams t ON pms.team_id = t.team_id
    WHERE (p.display_name ILIKE $1 OR p.player_name ILIKE $1)
      AND ($2::int IS NULL OR m.season_id = $2)
    ORDER BY p.player_id, m.kickoff_utc DESC NULLS LAST
    LIMIT 20
`;

// 3. ค้นหา Matches จากชื่อทีมเหย้าหรือทีมเยือน
const MATCHES_SEARCH_QUERY = `
    SELECT
        m.match_id,
        s.label AS season_label,
        m.matchweek,
        m.match_date,
        m.status,
        ht.team_name AS home_team_name,
        m.home_goals,
        at.team_name AS away_team_name,
        m.away_goals
    FROM pl_history.matches m
    JOIN pl_history.seasons s ON m.season_id = s.season_id
    JOIN pl_history.teams ht ON m.home_team_id = ht.team_id
    JOIN pl_history.teams at ON m.away_team_id = at.team_id
    WHERE (ht.team_name ILIKE $1 OR at.team_name ILIKE $1)
      AND ($2::int IS NULL OR m.season_id = $2)
    ORDER BY m.kickoff_utc DESC
    LIMIT 20
`;

// ==========================================
// Route Handler: GET /api/search
// Query Params: ?q=Arsenal&season=2026-27 (หรือ season=all)
// ==========================================
router.get("/search", async (req, res) => {
    const keyword = (req.query.q || "").trim();
    const seasonParam = req.query.season || "all";

    // หากไม่มีคำค้นหา ให้คืนค่าลิสต์ว่างทันทีโดยไม่ต้อง Query ฐานข้อมูล
    if (!keyword) {
        return res.json({
            success: true,
            query: "",
            teams: [],
            players: [],
            matches: []
        });
    }

    const seasonId = seasonParam !== "all"
        ? parseInt(seasonParam.split("-")[0], 10)
        : null;
    const searchPattern = `%${keyword}%`;

    try {
        // ค้นหาทั้ง 3 หมวดหมู่พร้อมกันเพื่อความรวดเร็ว
        const [teamsRes, playersRes, matchesRes] = await Promise.all([
            pool.query(TEAMS_SEARCH_QUERY, [searchPattern, seasonId]),
            pool.query(PLAYERS_SEARCH_QUERY, [searchPattern, seasonId]),
            pool.query(MATCHES_SEARCH_QUERY, [searchPattern, seasonId])
        ]);

        res.json({
            success: true,
            query: keyword,
            teams: teamsRes.rows,
            players: playersRes.rows,
            matches: matchesRes.rows
        });
    } catch (error) {
        console.error("Search API Error:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred while searching for information.",
            error: error.message
        });
    }
});

export default router;