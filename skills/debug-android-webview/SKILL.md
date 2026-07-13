---
name: debug-android-webview
description: Use when debugging WebView pages in Android emulator, especially for investigating blank pages, JavaScript errors, or compatibility issues on old WebView versions (e.g., Chrome 37 on Android 5.0)
---

# Debug Android WebView via CDP

## Overview

Connect Android emulator's WebView to Chrome DevTools Protocol (CDP) for full debugging — console, network, DOM, runtime. Works with any app that uses WebView (Via, Chrome, WebView-based apps).

**IMPORTANT:** All temporary dependencies (e.g., `ws` npm package) must be installed in the system temp directory (`/tmp/`), never in the project workspace.

## Prerequisites

- Android emulator running with target app installed
- App must have `WebView.setWebContentsDebuggingEnabled(true)` enabled (or use a browser that enables it, like Via)

## Workflow

### 1. Start Emulator and Launch App

```bash
emulator -avd <avd-name> -no-snapshot &
adb shell am start -n <package>/<activity> -d "<url>"
```

### 2. Find WebView Debug Socket

```bash
adb shell cat /proc/net/unix | grep webview
# → @webview_devtools_remote_<pid>
```

### 3. Forward Port

```bash
adb forward --remove tcp:9222 2>/dev/null
adb forward tcp:9222 "localabstract:webview_devtools_remote_$(adb shell ps | grep <package> | awk '{print $2}')"
```

### 4. Verify Connection

```bash
curl -s http://localhost:9222/json
```

Returns JSON list of debuggable pages with `id`, `title`, `url`, `webSocketDebuggerUrl`.

### 5. Connect CDP via WebSocket

```bash
# Install ws in temp dir (do NOT pollute project workspace)
mkdir -p /tmp/webview-debug && cd /tmp/webview-debug && npm init -y --silent 2>/dev/null && npm install ws --silent 2>&1 | tail -1

# Connect and evaluate JavaScript
node -e "
const WebSocket = require('/tmp/webview-debug/node_modules/ws');
const ws = new WebSocket('ws://localhost:9222/devtools/page/<pageId>');
ws.on('open', () => {
  ws.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression:'document.documentElement.outerHTML'}}));
  ws.send(JSON.stringify({id:2, method:'Console.enable', params:{}}));
});
ws.on('message', (data) => {
  const j = JSON.parse(data.toString());
  if (j.method === 'Console.messageAdded') {
    console.log('CONSOLE', j.params.message.level + ':', j.params.message.text);
  } else if (j.id === 1) {
    console.log(j.result?.result?.value);
  }
});
"
```

### 6. Open DevTools Frontend in Chrome

```bash
# Get the devtoolsFrontendUrl from /json output
PAGE_ID=$(curl -s http://localhost:9222/json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
open "http://chrome-devtools-frontend.appspot.com/serve_rev/@180870/devtools.html?ws=localhost:9222/devtools/page/$PAGE_ID"
```

## Common CDP Commands

| Purpose          | Method              | Expression                                  |
| ---------------- | ------------------- | ------------------------------------------- |
| Get HTML         | `Runtime.evaluate`  | `document.documentElement.outerHTML`        |
| Get body         | `Runtime.evaluate`  | `document.body.innerHTML.substring(0,5000)` |
| Check readyState | `Runtime.evaluate`  | `document.readyState`                       |
| Get location     | `Runtime.evaluate`  | `window.location.href`                      |
| Get title        | `Runtime.evaluate`  | `document.title`                            |
| Get UA           | `Runtime.evaluate`  | `window.navigator.userAgent`                |
| Enable console   | `Console.enable`    | -                                           |
| Enable network   | `Network.enable`    | -                                           |
| Check version    | GET `/json/version` | -                                           |

## Troubleshooting

### "Target is being inspected"

The page is already attached to another debugger. Close and reopen the app:

```bash
adb shell am force-stop <package>
# wait a moment, then relaunch
```

### "No space left on device"

Emulator disk full. Clean up:

```bash
brew cleanup --prune=all
pnpm store prune
rm -rf ~/Library/Caches/CocoaPods/*
rm -rf ~/Library/Developer/Xcode/DerivedData/*
```

### WebSocket connects but no response

The page might be in a broken state (e.g., JavaScript context not initialized). Wait for page to fully load before sending commands.

### `chrome://inspect` doesn't show WebView

Modern Chrome DevTools may not be compatible with old WebView CDP protocol versions. Always use the `devtoolsFrontendUrl` from `/json` response instead.

## Cleanup

```bash
adb emu kill
adb forward --remove-all
rm -rf /tmp/webview-debug
```

## Version Info

Check WebView version:

```bash
adb shell dumpsys package com.android.webview | grep versionName
# → versionName=37 (8789838-arm64)
```

Check CDP version and UA:

```bash
curl -s http://localhost:9222/json/version
```
