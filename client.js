/**
 * dsh-web-search-router —— Client 半区（设置页「搜索」）
 *
 * 只有三样东西：
 *   1. 搜索方式：跟随渠道 / 官方搜索 / 自定义（行式下拉）
 *   2. 自定义 API Key（密码框，留空表示不修改）
 *   3. 接口地址（默认 Parallel，可改）
 *
 * 状态说明区会告诉用户当前实际会走哪一条，避免"设了但没生效"的困惑。
 */

window.__ModuleLoader__.load({
  id: 'dsh-web-search-router',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback } = React

    const CSS = `
.dshws-root{display:flex;flex-direction:column;gap:20px;font-size:14px;color:var(--dsw-alias-label-primary);max-width:680px}
.dshws-head{display:flex;flex-direction:column;gap:4px}
.dshws-title{font-size:16px;font-weight:600;line-height:24px}
.dshws-desc{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dshws-card{border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dshws-row{display:flex;align-items:center;gap:16px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshws-row:last-child{border-bottom:0}
.dshws-row-main{flex:1;min-width:0}
.dshws-row-title{font-size:14px;font-weight:500;line-height:22px}
.dshws-row-sub{margin-top:2px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dshws-sel-root{position:relative;flex:none}
.dshws-select{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px 0 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;font-weight:500;line-height:20px;cursor:pointer;white-space:nowrap;transition:background-color .1s,border-color .1s}
.dshws-select:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dshws-select:disabled{opacity:.5;cursor:default}
.dshws-sel-text{max-width:180px;overflow:hidden;text-overflow:ellipsis}
.dshws-sel-chev{font-size:12px;line-height:1;color:var(--dsw-alias-label-secondary);transform:translateY(-1px)}
.dshws-sel-panel{position:absolute;top:calc(100% + 6px);right:0;z-index:70;min-width:100%;max-height:260px;overflow-y:auto;padding:6px;border-radius:var(--dsw-radius-panel);background:var(--dsw-specific-input-major);border:1px solid var(--dsw-alias-border-l2);box-shadow:var(--dsw-elevation-soft);display:flex;flex-direction:column;gap:1px}
.dshws-sel-item{appearance:none;display:flex;align-items:center;width:100%;padding:8px 12px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;white-space:nowrap}
.dshws-sel-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dshws-sel-item[aria-selected="true"]{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-business-primary);font-weight:600}
.dshws-field{display:flex;flex-direction:column;gap:6px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.dshws-field:last-child{border-bottom:0}
.dshws-label{font-size:14px;font-weight:500;line-height:22px}
.dshws-hint{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshws-input{width:100%;box-sizing:border-box;background:var(--dsw-specific-input-major);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);padding:8px 12px;font-size:14px;font-family:inherit;line-height:22px;outline:none;transition:border-color .1s}
.dshws-input:focus{border-color:var(--dsw-alias-state-business-primary)}
.dshws-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dshws-btn{appearance:none;height:32px;padding:0 14px;border:0;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px;font-weight:500;cursor:pointer;transition:background-color .1s}
.dshws-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-solid)}
.dshws-btn:disabled{opacity:.5;cursor:default}
.dshws-btn.primary{background:var(--dsw-alias-button-info-fill);color:#fff}
.dshws-btn.primary:hover:not(:disabled){background:var(--dsw-alias-button-info-hover)}
.dshws-btn.ghost{background:transparent;color:var(--dsw-alias-label-secondary)}
.dshws-btn.ghost:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dshws-msg{font-size:13px;line-height:20px}
.dshws-msg.err{color:var(--dsw-alias-state-error-primary)}
.dshws-msg.ok{color:var(--dsw-alias-state-success-primary)}
.dshws-status{display:flex;align-items:flex-start;gap:8px;padding:12px 16px;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-interactive-bg-hover);font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.dshws-dot{width:6px;height:6px;border-radius:999px;margin-top:7px;flex:none;background:var(--dsw-alias-state-success-primary)}
.dshws-dot.warn{background:var(--dsw-alias-state-warn-primary)}
.dshws-dot.err{background:var(--dsw-alias-state-error-primary)}
`

    async function callJson(path, body) {
      const init = body === undefined
        ? { method: 'GET' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      const response = await fetch(path, init)
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      return data
    }

    /** 自制下拉：不用原生 select，避免弹出列表绕过主题（深色下会白底蓝高亮）。 */
    function Pick(props) {
      const [open, setOpen] = useState(false)
      const rootRef = React.useRef(null)

      useEffect(() => {
        if (!open) return undefined
        const onDown = (event) => {
          if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
        document.addEventListener('mousedown', onDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      const current = props.options.find((option) => option.value === props.value) ?? props.options[0]

      return h('div', { className: 'dshws-sel-root', ref: rootRef },
        h('button', {
          type: 'button',
          className: props.className,
          disabled: props.disabled,
          'aria-label': props.label,
          'aria-haspopup': 'listbox',
          'aria-expanded': open,
          onClick: () => setOpen((value) => !value),
        },
          h('span', { className: 'dshws-sel-text' }, current ? current.label : ''),
          h('span', { className: 'dshws-sel-chev' }, '⌄')
        ),
        open ? h('div', { className: 'dshws-sel-panel', role: 'listbox' },
          props.options.map((option) => h('button', {
            key: option.value,
            type: 'button',
            role: 'option',
            className: 'dshws-sel-item',
            'aria-selected': option.value === props.value ? 'true' : 'false',
            onClick: () => {
              setOpen(false)
              props.onChange(option.value)
            },
          }, option.label))
        ) : null
      )
    }

    /**
     * 搜索失败提示（浮层 toast）。
     *
     * Host 只在搜索失败时记录一条 notice；这里定时轮询，
     * 拿到新 id 就弹一次，弹完 ack 掉，避免同一失败反复打扰。
     * 为什么用轮询而不是事件：静态 Client 包无法注册 Remote 事件，
     * 轮询是这类插件能用的最直接通道。
     */
    function SearchFailureToast() {
      const [notice, setNotice] = useState(null)
      const seenRef = React.useRef(new Set())

      useEffect(() => {
        let alive = true
        let timer

        const poll = async () => {
          try {
            const data = await callJson('/dsh-web-search/notices')
            const failure = data?.failure
            if (alive && failure && !seenRef.current.has(failure.id)) {
              seenRef.current.add(failure.id)
              setNotice(failure)
              // 立刻确认，避免其它页面或下次轮询重复弹。
              void callJson(`/dsh-web-search/notices?ack=${encodeURIComponent(failure.id)}`).catch(() => {})
            }
          } catch {
            /* 轮询失败静默重试 */
          }
          if (alive) timer = setTimeout(poll, 4000)
        }

        void poll()
        return () => {
          alive = false
          if (timer) clearTimeout(timer)
        }
      }, [])

      useEffect(() => {
        if (!notice) return undefined
        // 12 秒后自动消失；用户也可以手动关闭。
        const timer = setTimeout(() => setNotice(null), 12000)
        return () => clearTimeout(timer)
      }, [notice])

      if (!notice) return null

      const title = notice.kind === 'unconfigured'
        ? '尚未配置搜索服务'
        : notice.kind === 'official'
          ? 'DeepSeek 搜索出现问题'
          : '自定义搜索出现问题'

      return h('div', { className: 'dshws-toast-wrap' },
        h('style', null, `
.dshws-toast-wrap{position:fixed;right:24px;bottom:24px;z-index:80;max-width:400px;pointer-events:auto}
.dshws-toast{display:flex;gap:12px;padding:12px 14px;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);box-shadow:var(--dsw-elevation-soft);position:relative;overflow:hidden}
.dshws-toast::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--dsw-alias-state-warn-primary)}
.dshws-toast-body{flex:1;min-width:0}
.dshws-toast-title{font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}
.dshws-toast-msg{margin-top:2px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dshws-toast-close{appearance:none;flex:none;width:22px;height:22px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;transition:background-color .1s}
.dshws-toast-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
`),
        h('div', { className: 'dshws-toast', role: 'alert' },
          h('div', { className: 'dshws-toast-body' },
            h('div', { className: 'dshws-toast-title' }, title),
            h('div', { className: 'dshws-toast-msg' }, notice.message)
          ),
          h('button', {
            type: 'button',
            className: 'dshws-toast-close',
            'aria-label': '关闭',
            onClick: () => setNotice(null),
          }, '✕')
        )
      )
    }

    function SearchSettings() {
      const [mode, setMode] = useState('auto')
      const [hasKey, setHasKey] = useState(false)
      const [endpoint, setEndpoint] = useState('https://api.parallel.ai/v1')
      const [officialChannel, setOfficialChannel] = useState(false)
      const [keyDraft, setKeyDraft] = useState('')
      const [endpointDraft, setEndpointDraft] = useState('')
      const [busy, setBusy] = useState(false)
      const [message, setMessage] = useState(null)

      const load = useCallback(async () => {
        try {
          const data = await callJson('/dsh-web-search/config')
          setMode(data.mode || 'auto')
          setHasKey(data.hasKey === true)
          setEndpoint(data.endpoint || 'https://api.parallel.ai/v1')
          setEndpointDraft(data.endpoint || 'https://api.parallel.ai/v1')
          setOfficialChannel(data.officialChannel === true)
          setMessage(null)
        } catch (error) {
          setMessage({ kind: 'err', text: `读取失败：${String(error.message || error)}` })
        }
      }, [])

      useEffect(() => { void load() }, [load])

      const save = async (patch) => {
        setBusy(true)
        try {
          await callJson('/dsh-web-search/config', patch)
          await load()
          setKeyDraft('')
          setMessage({ kind: 'ok', text: '已保存。' })
        } catch (error) {
          setMessage({ kind: 'err', text: `保存失败：${String(error.message || error)}` })
        } finally {
          setBusy(false)
        }
      }

      // 当前实际会走哪条 —— 直接算给用户看。
      let route
      if (mode === 'official') route = officialChannel ? 'official' : 'blocked-official'
      else if (mode === 'custom') route = hasKey ? 'custom' : 'blocked-custom'
      else route = officialChannel ? 'official' : hasKey ? 'custom' : 'blocked-auto'

      const status = {
        official: { dot: '', text: '当前会使用 DeepSeek 官方搜索。' },
        custom: { dot: '', text: '当前会使用你填写的自定义搜索。' },
        'blocked-official': { dot: 'err', text: '搜索固定为官方，但本对话不是官方渠道，搜索会失败。' },
        'blocked-custom': { dot: 'err', text: '搜索固定为自定义，但还没有可用 API Key，搜索会失败。' },
        'blocked-auto': { dot: 'warn', text: '当前没有任何可用搜索配置：既不是官方渠道，也没填自定义 API Key。此时模型尝试搜索会得到一条提示，告诉你去这里配置。' },
      }[route]

      return h('div', { className: 'dshws-root' },
        h('style', null, CSS),

        h('div', { className: 'dshws-head' },
          h('div', { className: 'dshws-title' }, '搜索'),
          h('div', { className: 'dshws-desc' },
            '决定模型联网检索时用哪一个后端。官方渠道可直接用 DeepSeek 自带搜索；'
            + '其它渠道需要你填自己的 API Key。')
        ),

        h('div', { className: 'dshws-card' },
          h('div', { className: 'dshws-row' },
            h('div', { className: 'dshws-row-main' },
              h('div', { className: 'dshws-row-title' }, '搜索方式'),
              h('div', { className: 'dshws-row-sub' }, '跟随渠道会根据当前模型渠道自动选择。')
            ),
            h(Pick, {
              className: 'dshws-select',
              value: mode,
              disabled: busy,
              label: '搜索方式',
              options: [
                { value: 'auto', label: '跟随渠道' },
                { value: 'official', label: '仅官方搜索' },
                { value: 'custom', label: '仅自定义搜索' },
              ],
              onChange: (next) => void save({ mode: next }),
            })
          ),

          h('div', { className: 'dshws-field' },
            h('label', { className: 'dshws-label' }, '自定义 API Key'),
            h('input', {
              className: 'dshws-input',
              type: 'password',
              value: keyDraft,
              autoComplete: 'off',
              placeholder: hasKey ? '已设置（留空表示不修改）' : '粘贴你的 API Key',
              onChange: (event) => setKeyDraft(event.target.value),
            }),
            h('div', { className: 'dshws-hint' },
              hasKey ? '已保存一个 Key。' : '还没有填写。非官方渠道时必填，否则无法搜索。')
          ),

          h('div', { className: 'dshws-field' },
            h('label', { className: 'dshws-label' }, '接口地址'),
            h('input', {
              className: 'dshws-input',
              value: endpointDraft,
              placeholder: 'https://api.parallel.ai/v1',
              onChange: (event) => setEndpointDraft(event.target.value),
            }),
            h('div', { className: 'dshws-hint' }, `默认为 Parallel：${endpoint}。可改成别的兼容接口。`)
          )
        ),

        h('div', { className: 'dshws-actions' },
          h('button', {
            className: 'dshws-btn primary',
            disabled: busy,
            onClick: () => {
              const patch = {}
              if (keyDraft.trim().length > 0) patch.customApiKey = keyDraft
              if (endpointDraft.trim().length > 0 && endpointDraft !== endpoint) patch.customEndpoint = endpointDraft
              void save(Object.keys(patch).length > 0 ? patch : {})
            },
          }, '保存'),
          h('button', {
            className: 'dshws-btn ghost',
            disabled: busy,
            onClick: () => void load(),
          }, '重新载入'),
          message ? h('span', { className: `dshws-msg ${message.kind}` }, message.text) : null
        ),

        h('div', { className: 'dshws-status' },
          h('span', { className: `dshws-dot ${status.dot}` }),
          h('span', null, status.text)
        )
      )
    }

    // ── 设置导航图标 ──────────────────────────────────────────────────────

    /*
     * 宿主的设置导航按 section id 硬编码图标，只认 account / models /
     * agent-presets / plugins / archived-sessions 五个，其余一律给齿轮；
     * 而 settings.section 的注册接口没有 icon 字段。
     *
     * 所以自己换：给导航行打 data 属性，再用 mask-image 盖掉默认齿轮。
     * 用 mask 而非 background-image，是为了让颜色跟随 currentColor ——
     * 选中时文字变蓝，图标自动跟着变蓝。
     */
    const NAV_ATTR = 'dshnav'
    const NAV_VALUE = 'dsh-web-search'
    const NAV_LABEL = '搜索'

    /**
     * 地球图标：表示网络搜索。
     *
     * 特意不用放大镜 —— 装了第三方搜索插件的 profile 里，
     * 它的导航行也用放大镜，两个同形状的图标挨在一起会分不清。
     * stroke 用纯黑，供 mask 取 alpha。
     */
    const NAV_MASK = 'url("data:image/svg+xml,'
      + encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' "
        + "stroke='#000' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'>"
        + "<circle cx='12' cy='12' r='9'/>"
        + "<path d='M3 12h18'/>"
        + "<path d='M12 3c2.8 3.4 2.8 14.6 0 18M12 3c-2.8 3.4-2.8 14.6 0 18'/>"
        + '</svg>',
      )
      + '")'

    const NAV_CSS = `
button[data-${NAV_ATTR}="${NAV_VALUE}"] > svg{display:none}
button[data-${NAV_ATTR}="${NAV_VALUE}"]::before{
  content:'';flex:none;
  width:16px;height:16px;
  background-color:currentColor;
  -webkit-mask:var(--dshws-nav-mask) center / contain no-repeat;
  mask:var(--dshws-nav-mask) center / contain no-repeat;
}
`

    /** 找到设置导航里属于本插件的那一行并打标记；找不到就安静返回。 */
    function decorateNavRow() {
      try {
        const buttons = document.querySelectorAll('button')
        for (const button of buttons) {
          if (button.dataset[NAV_ATTR] === NAV_VALUE) continue
          if (button.querySelector(':scope > svg') === null) continue
          const label = button.querySelector(':scope > span')
          if (label === null || label.textContent.trim() !== NAV_LABEL) continue
          const list = button.parentElement
          if (list === null || !list.textContent.includes('通用设置')) continue
          button.dataset[NAV_ATTR] = NAV_VALUE
          button.style.setProperty('--dshws-nav-mask', NAV_MASK)
        }
      } catch {
        /* 定位失败不影响设置页本身 */
      }
    }

    /** 装上观察器：设置面板每次打开 DOM 都会重建，需要重新打标记。 */
    function installNavIcons() {
      try {
        const style = document.createElement('style')
        style.textContent = NAV_CSS
        document.head.appendChild(style)
        decorateNavRow()

        let queued = false
        const observer = new MutationObserver(() => {
          if (queued) return
          queued = true
          requestAnimationFrame(() => {
            queued = false
            decorateNavRow()
          })
        })
        observer.observe(document.body, { childList: true, subtree: true })

        return () => {
          observer.disconnect()
          style.remove()
        }
      } catch {
        return undefined
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => installNavIcons())

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'dsh-web-search',
          order: 42,
          label: () => '搜索',
        }, SearchSettings))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'dsh-web-search-toast',
          order: 50,
        }, SearchFailureToast))
      },
    }
  },
})
