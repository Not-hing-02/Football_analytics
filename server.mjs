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

// GET /api/analytics/filters คืนฤดูกาลและทีมที่เลือกได้ในแต่ละฤดูกาล โดยไม่รับ query parameter
app.get("/api/analytics/filters", async (req, res) => {
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

// ตรวจ ID ให้เป็นจำนวนเต็มบวกในช่วง integer ของ PostgreSQL ก่อนส่งเข้า SQL
function analyticsId(value) {
    if (typeof value !== "string" || !/^[1-9]\d{0,9}$/.test(value)) return null;
    const id = Number(value);
    return id <= 2147483647 ? id : null;
}

// GET /api/analytics/dashboard?seasonId=<id>[&teamId=<id>]
// ใช้ข้อมูลชุดเดียวกันสำหรับกราฟและ CSV หากไม่ระบุ teamId จะสรุปทั้งลีก
app.get("/api/analytics/dashboard", async (req, res) => {
    const { seasonId, teamId, ...unknown } = req.query;
    const season = analyticsId(seasonId);
    const team = teamId === undefined ? null : analyticsId(teamId);
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

// GET /api/compare/players/options?seasonId=<id>
// แสดงเฉพาะผู้เล่นที่ลงสนามในนัดที่จบแล้ว พร้อมสโมสรและตำแหน่งล่าสุดในฤดูกาลที่เลือก
app.get("/api/compare/players/options", async (req, res) => {
    const { seasonId, ...unknown } = req.query;
    const season = analyticsId(seasonId);
    if (season === null || Object.keys(unknown).length) {
        return res.status(400).json({ error: "Supply a valid seasonId." });
    }
    try {
        const { rows } = await pool.query(`
            WITH latest AS (
                -- ใช้ข้อมูลจากนัดล่าสุดในฤดูกาลที่เลือก เพื่อให้สโมสรบนการ์ดตรงกับช่วงเวลาที่เปรียบเทียบ
                SELECT DISTINCT ON (x.player_id) x.player_id, x.team_id, x.position
                FROM pl_history.player_match_stats x
                JOIN pl_history.matches m USING (match_id)
                WHERE m.season_id = $1 AND m.status = 'completed' AND x.minutes > 0
                ORDER BY x.player_id, m.match_date DESC, m.kickoff_utc DESC NULLS LAST, m.match_id DESC
            )
            SELECT s.season_id AS "seasonId", COALESCE((
                SELECT json_agg(json_build_object(
                    'id', p.player_id, 'name', p.display_name, 'fullName', p.player_name,
                    'team', t.team_name, 'position', l.position
                ) ORDER BY p.display_name, p.player_id)
                FROM latest l
                JOIN pl_history.players p USING (player_id)
                JOIN pl_history.teams t USING (team_id)
            ), '[]'::json) AS players
            FROM pl_history.seasons s WHERE s.season_id = $1
        `, [season]);
        if (!rows.length) return res.status(404).json({ error: "Season not found." });
        res.json(rows[0]);
    } catch (error) {
        console.error("Unable to load comparison players", error);
        res.status(500).json({ error: "Unable to load players for this season." });
    }
});

// GET /api/compare/players?seasonId=<id>&playerA=<id>&playerB=<id>
// คืนสถิติรวมของฤดูกาลตามลำดับผู้เล่น A และ B โดยใช้ null สำหรับสถิติที่ข้อมูลไม่ครบ
app.get("/api/compare/players", async (req, res) => {
    const { seasonId, playerA, playerB, ...unknown } = req.query;
    const season = analyticsId(seasonId);
    const left = analyticsId(playerA);
    const right = analyticsId(playerB);
    if (Object.keys(unknown).length || season === null || left === null || right === null || left === right) {
        return res.status(400).json({ error: "Supply a valid seasonId and two different player IDs." });
    }
    try {
        const { rows } = await pool.query(`
            SELECT x.player_id AS id,
                json_build_object(
                    'goals', SUM(x.goals),
                    'assists', SUM(x.assists_fpl),
                    'matchesPlayed', COUNT(*),
                    -- ไม่คำนวณความแม่นยำในการจ่ายบอลจากเปอร์เซ็นต์รายนัด เพราะไม่มีจำนวนครั้งที่พยายามจ่ายสำหรับถ่วงน้ำหนัก
                    'passAccuracy', NULL::numeric,
                    -- ใช้ข้อมูลครบทุกนัดที่ผู้เล่นลงสนาม เพื่อไม่ให้ยอดรวมหรือค่าเฉลี่ยจากข้อมูลบางนัดดูเหมือนสถิติทั้งฤดูกาล
                    'shots', CASE WHEN COUNT(x.shots) = COUNT(*) THEN SUM(x.shots) END,
                    'shotsOnTarget', CASE WHEN COUNT(x.shots_on_target) = COUNT(*) THEN SUM(x.shots_on_target) END,
                    'averageRating', CASE WHEN COUNT(x.rating_10) = COUNT(*) THEN ROUND(AVG(x.rating_10), 2) END,
                    'yellowCards', SUM(x.yellow_cards)
                ) AS metrics
            FROM pl_history.player_match_stats x
            JOIN pl_history.matches m USING (match_id)
            WHERE m.season_id = $1 AND m.status = 'completed' AND x.minutes > 0
                AND x.player_id IN ($2, $3)
            GROUP BY x.player_id
            ORDER BY x.player_id = $3
        `, [season, left, right]);
        if (rows.length !== 2) {
            return res.status(404).json({ error: "Season not found or a selected player has no appearances in that season." });
        }
        res.json({ seasonId: season, players: rows });
    } catch (error) {
        console.error("Unable to compare players", error);
        res.status(500).json({ error: "Unable to load the player comparison." });
    }
});

app.listen(port, () => {
    console.log(`Open http://localhost:${port}/players.html`);
});
