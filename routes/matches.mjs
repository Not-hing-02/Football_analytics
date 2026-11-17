import { Router } from "express";
import pool from "../db.mjs";

const router = Router();

// GET /api/matches
router.get("/", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                m.match_id AS id,
                m.season_id,
                s.label AS season,
                m.matchweek,
                TO_CHAR(m.match_date, 'YYYY-MM-DD') AS match_date,
                m.kickoff_utc,
                m.status,
                h.team_id AS home_id,
                h.team_name AS home_team,
                a.team_id AS away_id,
                a.team_name AS away_team,
                ts.home_stadium AS stadium,
                m.home_goals,
                m.away_goals,
                m.ht_home_goals,
                m.ht_away_goals,
                m.home_shots,
                m.away_shots,
                m.home_shots_on_target,
                m.away_shots_on_target
            FROM pl_history.matches m
            JOIN pl_history.seasons s
                ON s.season_id = m.season_id
            JOIN pl_history.teams h
                ON h.team_id = m.home_team_id
            JOIN pl_history.teams a
                ON a.team_id = m.away_team_id
            JOIN pl_history.team_seasons ts
                ON ts.team_id = m.home_team_id
                AND ts.season_id = m.season_id
            ORDER BY
                m.season_id DESC,
                m.match_date DESC,
                m.match_id DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Unable to load matches", error);

        res.status(500).json({
            error: "โหลดข้อมูลแมตช์ไม่สำเร็จ"
        });
    }
});

export default router;