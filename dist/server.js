"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const matchRoute_1 = __importDefault(require("./routes/matchRoute"));
const playerRoute_1 = __importDefault(require("./routes/playerRoute"));
const teamRoute_1 = __importDefault(require("./routes/teamRoute"));
const suggestionsRoute_1 = __importDefault(require("./routes/suggestionsRoute"));
const mlRoute_1 = __importDefault(require("./routes/mlRoute"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_1 = require("./utils/swagger");
const app = (0, express_1.default)();
app.use(express_1.default.json());
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
app.use((0, cors_1.default)());
// prefixo da API
app.use("/api", matchRoute_1.default);
app.use("/api", playerRoute_1.default);
app.use("/api", teamRoute_1.default);
app.use("/api", suggestionsRoute_1.default);
app.use("/api", mlRoute_1.default);
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swagger_1.swaggerSpec));
app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000");
});
//# sourceMappingURL=server.js.map