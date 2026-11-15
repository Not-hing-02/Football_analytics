import express from "express";
import pg from "pg";
import { fileURLToPath } from "node:url";

const app = express();
const pool = new pg.Pool();
const port = Number(process.env.PORT || 3000);

const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));

// ให้ Node.js เปิดไฟล์หน้าเว็บจากโฟลเดอร์ public
app.use(express.static(publicDirectory));

// API ประวัตินักเตะ แยกตามฤดูกาลและทีม
app.get("/api/players/:id/history", async (req, res) => {
    const playerId = Number(req.params.id);

    if (!Number.isSafeInteger(playerId) || playerId <= 0) {
        return res.status(400).json({
            error: "รหัสนักเตะไม่ถูกต้อง"
        });
    }

    try {
        const playerResult = await pool.query(
            `SELECT player_id
             FROM pl_history.players
             WHERE player_id = $1`,
            [playerId]
        );

        if (playerResult.rowCount === 0) {
            return res.status(404).json({
                error: "ไม่พบนักเตะ"
            });
        }

        const result = await pool.query(
            `SELECT
                s.label AS season,
                t.team_name AS team,
                COUNT(*)::integer AS appearances,
                SUM(x.goals)::integer AS goals,
                SUM(x.assists_fpl)::integer AS assists,
                SUM(x.yellow_cards)::integer AS yellow_cards,
                SUM(x.red_cards)::integer AS red_cards
             FROM pl_history.player_match_stats x
             JOIN pl_history.matches m
                ON m.match_id = x.match_id
             JOIN pl_history.seasons s
                ON s.season_id = m.season_id
             JOIN pl_history.teams t
                ON t.team_id = x.team_id
             WHERE x.player_id = $1
                AND m.status = 'completed'
                AND x.minutes > 0
             GROUP BY s.season_id, s.label, t.team_id, t.team_name
             ORDER BY s.season_id DESC, MIN(m.match_date), t.team_name`,
            [playerId]
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Unable to load player history", error);

        res.status(500).json({
            error: "โหลดประวัตินักเตะไม่สำเร็จ"
        });
    }
});
app.get("/api/players", async (req, res) => {
    try {
        const result = await pool.query(`
            WITH recorded_stats AS (
                SELECT
                    x.*,
                    m.match_date
                FROM pl_history.player_match_stats x
                JOIN pl_history.matches m
                    ON m.match_id = x.match_id
                WHERE m.status = 'completed'
                    AND x.minutes > 0
            ),
            latest_team AS (
                SELECT DISTINCT ON (player_id)
                    player_id,
                    team_id,
                    position
                FROM recorded_stats
                ORDER BY player_id, match_date DESC, match_id DESC
            ),
            totals AS (
                SELECT
                    player_id,
                    COUNT(*)::integer AS matches,
                    SUM(goals)::integer AS goals,
                    ROUND(
    AVG(
        LEAST(
            10.0,
            GREATEST(
                1.0,
                6.0
                + CASE WHEN minutes >= 60 THEN 0.2 ELSE 0 END
                + goals * 0.8
                + assists_fpl * 0.5
                + CASE
                    WHEN position = 'GK' THEN saves * 0.1
                    ELSE 0
                  END
                - yellow_cards * 0.2
                - red_cards * 1.0
                - own_goals * 0.8
            )
        )
    ),
    1
)::float8 AS rating
                FROM recorded_stats
                GROUP BY player_id
            )
            SELECT
                p.player_id AS id,
                p.player_name AS name,
                COALESCE(t.team_name, 'ไม่มีข้อมูลทีม') AS team,
                CASE latest.position
                    WHEN 'GK' THEN 'Goalkeeper'
                    WHEN 'DEF' THEN 'Defender'
                    WHEN 'MID' THEN 'Midfielder'
                    WHEN 'FWD' THEN 'Forward'
                    ELSE 'Unknown'
                END AS position,
                EXTRACT(
                    YEAR FROM AGE(CURRENT_DATE, p.birth_date)
                )::integer AS age,
                COALESCE(totals.matches, 0) AS matches,
                COALESCE(totals.goals, 0) AS goals,
                totals.rating
            FROM pl_history.players p
            LEFT JOIN latest_team latest
                ON latest.player_id = p.player_id
            LEFT JOIN pl_history.teams t
                ON t.team_id = latest.team_id
            LEFT JOIN totals
                ON totals.player_id = p.player_id
            ORDER BY p.player_name, p.player_id
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("Unable to load players", error);

        res.status(500).json({
            error: "โหลดรายชื่อนักเตะไม่สำเร็จ"
        });
    }
});

// api ทีมเเละสถิติเเยกตามฤดูกาล
app.get("/api/teams", async (req, res) => {
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
        res.status(500).json({ error: "โหลดข้อมูลทีมไม่สำเร็จ" });
    }
});

app.listen(port, () => {
    console.log(`Open http://localhost:${port}/players.html`);
});