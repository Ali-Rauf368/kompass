import type { IncomingMessage, Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { SESSION_COOKIE, verifySession, type SessionUser } from "../auth/session";
import type { Role } from "../generated/prisma/client";

/** Server → client events. The web app subscribes by `type`. */
export type LiveEvent =
  | { type: "notification"; id: string; title: string; body?: string; link?: string }
  | { type: "ticket.updated"; ticketId: number; status: string; priority: string }
  | { type: "ticket.activity"; ticketId: number }
  | { type: "leave.updated"; leaveId: number; status: string }
  | { type: "deal.updated"; dealId: number; stage: string }
  | { type: "ingestion.finished"; pipeline: string; runId: number; status: string }
  | { type: "kpis.changed" };

interface Client {
  socket: WebSocket;
  user: SessionUser;
  alive: boolean;
}

const clients = new Set<Client>();
let wss: WebSocketServer | undefined;

function parseCookies(header = "") {
  return Object.fromEntries(
    header.split(";").map((part) => {
      const [k, ...v] = part.trim().split("=");
      return [k, decodeURIComponent(v.join("="))];
    }),
  );
}

/** Attaches the WebSocket endpoint at /ws. The session cookie authenticates the upgrade request. */
export function attachRealtime(server: Server) {
  wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    if (new URL(req.url ?? "/", "http://x").pathname !== "/ws") return socket.destroy();
    const user = verifySession(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    if (!user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      return socket.destroy();
    }
    wss!.handleUpgrade(req, socket, head, (ws) => {
      const client: Client = { socket: ws, user, alive: true };
      clients.add(client);
      ws.on("pong", () => (client.alive = true));
      ws.on("close", () => clients.delete(client));
      ws.send(JSON.stringify({ type: "hello", username: user.username }));
    });
  });

  // Heartbeat: drop connections that stopped answering (laptop closed, network gone).
  const interval = setInterval(() => {
    for (const c of clients) {
      if (!c.alive) {
        c.socket.terminate();
        clients.delete(c);
        continue;
      }
      c.alive = false;
      c.socket.ping();
    }
  }, 30_000);
  interval.unref();
  server.on("close", () => {
    clearInterval(interval);
    for (const c of clients) c.socket.terminate();
    clients.clear();
  });
}

type Audience = { all: true } | { usernames: string[] } | { roles: Role[] };

/** Fire-and-forget broadcast to connected clients matching the audience. */
export function publish(audience: Audience, event: LiveEvent) {
  const data = JSON.stringify(event);
  for (const c of clients) {
    const match =
      "all" in audience ||
      ("usernames" in audience && audience.usernames.includes(c.user.username)) ||
      ("roles" in audience && (c.user.roles.includes("ADMIN") || audience.roles.some((r) => c.user.roles.includes(r))));
    if (match && c.socket.readyState === WebSocket.OPEN) c.socket.send(data);
  }
}

export const connectedClients = () => clients.size;
