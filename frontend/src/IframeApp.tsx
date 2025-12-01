import { useEffect, useState, Fragment, type JSX } from "react";
import { io, Socket } from "socket.io-client";
import { ServerStackIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import "./App.css";

interface TSServerInfo {
  virtualserver_name: string;
  virtualserver_maxclients: string;
  virtualserver_clientsonline: string;
  [key: string]: string;
}

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
  [key: string]: unknown;
}

interface TSChannelNode extends TSChannel {
  children?: TSChannelNode[];
}

interface ServerToClientEvents {
  log: (msg: string) => void;
  clients: (list: TSClient[]) => void;
  channels: (list: TSChannel[]) => void;
  commandResult: (res: unknown) => void;
  serverInfo: (name: string, max: string, online: string) => void;
}

interface ClientToServerEvents {
  sendCommand: (cmd: string) => void;
}

const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  import.meta.env.VITE_API_URL || "https://ts6-backend.kottel.de",
  { transports: ["websocket"] }
);

function IframeApp() {
  const [serverInfo, setServerInfo] = useState<TSServerInfo | null>(null);
  const [clients, setClients] = useState<TSClient[]>([]);
  const [channels, setChannels] = useState<TSChannel[]>([]);
  const [error, setError] = useState<JSX.Element | null>(null);
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  useEffect(() => {
    socket.on("connect", () => console.log("✅ Socket connected"));
    socket.on("disconnect", () => {
      console.log("Socket disconnected");
      setError(
        <div className="flex items-center gap-2 text-error text-sm font-medium">
          <ExclamationCircleIcon className="w-5 h-5" />
          <span>Disconnected</span>
        </div>
      );
    });
    socket.on("connect_error", (err) => {
      console.error("Socket error:", err);
      setError(
        <div className="flex items-center gap-2 text-error text-sm font-medium">
          <ExclamationCircleIcon className="w-5 h-5" />
          <span>Connection Error</span>
        </div>
      );
    });

    socket.on("serverInfo", (name: string, max: string, online: string) => {
      console.log(`${name} (${online}/${max})`);
      setServerInfo({
        virtualserver_name: name,
        virtualserver_maxclients: max,
        virtualserver_clientsonline: online,
      });
    });

    socket.on("clients", (list) => {
      if (!list) {
        setError(
          <div className="flex items-center gap-2 text-error text-sm font-medium">
            <ExclamationCircleIcon className="w-5 h-5" />
            <span>Clientlist missing</span>
          </div>
        );
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

  function buildChannelTree(list: TSChannel[]): TSChannelNode[] {
    const map = new Map<string, TSChannelNode>();
    for (const ch of list) {
      map.set(String(ch.cid), { ...ch, children: [] });
    }
    const roots: TSChannelNode[] = [];
    for (const node of map.values()) {
      const pid = node.pid ?? "0";
      if (!pid || pid === "0" || !map.has(String(pid))) {
        roots.push(node);
      } else {
        map.get(String(pid))!.children!.push(node);
      }
    }

    function sortRec(nodes: TSChannelNode[]) {
      nodes.sort(
        (a, b) => Number(a.channel_order ?? 0) - Number(b.channel_order ?? 0)
      );
      for (const n of nodes) if (n.children && n.children.length) sortRec(n.children);
    }
    sortRec(roots);
    return roots;
  }

  const channelTree = buildChannelTree(channels);

  const clientsByChannel = clients.reduce<Record<string, TSClient[]>>((acc, c) => {
    const key = String(c.cid ?? "0");
    acc[key] = acc[key] || [];
    acc[key].push(c);
    return acc;
  }, {});

  function renderChannelNode(node: TSChannelNode, depth = 0): JSX.Element {
    const chName = node.channel_name ?? "";
    const isSpacer = /\[c?spacer[^\]]*\]/i.test(chName);
    const chClients = (clientsByChannel[String(node.cid)] ?? [])
      .slice()
      .sort((a, b) => a.client_nickname.localeCompare(b.client_nickname, "de"));

    const indentPx = Math.min(depth, 6) * 16;

    const displayText = isSpacer
      ? chName.replace(/\[.*?\]/, "").trim() || "──────────"
      : chName || "(unnamed)";

    return (
      <Fragment key={node.cid}>
        <tr>
          <td colSpan={2} className="p-0">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: isSpacer ? "center" : "flex-start",
                padding: isSpacer ? "6px 0" : "10px 12px",
                background: isSpacer
                  ? "transparent"
                  : depth % 2
                    ? "rgba(255,255,255,0.02)"
                    : "transparent",
                opacity: isSpacer ? 0.6 : 1,
                fontWeight: isSpacer ? 500 : 600,
                color: isSpacer ? "#000000" : "inherit",
                borderBottom: isSpacer
                  ? "1px solid rgba(255,255,255,0.05)"
                  : "none",
              }}
            >
              {!isSpacer && (
                <div
                  style={{
                    width: 15,
                    height: 16.5,
                    clipPath:
                      "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
                    background: "#2980c3",
                    boxShadow: "0 0 6px rgba(99,102,241,0.15)",
                    marginRight: 8,
                  }}
                />
              )}
              {displayText}
            </div>
          </td>
        </tr>

        {chClients.map((client) => (
          <tr key={client.clid}>
            <td colSpan={2} className="p-0">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "6px 12px",
                  paddingLeft: `${indentPx + 28}px`,
                  color: "inherit",
                }}
                className="hover:bg-white-100 dark:hover:bg-neutral-800 transition-all duration-150"
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
                <div style={{ fontSize: 14 }}>{client.client_nickname}</div>
              </div>
            </td>
          </tr>
        ))}

        {node.children?.map((child) => renderChannelNode(child, depth + 1))}
      </Fragment>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-transparent text-base-content text-center px-4 py-4 text-white-900 dark:text-white">
      {/* Optimized for iframe - no logo, no title, no accordion */}
      
      {error && (
        <div className="w-full mb-4 text-error font-medium text-sm">
          {error}
        </div>
      )}

      {/* Server tree: channels with users - always expanded */}
      {channelTree.length > 0 ? (
        <div className="w-full max-w-full bg-transparent shadow-none rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-white-800 dark:text-white">
            <ServerStackIcon className="w-4 h-4" />
            <span>{serverInfo?.virtualserver_name || "Server"}</span>
          </div>
          <table className="table w-full text-left text-sm text-white-900 dark:text-white">
            <tbody>
              {channelTree.map((node) => renderChannelNode(node))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-white-500 dark:text-white-400 italic font-normal">No channels available.</div>
      )}
    </div>
  );
}

export default IframeApp;
