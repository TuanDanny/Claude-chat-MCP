import WebSocket from "ws";
import { createPairingCode } from "./pairing.js";
import { remoteReadLimits } from "./remotePolicy.js";

export function createRelayAgentPlan(relayUrl: string) {
  const pairing = createPairingCode();
  return {
    ok: true,
    relay_url: relayUrl,
    pairing,
    remote_policy: remoteReadLimits(),
    next_action: "Start outbound WebSocket relay connection after a real relay host is configured."
  };
}

export async function smokeRelayWebSocket(url: string): Promise<{ ok: boolean; url: string; error?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const done = (result: { ok: boolean; url: string; error?: string }) => {
      try {
        ws.close();
      } catch {
        // ignore close errors in smoke checks
      }
      resolve(result);
    };
    ws.once("open", () => done({ ok: true, url }));
    ws.once("error", (error) => done({ ok: false, url, error: error.message }));
    setTimeout(() => done({ ok: false, url, error: "timeout" }), 5000).unref();
  });
}
