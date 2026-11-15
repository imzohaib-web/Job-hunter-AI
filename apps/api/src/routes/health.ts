import { Router } from "express";
import { getDeepHealth, getHealth } from "../controllers/healthController.js";

const router = Router();

router.get("/", getHealth);
router.get("/deep", getDeepHealth);

export const healthRouter = router;
