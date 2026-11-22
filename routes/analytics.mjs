import { Router } from "express";
import pool from "../db.mjs";
import { parsePostgresId } from "../utils/postgres-id.mjs";

const router = Router();

// GET /api/analytics/filters คืนฤดูกาลและทีมที่เลือกได้ในแต่ละฤดูกาล โดยไม่รับ query parameter
router.get("/filters", async (req, res) => {
    if (Object.keys(req.query).length) {
        return res.status(400).json({ error: "This endpoint takes no filters." });
    }
    try {
        const { rows } = await pool.query(`
            SELECT s.season_id AS id, s.label,
                COALESCE(json_agg(json_build_object('id', t.team_id, 'name', t.team_name)
                    ORDER BY t.team_name, t.team_id)
                    FILTER (WHERE t.team_id IS NOT NULL), '[]'::json) AS teams
            FROM pl_history.seasons s
            LEFT JOIN pl_history.team_seasons ts USING (season_id)
            LEFT JOIN pl_history.teams t USING (team_id)
            GROUP BY s.season_id, s.label
            ORDER BY s.season_id DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Unable to load analytics filters", error);
        res.status(500).json({ error: "Unable to load analytics filters." });
    }
});

// GET /api/analytics/dashboard?seasonId=<id>[&teamId=<id>]
// ใช้ข้อมูลชุดเดียวกันสำหรับกราฟและ CSV หากไม่ระบุ teamId จะสรุปทั้งลีก
router.get("/dashboard", async (req, res) => {
    const { seasonId, teamId, ...unknown } = req.query;
    const season = parsePostgresId(seasonId);
    const team = teamId === undefined ? null : parsePostgresId(teamId);
    if (Object.keys(unknown).length || season === null || (teamId !== undefined && team === null)) {
        return res.status(400).json({ error: "Supply a valid seasonId and, optionally, a valid teamId." });
    }

    try {
        const { rows } = await pool.query(`
            WITH selection AS (
                SELECT s.season_id, s.label, t.team_id, t.team_name,
                    (SELECT COUNT(*)::int FROM pl_history.team_seasons
                        WHERE season_id = s.season_id) AS team_count
                FROM pl_history.seasons s
                LEFT JOIN pl_history.team_seasons ts
                    ON ts.season_id = s.season_id AND ts.team_id = $2
                LEFT JOIN pl_history.teams t ON t.team_id = ts.team_id
                WHERE s.season_id = $1 AND ($2::int IS NULL OR t.team_id IS NOT NULL)
            ), completed AS (
                SELECT m.*,
                    CASE WHEN $2 IS NULL THEN m.home_goals + m.away_goals
                         WHEN m.home_team_id = $2 THEN m.home_goals ELSE m.away_goals END AS goals_for,
                    CASE WHEN $2 IS NULL OR m.home_team_id = $2 THEN m.home_goals ELSE m.away_goals END AS outcome_for,
                    CASE WHEN $2 IS NULL OR m.home_team_id = $2 THEN m.away_goals ELSE m.home_goals END AS outcome_against
                FROM pl_history.matches m JOIN selection s USING (season_id)
                WHERE m.status = 'completed'
                    AND ($2 IS NULL OR $2 IN (m.home_team_id, m.away_team_id))
            ), scored AS (
                -- แยกนัดที่มีสกอร์ครบเพื่อไม่ให้สกอร์ที่หายไปถูกตีความเป็นศูนย์
                SELECT * FROM completed WHERE home_goals IS NOT NULL AND away_goals IS NOT NULL
            ), monthly AS (
                SELECT to_char(match_date, 'YYYY-MM') AS month, COUNT(*)::int AS matches,
                    ROUND(AVG(goals_for), 2) AS goals_per_match,
                    ROUND(AVG(CASE
                        -- เมื่อดูทั้งลีก หารแต้มรวมของสองทีมด้วยสองเพื่อให้ได้แต้มต่อทีมต่อนัด
                        WHEN $2 IS NULL THEN CASE WHEN outcome_for = outcome_against THEN 1.0 ELSE 1.5 END
                        WHEN outcome_for > outcome_against THEN 3.0
                        WHEN outcome_for = outcome_against THEN 1.0 ELSE 0.0 END), 2) AS points_per_match
                FROM scored GROUP BY 1
            ), scorers AS (
                SELECT p.player_id AS id, p.display_name AS name, SUM(x.goals)::int AS goals
                FROM completed m JOIN pl_history.player_match_stats x USING (match_id)
                JOIN pl_history.players p USING (player_id)
                WHERE ($2 IS NULL OR x.team_id = $2)
                GROUP BY p.player_id, p.display_name
                HAVING SUM(x.goals) > 0
                ORDER BY goals DESC, name, id LIMIT 4
            )
            SELECT json_build_object('id', s.season_id, 'label', s.label) AS season,
                CASE WHEN s.team_id IS NOT NULL THEN
                    json_build_object('id', s.team_id, 'name', s.team_name) END AS team,
                (SELECT json_build_object(
                    'completedMatches', COUNT(*),
                    'firstCompleted', MIN(match_date),
                    'lastCompleted', MAX(match_date),
                    'expectedMatches', CASE WHEN $2 IS NULL THEN s.team_count * (s.team_count - 1)
                        ELSE 2 * (s.team_count - 1) END
                ) FROM completed) AS coverage,
                (SELECT json_build_object(
                    'wins', COUNT(*) FILTER (WHERE outcome_for > outcome_against),
                    'draws', COUNT(*) FILTER (WHERE outcome_for = outcome_against),
                    'losses', COUNT(*) FILTER (WHERE outcome_for < outcome_against)
                ) FROM scored) AS outcomes,
                COALESCE((SELECT json_agg(monthly ORDER BY month) FROM monthly), '[]'::json) AS monthly,
                COALESCE((SELECT json_agg(scorers ORDER BY goals DESC, name, id) FROM scorers), '[]'::json) AS scorers
            FROM selection s
        `, [season, team]);
        if (!rows.length) return res.status(404).json({ error: "Season or team in that season not found." });
        res.json(rows[0]);
    } catch (error) {
        console.error("Unable to load analytics dashboard", error);
        res.status(500).json({ error: "Unable to load analytics data." });
    }
});

export default router;
