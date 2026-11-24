# dsh-mark-unread

**Mark as unread** for DeepSeek Harness sessions — one extra row in every Session's `...` menu, and a dot that behaves exactly like the shipped completion dot.

中文说明见下方 [中文](#中文说明)。

## Why

DeepSeek Harness grows a green dot on a Session row when a background Session finishes, and drops that dot the moment you open the Session. There is no way to put the dot back, so a Session you deliberately postponed — or one whose answer you still have to act on — cannot be flagged for later. Starring and pinning both change the sidebar's order, which is not what "remind me about this one" means.

This bundle adds the missing action. It writes nothing into the Session log, touches no Session data, and makes no network request off your machine.

## What you get

| Where | What |
| :---: | --- |
| Session `...` menu, between **Pin** and **Rename** (order 150) | A **Mark as unread** row. Choose it again (**Mark as read**) to clear the mark by hand. |
| Session row, in the 16px cell before the title | A green dot: same 10px box and 6px solid core as the shipped completion dot, painted with `--dsw-alias-state-success-primary`. |
| Opening the Session | The dot clears itself. The mark is consumed by the same signal the shipped dot uses (`retainedBy.mainView > 0`), so the two dots disappear at the same moment. |

Two details worth knowing:

- Marking the Session you are reading right now keeps the dot visible instead of eating it immediately. It clears when you switch away and come back, so the click always has visible feedback.
- Marks are personal UI state. They live in `~/.dsh/mark-unread/state.json` (or `$DSH_PROFILE_DIR/mark-unread/state.json` when that variable is set), survive a restart, and are never mixed into Session data.

## Install

From the plugin market: open the **Plugins** page, find this entry, install it, then reload the page.

By spec, from the same machine DSH runs on:

```sh
dsh plugin --profile desktop add github:Refreshing-CZQ/dsh-mark-unread
```

Swap `desktop` for the profile you actually run. A release tarball works the same way:

```sh
dsh plugin --profile desktop add https://github.com/Refreshing-CZQ/dsh-mark-unread/releases/download/v1.1.0/dsh-mark-unread-1.1.0.tgz
```

An already-running GUI picks up the browser half on reload (`Ctrl+R`); the host half needs a restart only when this plugin's host code changes.

## How it works

Two Slot contributions on seats the sidebar browser already declares:

- `sidebar.workspaces.session.menu.item`, `order: 150` — the menu row. It reads the shipped `useMenuOpenState()` injected hook to close the menu before it toggles, the same way the shipped rows do.
- `sidebar.session.row.leading` — the dot. That seat is the 16px cell the row's own state dot otherwise occupies, and it is mounted only while the row's primary state is idle, so the two dots never render side by side.

The browser half holds the marks in memory and talks to this bundle's own host half over one private same-origin route:

- `GET /_dsh/mark-unread` returns the stored ids.
- `POST /_dsh/mark-unread` takes `{ sessionId, unread }` and requires the `x-dsh-mark-unread: 1` header, so a cross-site form post cannot write it.
- Storage is one JSON file, atomically replaced, capped at 400 ids.

Routing the store through the host is deliberate: the Web GUI binds an OS-assigned port, so its origin — and therefore `localStorage` — changes between launches. A mark kept in `localStorage` would not survive a restart.

The browser half imports no Harness client package. Row markup and metrics follow the shipped menu row (34px minimum height, 6px 8px padding, 6px gap, radius and hover from `--dsw-alias-*` tokens), and all visible text goes through the client locale service in `zh` and `en`.

## Compatibility

- Declares `engines.dsh: >=0.2.0`; uses only the `sidebar.workspaces.session.menu.item` and `sidebar.session.row.leading` seats and the standard `useSessionRetainInfo` / `useMenuOpenState` hooks.
- Colors come from `--dsw-alias-*` theme tokens, so light and dark themes both work.
- Web GUI and DSH Desktop NEXT. No native dependency, no build step.

## Uninstall

```sh
dsh plugin --profile desktop remove dsh-mark-unread
```

Or switch it off on the **Plugins** page. Marks live in one file; delete `~/.dsh/mark-unread/` to drop them too.

## License

MIT.

## 中文说明

给 DSH 会话的「...」菜单加一行「标为未读」，并在会话行前显示一颗绿点。

- **为什么要有**：DSH 会在后台会话跑完时给会话行点一颗绿点，你打开会话它就消失，但没有办法把它重新点回来。想标记「这个我待会儿还要接着处理」时，只能置顶或加星，而那会打乱侧边栏顺序。
- **点在哪**：菜单里在「置顶会话」和「重命名」之间；圆点在标题前那格 16px 的空位，几何和颜色都跟原生完成点一致（10px 盒子 + 6px 实心核，取 `--dsw-alias-state-success-primary`）。
- **什么时候消失**：打开会话就消失，用的是原生那颗点同一个「正在看」信号（`retainedBy.mainView > 0`）。给正在看的会话标未读时，圆点先留着，等你切走再切回来才被消费，避免点了没反馈。
- **存在哪**：`~/.dsh/mark-unread/state.json`（设置了 `DSH_PROFILE_DIR` 时在 profile 目录下），重启仍在。这是你自己的界面状态，不写进会话日志，也不上传到任何地方。
- **怎么装**：插件页里搜索本插件安装，或者 `dsh plugin --profile desktop add github:Refreshing-CZQ/dsh-mark-unread`，把 `desktop` 换成你实际用的 profile。装完刷新页面（`Ctrl+R`）。
- **怎么卸**：`dsh plugin --profile desktop remove dsh-mark-unread`，或在插件页关掉。
