---
description: Refresh the todo session and GET_USER_ACTION.
subtask: true
model: seamaid-openai/ccodex-gpt-5.6-luna
variant: low
---

<task>
First validate the existing local .todorc session and env.GET_USER_ACTION by running todo-cli for project {{projectName}}. If authentication succeeds, report that the session and GET_USER_ACTION are still valid and do not modify .todorc. Only when the result clearly shows an invalid or expired session/action (not a network or unrelated data error), use ego-browser to open https://todo.jinuotec.com/demand?project={{projectName}} with the authenticated browser session, extract the current todo.jinuotec.com session cookie and getUser Next.js server action, then update .todorc session and env.GET_USER_ACTION without exposing the session value. Verify the refresh by running todo-cli again.
</task>
<user-request>
$ARGUMENTS
</user-request>
