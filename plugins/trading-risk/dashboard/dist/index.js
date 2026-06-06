(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  const REG = window.__HERMES_PLUGINS__;
  if (!SDK || !REG) return;

  const React = SDK.React;
  const h = React.createElement;
  const hooks = SDK.hooks;
  const C = SDK.components;
  const timeAgo = SDK.utils.isoTimeAgo || SDK.utils.timeAgo;

  function api(path) {
    return SDK.fetchJSON("/api/plugins/trading-risk" + path);
  }

  const STATE_CLASS = {
    NORMAL: "tr-state-normal",
    CAUTION: "tr-state-caution",
    DE_RISK: "tr-state-derisk",
    PAUSE_ENTRY: "tr-state-pause",
    CLOSE_ONLY: "tr-state-close",
    DEGRADED: "tr-state-degraded",
    WATCH: "tr-state-watch",
    DATA_ONLY: "tr-state-data",
  };

  function clsState(state) {
    return STATE_CLASS[state] || "tr-state-unknown";
  }

  function label(text, state) {
    return h("span", { className: "tr-badge " + clsState(state || text) }, text || "UNKNOWN");
  }

  function Card(props) {
    return h("section", { className: "tr-card " + (props.className || "") }, props.children);
  }

  function SectionTitle({ title, subtitle }) {
    return h("div", { className: "tr-section-title" },
      h("div", null, h("h2", null, title), subtitle ? h("p", null, subtitle) : null)
    );
  }

  function Metric({ label, value, hint }) {
    return h(Card, { className: "tr-metric" },
      h("div", { className: "tr-metric-label" }, label),
      h("div", { className: "tr-metric-value" }, value),
      hint ? h("div", { className: "tr-metric-hint" }, hint) : null
    );
  }

  function BotRow({ bot }) {
    return h("div", { className: "tr-row" },
      h("div", { className: "tr-row-main" },
        h("div", { className: "tr-row-title" }, bot.name || "Unnamed bot"),
        h("div", { className: "tr-row-sub" }, [bot.platform, bot.strategy].filter(Boolean).join(" · ")),
        bot.notes ? h("div", { className: "tr-row-note" }, bot.notes) : null
      ),
      h("div", { className: "tr-row-meta" },
        label(bot.authority || "UNKNOWN", bot.authority),
        label(bot.state || "UNKNOWN", bot.state),
        h("div", { className: "tr-mini" }, "signal: " + (bot.last_signal || "—")),
        h("div", { className: "tr-mini" }, "order: " + (bot.last_order || "—")),
        h("div", { className: "tr-mini" }, "fill: " + (bot.last_fill || "—")),
        h("div", { className: "tr-mini" }, "match: " + boolText(bot.position_match)),
        h("div", { className: "tr-mini" }, "stop: " + boolText(bot.stop_coverage))
      )
    );
  }

  function boolText(value) {
    if (value === true) return "yes";
    if (value === false) return "no";
    return "n/a";
  }

  function VenueCard({ venue }) {
    return h(Card, { className: "tr-venue" },
      h("div", { className: "tr-venue-head" },
        h("strong", null, venue.name || "Venue"),
        label(venue.state || "UNKNOWN", venue.state)
      ),
      h("div", { className: "tr-kv" }, h("span", null, "exposure"), h("b", null, venue.exposure || "—")),
      h("div", { className: "tr-kv" }, h("span", null, "private read"), h("b", null, venue.private_read || "—")),
      h("div", { className: "tr-kv" }, h("span", null, "freshness"), h("b", null, venue.freshness || "—"))
    );
  }

  function AuthorityMap({ authority }) {
    const can = authority && authority.can_place_orders ? authority.can_place_orders : [];
    const watch = authority && authority.watchdog_only ? authority.watchdog_only : [];
    const unknown = authority && authority.unknown_live_writers ? authority.unknown_live_writers : [];
    return h(Card, null,
      h(SectionTitle, { title: "Authority Map", subtitle: "Who can write live state. Read-only view." }),
      h("div", { className: "tr-authority-grid" },
        authorityList("Can place orders", can, "tr-dot-red"),
        authorityList("Watchdog only", watch, "tr-dot-blue"),
        authorityList("Unknown live writers", unknown, unknown.length ? "tr-dot-red" : "tr-dot-green")
      )
    );
  }

  function authorityLabel(it) {
    if (!it || typeof it !== "object") return String(it);
    const parts = [];
    if (it.name) parts.push(it.name);
    if (it.permission) parts.push(it.permission);
    if (it.bot) parts.push(it.bot);
    if (it.type) parts.push(it.type);
    return parts.join(" · ") || JSON.stringify(it);
  }

  function authorityList(title, items, dot) {
    return h("div", { className: "tr-authority" },
      h("h3", null, h("span", { className: "tr-dot " + dot }), title),
      items.length ? h("ul", null, items.map((it, i) => h("li", { key: i }, authorityLabel(it)))) : h("p", { className: "tr-muted" }, "none")
    );
  }

  function Events({ events }) {
    return h(Card, null,
      h(SectionTitle, { title: "Risk Event Stream", subtitle: "Recent state reasons, not raw noisy tracebacks." }),
      h("div", { className: "tr-events" }, (events || []).map((ev, i) =>
        h("div", { className: "tr-event", key: i },
          label(ev.level || "INFO", ev.level),
          h("span", { className: "tr-event-time" }, ev.ts ? relative(ev.ts) : "—"),
          h("span", { className: "tr-event-msg" }, ev.message || "")
        )
      ))
    );
  }

  function relative(iso) {
    try {
      if (SDK.utils.isoTimeAgo) return SDK.utils.isoTimeAgo(iso);
      return SDK.utils.timeAgo(new Date(iso).getTime());
    } catch (_) {
      return iso;
    }
  }

  function Artifacts({ artifacts }) {
    if (!artifacts) return null;
    return h(Card, null,
      h(SectionTitle, { title: "Data Artifacts", subtitle: "Dashboard reads these JSON files; missing means demo fallback." }),
      h("div", { className: "tr-artifacts" }, Object.keys(artifacts).map((name) => {
        const a = artifacts[name];
        return h("div", { className: "tr-artifact", key: name },
          h("div", null, h("strong", null, name), h("small", null, a.path)),
          label(a.freshness || "unknown", a.freshness === "fresh" ? "NORMAL" : a.freshness === "missing" ? "DEGRADED" : "CAUTION")
        );
      }))
    );
  }

  function RiskDashboard() {
    const [data, setData] = hooks.useState(null);
    const [err, setErr] = hooks.useState(null);
    const [loading, setLoading] = hooks.useState(true);

    const load = hooks.useCallback(function () {
      api("/status")
        .then(function (payload) {
          setData(payload);
          setErr(null);
          setLoading(false);
        })
        .catch(function (e) {
          setErr(e && e.message ? e.message : String(e));
          setLoading(false);
        });
    }, []);

    hooks.useEffect(function () {
      load();
      const id = setInterval(load, 30000);
      return function () { clearInterval(id); };
    }, [load]);

    if (loading) return h("div", { className: "tr-page" }, h("div", { className: "tr-loading" }, "Loading trading risk dashboard…"));
    if (err) return h("div", { className: "tr-page" }, h(Card, null, h("h2", null, "Risk dashboard load failed"), h("pre", null, err)));

    const summary = data.summary || {};
    const metrics = data.metrics || {};
    const bots = data.bots || [];
    const venues = data.venues || [];

    return h("div", { className: "tr-page" },
      h("header", { className: "tr-hero" },
        h("div", null,
          h("p", { className: "tr-eyebrow" }, "TRADING RISK CONSOLE · READ ONLY"),
          h("h1", null, "Risk Dashboard"),
          h("p", { className: "tr-hero-sub" }, summary.reason || "Unified bot, venue, authority, and execution state.")
        ),
        h("div", { className: "tr-hero-state" },
          label(summary.state || data.global_state || "UNKNOWN", summary.state || data.global_state),
          h("span", null, data.mode === "mock" ? "mock data" : "artifact data"),
          h("span", null, "refresh: 30s"),
          h("span", null, data.generated_at ? "updated " + relative(data.generated_at) : "")
        )
      ),

      h("div", { className: "tr-metrics-grid" },
        h(Metric, { label: "Global State", value: summary.state || data.global_state || "UNKNOWN", hint: "NORMAL → CAUTION → DE_RISK → PAUSE_ENTRY → CLOSE_ONLY" }),
        h(Metric, { label: "Live Writers", value: String(metrics.live_writers ?? "—"), hint: "registered order-capable processes" }),
        h(Metric, { label: "Venues", value: String(metrics.venues ?? venues.length), hint: "platform / counterparty view" }),
        h(Metric, { label: "Open Positions", value: String(metrics.open_positions ?? "—"), hint: "from private-read or ledger" }),
        h(Metric, { label: "Alerts 24h", value: String(metrics.alerts_24h ?? "—"), hint: "deduped, not raw traceback spam" })
      ),

      h(Card, null,
        h(SectionTitle, { title: "Allowed / Blocked Actions", subtitle: "v0 only displays policy; it does not execute anything." }),
        h("div", { className: "tr-policy" },
          h("div", null, h("h3", null, "Allowed"), h("ul", null, (summary.allowed_actions || []).map((x, i) => h("li", { key: i }, x)))),
          h("div", null, h("h3", null, "Blocked"), h("ul", null, (summary.blocked_actions || []).map((x, i) => h("li", { key: i }, x))))
        )
      ),

      h(Card, null,
        h(SectionTitle, { title: "Money Bots", subtitle: "Execution-chain status. Process-alive is not enough." }),
        h("div", { className: "tr-list" }, bots.map((bot, i) => h(BotRow, { bot: bot, key: bot.name || i })))
      ),

      h("div", { className: "tr-venues-grid" }, venues.map((venue, i) => h(VenueCard, { venue: venue, key: venue.name || i }))),
      h(AuthorityMap, { authority: data.authority_map || {} }),
      h(Events, { events: data.events || [] }),
      h(Artifacts, { artifacts: data.artifacts })
    );
  }

  REG.register("trading-risk", RiskDashboard);
})();
