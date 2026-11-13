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
app.listen(port, () => {
    console.log(`Open http://localhost:${port}/players.html`);
});