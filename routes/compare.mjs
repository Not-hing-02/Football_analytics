import { Router } from "express";
import pool from "../db.mjs";
import { parsePostgresId } from "../utils/postgres-id.mjs";

const router = Router();

// GET /api/compare/players/options?seasonId=<id>
// แสดงเฉพาะผู้เล่นที่ลงสนามในนัดที่จบแล้ว พร้อมสโมสรและตำแหน่งล่าสุดในฤดูกาลที่เลือก
router.get("/players/options", async (req, res) => {
    const { seasonId, ...unknown } = req.query;
    const season = parsePostgresId(seasonId);
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
                    'team', t.team_name, 'position', l.position,
                    'teams', (
                        -- เก็บทุกสโมสรที่มีนัดลงสนามในฤดูกาลเดียวกัน เพื่อรองรับการย้ายทีม
                        SELECT json_agg(clubs ORDER BY clubs.name, clubs.id)
                        FROM (
                            SELECT DISTINCT t2.team_id AS id, t2.team_name AS name
                            FROM pl_history.player_match_stats x2
                            JOIN pl_history.matches m2 USING (match_id)
                            JOIN pl_history.teams t2 ON t2.team_id = x2.team_id
                            WHERE x2.player_id = l.player_id AND m2.season_id = $1
                                AND m2.status = 'completed' AND x2.minutes > 0
                        ) clubs
                    )
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
router.get("/players", async (req, res) => {
    const { seasonId, playerA, playerB, ...unknown } = req.query;
    const season = parsePostgresId(seasonId);
    const left = parsePostgresId(playerA);
    const right = parsePostgresId(playerB);

    if (
        Object.keys(unknown).length ||
        season === null ||
        left === null ||
        right === null ||
        left === right
    ) {
        return res.status(400).json({
            error: "Supply a valid seasonId and two different player IDs.",
        });
    }

    try {
        const { rows } = await pool.query(`
            SELECT player_id AS id,
                json_build_object(
                    'goals', goals,
                    'assists', assists,
                    'matchesPlayed', matches_played,
                    'passAccuracy', pass_accuracy,
                    'shots', shots,
                    'shotsOnTarget', shots_on_target,
                    'averageRating', average_rating,
                    'yellowCards', yellow_cards
                ) AS metrics,
                rating_kind AS "ratingKind",
                json_build_object(
                    'matches', matches_played,
                    'shots', matches_with_shots,
                    'shotsOnTarget', matches_with_shots_on_target,
                    'passes', matches_with_passes
                ) AS coverage
            FROM pl_history.v_player_compare
            WHERE season_id = $1 AND player_id IN ($2, $3)
            ORDER BY player_id = $3
        `, [season, left, right]);

        if (rows.length !== 2) {
            return res.status(404).json({
                error: "Season not found or a selected player has no appearances in that season.",
            });
        }

        return res.json({ seasonId: season, players: rows });
    } catch (error) {
        console.error("Unable to compare players", error);
        return res.status(500).json({
            error: "Unable to load the player comparison.",
        });
    }
});

export default router;
