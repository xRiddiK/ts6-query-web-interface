import { useEffect, useState, Fragment } from "react";
import { io, Socket } from "socket.io-client";
import tsLogo from "./assets/teamspeak_blue.svg";
import { UserGroupIcon, PlayCircleIcon } from '@heroicons/react/24/solid';
import "./App.css";

interface TSClient {
  clid: string;
  cid: string;
  client_database_id: string;
  client_nickname: string;
  [key: string]: string;
}

interface TSChannel {
  cid: string;
  pid?: string;
  channel_order?: string | number;
  channel_name?: string;
  total_clients?: string | number;
  [key: string]: any;
}

interface ServerToClientEvents {
  log: (msg: string) => void;
  clients: (list: TSClient[]) => void;
  channels: (list: TSChannel[]) => void;
  commandResult: (res: unknown) => void;
}

interface ClientToServerEvents {
  sendCommand: (cmd: string) => void;
}

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_API_URL || "http://localhost:8080",
  { transports: ["websocket"] }
);

const tsLink = "https://tmspk.gg/s/127.0.0.1"; // replace with your ts link

function App() {
  const [clients, setClients] = useState<TSClient[]>([]);
  const [channels, setChannels] = useState<TSChannel[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    socket.on("connect", () => console.log("✅ Socket connected"));
    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setError("🔴 Disconnected");
    });
    socket.on("connect_error", (err) => {
      console.error("⚠️ Socket error:", err);
      setError("🟠 Connection Error");
    });

    socket.on("clients", (list) => {
      if (!list) {
        setError("❌ Clientlist missing");
        return;
      }
      const filtered = list
        .filter(
          (c) =>
            c.client_type !== "1" &&
            c.client_nickname?.toLowerCase() !== "serveradmin"
        )
        .sort((a, b) =>
          a.client_nickname.localeCompare(b.client_nickname, "de")
        );
      setClients(filtered);
      setError(null);
    });

    socket.on("channels", (list) => {
      if (!list) return;
      const sorted = list
        .slice()
        .sort(
          (a, b) =>
            Number(a.channel_order ?? 0) - Number(b.channel_order ?? 0)
        );
      setChannels(sorted);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("clients");
      socket.off("channels");
    };
  }, []);

  // Build channel tree using pid and channel_order
  function buildChannelTree(list: TSChannel[]) {
    const map = new Map<string, TSChannel & { children?: any[] }>();
    for (const ch of list) {
      map.set(String(ch.cid), { ...ch, children: [] });
    }
    const roots: (TSChannel & { children?: any[] })[] = [];
    for (const node of map.values()) {
      const pid = node.pid ?? "0";
      if (!pid || pid === "0" || !map.has(String(pid))) {
        roots.push(node);
      } else {
        map.get(String(pid))!.children!.push(node);
      }
    }
    // sort children by channel_order recursively
    function sortRec(nodes: (TSChannel & { children?: any[] })[]) {
      nodes.sort((a, b) => Number(a.channel_order ?? 0) - Number(b.channel_order ?? 0));
      for (const n of nodes) if (n.children && n.children.length) sortRec(n.children);
    }
    sortRec(roots);
    return roots;
  }

  const channelTree = buildChannelTree(channels);

  // map clients by channel id for quick lookup
  const clientsByChannel = clients.reduce<Record<string, TSClient[]>>((acc, c) => {
    const key = String(c.cid ?? "0");
    acc[key] = acc[key] || [];
    acc[key].push(c);
    return acc;
  }, {});

  // changed: renderChannelNode — visually indents with connector + bullet for users
  function renderChannelNode(node: TSChannel & { children?: any[] }, depth = 0) {
    const chClients = (clientsByChannel[String(node.cid)] ?? []).slice().sort((a, b) =>
      a.client_nickname.localeCompare(b.client_nickname, "de")
    );

    const indentPx = Math.min(depth, 6) * 16;

    return (
      <Fragment key={node.cid}>
        <tr>
          <td colSpan={2} className="p-0">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 12px",
                background: depth % 2 ? "rgba(255,255,255,0.02)" : "transparent",
              }}
            >
              {/* left indent + vertical connector */}
              <div style={{ width: indentPx, display: "flex", justifyContent: "center" }}>
                {depth > 0 && (
                  <div
                    style={{
                      width: 2,
                      height: "100%",
                      background: "linear-gradient(to bottom, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                      borderRadius: 1,
                      marginRight: 8,
                    }}
                  />
                )}
              </div>

              {/* channel row */}
              <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {/* channel icon/bullet */}
                    <div
                    style={{
                      width: 15,
                      height: 16.5,  // Slightly taller for hexagon shape
                      clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                      background: "#2980c3",
                      boxShadow: "0 0 6px rgba(99,102,241,0.15)",
                    }}
                    />
                  <div style={{ fontWeight: 600, color: "var(--tw-text-opacity, #fff)" }}>
                    {node.channel_name ?? "(unnamed)"}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>

        {/* channel users — indented and with small bullet */}
        {chClients.map((client) => (
            <tr key={client.clid}>
              <td colSpan={2} className="p-0">
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 12px",
                    paddingLeft: `${indentPx + 28}px`,
                    color: "var(--tw-text-opacity, #e5e7eb)",
                  }}
                  className="hover:bg-neutral-800 transition-all duration-150"
                >
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 99,
                      background: "rgba(148,163,184,0.5)",
                      marginRight: 10,
                    }}
                  />
                  <div style={{ fontSize: 13 }}>{client.client_nickname}</div>
                </div>
              </td>
            </tr>
          ))
  }

        {/* render children recursively */}
        {node.children && node.children.map((child: any) => renderChannelNode(child, depth + 1))}
      </Fragment>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-base-200 text-base-content text-center px-4 py-10 dark">
      {/* Logo + Title */}
      <div className="flex flex-col items-center mb-8 space-y-3">
        <a
          href="https://www.teamspeak.com/en/downloads/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex flex-col items-center"
        >
          <img
            src={tsLogo}
            className="w-20 h-20 object-contain transition-color duration-300 hover:scale-105 hover:drop-shadow-[0_0_2em_#646cffaa]"
            alt="TeamSpeak logo"
          />
          <h1 className="text-3xl font-bold mt-3 tracking-wide">
            TeamSpeak 6
          </h1>
        </a>
        {error && (
          <h2 className="text-error font-medium text-sm mt-2">{error}</h2>
        )}
      </div>

      {/* Card */}
      <div className="card w-full max-w-sm bg-base-100 shadow-xl rounded-xl p-6 flex flex-col items-center gap-4 bg-neutral-900">
        {/* user count button */}
        <button className="btn btn-primary w-full text-lg font-semibold flex items-center justify-center gap-2">
          <UserGroupIcon className="w-6 h-6" />
          <span>User Count: {clients.length}</span>
        </button>

        {/* join server card */}
        <a
          href={tsLink}
          target="_blank"
          rel="noreferrer"
          className="w-xs flex items-center justify-center gap-3 px-5 py-3 rounded-lg bg-blue-500 text-white font-semibold transition-all duration-300 hover:scale-[1.02]"
        >
          <PlayCircleIcon className="w-6 h-6" />
          <span>Join</span>
        </a>
      </div>

      {/* Server tree: channels with users listed under each channel */}
      {channelTree.length > 0 ? (
        <div className="mt-8 card w-full max-w-sm bg-base-100 shadow-xl rounded-xl p-6 flex flex-col items-center gap-4 bg-neutral-900">
          <div className="text-lg font-semibold mb-4">Server</div>
          <table className="table w-full text-left text-sm text-gray-300">
            <tbody>
              {channelTree.map((node) => renderChannelNode(node))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-8 text-gray-500 italic">No channels available.</div>
      )}

      {/* Footer */}
      <footer className="mt-10 text-md text-gray-500">
        Made with ⁠♡ by <span className="text-primary font-semibold">JXCS</span> ×{" "}
        <span className="text-gray-400">React + HeroUI</span>
      </footer>
    </div>
  );
}

export default App;
