/**
 * PortListField — each entry is a port the block exposes to the network.
 *
 * Stored as JSON strings in `node.data.exposed_ports[]` so the existing
 * list-based property machinery (undo/redo coalescing, persistence) keeps
 * working without changes. The compact text form `https:443` is accepted
 * on read for hand-edited values.
 */

export type PortProtocol = 'http' | 'https' | 'tcp';

export interface PortSpec {
  /** Listener port number. */
  port: number;
  protocol: PortProtocol;
  /** Optional human-readable label, e.g. "API" / "Healthcheck". */
  label?: string;
}

const DEFAULT: PortSpec = { port: 8080, protocol: 'http' };

export function parsePort(raw: string): PortSpec {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.port === 'number') {
      const protocol: PortProtocol =
        parsed.protocol === 'https' || parsed.protocol === 'tcp' ? parsed.protocol : 'http';
      return {
        port: parsed.port,
        protocol,
        ...(typeof parsed.label === 'string' && parsed.label ? { label: parsed.label } : {}),
      };
    }
  } catch {
    /* fall through to text form */
  }
  // Compact text form: "https:443" / "8080" / "tcp:22:ssh"
  const parts = raw.split(':');
  if (parts.length >= 2 && (parts[0] === 'http' || parts[0] === 'https' || parts[0] === 'tcp')) {
    const port = Number(parts[1]);
    if (Number.isFinite(port)) {
      return { protocol: parts[0] as PortProtocol, port, ...(parts[2] ? { label: parts[2] } : {}) };
    }
  }
  const portNum = Number(raw);
  if (Number.isFinite(portNum)) return { port: portNum, protocol: 'http' };
  return DEFAULT;
}

export function stringifyPort(p: PortSpec): string {
  return JSON.stringify({
    port: p.port,
    protocol: p.protocol,
    ...(p.label ? { label: p.label } : {}),
  });
}

/** Default label for a port — used by the port schema when no user label is set. */
export function defaultPortLabel(p: PortSpec): string {
  const proto = p.protocol.toUpperCase();
  return p.label ? `${proto} :${p.port} (${p.label})` : `${proto} :${p.port}`;
}
