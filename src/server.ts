import "dotenv/config";
import express from "express";
import matchRoutes from "./routes/matchRoute";
import playerRoutes from "./routes/playerRoute";


const app = express();

app.use(express.json());

// prefixo da API
app.use("/api", matchRoutes);
app.use("/api", playerRoutes);

app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000");
});