"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const suggestionsController_1 = require("../controller/suggestionsController");
const router = (0, express_1.Router)();
router.get("/suggestions", suggestionsController_1.getAllSuggestions);
router.get("/suggestions/best", suggestionsController_1.getBestSuggestions);
router.get("/suggestions/dream", suggestionsController_1.getDreamSuggestions);
router.get("/suggestions/featured", suggestionsController_1.getFeaturedMatches);
exports.default = router;
//# sourceMappingURL=suggestionsRoute.js.map