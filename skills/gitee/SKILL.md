---
name: gitee
description: 使用 Gitee REST API v5 查看当前账号可见的仓库，以及创建、查询或合并 Pull Request。用户提到 Gitee 仓库列表、我的码云仓库、Gitee PR、码云 PR、创建或合并 Gitee Pull Request、Gitee access token、Gitee API 时使用本技能。
allowed-tools: Bash(*)
---

# Gitee API

使用 Gitee REST API v5 查看仓库或操作 Pull Request。只从环境变量 `GITEE_TOKEN` 读取访问令牌，不输出或写入令牌。

## 准备

1. 确认 `GITEE_TOKEN` 已设置；未设置时停止并要求用户配置。
2. 查看当前账号的仓库不需要 `owner/repo`；操作 PR 时，从用户输入获取 `owner`、`repo`、源分支和目标分支。未提供 `owner/repo` 时，可从当前仓库的 Gitee `origin` URL 推导；无法可靠推导时询问用户。
3. 创建 PR 前确认源分支已推送。合并 PR 前确认用户明确要求合并；不要因创建成功而自动合并。
4. 使用临时文件保存 API 响应，并在结束时删除。

API 基址：`https://gitee.com/api/v5`

## 查看仓库

用户询问“我有哪些 Gitee 仓库”“查看码云仓库”等当前账号范围的问题时，调用：

```text
GET /user/repos
```

默认查询全部可见仓库，按最近更新时间降序排列。每页最多取 100 条；结果达到 100 条时继续请求下一页，直到返回不足 100 条。

```bash
RESPONSE_DIR=$(mktemp -d "${TMPDIR:-/tmp}/gitee-repos.XXXXXX")
trap 'rm -rf "$RESPONSE_DIR"' EXIT

PAGE=1
: > "$RESPONSE_DIR/repos.ndjson"

while true; do
  curl --fail-with-body --silent --show-error --get \
    "https://gitee.com/api/v5/user/repos" \
    --data-urlencode "access_token=${GITEE_TOKEN}" \
    --data-urlencode "type=all" \
    --data-urlencode "sort=updated" \
    --data-urlencode "direction=desc" \
    --data-urlencode "page=${PAGE}" \
    --data-urlencode "per_page=100" \
    -o "$RESPONSE_DIR/page.json"

  COUNT=$(jq 'length' "$RESPONSE_DIR/page.json")
  jq -c '.[]' "$RESPONSE_DIR/page.json" >> "$RESPONSE_DIR/repos.ndjson"
  [ "$COUNT" -lt 100 ] && break
  PAGE=$((PAGE + 1))
done

jq -s -r '.[] | [
  .full_name,
  (if .private then "私有" else "公开" end),
  (if .fork then "Fork" else "自有" end),
  .updated_at,
  (.html_url | sub("\\.git$"; "")),
  (.description // "")
] | @tsv' "$RESPONSE_DIR/repos.ndjson"
```

若用户明确指定范围，可将 `type=all` 改为 `owner`、`public`、`private` 或 `member`。不要把“当前账号可见”误写成“当前账号拥有”；组织仓库和成员仓库可能也会出现在结果中。

## 创建 PR

调用：

```text
POST /repos/{owner}/{repo}/pulls
```

必填表单参数：

- `title`：PR 标题
- `head`：源分支；跨仓库时使用 `path_with_namespace:branch`
- `base`：目标分支

可选参数包括 `body`、`assignees`、`testers`、`labels`、`draft`、`squash`、`prune_source_branch` 和 `close_related_issue`。只传用户明确要求或能从仓库事实可靠确定的参数。

```bash
RESPONSE_FILE=$(mktemp "${TMPDIR:-/tmp}/gitee-pr.XXXXXX")

curl --fail-with-body --silent --show-error \
  -X POST \
  "https://gitee.com/api/v5/repos/${OWNER}/${REPO}/pulls?access_token=${GITEE_TOKEN}" \
  -F "title=${PR_TITLE}" \
  -F "head=${HEAD_BRANCH}" \
  -F "base=${BASE_BRANCH}" \
  -F "body=<${BODY_FILE}" \
  -o "$RESPONSE_FILE"
```

成功状态码为 `201`。从 JSON 响应读取 `number` 和可用的 URL 字段；若响应未提供 URL，使用：

```text
https://gitee.com/{owner}/{repo}/pulls/{number}
```

## 合并 PR

调用：

```text
PUT /repos/{owner}/{repo}/pulls/{number}/merge
```

`merge_method` 支持：

- `merge`：合并全部提交，默认值
- `squash`：压缩后合并
- `rebase`：变基后合并

未指定合并方式时使用 `merge`。删除源分支、关闭关联 Issue 只在用户明确要求时启用。

```bash
curl --fail-with-body --silent --show-error \
  -X PUT \
  "https://gitee.com/api/v5/repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/merge?access_token=${GITEE_TOKEN}" \
  -F "merge_method=${MERGE_METHOD:-merge}" \
  -F "prune_source_branch=${PRUNE_SOURCE_BRANCH:-false}" \
  -F "close_related_issue=${CLOSE_RELATED_ISSUE:-false}"
```

成功状态码为 `200`。仓库保护规则、审批人数、测试要求或冲突可能阻止合并；返回失败时报告 API 响应，不要绕过保护规则或反复重试。

## 检查是否已合并

```bash
curl --silent --show-error -o /dev/null -w '%{http_code}' \
  "https://gitee.com/api/v5/repos/${OWNER}/${REPO}/pulls/${PR_NUMBER}/merge?access_token=${GITEE_TOKEN}"
```

- `204`：已合并
- `404`：未合并或 PR 不存在

## 输出

查看仓库时返回：

- 仓库总数，以及公开、私有、Fork 数量
- 仓库全名、可见性、是否 Fork、最近更新时间和可点击 URL
- 用户要求时补充描述，或按命名空间、可见性筛选

操作 PR 时返回：

- 执行的操作：创建或合并
- 仓库、源分支和目标分支
- PR 编号与 URL
- 合并方式及是否删除源分支
- API 错误或仓库规则导致的阻塞项

不要在输出、日志或错误摘要中包含 `GITEE_TOKEN`。

官方文档：https://gitee.com/api/v5/swagger
