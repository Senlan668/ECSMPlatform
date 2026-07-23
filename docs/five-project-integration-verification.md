# 五项目代码融合验收记录

验收时间：2026-07-24（Asia/Shanghai）

## 1. 验收边界

本次“100% 融合”指五个来源项目中可迁移的源码、配置模板、测试、文档和业务入口全部进入 `AIPlatform`，并由当前项目的 Java 控制面、Python/Node 运行时和 React 主前端统一承载。

按约定不迁移真实数据库、向量库、SQL dump、生产 `.env`、密钥、录音、视频、生成图片和依赖/构建目录。外部数据库、持久化 RAG、对象存储及第三方模型/RTC 密钥仍保持未配置状态；运行时使用内存或本地开发降级，并明确返回依赖不可用，不伪造成功。

## 2. 文件级门禁

最终快照：`docs/five-project-source-manifest.json`

| 迁入运行时 | 纳入文件 | 与源一致 | 融合后修改 | 缺失 |
| --- | ---: | ---: | ---: | ---: |
| Live Clip | 183 | 169 | 14 | 0 |
| 销售知识与考核 | 163 | 148 | 15 | 0 |
| 实时语音 | 139 | 132 | 7 | 0 |
| 内容运营 | 243 | 193 | 50 | 0 |
| MCP 共享 AI 服务 | 109 | 80 | 29 | 0 |
| 合计 | 837 | 722 | 115 | 0 |

“融合后修改”包含租户边界、运行时鉴权、健康检查、本地降级、主平台代理、依赖声明和可编译性修复。快照同时记录源 SHA-256 与最终目标 SHA-256；删除源目录后，门禁会逐个重算目标哈希，不能用同名空文件通过。

明确排除的非生成文件共 16 个，类别为 SQL dump/初始化数据、生产环境配置、测试输出和运行时生成图片。其余大量排除项来自 `node_modules`、`.venv`、缓存、构建目录和内容运营项目的运行时 `static` 数据。

删除后命令：

```powershell
python scripts/verify-five-project-integration.py
```

结果：`source deleted; verified 837 snapshot entries`，`PASS`。

## 3. 自动化验证

| 层级 | 结果 |
| --- | --- |
| Java Core 控制面 | 4 tests，0 failure |
| Java AI Business 控制面 | 25 tests，0 failure |
| Live Clip Python | 11 passed |
| 销售知识 Python | 43 passed |
| Voice Python | 4 passed |
| 内容运营 Python | 78 passed |
| MCP 租户与 Agent | 8 passed |
| MCP 原始网关业务链路 | 10/10 passed |
| 内容运营旧前端 Node 测试 | 39 passed |
| 主前端 Playwright | 19 passed，3 个移动端环境条件项 skipped，0 failed |
| 主前端 | lint、TypeScript、Vite build passed |
| 来源前端/服务 | Live Clip、销售知识、Voice、内容运营、Remotion build passed；Voice Node Server syntax passed |

Playwright 的 3 个跳过项分别是移动端的大文件媒体切片、微信 SQLite multipart 导入和真实 RTC 麦克风链路；对应桌面端链路已执行，移动端工作台与响应式布局另有覆盖。

## 4. 统一运行生命周期

统一停止脚本已验证能够回收全部登记进程树，以下端口全部释放：`5173`、`8080`、`8081`、`8101-8105`、`3100`、`9001-9004`。随后统一启动脚本重新拉起并通过健康检查：

| 服务 | 端口 |
| --- | ---: |
| Core control plane | 8080 |
| Live Clip runtime | 8101 |
| Sales Knowledge runtime | 8102 |
| Voice runtime | 8103 |
| Remotion renderer | 3100 |
| Content Campaign runtime | 8104 |
| Shared MCP AI services | 8105 |
| AI Business control plane | 8081 |
| React frontend | 5173 |

最终状态为 9 个服务全部 `managed / ready`。

## 5. 安全与路径审计

- 常见私钥头、GitHub Token、OpenAI 风格 Key、AWS/Google/Slack Token 格式扫描无命中。
- 可疑 `api_key/secret/password/token` 硬编码赋值扫描无命中。
- 五套 `.env.example` 均为空值或占位配置；Voice 场景 JSON 不含真实凭据。
- 运行控制令牌位于忽略目录 `.runtime`，未进入 Git。
- 运行代码中无 `D:\Code\懂王\代码` 外部绝对路径引用。
- 迁入目录与删除目标均无符号链接或 Windows 重解析点。

## 6. 源目录处置

以下五个目录已从原位置移入 Windows 回收站：

- `D:\Code\懂王\代码\AI切片`
- `D:\Code\懂王\代码\AI数据中台-多模态和销售考核`
- `D:\Code\懂王\代码\AI语音`
- `D:\Code\懂王\代码\AI运营`
- `D:\Code\懂王\代码\MCP协议的多Agent共享服务集群`

五个路径均已确认不存在，父目录 `D:\Code\懂王\代码` 为空。回收站清空前仍可恢复；最终运行时不依赖这些源路径。
