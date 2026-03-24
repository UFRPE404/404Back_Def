import { Router } from "express";
import { getLiveMatches } from "../controller/matchController";

const router = Router();

router.get('/live', getLiveMatches);

export default router;