# dsh-web-search-router

搜索路由插件：按「用的是哪个模型通道」决定走官方搜索还是你自己的搜索服务，并且在两者都不可用时给出可读的原因，而不是一句 500。

## 为什么需要

DSH 自带的搜索只对官方 DeepSeek 账号通道生效。用第三方模型通道时搜索会静默失败，用户看到的只是一个模糊的错误。这个插件把两种情况都接上：

| 当前通道 | 走哪条路 |
|---|---|
| 官方 DeepSeek 账号 | Anthropic Messages 协议里的 `web_search` 工具 |
| 第三方通道 | 你自己配置的搜索服务（Parallel 兼容接口） |

## 配置

设置 → 搜索，填搜索服务的 API Key 与接口地址。

凭据按以下顺序解析，前一个取不到就用下一个：

1. 账号令牌
2. 凭据存储里的 `DEEPSEEK_API_KEY`
3. 启动环境变量

## 失败提示

搜索失败时右下角弹提示，说明具体是哪一步不行：

- 没配 Key → 「还没有可用的搜索服务。请到「设置 → 搜索」填写 API Key。」
- 请求被拒 → 带上游返回的状态与原因
- 超时 / 网络错误 → 单独区分，不混为一谈

提示 12 秒自动消失，也可以手动确认。

## 安装

```bash
pnpm add github:MCJF28/dsh-web-search-router
```

装完在 `dsh.profile.bundles` 里加上 `dsh-web-search-router`。

## 注意

如果你的 profile patch 里 `web` 这一行被 base 包写死了 `searchProvider: deepseek-official`，需要在 profile 的 `cordis.patch.yml` 里覆盖它，否则这个插件注册的 provider 不会被选中：

```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: custom-search
    fetchProvider: http
```

原因：`resolveProvider` 只在 `configuredId === undefined` 时才遍历 provider 列表找可用项。一旦配置里写死了名字，插件的 `available()` 根本不会被调用。
