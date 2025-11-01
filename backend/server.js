import "dotenv/config";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { TSQuery } from "./tsquery.js";

//#region Configuration
const TS_HOST = process.env.TS_HOST || "";
const TS_PORT = Number(process.env.TS_PORT || 10022);
const TS_USER = process.env.TS_USER || "";
const TS_PASS = process.env.TS_PASS || "";

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const ts = new TSQuery({
  host: TS_HOST,
  port: TS_PORT,
  user: TS_USER,
  pass: TS_PASS,
  logFile: "./tsquery.log",
});
//#endregion

//#region Functions
async function ensureConnected() {
  try {
    await ts.connect();
    await ts.send("use 1");
  } catch (e) {
    console.error("connect error:", e.message);
    setTimeout(ensureConnected, 5000);
  }
}
await ensureConnected();

const origLog = ts.log.bind(ts);
ts.log = (msg) => {
  origLog(msg);
  io.emit("log", msg);
};

function decodeTSString(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/\\s/g, " ")
    .replace(/\\p/g, "|")
    .replace(/\\n/g, "\n")
    .replace(/\\f/g, "/")
    .replace(/\\b/g, "\b")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

function decodeTSObject(obj) {
  const decoded = {};
  for (const [key, val] of Object.entries(obj)) {
    decoded[key] = decodeTSString(val);
  }
  return decoded;
}
//#endregion

//#region API Endpoints
app.get("/api/clients", async (_req, res) => {
  try {
    const clients = await ts.send("clientlist");
    const decodedClients = clients.map(decodeTSObject);
    res.json(decodedClients);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/serverinfo", async (_req, res) => {
  try {
    const info = await ts.send("serverinfo");
    res.json(info);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Added: channels endpoint — returns channels sorted by channel_order with decoded names
app.get("/api/channels", async (_req, res) => {
  try {
    const channels = await ts.send("channellist");
    const decoded = channels.map(decodeTSObject);
    decoded.sort((a, b) => Number(a.channel_order || 0) - Number(b.channel_order || 0));
    const mapped = decoded.map((c) => ({
      cid: c.cid,
      pid: c.pid,
      channel_order: Number(c.channel_order || 0),
      channel_name: c.channel_name,
      total_clients: Number(c.total_clients || 0),
    }));
    res.json(mapped);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
//#endregion

io.on("connection", async (socket) => {
  console.log("Web client connected");

  try {
    const clients = await ts.send("clientlist");
    const decoded = clients.map(decodeTSObject);
    const filtered = decoded.filter(
      (c) =>
        c.client_type !== "1" &&
        c.client_nickname?.toLowerCase() !== "serveradmin"
    );
    socket.emit("clients", filtered);
  } catch (err) {
    console.error("initial clientlist error:", err.message);
  }

  // Emit initial channel list (sorted by channel_order)
  try {
    const channels = await ts.send("channellist");
    const decodedChannels = channels.map(decodeTSObject);
    decodedChannels.sort((a, b) => Number(a.channel_order || 0) - Number(b.channel_order || 0));
    socket.emit("channels", decodedChannels);
  } catch (err) {
    console.error("initial channellist error:", err.message);
  }

  socket.on("sendCommand", async (cmd) => {
    try {
      const res = await ts.send(cmd);
      socket.emit("commandResult", res);
    } catch (e) {
      socket.emit("commandResult", { error: e.message });
    }
  });

  socket.on("disconnect", () => console.log("web client disconnected"));
});

setInterval(async () => {
  try {
    const clients = await ts.send("clientlist");
    const decoded = clients.map(decodeTSObject);
    io.emit("clients", decoded);
  } catch (e) {
    console.error("clientlist error:", e.message);
  }

  // Periodically update channels as well
  try {
    const channels = await ts.send("channellist");
    const decodedChannels = channels.map(decodeTSObject);
    decodedChannels.sort((a, b) => Number(a.channel_order || 0) - Number(b.channel_order || 0));
    io.emit("channels", decodedChannels);
  } catch (e) {
    console.error("channellist error:", e.message);
  }
}, 10_000);
//#endregion

//#region Start Server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () =>
  console.log(`backend running on http://localhost:${PORT}`)
);
//#endregion
