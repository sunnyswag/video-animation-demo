# video-animation-demo

系列视频的网页交互动画合集，通过 GitHub Pages 直接访问。

## Demos

| 目录 | 内容 | 在线地址 |
| --- | --- | --- |
| `blocking-async-demo/` | 同步/异步 × 阻塞/非阻塞 · 餐厅类比交互演示 | https://sunnyswag.github.io/video-animation-demo/blocking-async-demo/ |

### blocking-async-demo 使用说明

- 场景通过 URL 参数切换：`?scene=overview`（2×2 总览）/ `sync-blocking` / `sync-nonblocking` / `async-blocking` / `async-nonblocking` / `summary`（数据总结）/ `c-epoll`
- `空格` / `→` 下一步，`R` 重置，`C` 显示/隐藏代码（学习模式）
- 调试参数：`?steps=N` 自动推进 N 拍，`&code=1` 默认开启学习模式

### 目录结构与本地开发

无框架、无构建，双击 `index.html` 即可打开；改逻辑后跑一遍回归测试：

```
blocking-async-demo/
├── index.html   页面结构与各视图骨架
├── style.css    「深夜食堂」主题样式
├── logic.js     纯逻辑层：厨房模型 + 四场景生成器 + 数据总结（不碰 DOM）
├── ui.js        渲染与交互（依赖 logic.js 暴露的全局）
└── test.js      逻辑层回归测试：node blocking-async-demo/test.js
```
