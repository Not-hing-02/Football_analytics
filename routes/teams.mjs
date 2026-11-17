import { Router } from "express";
import pool from "../db.mjs";

const router = Router();

// GET /api/teams
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                t.team_id AS id,
                t.team_name AS name,
                t.short_name AS abbreviation,
                t.city,
                ts.home_stadium AS stadium,
                s.season_id,
                s.label AS season,
                COALESCE(v.played, 0)::integer AS played,
                COALESCE(v.wins, 0)::integer AS wins,
                COALESCE(v.draws, 0)::integer AS draws,
                COALESCE(v.losses, 0)::integer AS losses,
                COALESCE(v.goals_for, 0)::integer AS goals_for,
                COALESCE(v.goals_against, 0)::integer AS goals_against,
                (
                    COALESCE(v.goals_for, 0)
                    - COALESCE(v.goals_against, 0)
                )::integer AS goal_difference,
                (
                    COALESCE(v.wins, 0) * 3
                    + COALESCE(v.draws, 0)
                )::integer AS points,
                COALESCE(f.results, ARRAY[]::text[]) AS form
            FROM pl_history.team_seasons ts
            JOIN pl_history.teams t
                ON t.team_id = ts.team_id
            JOIN pl_history.seasons s
                ON s.season_id = ts.season_id
            LEFT JOIN pl_history.v_team_season v
                ON v.team_id = ts.team_id
                AND v.season_id = ts.season_id
            LEFT JOIN LATERAL (
                SELECT ARRAY_AGG(
                    recent.result
                    ORDER BY recent.match_date, recent.match_id
                ) AS results
                FROM (
                    SELECT
                        m.match_id,
                        m.match_date,
                        CASE
                            WHEN m.home_goals = m.away_goals THEN 'D'
                            WHEN (
                                m.home_team_id = t.team_id
                                AND m.home_goals > m.away_goals
                            ) OR (
                                m.away_team_id = t.team_id
                                AND m.away_goals > m.home_goals
                            ) THEN 'W'
                            ELSE 'L'
                        END AS result
                    FROM pl_history.matches m
                    WHERE m.season_id = s.season_id
                        AND m.status = 'completed'
                        AND m.home_goals IS NOT NULL
                        AND m.away_goals IS NOT NULL
                        AND (
                            m.home_team_id = t.team_id
                            OR m.away_team_id = t.team_id
                        )
                    ORDER BY m.match_date DESC, m.match_id DESC
                    LIMIT 5
                ) recent
            ) f ON TRUE
            ORDER BY
                s.season_id DESC,
                points DESC,
                goal_difference DESC,
                goals_for DESC,
                t.team_name
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Unable to load teams", error);

        res.status(500).json({
            error: "โหลดข้อมูลทีมไม่สำเร็จ"
        });
    }
});

export default router;