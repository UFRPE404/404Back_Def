"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const matchController_1 = require("../controller/matchController");
const router = (0, express_1.Router)();
router.get('/live', matchController_1.getLiveMatches);
router.get('/ended', matchController_1.getEndedMatches);
router.get("/matches/upcoming-with-odds", matchController_1.getMatches);
router.get("/matches/upcoming", matchController_1.getUpcomingMatches);
router.get("/matches/h2h-bulk", matchController_1.getMatchH2HBulk);
router.get("/match/:eventId/odds", matchController_1.getMatchOdds);
router.get("/match/:eventId/full-odds", matchController_1.getMatchFullOdds);
router.get("/match/:eventId/h2h", matchController_1.getMatchH2H);
router.get("/match/:eventId/historic", matchController_1.getMatchHistoricHandler);
exports.default = router;
//# sourceMappingURL=matchRoute.js.map