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
      h(SectionTitle, { title: "Authority Map / 权力图", subtitle: "Who can write live state. Read-only view. / 谁能写入实盘状态，只读展示。" }),
      h("div", { className: "tr-authority-grid" },
        authorityList("Can place orders / 可下单权力源", can, "tr-dot-red"),
        authorityList("Watchdog only / 仅监控", watch, "tr-dot-blue"),
        authorityList("Unknown live writers / 未知实盘写入源", unknown, unknown.length ? "tr-dot-red" : "tr-dot-green")
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
      h(SectionTitle, { title: "Risk Event Stream / 风险事件流", subtitle: "Recent state reasons, not raw noisy tracebacks. / 只显示状态原因，不喷原始噪音 traceback。" }),
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
      h(SectionTitle, { title: "Data Artifacts / 数据工件", subtitle: "Dashboard reads these JSON files; missing means demo fallback. / 看板读取这些 JSON；缺失则回退演示数据。" }),
      h("div", { className: "tr-artifacts" }, Object.keys(artifacts).map((name) => {
        const a = artifacts[name];
        return h("div", { className: "tr-artifact", key: name },
          h("div", null, h("strong", null, name), h("small", null, a.path)),
          label(a.freshness || "unknown", a.freshness === "fresh" ? "NORMAL" : a.freshness === "missing" ? "DEGRADED" : "CAUTION")
        );
      }))
    );
  }

  function OtherAutomation({ items }) {
    items = items || [];
    if (!items.length) return null;
    return h(Card, null,
      h(SectionTitle, { title: "Other Active Automation / 其他正在跑的自动化", subtitle: "Not counted as current real-money bots unless Obsidian says live authority + live positions. / 不等于真钱机器人，除非 Obsidian 明确有真钱权限和仓位。" }),
      h("div", { className: "tr-list" }, items.map((it, i) => h("div", { className: "tr-row", key: it.name || i },
        h("div", { className: "tr-row-main" },
          h("div", { className: "tr-row-title" }, it.name || "Automation"),
          h("div", { className: "tr-row-sub" }, [it.platform, it.category, it.source].filter(Boolean).join(" · "))
        ),
        h("div", { className: "tr-row-meta" },
          label(it.state || "UNKNOWN", it.state && it.state.indexOf("ERROR") === 0 ? "DEGRADED" : "WATCH"),
          label(it.authority || "UNKNOWN", it.authority),
          h("div", { className: "tr-mini" }, "counted real money: " + boolText(!!it.counted_real_money))
        )
      )))
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
          h("p", { className: "tr-eyebrow" }, "TRADING RISK CONSOLE · READ ONLY / 交易风控中枢 · 只读"),
          h("h1", null, "Risk Dashboard / 风控看板"),
          h("p", { className: "tr-hero-sub" }, summary.reason || "Unified bot, venue, authority, and execution state. / 统一展示机器人、平台、权力源与执行链状态。")
        ),
        h("div", { className: "tr-hero-state" },
          label(summary.state || data.global_state || "UNKNOWN", summary.state || data.global_state),
          h("span", null, data.mode === "mock" ? "mock data" : "artifact data"),
          h("span", null, "refresh: 30s"),
          h("span", null, data.generated_at ? "updated " + relative(data.generated_at) : "")
        )
      ),

      h("div", { className: "tr-metrics-grid" },
        h(Metric, { label: "Global State / 全局状态", value: summary.state || data.global_state || "UNKNOWN", hint: "NORMAL → CAUTION → DE_RISK → PAUSE_ENTRY → CLOSE_ONLY" }),
        h(Metric, { label: "Live Writers / 实盘写入源", value: String(metrics.live_writers ?? "—"), hint: "registered order-capable processes / 已登记可下单进程" }),
        h(Metric, { label: "Venues / 平台", value: String(metrics.venues ?? venues.length), hint: "platform / counterparty view / 平台与交易对手视图" }),
        h(Metric, { label: "Open Positions / 持仓数", value: String(metrics.open_positions ?? "—"), hint: "from private-read or ledger / 来自只读私有接口或 ledger" }),
        h(Metric, { label: "Alerts 24h / 24h 告警", value: String(metrics.alerts_24h ?? 0), hint: "deduped, not raw traceback spam / 去重后告警，不算 traceback 噪音" })
      ),

      h(Card, null,
        h(SectionTitle, { title: "Allowed / Blocked Actions / 允许与禁止动作", subtitle: "v0 only displays policy; it does not execute anything. / v0 只展示策略，不执行任何交易动作。" }),
        h("div", { className: "tr-policy" },
          h("div", null, h("h3", null, "Allowed"), h("ul", null, (summary.allowed_actions || []).map((x, i) => h("li", { key: i }, x)))),
          h("div", null, h("h3", null, "Blocked"), h("ul", null, (summary.blocked_actions || []).map((x, i) => h("li", { key: i }, x))))
        )
      ),

      h(Card, null,
        h(SectionTitle, { title: "Money Bots / 真钱机器人", subtitle: "Execution-chain status. Process-alive is not enough. / 看执行链状态，进程活着不等于健康。" }),
        h("div", { className: "tr-list" }, bots.map((bot, i) => h(BotRow, { bot: bot, key: bot.name || i })))
      ),

      h(OtherAutomation, { items: data.other_active_automation }),

      h("div", { className: "tr-venues-grid" }, venues.map((venue, i) => h(VenueCard, { venue: venue, key: venue.name || i }))),
      h(AuthorityMap, { authority: data.authority_map || {} }),
      h(Events, { events: data.events || [] }),
      h(Artifacts, { artifacts: data.artifacts })
    );
  }

  REG.register("trading-risk", RiskDashboard);
})();
