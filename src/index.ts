import express from "express";
import { app } from "./api.js";
import { services } from "./config.js";

// Vercel entry point. Local npm start continues to use server.ts.
const { trading, analysis, finnhub } = services();
const application = express();
application.use(app(trading, analysis, finnhub));
export default application;
