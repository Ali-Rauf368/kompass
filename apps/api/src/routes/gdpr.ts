import { Router } from "express";
import { z } from "zod";
import { currentUser, requireRole } from "../auth/session";
import { config } from "../config";
import { audit } from "../lib/audit";
import { applyRetention, exportEmployeeData, pseudonymizeEmployee } from "../lib/gdpr";
import { forbidden } from "../lib/errors";
import { idParam } from "../lib/http";
import { scheduleRefresh } from "../analytics/warehouse";

const router = Router();

/** Employees can download their own data; HR can export anyone's (data subject requests). */
router.get("/employees/:id/export", async (req, res) => {
  const user = currentUser(req);
  const id = idParam.parse(req.params.id);
  if (user.employeeId !== id && !user.roles.some((r) => r === "HR" || r === "ADMIN")) throw forbidden();
  const data = await exportEmployeeData(id);
  await audit(req, { action: "gdpr.exported", entityType: "employee", entityId: id, personalData: true });
  res.setHeader("Content-Disposition", `attachment; filename="kompass-data-export-${id}.json"`);
  res.json(data);
});

router.post("/employees/:id/erase", requireRole("HR"), async (req, res) => {
  const id = idParam.parse(req.params.id);
  z.object({ confirm: z.literal("ERASE") }).parse(req.body);
  const result = await pseudonymizeEmployee(id, currentUser(req).username);
  scheduleRefresh();
  res.json(result);
});

router.post("/retention/run", requireRole("ADMIN"), async (req, res) => {
  const result = await applyRetention(config().LEAVE_RETENTION_YEARS, currentUser(req).username);
  await audit(req, { action: "gdpr.retention", entityType: "system", details: result });
  res.json(result);
});

export default router;
