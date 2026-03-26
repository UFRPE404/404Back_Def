import { Router } from "express";
import { getLiveMatches, getEndedMatches, getMatches, getUpcomingMatches, getMatchOdds } from "../controller/matchController";
const router = Router();

router.get('/live', getLiveMatches);
router.get('/ended', getEndedMatches);
router.get("/matches/upcoming-with-odds", getMatches);
router.get("/matches/upcoming", getUpcomingMatches);
router.get("/match/:eventId/odds", getMatchOdds);
export default router;