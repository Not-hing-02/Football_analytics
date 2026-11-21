import { Router } from "express";
import pool from "../db.mjs";
import { parsePostgresId } from "../utils/postgres-id.mjs";

const router = Router();

// GET /api/compare/teams?seasonId=<id>&teamA=<id>&teamB=<id>
// คืนทีมตามลำดับ A/B พร้อมยอดเฉพาะนัดที่จบและมีสกอร์ครบ โดยแยกจำนวนสกอร์ที่หายไป
router.get("/", async (req, res) => {
    const { seasonId, teamA, teamB, ...unknown } = req.query;
    const season = parsePostgresId(seasonId);
    const left = parsePostgresId(teamA);
    const right = parsePostgresId(teamB);
    if (Object.keys(unknown).length || season === null || left === null || right === null || left === right) {
        return res.status(400).json({ error: "Supply a valid seasonId and two different team IDs." });
    }
    try {
        const { rows } = await pool.query(`
            WITH selected AS (
                SELECT t.team_id, t.team_name, s.season_id, s.label,
                    2 * ((SELECT COUNT(*) FROM pl_history.team_seasons
                        WHERE season_id = $1) - 1) AS expected
                FROM pl_history.team_seasons ts
                JOIN pl_history.teams t USING (team_id)
                JOIN pl_history.seasons s USING (season_id)
                WHERE ts.season_id = $1 AND ts.team_id IN ($2, $3)
            ), games AS (
                -- หนึ่งแถวต่อนัดต่อทีม ใช้ CASE กลับมุมมองเมื่อทีมเล่นเป็นทีมเยือน
                SELECT s.team_id, m.match_id, m.home_goals, m.away_goals,
                    CASE WHEN m.home_team_id = s.team_id THEN m.home_goals ELSE m.away_goals END AS gf,
                    CASE WHEN m.home_team_id = s.team_id THEN m.away_goals ELSE m.home_goals END AS ga
                FROM selected s JOIN pl_history.matches m
                    ON m.season_id = s.season_id
                    AND s.team_id IN (m.home_team_id, m.away_team_id)
                WHERE m.status = 'completed'
            ), totals AS (
                SELECT team_id,
                    COUNT(*) FILTER (WHERE gf > ga)::int AS wins,
                    COUNT(*) FILTER (WHERE gf = ga)::int AS draws,
                    COUNT(*) FILTER (WHERE gf < ga)::int AS losses,
                    COALESCE(SUM(gf) FILTER (WHERE ga IS NOT NULL), 0)::int AS gf,
                    COALESCE(SUM(ga) FILTER (WHERE gf IS NOT NULL), 0)::int AS ga,
                    COUNT(*)::int AS completed,
                    COUNT(*) FILTER (WHERE home_goals IS NULL OR away_goals IS NULL)::int AS missing
                FROM games GROUP BY team_id
            )
            SELECT s.season_id, s.label, s.team_id AS id, s.team_name AS name,
                json_build_object(
                    'matchesPlayed', COALESCE(v.wins + v.draws + v.losses, 0),
                    'wins', COALESCE(v.wins, 0), 'draws', COALESCE(v.draws, 0),
                    'losses', COALESCE(v.losses, 0), 'goalsFor', COALESCE(v.gf, 0),
                    'goalsAgainst', COALESCE(v.ga, 0), 'goalDifference', COALESCE(v.gf - v.ga, 0),
                    'points', COALESCE(v.wins * 3 + v.draws, 0)
                ) AS metrics,
                json_build_object('completedMatches', COALESCE(v.completed, 0),
                    'missingScores', COALESCE(v.missing, 0), 'expectedMatches', s.expected) AS coverage
            FROM selected s LEFT JOIN totals v USING (team_id)
            ORDER BY s.team_id = $3
        `, [season, left, right]);
        if (rows.length !== 2) return res.status(404).json({ error: "Season or teams in that season not found." });
        res.json({
            season: { id: rows[0].season_id, label: rows[0].label },
            teams: rows.map(({ id, name, metrics, coverage }) => ({ id, name, metrics, coverage })),
        });
    } catch (error) {
        console.error("Unable to compare teams", error);
        res.status(500).json({ error: "Unable to load the team comparison." });
    }
});

export default router;
