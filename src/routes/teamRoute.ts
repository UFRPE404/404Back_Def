import { Router } from "express";
import { getHistory } from "../controller/teamController";

const router = Router();

// Histórico de partidas encerradas de um time
router.get("/team/:teamId/history", getHistory);

export default router;
