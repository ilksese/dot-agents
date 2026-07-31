type OpenCodeConfig = {
  command?: Record<string, CommandConfig>
}

export type CommandConfig = {
  template: string
  description?: string
  agent?: string
  model?: string
  variant?: string
  subtask?: boolean
}

export const createSeamaidCommands = (config: OpenCodeConfig, projectName: string) => {
  config.command ??= {}
  config.command["todo:defects"] ??= {
    description: "List defects in the current repository.",
    subtask: true,
    model: "seamaid-openai/ccodex-gpt-5.6-luna",
    variant: "low",
    template: `<task>Use the todo-cli tools to get all the pending defects related to me in project ${projectName}.</task>
<user-request>$ARGUMENTS</user-request>`,
  }
  config.command["todo:tasks"] ??= {
    description: "List tasks in the current repository.",
    subtask: true,
    model: "seamaid-openai/ccodex-gpt-5.6-luna",
    variant: "low",
    template: `<task>Use the todo-cli tools to get all the pending tasks related to me in project ${projectName}.</task>
<user-request>$ARGUMENTS</user-request>`,
  }
}
