import "dotenv/config";
import express from "express";
import matchRoutes from "./routes/matchRoute";


const app = express();

app.use(express.json());

// prefixo da API
app.use("/api", matchRoutes);

app.listen(3000, () => {
    console.log("Servidor rodando em http://localhost:3000");
});