import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizedCoordinationGraph,
  requestCoordinationReadout,
} from "../src/lib/coordination-readout.mjs";

const groups = [
  { peers: ["a/one.json", "b/one.json"] },
  { peers: ["b/two.json", "c/two.json"] },
  { peers: ["a/three.json", "c/three.json"] },
];

test("CMT retains incidence projection and contracts normalized graph metrology", async () => {
  assert.deepEqual(normalizedCoordinationGraph(groups), {
    vertices: ["a", "b", "c"],
    edges: [["a", "b"], ["a", "c"], ["b", "c"]],
  });
  const observed = await requestCoordinationReadout(groups, {
    agentUrl: "https://readout.example/.well-known/agent-card.json",
    request: async ({ agentUrl, graph }) => {
      assert.equal(agentUrl, "https://readout.example/.well-known/agent-card.json");
      assert.deepEqual(graph, {
        vertices: ["a", "b", "c"],
        edges: [["a", "b"], ["a", "c"], ["b", "c"]],
      });
      return { components: 1, h0rank: 1, h1rank: 1, coordinationCost: 1 };
    },
  });
  assert.deepEqual(observed, { components: 1, h0rank: 1, h1rank: 1, coordinationCost: 1 });
});
