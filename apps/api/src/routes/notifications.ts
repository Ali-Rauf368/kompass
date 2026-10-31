import { Router } from "express";
import { isValidObjectId } from "mongoose";
import { currentUser } from "../auth/session";
import { Notification } from "../db/mongo";
import { notFound } from "../lib/errors";

const router = Router();

router.get("/", async (req, res) => {
  const { username } = currentUser(req);
  const [items, unread] = await Promise.all([
    Notification.find({ username }).sort({ createdAt: -1 }).limit(30).lean(),
    Notification.countDocuments({ username, readAt: null }),
  ]);
  res.json({ items: items.map(({ _id, ...n }) => ({ id: String(_id), ...n })), unread });
});

router.post("/read-all", async (req, res) => {
  await Notification.updateMany({ username: currentUser(req).username, readAt: null }, { readAt: new Date() });
  res.status(204).end();
});

router.post("/:id/read", async (req, res) => {
  if (!isValidObjectId(req.params.id)) throw notFound("Notification");
  const n = await Notification.findOneAndUpdate({ _id: req.params.id, username: currentUser(req).username }, { readAt: new Date() }, { new: true });
  if (!n) throw notFound("Notification");
  res.status(204).end();
});

export default router;
