// Material colours Mermaid through its --md-mermaid-* variables (extra.css), but some of Mermaid 11's styles predate
// them: arrowheads, lifelines and group boxes would keep Mermaid's purple and grey. These rules are appended to
// Material's theme CSS before it initialises the pinned Mermaid.
(() => {
  if (typeof mermaid === "undefined") return;
  const rules = `
    .actor-line { stroke: var(--md-mermaid-sequence-actor-line-color) !important; }
    marker[id$="arrowhead"] path { fill: var(--md-mermaid-sequence-message-line-color) !important; stroke: none !important; }
    marker[id$="crosshead"] path { stroke: var(--md-mermaid-sequence-message-line-color) !important; }
    .cluster rect { fill: var(--md-default-bg-color) !important; stroke: var(--md-mermaid-edge-color) !important; stroke-dasharray: 4 3; }
    .edgeLabel, .edgeLabel p { color: var(--md-mermaid-label-fg-color); }
    .stateGroup rect, .statediagram-state rect { fill: var(--md-mermaid-node-bg-color) !important; stroke: var(--md-mermaid-edge-color) !important; }
    .transition { stroke: var(--md-mermaid-edge-color) !important; }
    marker[id$="barbEnd"] path, marker[id$="dependencyEnd"] path { fill: var(--md-mermaid-edge-color) !important; stroke: var(--md-mermaid-edge-color) !important; }
    .state-start circle, .start-state, circle.state-start { fill: var(--md-mermaid-edge-color) !important; stroke: var(--md-mermaid-edge-color) !important; }
  `;
  const initialize = mermaid.initialize.bind(mermaid);
  mermaid.initialize = (config = {}) => initialize({ ...config, themeCSS: (config.themeCSS ?? "") + rules });
})();
