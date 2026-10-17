/**
 * dsh-web-search-router —— 搜索路由（Host 半区）
 *
 * 设计修正说明
 * ------------
 * 最初想做「一个 router provider 转发给官方/自定义」，但接缝不允许读回已注册的
 * provider，转发就要靠额外服务位中转，徒增故障面。改为更简单且可靠的方案：
 *
 *   本插件**只提供一个 provider**（id = "auto"，即"自动"），它自己按规则决定去向：
 *     · 官方渠道（provider === "deepseek-account"）且有官方凭据 → 走官方搜索协议
 *     · 否则有自定义 Key + 地址                              → 走自定义（Parallel）协议
 *     · 都没有                                                → 抛带指引的错误
 *
 *   于是：
 *     - 用户在设置里选「自动」→ 接缝选中本 provider，内部再分流；
 *     - 用户选「官方」        → 需要把接缝指向 deepseek-official（本插件不注册 auto）；
 *     - 用户选「自定义」      → 同上，指向 parallel。
 *
 *   为了不让用户去改环境变量，`mode` 变化时本插件会用 registerSearchProvider 的
 *   注册顺序控制：三种模式各注册一个 id，但只有当前模式那个 available() 返回 true，
 *   其余返回 false —— 接缝只会在"可用"的里选，于是自然只有一个候选。
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { WebError } from '@deepseek-ai/dsh-web'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'

export const name = 'web-search-router'
export const inject = ['web', 'webServer']

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const CONFIG_FILE = join(DSH_HOME, 'web-search.json')
export const DEFAULT_CUSTOM_ENDPOINT = 'https://api.parallel.ai/v1'

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
const OFFICIAL_CHANNEL = 'deepseek-account'
const MODES = new Set(['auto', 'official', 'custom'])

/**
 * 最近一次搜索失败的通知（供客户端轮询并弹窗）。
 * 只保留最新一条：一次失败弹一次，重启前不重复弹同一个 id。
 */
let lastFailure = null
let failureSeq = 0

function recordFailure(kind, message, userHint) {
  failureSeq += 1
  lastFailure = {
    id: `wf-${Date.now()}-${failureSeq}`,
    kind,
    // userHint 是给用户看的一句话；message 是完整说明（可能含给模型的约束语）。
    message: userHint || message,
    at: new Date().toISOString(),
  }
  return lastFailure
}

function loadConfig() {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {}
  return {
    mode: MODES.has(source.mode) ? source.mode : 'auto',
    customApiKey: typeof source.customApiKey === 'string' ? source.customApiKey : '',
    customEndpoint: typeof source.customEndpoint === 'string' && source.customEndpoint.length > 0
      ? source.customEndpoint
      : DEFAULT_CUSTOM_ENDPOINT,
  }
}

let config = normalizeConfig(loadConfig())

function saveConfig(next) {
  mkdirSync(DSH_HOME, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8')
  config = next
}

function hasCustom() {
  return config.customApiKey.trim().length > 0 && URL.canParse(config.customEndpoint)
}

/**
 * 官方渠道判定。
 *
 * 口径（用户确认）：只有「DeepSeek 账号」（provider 路由 = deepseek-account,
 * 也就是设置里那个 DeepSeek 账号卡片）才算官方渠道；其它任何 provider
 * （包括 codearts 这类第三方）都是非官方渠道。
 *
 * 注意必须用 `requestContext().provider`（本轮实际使用的渠道），
 * 不能用 `agent.options.provider`（那只是配置里的默认值，实测会与实际不符）。
 */
function isOfficialChannel(ctx) {
  try {
    const agent = ctx.get('agents')?.currentInitiator()
    const provider = agent?.session?.requestContext?.()?.provider ?? agent?.options?.provider
    return provider === OFFICIAL_CHANNEL
  } catch {
    return false
  }
}

/* ---------------- 官方协议（DeepSeek Anthropic 兼容 Messages） ---------------- */

/**
 * 官方搜索所需的凭据与端点，全部**运行时从用户自己的配置解析**，
 * 不写死任何 Key、也不假设一定存在某个凭据：
 *   1. 若当前请求来自 DeepSeek 账号登录，优先用账号 token（和官方插件同源）；
 *   2. 否则读凭据服务里的 DEEPSEEK_API_KEY；
 *   3. 再否则读启动环境里的同名变量。
 * 三处都没有时给出可操作提示，而不是静默失败。
 */
const OFFICIAL_BASE_URL = 'https://api.deepseek.com/anthropic/v1'
const OFFICIAL_MODEL = 'deepseek-v4-flash'
const OFFICIAL_API_VERSION = '2023-06-01'
const OFFICIAL_MAX_TOKENS = 4096
const OFFICIAL_MAX_USES = 5
const OFFICIAL_KEY_ENV = 'DEEPSEEK_API_KEY'

const OFFICIAL_NO_CREDENTIAL = 'DeepSeek 搜索暂时不可用：当前对话走的是 DeepSeek 官方渠道，'
  + '但没有可用的 DeepSeek 凭据。请先登录 DeepSeek 账号，或在「设置 → 模型」里填入 DeepSeek API Key，'
  + '也可以用非官方模型并配置自定义搜索。'

/** 取官方凭据：账号 token 优先，其次凭据服务，最后启动环境。 */
async function officialCredential(ctx, endpoint, signal) {
  // 1) 账号登录态（与 dsh-web-search-deepseek 的 account 分支一致）
  try {
    const account = ctx.get('deepseekAccount')
    if (account !== undefined) {
      const token = await account.resolveToken(endpoint)
      if (typeof token === 'string' && token.length > 0) {
        return { kind: 'account', headers: { 'x-dsh-auth-token': token } }
      }
    }
  } catch {
    /* 没有账号服务或未登录，继续下一种 */
  }

  if (signal?.aborted === true) throw new WebError('搜索已取消', 'WEB_ABORTED', { cause: signal.reason })

  // 2) 凭据服务
  let apiKey
  try {
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const found = await credentials.resolve(OFFICIAL_KEY_ENV)
      if (found !== undefined && typeof found.value === 'string' && found.value.length > 0) {
        apiKey = found.value
      }
    }
  } catch {
    /* 继续下一种 */
  }

  // 3) 启动环境
  if (apiKey === undefined) {
    try {
      const ambient = launchEnvironmentOf(ctx).get(OFFICIAL_KEY_ENV)
      if (ambient !== undefined && ambient.value.length > 0) apiKey = ambient.value
    } catch {
      /* 无环境访问能力 */
    }
  }

  if (apiKey === undefined) {
    throw new WebError(OFFICIAL_NO_CREDENTIAL, 'WEB_PROVIDER_CREDENTIAL_MISSING')
  }
  return {
    kind: 'api-key',
    headers: { 'x-api-key': apiKey, authorization: `Bearer ${apiKey}` },
  }
}

/** 从官方响应里取引用来源；没有结果块时明确报错，不退化成瞎猜。 */
function mapOfficialResponse(response) {
  const blocks = Array.isArray(response?.content) ? response.content : []
  const resultBlocks = blocks.filter((block) => block?.type === 'web_search_tool_result')
  if (resultBlocks.length === 0) {
    throw new WebError(
      'DeepSeek 搜索没有返回任何检索结果，可能是本次请求没有触发原生搜索。请换一种问法重试。',
      'WEB_PROVIDER_ERROR',
    )
  }
  // 文本块里的 citations 才是摘要来源（官方结果项通常不带 snippet）。
  const snippets = new Map()
  for (const block of blocks) {
    if (block?.type !== 'text') continue
    for (const cite of block.citations ?? []) {
      if (typeof cite?.url === 'string' && cite.url.length > 0
        && typeof cite?.cited_text === 'string' && cite.cited_text.length > 0
        && !snippets.has(cite.url)) {
        snippets.set(cite.url, cite.cited_text)
      }
    }
  }
  const seen = new Set()
  const sources = []
  for (const block of resultBlocks) {
    for (const item of block?.content ?? []) {
      if (item?.type !== 'web_search_result') continue
      const url = typeof item.url === 'string' ? item.url : ''
      if (url.length === 0 || seen.has(url)) continue
      seen.add(url)
      const snippet = snippets.get(url)
      sources.push({
        url,
        ...(typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {}),
        ...(typeof snippet === 'string' && snippet.length > 0 ? { snippet } : {}),
        ...(typeof item.page_age === 'string' && item.page_age.length > 0
          ? { publishedAt: item.page_age }
          : {}),
      })
    }
  }
  return { sources, truncated: false }
}

async function searchOfficial(ctx, request, signal) {
  const endpoint = `${OFFICIAL_BASE_URL}/messages`
  if (signal?.aborted === true) throw new WebError('搜索已取消', 'WEB_ABORTED', { cause: signal.reason })

  const auth = await officialCredential(ctx, endpoint, signal)
  if (signal?.aborted === true) throw new WebError('搜索已取消', 'WEB_ABORTED', { cause: signal.reason })

  const body = {
    model: OFFICIAL_MODEL,
    max_tokens: OFFICIAL_MAX_TOKENS,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: `Perform a web search for the query: ${request.query}` }],
    }],
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: OFFICIAL_MAX_USES }],
  }

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        ...auth.headers,
        'anthropic-version': OFFICIAL_API_VERSION,
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'deepseek-harness-custom-search/1.0.0',
      },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    if (signal?.aborted === true) throw error
    throw new WebError(
      'DeepSeek 搜索 API 出现问题：网络请求失败。'
        + '请检查网络或稍后重试；若持续失败，可改用非官方模型并配置自定义搜索。',
      'WEB_PROVIDER_ERROR',
      { cause: error },
    )
  }

  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json()
      detail = typeof parsed?.error?.message === 'string' ? parsed.error.message : ''
    } catch {
      /* 忽略 */
    }
    const hint = response.status === 401 || response.status === 403
      ? (auth.kind === 'account'
          ? 'DeepSeek 账号登录可能已失效，请重新登录。'
          : 'DeepSeek API Key 可能无效，请到「设置 → 模型」检查。')
      : response.status === 429
        ? '请求过于频繁或额度不足。'
        : '服务返回了错误。'
    throw new WebError(
      `DeepSeek 搜索 API 出现问题（HTTP ${response.status}）。${hint}`
        + (detail ? `服务端说明：${detail}` : ''),
      'WEB_PROVIDER_ERROR',
    )
  }

  try {
    return mapOfficialResponse(await response.json())
  } catch (error) {
    if (error instanceof WebError) throw error
    throw new WebError(
      'DeepSeek 搜索返回了无法解析的响应。请稍后重试。',
      'WEB_PROVIDER_ERROR',
      { cause: error },
    )
  }
}

/* ---------------- 自定义协议（Parallel） ---------------- */

async function searchCustom(request, signal) {
  const endpoint = `${config.customEndpoint.replace(/\/+$/u, '')}/search`
  if (signal?.aborted === true) {
    throw new WebError('搜索已取消', 'WEB_ABORTED', { cause: signal.reason })
  }

  const body = {
    objective: request.query,
    search_queries: [request.query],
    mode: 'basic',
    max_chars_total: 20000,
  }

  let response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        'x-api-key': config.customApiKey.trim(),
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': 'deepseek-harness-custom-search/1.0.0',
      },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    })
  } catch (error) {
    if (signal?.aborted === true) throw error
    throw new WebError(
      '您填写的自定义搜索服务可能出现问题或配置不正确。'
        + `网络请求失败（${String(error)}），请求发往 ${JSON.stringify(endpoint)}。`
        + '请检查「设置 → 搜索」里的接口地址是否可达、API Key 是否正确。',
      'WEB_PROVIDER_ERROR',
      { cause: error },
    )
  }

  if (!response.ok) {
    let detail = ''
    try {
      const parsed = await response.json()
      detail = typeof parsed?.message === 'string'
        ? parsed.message
        : typeof parsed?.error === 'string' ? parsed.error : parsed?.error?.message ?? parsed?.detail
    } catch {
      /* 忽略解析失败 */
    }
    const hint = response.status === 401 || response.status === 403
      ? 'API Key 似乎无效或被拒绝。'
      : response.status === 404
        ? '接口地址可能填错了。'
        : response.status === 429
          ? '请求过于频繁或额度用尽。'
          : '服务返回了错误。'
    throw new WebError(
      `您填写的自定义搜索服务可能出现问题或配置不正确（HTTP ${response.status}）。${hint}`
        + (detail ? `服务端说明：${detail}` : '')
        + ` 请求发往 ${JSON.stringify(endpoint)}。`,
      'WEB_PROVIDER_ERROR',
    )
  }

  const data = await response.json().catch(() => ({}))
  const results = Array.isArray(data?.results) ? data.results : []
  const sources = []
  const seen = new Set()
  for (const item of results) {
    const url = typeof item?.url === 'string' ? item.url : ''
    if (url.length === 0 || seen.has(url)) continue
    seen.add(url)
    const excerpts = Array.isArray(item?.excerpts)
      ? item.excerpts.filter((text) => typeof text === 'string' && text.length > 0)
      : []
    sources.push({
      url,
      ...(typeof item?.title === 'string' && item.title.length > 0 ? { title: item.title } : {}),
      ...(excerpts.length > 0 ? { snippet: excerpts.join('\n\n') } : {}),
      ...(typeof item?.publish_date === 'string' && item.publish_date.length > 0
        ? { publishedAt: item.publish_date }
        : {}),
    })
  }
  return { sources, truncated: false }
}

export function apply(ctx) {
  /**
   * 注册唯一入口 provider：
   *   · 官方渠道 → 内部走 DeepSeek 官方协议（凭据运行时从用户自己配置解析）；
   *   · 其它渠道 → 内部走自定义（Parallel）协议；
   *   · 两种情况都不可用时，抛出带 userHint 的可读错误，
   *     客户端据此弹出提示，而不是把底层原始报错直接给用户。
   */
  try {
    const web = ctx.web ?? ctx.get?.('web')
    if (web !== undefined && typeof web.registerSearchProvider === 'function') {
      web.registerSearchProvider({
        id: 'custom-search',
        available() {
          // 永远接管：具体的可用性与原因说明放在 search() 里，用户才能看到该去配置什么。
          return true
        },
        async search(request, signal) {
          const official = isOfficialChannel(ctx)
          // 用户显式指定模式时尊重用户选择；否则跟随渠道。
          const wantOfficial = config.mode === 'official'
            || (config.mode === 'auto' && official)

          try {
            if (wantOfficial) {
              return await searchOfficial(ctx, request, signal)
            }

            if (!hasCustom()) {
              // 给模型看的说明保持简洁；给用户看的一句话放在 userHint，弹窗只显示那条。
              throw new WebError(
                '还没有可用的搜索服务：本对话不是 DeepSeek 官方渠道，自定义搜索的 API Key 也没填。'
                  + '请打开「设置 → 搜索」填写 API Key。',
                'WEB_PROVIDER_CREDENTIAL_MISSING',
                { userHint: '还没有可用的搜索服务。请到「设置 → 搜索」填写 API Key。' },
              )
            }

            return await searchCustom(request, signal)
          } catch (error) {
            // 供客户端弹窗：区分「没配置」与「配置了但服务出错」。
            if (!(error instanceof WebError) || error.code !== 'WEB_ABORTED') {
              const missing = error && error.code === 'WEB_PROVIDER_CREDENTIAL_MISSING'
              const kind = wantOfficial ? 'official' : missing ? 'unconfigured' : 'custom'
              recordFailure(
                kind,
                String(error && error.message ? error.message : error),
                error && error.userHint ? error.userHint : undefined,
              )
            }
            throw error
          }
        },
      })
    }
  } catch {
    /* 注册失败不阻断其它功能（设置页仍可用） */
  }

  const disposers = []

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-web-search/notices',
      handler: async (req, res) => {
        try {
          // 支持 ?ack=<id> 由客户端确认已展示，避免同一条反复弹。
          const url = new URL(req.url ?? '/', 'http://localhost')
          const ack = url.searchParams.get('ack')
          if (ack !== null && lastFailure !== null && lastFailure.id === ack) {
            lastFailure = null
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({ ok: true, failure: lastFailure }))
        } catch (error) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
        }
      },
    }),
  )

  disposers.push(
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-web-search/config',
      handler: async (req, res) => {
        try {
          if (req.method === 'POST' || req.method === 'PUT') {
            const chunks = []
            for await (const chunk of req) chunks.push(chunk)
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
            // 空字符串表示"不修改 Key"，避免页面回填明文后再提交把它清掉。
            const patch = { ...parsed }
            if (typeof patch.customApiKey === 'string' && patch.customApiKey.length === 0) {
              delete patch.customApiKey
            }
            saveConfig(normalizeConfig({ ...config, ...patch }))
          }
          res.writeHead(200, JSON_HEADERS)
          res.end(JSON.stringify({
            ok: true,
            mode: config.mode,
            hasKey: config.customApiKey.trim().length > 0,
            endpoint: config.customEndpoint,
            officialChannel: isOfficialChannel(ctx),
          }))
        } catch (error) {
          res.writeHead(400, JSON_HEADERS)
          res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }))
        }
      },
    }),
  )

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* 卸载期忽略 */
      }
    }
  })
}
