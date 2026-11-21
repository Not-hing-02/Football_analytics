import express from "express";
import pool from "../db.mjs";
import { sessionUser } from "./auth.mjs";
import { readFavorites } from "./favorites.mjs";

const router = express.Router();

// ==========================================
// SQL Queries
// ==========================================

// ดึงชื่อฤดูกาล (เช่น "2026/27")
const SEASON_QUERY = `
    SELECT label
    FROM pl_history.seasons
    WHERE season_id = $1
`;

// ดึงตัวเลขภาพรวม (KPIs) ของฤดูกาลที่เลือก
const KPI_QUERY = `
    SELECT
        (SELECT COUNT(*)
         FROM pl_history.team_seasons
         WHERE season_id = $1) AS total_teams,
        (SELECT COUNT(DISTINCT pms.player_id)
         FROM pl_history.player_match_stats pms
         JOIN pl_history.matches m ON pms.match_id = m.match_id
         WHERE m.season_id = $1) AS total_players,
        (SELECT COUNT(*)
         FROM pl_history.matches
         WHERE season_id = $1 AND status = 'completed') AS matches_played,
        (SELECT COUNT(*)
         FROM pl_history.matches
         WHERE season_id = $1 AND status = 'scheduled') AS upcoming_matches
`;

// ดึงผลการแข่งขัน 5 นัดล่าสุดที่แข่งจบแล้ว
const RECENT_MATCHES_QUERY = `
    SELECT
        m.match_id, m.matchweek, m.match_date, m.kickoff_utc,
        ht.team_id AS home_team_id, ht.team_name AS home_team_name, ht.short_name AS home_short_name, m.home_goals,
        at.team_id AS away_team_id, at.team_name AS away_team_name, at.short_name AS away_short_name, m.away_goals
    FROM pl_history.matches m
    JOIN pl_history.teams ht ON m.home_team_id = ht.team_id
    JOIN pl_history.teams at ON m.away_team_id = at.team_id
    WHERE m.season_id = $1 AND m.status = 'completed'
    ORDER BY m.kickoff_utc DESC
    LIMIT 5
`;

// ดึงอันดับดาวซัลโวสูงสุด 5 อันดับแรก
const TOP_SCORERS_QUERY = `
    SELECT
        p.player_id, p.display_name, p.player_name,
        t.team_name, t.short_name,
        SUM(pms.goals) AS total_goals,
        SUM(pms.assists_fpl) AS total_assists
    FROM pl_history.player_match_stats pms
    JOIN pl_history.matches m ON pms.match_id = m.match_id
    JOIN pl_history.players p ON pms.player_id = p.player_id
    JOIN pl_history.teams t ON pms.team_id = t.team_id
    WHERE m.season_id = $1 AND m.status = 'completed'
    GROUP BY p.player_id, p.display_name, p.player_name, t.team_name, t.short_name
    HAVING SUM(pms.goals) > 0
    ORDER BY total_goals DESC, total_assists DESC, p.display_name ASC
    LIMIT 5
`;

// ดึงสถิติ ชนะ / เสมอ / แพ้ ของกลุ่มทีมโปรด (จำกัดสูงสุด 10 ทีม)
const FAV_TEAMS_QUERY = `
    SELECT
        t.team_id, t.team_name, t.short_name,
        COUNT(m.match_id) FILTER (
            WHERE (m.home_team_id = t.team_id AND m.home_goals > m.away_goals)
               OR (m.away_team_id = t.team_id AND m.away_goals > m.home_goals)
        ) AS wins,
        COUNT(m.match_id) FILTER (
            WHERE m.home_goals = m.away_goals
        ) AS draws,
        COUNT(m.match_id) FILTER (
            WHERE (m.home_team_id = t.team_id AND m.home_goals < m.away_goals)
               OR (m.away_team_id = t.team_id AND m.away_goals < m.home_goals)
        ) AS losses
    FROM pl_history.teams t
    LEFT JOIN pl_history.matches m
        ON (m.home_team_id = t.team_id OR m.away_team_id = t.team_id)
       AND m.season_id = $1
       AND m.status = 'completed'
    WHERE t.team_id = ANY($2::int[])
    GROUP BY t.team_id, t.team_name, t.short_name
    LIMIT 10
`;

// ==========================================
// Route Handler: GET /api/dashboard
// ==========================================
router.get("/dashboard", async (req, res) => {
    const seasonId = parseInt(req.query.season, 10) || 2026;

    // ป้องกันเบราว์เซอร์แคชข้อมูลรายการโปรดที่เปลี่ยนตามผู้ใช้
    res.set("Cache-Control", "no-store");
    const { teams: favTeamIds } = readFavorites(sessionUser(req)?.id);

    try {
        // รัน Query ทั้งหมดพร้อมกันเพื่อลดเวลาการรอ Response
        const [seasonRes, kpiRes, matchesRes, scorersRes, favRes] = await Promise.all([
            pool.query(SEASON_QUERY, [seasonId]),
            pool.query(KPI_QUERY, [seasonId]),
            pool.query(RECENT_MATCHES_QUERY, [seasonId]),
            pool.query(TOP_SCORERS_QUERY, [seasonId]),
            pool.query(FAV_TEAMS_QUERY, [seasonId, favTeamIds])
        ]);

        const seasonLabel = seasonRes.rows[0]?.label || null;
        const kpi = kpiRes.rows[0];

        res.json({
            success: true,
            season_id: seasonId,
            season_label: seasonLabel,
            kpis: {
                total_teams: Number(kpi.total_teams),
                total_players: Number(kpi.total_players),
                matches_played: Number(kpi.matches_played),
                upcoming: Number(kpi.upcoming_matches)
            },
            recent_matches: matchesRes.rows,
            top_scorers: scorersRes.rows,
            favorite_teams: favRes.rows
        });
    } catch (error) {
        console.error("Dashboard API Error:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;