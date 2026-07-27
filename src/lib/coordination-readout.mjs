import { dirname } from "node:path";
import { requestRelationalGraphReadout } from "@lenticule-science/mathematical-readout-exchange/client";

const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const DEFAULT_READOUT_AGENT_URL = process.env.CORPUS_MATHEMATICAL_READOUT_AGENT_URL
  ?? "https://bare-cedar-fog.561.group/a2a/mathematical-readout-exchange/.well-known/agent-card.json";

export function normalizedCoordinationGraph(groupSummaries) {
  const directories = new Set();
  const edges = new Set();
  for (const group of groupSummaries) {
    const spanned = [...new Set(group.peers.map((peer) => dirname(peer)))];
    for (const directory of spanned) directories.add(directory);
    for (let left = 0; left < spanned.length; left += 1) {
      for (let right = left + 1; right < spanned.length; right += 1) {
        const endpoints = [spanned[left], spanned[right]].sort(compareText);
        edges.add(JSON.stringify(endpoints));
      }
    }
  }
  return Object.freeze({
    vertices: Object.freeze([...directories].sort(compareText)),
    edges: Object.freeze([...edges].map((edge) => Object.freeze(JSON.parse(edge)))
      .sort(([leftA, rightA], [leftB, rightB]) => compareText(leftA, leftB) || compareText(rightA, rightB))),
  });
}

export function requestCoordinationReadout(
  groupSummaries,
  { agentUrl = DEFAULT_READOUT_AGENT_URL, request = requestRelationalGraphReadout } = {},
) {
  return request({ agentUrl, graph: normalizedCoordinationGraph(groupSummaries) });
}
