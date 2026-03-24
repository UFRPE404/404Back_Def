import { Router } from "express";
import { getLiveMatches, getEndedMatches } from "../controller/matchController.js";
const router = Router();

router.get('/live', getLiveMatches);
router.get('/ended', getEndedMatches);
export default router;