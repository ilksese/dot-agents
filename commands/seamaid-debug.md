---
description: 海妖项目debug
agent: HY-Agent
---

# 海妖项目 Debug

## 任务目标

这是一个 bug 定位和修复方案制定任务。

- 先定位问题的根本原因。
- 再制定修复方案。
- 不要直接修改代码。
- 过程中可以选择性使用 chrome-devtools-mcp 辅助调试。

## 输入参数

- 环境：`$1`
- issue：`$2`

## 环境说明

- `dev`：开发环境
- `pre`：预览环境

## Web 服务规则

- 使用 `pm2 list` 检查是否有可以直接复用的服务。
- 启动开发环境：`pm2 start 'pnpm run dev' --name <env:project_name>`。
- 启动预览环境：`pm2 start 'npx next start -p 3000' --name <env:project_name>`。
- 如果端口被占用，自动切换端口。

## 浏览器规则

- 访问移动端时，视图大小设置为 `375*667`。
- DPR 设置为 `3`。
- User-Agent 使用 `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36`。
- 访问和切换页面路由时，遵循项目中的 `@middleware.ts` 或 `@proxy.ts`。

## 测试规则

- 组件、页面单例测试和 e2e 测试使用 `@testing-library/react`。
- 通过编写 `[component].test.tsx` 进行测试。
- 测试通过后，再使用浏览器进行 UI/UX 验收检查。
- Web 服务使用 pm2 管理。
- 禁止执行构建脚本，例如 `pnpm run build`。
- 构建任务需要让用户手动执行。
