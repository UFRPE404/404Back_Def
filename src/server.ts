import "dotenv/config";
import cors from 'cors'
import express from "express";
import matchRoutes from "./routes/matchRoute";
import playerRoutes from "./routes/playerRoute";
import teamRoutes from "./routes/teamRoute";
import suggestionsRoutes from "./routes/suggestionsRoute";
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './utils/swagger';


const app = express();

app.use(express.json());
// eslint-disable-next-line @typescript-eslint/no-unsafe-call
app.use(cors() as unknown as express.RequestHandler);
// prefixo da API
app.use("/api", matchRoutes);
app.use("/api", playerRoutes);
app.use("/api", teamRoutes);
app.use("/api", suggestionsRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000");
});