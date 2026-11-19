import express from "express";
import { fileURLToPath } from "node:url";

import playersRouter from "./routes/players.mjs";
import teamsRouter from "./routes/teams.mjs";
import matchesRouter from "./routes/matches.mjs";
import analyticsRouter from "./routes/analytics.mjs";
import compareRouter from "./routes/compare.mjs";

const app = express();
const port = Number(process.env.PORT || 3000);

const publicDirectory = fileURLToPath(
    new URL("./public/", import.meta.url)
);

app.use(express.json());
app.use(express.static(publicDirectory));

app.use("/api/players", playersRouter);
app.use("/api/teams", teamsRouter);
app.use("/api/matches", matchesRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/compare", compareRouter);

app.listen(port, () => {
    console.log(`Open http://localhost:${port}/players.html`);
});