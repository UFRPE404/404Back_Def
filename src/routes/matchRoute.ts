import { Router } from "express";
import { getLiveMatches, getEndedMatches, getMatches } from "../controller/matchController";
const router = Router();

router.get('/live', getLiveMatches);
router.get('/ended', getEndedMatches);
router.get("/matches/upcoming-with-odds", getMatches);

//falta implementar as rotas
export default router;