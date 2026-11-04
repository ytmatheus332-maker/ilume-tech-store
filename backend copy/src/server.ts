import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);

app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    store: "ILUME TECH STORE",
    message: "Backend funcionando corretamente.",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "ilume-backend",
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`ILUME Backend rodando em http://localhost:${PORT}`);
});
