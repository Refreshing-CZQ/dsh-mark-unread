/**
 * Client half of the mark-unread bundle.
 *
 * Three contributions on shipped Slot seats the sidebar browser declares:
 *   - `sidebar.workspaces.session.row.action` (order 50): the exposed hover
 *     button that sits beside the shipped `archive` (100) and `pin` (200) row
 *     actions, before them. This is the primary control — marking is a frequent
 *     action, so it lives one level above the `...` menu.
 *   - `sidebar.workspaces.session.menu.item` (order 150): the 标为未读 / 标为已读
 *     row. Kept for parity with `pin` and `archive`, which are registered on
 *     both seats; the menu is where a labelled version of the action belongs.
 *   - `sidebar.session.row.leading`: the unread dot in the row's 16px leading cell.
 *
 * The dot mirrors the shipped completion dot: same 10px box with a 6px core,
 * painted with `--dsw-alias-state-success-primary`. It clears itself the same
 * way the shipped one does — once the Session is open in the main view
 * (`retainedBy.mainView > 0`), the mark is consumed. A mark placed on the
 * Session that is already open stays visible until that Session is closed and
 * opened again, so marking while reading still gives feedback.
 *
 * Mark state is owned by this bundle's Host half and reached over one private
 * same-origin route, so marks survive an application restart (the Web GUI binds
 * an OS-assigned port, which would strand a localStorage-only store).
 */
window.__ModuleLoader__.load({
  id: 'dsh-mark-unread',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'mark-unread'
    const ENDPOINT = '/_dsh/mark-unread'
    const SENTINEL = 'x-dsh-mark-unread'

    /** Shared geometry for both exposed controls. */
    const STYLES = `
.dsh-mu-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: none;
  border-radius: var(--dsw-radius-md, 6px);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  text-align: left;
}
.dsh-mu-row:hover,
.dsh-mu-row:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  outline: none;
}
.dsh-mu-icon {
  display: inline-flex;
  flex: none;
  width: 14px;
  height: 14px;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-menu-icon, var(--dsw-alias-label-secondary));
}
.dsh-mu-icon svg { width: 14px; height: 14px; }
.dsh-mu-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Row hover strip: the button beside the shipped archive / pin actions. */
.dsh-mu-action {
  display: inline-flex;
  flex: none;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: var(--dsw-radius-sm, 4px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  cursor: pointer;
}
.dsh-mu-action:hover,
.dsh-mu-action:focus-visible {
  background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2));
  color: var(--dsw-alias-label-primary, inherit);
  outline: none;
}
.dsh-mu-action[data-marked='true'] {
  color: var(--dsw-alias-state-success-primary);
}
.dsh-mu-action svg { width: 14px; height: 14px; }
.dsh-mu-cell {
  display: inline-flex;
  flex: none;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
}
/* Same geometry as the shipped completion dot: 10px box, 6px currentColor core. */
.dsh-mu-dot {
  position: relative;
  display: inline-block;
  flex: none;
  width: 10px;
  height: 10px;
  color: var(--dsw-alias-state-success-primary);
}
.dsh-mu-dot::after {
  content: '';
  position: absolute;
  inset: 20%;
  border-radius: 50%;
  background: currentColor;
}
`

    // ---------------------------------------------------------------- state ---
    const marks = new Set()
    /** Ids whose mark should be consumed by the next open of that Session. */
    const armed = new Set()
    const listeners = new Set()

    function notify() {
      for (const listener of [...listeners]) listener()
    }

    function subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }

    function hasMark(sessionId) {
      return typeof sessionId === 'string' && marks.has(sessionId)
    }

    function replaceIds(ids) {
      marks.clear()
      armed.clear()
      for (const id of ids) {
        marks.add(id)
        armed.add(id)
      }
      notify()
    }

    async function load() {
      if (typeof fetch !== 'function') return
      try {
        const response = await fetch(ENDPOINT, { headers: { accept: 'application/json' } })
        if (!response.ok) return
        const body = await response.json()
        if (Array.isArray(body?.unread)) replaceIds(body.unread)
      } catch (error) {
        console.warn('[mark-unread] could not read the stored marks:', error)
      }
    }

    async function persist(sessionId, unread) {
      if (typeof fetch !== 'function') return
      try {
        const response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', [SENTINEL]: '1' },
          body: JSON.stringify({ sessionId, unread }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body = await response.json()
        if (Array.isArray(body?.unread)) replaceIds(body.unread)
      } catch (error) {
        console.warn('[mark-unread] could not store the mark:', error)
        // Roll back to what the Host still believes, so the dot never lies.
        void load()
      }
    }

    /** Mark one Session unread; a Session open right now stays marked until reopened. */
    function markUnread(sessionId, openNow) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      marks.add(sessionId)
      if (openNow) armed.delete(sessionId)
      else armed.add(sessionId)
      notify()
      void persist(sessionId, true)
    }

    function clearUnread(sessionId) {
      if (typeof sessionId !== 'string' || sessionId === '') return
      if (!marks.delete(sessionId)) return
      armed.delete(sessionId)
      notify()
      void persist(sessionId, false)
    }

    function useMark(sessionId) {
      const snapshot = React.useCallback(() => hasMark(sessionId), [sessionId])
      return React.useSyncExternalStore(subscribe, snapshot, snapshot)
    }

    const mainViewOpen = (info) => (info?.retainedBy?.mainView ?? 0) > 0

    // ---------------------------------------------------------------- icons ---
    function unreadIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 8, cy: 8, r: 5.25, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('circle', { cx: 8, cy: 8, r: 2.1, fill: 'currentColor' }),
      )
    }

    function readIcon() {
      return h(
        'svg',
        { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('circle', { cx: 8, cy: 8, r: 5.25, stroke: 'currentColor', strokeWidth: 1.4 }),
        h('path', {
          d: 'M5.6 8.2 7.2 9.8 10.5 6.4',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
        }),
      )
    }

    // ----------------------------------------------------------- components ---
    /**
     * The exposed row button, in the hover strip beside `archive` and `pin`.
     *
     * The seat hands over the row it belongs to and owns the click plumbing
     * (a click inside the strip never opens the row), so this component only
     * performs the toggle. When the row is unread the glyph turns green and a
     * second click clears the mark by hand.
     */
    function MarkUnreadRowAction(props) {
      const { sessionId, t, useSessionRetainInfo } = props
      const marked = useMark(sessionId)
      const openNow = useSessionRetainInfo(sessionId, mainViewOpen)
      if (typeof sessionId !== 'string') return null
      const label = typeof t === 'function' ? t(marked ? 'row.markRead' : 'row.markUnread') : ''
      return h(
        'button',
        {
          type: 'button',
          className: 'dsh-mu-action',
          'data-marked': marked ? 'true' : 'false',
          'aria-pressed': marked ? 'true' : 'false',
          'aria-label': label,
          title: label,
          onClick: () => {
            if (marked) clearUnread(sessionId)
            else markUnread(sessionId, openNow === true)
          },
        },
        marked ? readIcon() : unreadIcon(),
      )
    }

    /**
     * Replaces the shipped `archive` button in the row's hover strip with nothing.
     *
     * Archive is destructive-ish from the row's perspective: one stray click and the
     * Session leaves the list, which is hard to find again. It stays available in the
     * `...` menu, so the seat is shadowed rather than the action removed. Reusing the
     * shipped id puts this entry in that cell; the seat treats a null render as
     * "this action does not apply to the row" and renders no button.
     */
    function HiddenArchiveRowAction() {
      return null
    }

    /** The `...` menu row: one `role="menuitem"` button joining the shipped rows. */
    function MarkUnreadMenuRow(props) {
      const { sessionId, t, useMenuOpenState, useSessionRetainInfo } = props
      const marked = useMark(sessionId)
      const openNow = useSessionRetainInfo(sessionId, mainViewOpen)
      const menuState = useMenuOpenState()
      const setMenuOpen = Array.isArray(menuState) ? menuState[1] : undefined
      const label = typeof t === 'function' ? t(marked ? 'menu.markRead' : 'menu.markUnread') : ''
      return h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          className: 'dsh-mu-row',
          onClick: () => {
            if (typeof setMenuOpen === 'function') setMenuOpen(false)
            if (marked) clearUnread(sessionId)
            else markUnread(sessionId, openNow === true)
          },
        },
        h('span', { className: 'dsh-mu-icon' }, marked ? readIcon() : unreadIcon()),
        h('span', { className: 'dsh-mu-label' }, label),
      )
    }

    /**
     * The row's leading cell: the unread dot.
     *
     * This is also where a mark is consumed: the row is mounted while its Session
     * is listed, and an opened Session (main view > 0) with an armed mark means
     * the user is looking at it now, so the mark is dropped.
     */
    function UnreadRowDot(props) {
      const { sessionId, t, useSessionRetainInfo } = props
      const marked = useMark(sessionId)
      const openNow = useSessionRetainInfo(sessionId, mainViewOpen)

      React.useEffect(() => {
        if (!marked) return
        if (!openNow) {
          armed.add(sessionId)
          return
        }
        if (armed.has(sessionId)) clearUnread(sessionId)
      }, [marked, openNow, sessionId])

      if (!marked || typeof sessionId !== 'string') return null
      const label = typeof t === 'function' ? t('row.unread') : ''
      return h(
        'span',
        { className: 'dsh-mu-cell' },
        h('span', { className: 'dsh-mu-dot', role: 'img', 'aria-label': label, title: label }),
      )
    }

    // ---------------------------------------------------------------- styles ---
    function installStyles() {
      const id = 'dsh-mark-unread-styles'
      const existing = document.getElementById(id)
      if (existing !== null) return () => {}
      const element = document.createElement('style')
      element.id = id
      element.textContent = STYLES
      document.head.appendChild(element)
      return () => {
        element.remove()
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => installStyles(), 'mark-unread styles')

        ctx.effect(
          () => {
            const dictionaries = [
              [
                'zh',
                {
                  'menu.markUnread': '标为未读',
                  'menu.markRead': '标为已读',
                  'row.markUnread': '标为未读',
                  'row.markRead': '标为已读',
                  'row.unread': '未读',
                },
              ],
              [
                'en',
                {
                  'menu.markUnread': 'Mark as unread',
                  'menu.markRead': 'Mark as read',
                  'row.markUnread': 'Mark as unread',
                  'row.markRead': 'Mark as read',
                  'row.unread': 'Unread',
                },
              ],
            ]
            const disposers = []
            for (const [locale, dict] of dictionaries) {
              try {
                disposers.push(ctx.locale.register(NS, locale, dict))
              } catch (error) {
                // A repeated registration (hot reload) must not take the feature down.
                console.warn('[mark-unread] locale dictionary already registered:', error)
              }
            }
            return () => {
              for (const dispose of disposers) dispose()
            }
          },
          'mark-unread locale',
        )

        void load()

        // Primary control: the exposed hover button, ahead of archive (100) and pin (200).
        ctx.slots.inject('sidebar.workspaces.session.row.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.row.action',
              id: 'mark-unread:row',
              order: 50,
              locale: NS,
            },
            MarkUnreadRowAction,
          ),
        )

        // Keep only pin and mark-unread exposed: archive stays in the `...` menu, where a
        // stray click cannot retire a Session by accident.
        ctx.slots.inject('sidebar.workspaces.session.row.action', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.row.action',
              id: 'archive',
              order: 100,
              locale: NS,
            },
            HiddenArchiveRowAction,
          ),
        )

        ctx.slots.inject('sidebar.workspaces.session.menu.item', () =>
          ctx.slots.register(
            {
              name: 'sidebar.workspaces.session.menu.item',
              id: 'mark-unread:toggle',
              order: 150,
              locale: NS,
            },
            MarkUnreadMenuRow,
          ),
        )

        ctx.slots.inject('sidebar.session.row.leading', () =>
          ctx.slots.register(
            {
              name: 'sidebar.session.row.leading',
              id: 'mark-unread:dot',
              locale: NS,
            },
            UnreadRowDot,
          ),
        )
      },
    }
  },
})
