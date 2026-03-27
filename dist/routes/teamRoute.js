"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const teamController_1 = require("../controller/teamController");
const router = (0, express_1.Router)();
// Histórico de partidas encerradas de um time
router.get("/team/:teamId/history", teamController_1.getHistory);
exports.default = router;
//# sourceMappingURL=teamRoute.js.map