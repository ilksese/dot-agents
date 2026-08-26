---
description: 使用 unified diff 预告将如何修改文件或代码，但不实际编辑
---

请预告你会如何修改文件或代码，但不要编辑任何文件，也不要执行写入操作。

用户请求：

```text
$ARGUMENTS
```

按以下流程执行：

1. 只查看理解这次修改所需的文件和符号。
2. 找出符合现有代码风格的最小可行改动。
3. 使用 unified diff 输出精确的拟修改内容。
4. 如果需要新增文件，在 diff 中用 `/dev/null` 作为旧路径。
5. 如果请求有歧义，选择最安全的合理默认值，并在 diff 后说明假设。

输出格式：

```diff
diff --git a/path/to/file b/path/to/file
--- a/path/to/file
+++ b/path/to/file
@@ ...
```

diff 之后最多补充三条简短说明，覆盖假设、跳过的工作，或真正应用改动后应运行的验证。
