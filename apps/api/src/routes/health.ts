import { Router } from "express";
import { getHealth } from "../controllers/healthController.js";

const router = Router();

router.get("/", getHealth);

export const healthRouter = router;
