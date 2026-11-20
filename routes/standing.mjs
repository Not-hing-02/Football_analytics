import express from "express";
import pool from "../db.mjs";

const router = express.Router();

// ==========================================
// SQL Queries
// ==========================================

// ตรวจสอบสถานะของฤดูกาล (จำนวนแมตช์ที่แข่งแล้ว / รอแข่ง และสัปดาห์ล่าสุด)
const SEASON_STATUS_QUERY = `
    SELECT
        s.label AS season_label,
        COUNT(m.match_id) FILTER (WHERE m.status = 'completed') AS completed_matches,
        COUNT(m.match_id) FILTER (WHERE m.status = 'scheduled') AS scheduled_matches,
        MAX(m.matchweek) FILTER (WHERE m.status = 'completed') AS current_matchweek
    FROM pl_history.seasons s
    LEFT JOIN pl_history.matches m ON s.season_id = m.season_id
    WHERE s.season_id = $1
    GROUP BY s.season_id, s.label
`;

// คำนวณตารางคะแนนจากแมตช์ที่แข่งจบแล้ว (completed) ตามตัวกรอง all / home / away
const STANDINGS_QUERY = `
    WITH team_matches AS (
        -- ผลการแข่งขันเกมเหย้า
        SELECT
            m.home_team_id AS team_id,
            m.home_goals AS gf,
            m.away_goals AS ga
        FROM pl_history.matches m
        WHERE m.season_id = $1
          AND m.status = 'completed'
          AND ($2 = 'all' OR $2 = 'home')

        UNION ALL

        -- ผลการแข่งขันเกมเยือน
        SELECT
            m.away_team_id AS team_id,
            m.away_goals AS gf,
            m.home_goals AS ga
        FROM pl_history.matches m
        WHERE m.season_id = $1
          AND m.status = 'completed'
          AND ($2 = 'all' OR $2 = 'away')
    )
    SELECT
        t.team_id,
        t.team_name,
        t.short_name,
        COUNT(tm.team_id)::int AS played,
        COUNT(*) FILTER (WHERE tm.gf > tm.ga)::int AS won,
        COUNT(*) FILTER (WHERE tm.gf = tm.ga)::int AS drawn,
        COUNT(*) FILTER (WHERE tm.gf < tm.ga)::int AS lost,
        COALESCE(SUM(tm.gf), 0)::int AS gf,
        COALESCE(SUM(tm.ga), 0)::int AS ga,
        COALESCE(SUM(tm.gf - tm.ga), 0)::int AS gd,
        COALESCE(SUM(
            CASE
                WHEN tm.gf > tm.ga THEN 3
                WHEN tm.gf = tm.ga THEN 1
                ELSE 0
            END
        ), 0)::int AS pts
    FROM pl_history.team_seasons ts
    JOIN pl_history.teams t ON ts.team_id = t.team_id
    LEFT JOIN team_matches tm ON t.team_id = tm.team_id
    WHERE ts.season_id = $1
    GROUP BY t.team_id, t.team_name, t.short_name
    ORDER BY pts DESC, gd DESC, gf DESC, t.team_name ASC
`;

// ==========================================
// Route Handler: GET /api/standing
// Query Params: ?season=2026&filter=all (all | home | away)
// ==========================================
router.get("/standing", async (req, res) => {
    const seasonId = parseInt(req.query.season, 10) || 2026;
    const filter = req.query.filter || "all";

    try {
        // ดึงสถานะฤดูกาลและตารางคะแนนพร้อมกัน
        const [statusRes, standingsRes] = await Promise.all([
            pool.query(SEASON_STATUS_QUERY, [seasonId]),
            pool.query(STANDINGS_QUERY, [seasonId, filter])
        ]);

        const seasonInfo = statusRes.rows[0] || {
            season_label: `${seasonId}/${String(seasonId + 1).slice(-2)}`,
            completed_matches: 0,
            scheduled_matches: 0,
            current_matchweek: 0
        };

        const isCompletedSeason =
            Number(seasonInfo.scheduled_matches) === 0 &&
            Number(seasonInfo.completed_matches) > 0;

        res.json({
            success: true,
            season_id: seasonId,
            season_label: seasonInfo.season_label,
            is_completed: isCompletedSeason,
            current_matchweek: Number(seasonInfo.current_matchweek || 0),
            filter,
            standings: standingsRes.rows
        });
    } catch (error) {
        console.error("Standing API Error:", error);
        res.status(500).json({
            success: false,
            message: "There was an error fetching the leaderboard data",
            error: error.message
        });
    }
});

export default router;