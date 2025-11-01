import { Client } from "ssh2";
import fs from "fs";

export class TSQuery {
  constructor({ host, port, user, pass, logFile = "./tsquery.log" }) {
    this.conn = new Client();
    this.stream = null;
    this.queue = [];
    this.ready = false;
    this.logFile = logFile;
    this.config = { host, port, user, pass };
    this.debug = process.env.DEBUG_MODE === "true";

    if (this.debug && fs.existsSync(logFile)) {
      fs.writeFileSync(logFile, "");
    }
  }

  log(msg) {
    if (!this.debug) return;

    const line = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(this.logFile, line);
    console.log(msg);
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.conn.on("ready", () => {
        this.log("connected with ts Query (SSH)");
        this.conn.shell((err, stream) => {
          if (err) return reject(err);
          this.stream = stream;
          this.ready = true;
          stream.on("data", (d) => this._handleData(d));
          stream.on("close", () => this.log("connection closed"));
          resolve(true);
        });
      });

      this.conn.on("error", (err) => {
        this.log("SSH Fehler: " + err.message);
        reject(err);
      });
      this.conn.on("end", () => this.log("connection ended"));

      this.conn.connect({
        host: this.config.host,
        port: this.config.port,
        username: this.config.user,
        password: this.config.pass,
      });
    });
  }

  _handleData(data) {
    const text = data.toString();
    this.log(text.trim());

    const current = this.queue[0];
    if (!current) return;

    current.buffer += text;

    if (text.includes("msg=ok") || text.includes("error id=")) {
      const finished = this.queue.shift();
      const parsed = this._parseResponse(finished.buffer);
      finished.resolve(parsed);
    }
  }

  async send(cmd) {
    if (!this.ready || !this.stream) throw new Error("Not connected");
    return new Promise((resolve) => {
      this.queue.push({ cmd, resolve, buffer: "" });
      this.log(cmd);
      this.stream.write(cmd + "\n");
    });
  }

  _parseResponse(raw) {
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const blob = lines
      .filter((l) => l.includes("=") && !l.startsWith("error"))
      .join(" ");

    if (!blob) return raw.trim();

    return blob.split("|").map((entry) => {
      const obj = {};
      entry.split(" ").forEach((pair) => {
        const [key, val] = pair.split("=");
        if (!key) return;
        obj[key] = (val ?? "").replace(/\\s/g, " ");
      });
      return obj;
    });
  }

  async close() {
    if (this.stream) this.stream.end("quit\n");
    this.conn.end();
  }
}