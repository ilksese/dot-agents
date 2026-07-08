---
description: 海妖项目debug
agent: seamaid-code
---

# 海妖项目 Debug

## 任务目标

这是一个 bug 定位和修复方案制定任务。

- 先定位问题的根本原因。
- 再制定修复方案。
- 不要直接修改代码。
- 过程中可以选择性使用 chrome-devtools-mcp 辅助调试。

## 输入参数

- 原始输入：`$ARGUMENTS`
- 环境：`$1`，可选
- issue：`$2...`，根据参数解析规则从剩余输入中提取

## 环境说明

- `dev`：开发环境
- `pre`：预览环境

## 端类型说明

- `mobile`：移动端
- `pc`：PC 端、桌面端
- `both`：移动端和 PC 端都有问题

## 参数解析规则

- 保留位置参数优先级，但允许用户使用自然语言输入。
- 先从 `$ARGUMENTS` 中识别环境，再识别端类型，剩余内容作为 issue。
- 环境可选。用户未明确指定 `dev` 或 `pre` 时，默认使用 `dev`。
- 端类型必需。用户未明确指定移动端、PC 端或双端时，先向用户提问：移动端、PC 端还是双端都有问题？不要继续定位。
- 端类型可从自然语言中推断：
  - 移动端、手机端、H5、mobile -> `mobile`
  - PC 端、PC端、桌面端、web、desktop -> `pc`
  - 双端、移动和 PC、移动和PC、全端、都不工作 -> `both`
- issue 为去除环境和端类型后的剩余问题描述。
- 如果 `$1` 不是 `dev` 或 `pre`，不要把它当作环境；默认环境为 `dev`，并把 `$ARGUMENTS` 作为 issue 候选继续解析。
- 如果端类型词和 issue 连在一起，例如 `移动端个人中心登录按钮点击不了`，应先识别前缀端类型，再把剩余文本作为 issue。

## 输入示例

- `/seamaid-debug dev mobile 首页轮播图不工作`
  - 环境：`dev`
  - 端类型：`mobile`
  - issue：`首页轮播图不工作`
- `/seamaid-debug 首页轮播图不工作`
  - 环境：`dev`
  - 端类型：未指定，先询问用户：移动端、PC 端还是双端都有问题？
  - issue：`首页轮播图不工作`
- `/seamaid-debug pre 首页轮播图不工作`
  - 环境：`pre`
  - 端类型：未指定，先询问用户：移动端、PC 端还是双端都有问题？
  - issue：`首页轮播图不工作`
- `/seamaid-debug 移动端个人中心登录按钮点击不了`
  - 环境：`dev`
  - 端类型：`mobile`
  - issue：`个人中心登录按钮点击不了`
- `/seamaid-debug pc端订单列表筛选条件不生效`
  - 环境：`dev`
  - 端类型：`pc`
  - issue：`订单列表筛选条件不生效`
- `/seamaid-debug pre 首页轮播图移动端和PC都不工作`
  - 环境：`pre`
  - 端类型：`both`
  - issue：`首页轮播图移动端和PC都不工作`

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
