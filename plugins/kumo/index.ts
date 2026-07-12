export default async function kumoPlugin() {
  return {
    config(cfg: { agent?: Record<string, Record<string, unknown>> }) {
      cfg.agent = {
        ...cfg.agent,
        title: {
          ...cfg.agent?.title,
          model: "opencode/big-pickle",
        },
        summary: {
          ...cfg.agent?.summary,
          model: "opencode/big-pickle",
        },
        explore: {
          ...cfg.agent?.explore,
          model: "opencode/big-pickle",
        },
      }
    },
  }
}
