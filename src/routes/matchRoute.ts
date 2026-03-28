import { Router } from "express";
import { getLiveMatches, getEndedMatches, getMatches, getUpcomingMatches, getMatchOdds, getMatchFullOdds, getMatchH2H, getMatchH2HBulk, getMatchHistoricHandler, getMatchLiveStatsHandler, getMatchLineupHandler } from "../controller/matchController";
const router = Router();

router.get('/live', getLiveMatches);
router.get('/ended', getEndedMatches);
router.get("/matches/upcoming-with-odds", getMatches);
router.get("/matches/upcoming", getUpcomingMatches);
router.get("/matches/h2h-bulk", getMatchH2HBulk);
router.get("/match/:eventId/odds", getMatchOdds);
router.get("/match/:eventId/full-odds", getMatchFullOdds);
router.get("/match/:eventId/h2h", getMatchH2H);
router.get("/match/:eventId/historic", getMatchHistoricHandler);
router.get("/match/:eventId/live-stats", getMatchLiveStatsHandler);
router.get("/match/:eventId/lineup", getMatchLineupHandler);
export default router;