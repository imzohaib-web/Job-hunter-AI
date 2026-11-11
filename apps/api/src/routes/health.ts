import { Router } from "express";
import { getDeepHealth, getHealth } from "../controllers/healthController.js";

export const healthRouter = Router();

healthRouter.get("/", getHealth);
healthRouter.get("/deep", getDeepHealth);
