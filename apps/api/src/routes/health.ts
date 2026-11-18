import { Router } from "express";
import { getAiVersion, getDeepHealth, getHealth, getVersion } from "../controllers/healthController.js";

const router = Router();

router.get("/", getHealth);
router.get("/deep", getDeepHealth);
router.get("/version", getVersion);
router.get("/version/ai", getAiVersion);

export const healthRouter = router;
