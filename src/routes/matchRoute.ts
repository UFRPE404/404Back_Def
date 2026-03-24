import { Router } from "express";
import { getLiveMatches } from "../controller/matchController";
import { getEndedEvents } from "../services/betsApiService";
import { getMatches } from "../controller/matchController";
const router = Router();

router.get('/live', getLiveMatches);
router.get('/ended', getEndedEvents);
router.get("/matches/upcoming-with-odds", getMatches);
export default router;