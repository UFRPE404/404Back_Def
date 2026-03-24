import { Router } from "express";
import { getLiveMatches } from "../controller/matchController";
import { getEndedEvents } from "../services/betsApiService";
const router = Router();

router.get('/live', getLiveMatches);
router.get('/ended', getEndedEvents);
export default router;