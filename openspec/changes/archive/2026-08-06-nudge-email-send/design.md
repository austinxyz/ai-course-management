## Context

`nudge` 现有的 `POST /api/nudge/events` 只接受 `event_type: nudged | skipped | unskipped`，`channel` 字段永远由服务端的 `_channel_for(student)` 按微信是否对齐自动判定，不接受调用方传入。详情面板（`DetailPanel`）已经有"复制文案"/"标记已催"/"跳过"（或"取消跳过"）三个按钮，草稿文本存在组件自身的 `draft` state 里。本变更要新增一条"真的把 `draft` 发出去"的路径，且发出去这件事必须被记成 `channel=email`，不管这个学员微信是否对齐——这与现有的自动判定逻辑冲突，是本设计要解决的核心问题（explore 阶段已发现，见 requirements Constraints）。

没有共享的 `Dialog` 组件——`ImportDialog`/`ReportUploadDialog` 都是手写的 modal markup（`fixed inset-0 z-50 ... bg-black/30` 背景 + `role="dialog"`），本变更的确认框沿用同一手写模式。

## Goals / Non-Goals

**Goals:**
- 新端点内部直接写 `NudgeEvent(channel="email")`，完全不经过 `_channel_for`——不是给 `_channel_for` 加参数，是绕开它，因为 `_channel_for` 的语义是"这个人平时该走哪个渠道"，跟"这次实际走了哪个渠道"是两件事，硬塞一个参数会让函数签名说谎
- SMTP 调用点必须能在测试里整体替换，不发起真实网络请求
- 失败路径不留脏数据——发送失败时不写任何 `NudgeEvent`

**Non-Goals:**
- 不做邮件模板引擎/富文本——纯文本字符串直接进 `email.message.EmailMessage`
- 不做发信队列/重试机制——同步发送，失败直接报错给前端，讲师手动重试

## Decisions

**1. 新增独立端点 `POST /api/nudge/send-email`，不复用 `POST /api/nudge/events`。**

理由：`/events` 端点的语义是"记录一个已经发生的动作"（讲师自己催了/跳过了），而发邮件是"执行一个动作并记录结果"——两者的失败语义不同（`/events` 失败通常是 404/422 这类客户端错误，发邮件失败是外部依赖错误 502/504）。合并到一个端点要么污染 `/events` 的简单语义，要么在 `/events` 里塞一个"顺便发邮件"的隐藏行为，都不如独立端点清楚。

请求体：`{student_email, course_id, body}`（`body` 是前端当前草稿的原文，服务端不重新生成文案——草稿可能已被讲师编辑过）。响应体复用 `NudgeEventRead`（跟 `/events` 端点返回同一种形状，前端不需要为这条路径新写一套类型）。

**2.（修订）`backend/app/email_client.py` 改用 Resend HTTP API（`httpx.post`），不再用 `smtplib`。暴露的函数签名不变——`send_email(to, subject, body) -> None`，失败抛 `EmailSendError`——这条决定的接口没变，只是实现换了。**

上线后用生产环境实测：Render 免费档对出站 SMTP 端口（587/465/25）有平台级封锁，`smtplib.SMTP(...)` 连接直接 `[Errno 101] Network is unreachable`，不是凭证问题，无解——SMTP 这条路径在 Render 免费档上走不通。改用 Resend：一个基于 HTTPS API 的邮件发送服务，请求走普通 443 端口，不受这条封锁影响。

```python
import httpx

class EmailSendError(Exception):
    """Resend API 层面的任何失败——未配置、鉴权失败、请求超时、4xx/5xx——
    统一收成这一种，路由层不需要关心 httpx 抛的具体异常类型。"""


RESEND_API_URL = "https://api.resend.com/emails"
FROM_ADDRESS = "noreply@austinxyz.ai"


def send_email(to: str, subject: str, body: str) -> None:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        raise EmailSendError("RESEND_API_KEY 未配置")

    try:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"from": FROM_ADDRESS, "to": [to], "subject": subject, "text": body},
            timeout=10,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise EmailSendError(str(exc)) from exc
```

`timeout=10`——同一条硬要求不变。发件人地址硬编码 `noreply@austinxyz.ai`——这个域名要在 Resend 后台加 DNS 记录验证过，否则 Resend 只允许发到账号自己的邮箱（对催学员这个场景毫无用处）。`RESEND_API_KEY` 缺失时**不是**启动即失败，理由同旧决定：这条路径本身是可选功能，缺配置不该拖垮整个后端。

`httpx` 原本只在 `dev` 依赖组（给 `TestClient` 用），本决定把它提到主依赖——不新增一个 HTTP 客户端库，用已经在用的那个。

**3. 路由层：`nudge.py` 里新增 `send_nudge_email` 端点函数，直接 `import` `email_client.send_email`（不是 FastAPI Depends 注入）。测试用 `unittest.mock.patch("app.routers.nudge.send_email")` 整体替换。**

不用 Depends 做依赖注入——这个仓库目前没有这种模式（`get_session` 是唯一的 Depends，用于 DB session），为一个函数引入新的依赖注入风格增加不必要的认知负担。`patch` 打在 `nudge.py` 里 `send_email` 这个名字上（不是 `email_client.send_email`）——Python mock 的标准坑：要 patch 调用点导入的名字，不是定义处的名字。

端点逻辑：
```python
@router.post("/send-email", response_model=NudgeEventRead, status_code=201)
def send_nudge_email(payload: NudgeSendEmailRequest, session=Depends(get_session)):
    student = session.get(Student, payload.student_email)
    if student is None:
        raise HTTPException(404, "没有这个学员")
    course = session.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(404, "没有这门课")

    subject = f"《{course.name}》作业提醒"
    try:
        send_email(to=payload.student_email, subject=subject, body=payload.body)
    except EmailSendError as exc:
        raise HTTPException(502, f"发送失败：{exc}") from exc

    row = NudgeEvent(
        student_email=payload.student_email, course_id=payload.course_id,
        event_type="nudged", channel="email", note="",
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return NudgeEventRead(type=row.event_type, channel=row.channel, note=row.note, at=row.created_at)
```

发送成功之后才写 DB——顺序不能反，否则发送失败时已经落库的记录就是脏数据（对应 spec"发送失败时 SHALL NOT 记录任何事件"）。

**4. 前端：`DetailPanel` 新增内部 `showConfirm` state 控制确认框显隐，确认框是手写 markup（同 `ImportDialog` 模式），不引入新组件库。`actions.ts` 新增 `sendNudgeEmail(studentEmail, courseId, body)` Server Action，内部调用 `POST /api/nudge/send-email`，失败时把 502 的 detail 文本透传给前端（复用现有 `BackendError`/`classify` 模式）。**

## Risks / Trade-offs

- **[风险] SMTP 中间态**（连接建立、鉴权通过，但对方服务器在真正接受邮件前超时）——投递结果不确定 → 接受：统一按失败处理（不记录已催），极小概率下会漏记一条实际送达的邮件；不追加投递回执确认机制，超出本轮范围（spec 里已明确记录这条边界）。
- **[风险] `send_email` 用同步 `smtplib`，FastAPI 路由函数是同步的（没有 `async def`），发送期间会阻塞这个 worker**——单人使用、逐条操作的场景下不构成实际问题（不是高并发路径）；如果将来要支持批量发送，这条会成为真实瓶颈，届时需要改成后台任务/队列，本轮不做。
- **[风险] `RESEND_API_KEY` 直接明文存在环境变量里**——跟仓库既有的 `BACKEND_SECRET`/`SITE_PASSWORD` 同一套信任模型（Render 环境变量面板），不新增风险面。
- **[风险] 发件域名 `austinxyz.ai` 的 DNS 验证是账号本人操作，agent 不能代做**——Resend 后台加 SPF/DKIM 记录、等 DNS 生效，这一步纯粹是"你做"，见 docs/setup.md。

## Migration Plan

无数据库结构变更——`nudge_events` 表已有的 `channel` 列直接存 `"email"`（跟 `_channel_for` 产生的值同一个字符串空间，不需要新枚举值）。环境变量从 `SMTP_USER`/`SMTP_PASSWORD` 换成 `RESEND_API_KEY`（旧变量可以直接从 Render 删除，代码不再读）。部署即生效，不配置这个变量时"发送邮件"按钮点击后端点返回 502，不影响其余功能。`httpx` 从 dev 依赖组提到主依赖，需要 `uv sync`/重新部署生效。

## Open Questions

（无——explore 与本文档已定：独立端点绕开 `_channel_for`、SMTP 客户端整体可 mock、失败不落库、确认框沿用手写 modal 模式。两处边界已在 spec.md 里标注给人工 review：跳过状态与发送邮件的交互、SMTP 中间态的处理方式。**上线后追加修订**：SMTP 被 Render 免费档出站封锁，换成 Resend HTTP API，发件人固定 `noreply@austinxyz.ai`）
