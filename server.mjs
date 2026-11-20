import express from "express";
import { fileURLToPath } from "node:url";

import analyticsRouter from "./routes/analytics.mjs";
import compareRouter from "./routes/compare.mjs";
import compareTeamsRouter from "./routes/compare-teams.mjs";
import playersRouter from "./routes/players.mjs";
import teamsRouter from "./routes/teams.mjs";

const app = express();
const port = Number(process.env.PORT || 3000);

const publicDirectory = fileURLToPath(
    new URL("./public/", import.meta.url)
);

// รองรับข้อมูล JSON สำหรับ API ที่เพิ่มภายหลัง
app.use(express.json());

// เปิดไฟล์ HTML, CSS และ JavaScript จาก public
app.use(express.static(publicDirectory));

// เชื่อม API แต่ละส่วน
app.use("/api/players", playersRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/compare", compareRouter);
app.use("/api/compare/teams", compareTeamsRouter);

app.listen(port, () => {
    console.log(`Open http://localhost:${port}/players.html`);
});
