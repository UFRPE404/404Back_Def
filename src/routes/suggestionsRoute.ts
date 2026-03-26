import { Router } from "express";
import { getAllSuggestions, getBestSuggestions, getDreamSuggestions, getFeaturedMatches } from "../controller/suggestionsController";

const router = Router();

router.get("/suggestions", getAllSuggestions);
router.get("/suggestions/best", getBestSuggestions);
router.get("/suggestions/dream", getDreamSuggestions);
router.get("/suggestions/featured", getFeaturedMatches);

export default router;
