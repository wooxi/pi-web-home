#!/usr/bin/env node
// Published entry point: one process that serves the built front end and the
// API, so `npx pi-web-home` is the whole install story.
//
// 8319 is what the dev server shows in the address bar, so the installed CLI
// uses the same number instead of asking you to remember a second one. Both
// defaults are only applied when nothing else set them — an explicit
// `PI_WEB_HOME_PORT` or `PI_WEB_HOME_OPEN=0` still wins.
process.env.PI_WEB_HOME_PORT ??= "8319";
process.env.PI_WEB_HOME_OPEN ??= "1";

await import("../server/build/index.js");
