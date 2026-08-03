"""作业：`ai-course/tools/homework-grader/session*/grades.csv` 的镜像。

写入有且只有一个入口——`POST /api/homework/import`，整份文件导入。
页面上没有逐条编辑的控件，因为源文件由批改流程生成并由人维护：
两边都能改单条成绩就会分叉，而分叉之后没有哪一边有资格当准。
整份导入不产生这个问题：它的语义是"以这份文件为准"。

结构化的 `PUT /api/homework` 已移除。只留一条进库的路，就不会有
"命令行导进去的和网页导进去的不一样"。
"""

import base64
import binascii
import uuid
from datetime import UTC, date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, select

from app.db import get_session
from app.homework_parsing import (
    BadHeader,
    CannotDecode,
    MalformedCell,
    ParseResult,
    decode_csv,
    parse,
)
from app.models import (
    Course,
    CourseAlias,
    CourseSession,
    Enrollment,
    HomeworkExcludedEmail,
    HomeworkImport,
    HomeworkRubricItem,
    HomeworkSubmission,
    Student,
)
from app.routers.courses import derive_session_state
from app.schemas import (
    ExcludedEmailCreate,
    ExcludedEmailRead,
    HeaderMismatch,
    HomeworkCountRead,
    HomeworkImportRead,
    HomeworkImportRequest,
    HomeworkImportResult,
    HomeworkPersonRead,
    HomeworkReplyMarkRead,
    ImportRow,
    RubricItemRead,
    RubricSaveRequest,
    ScoreItem,
    normalize_alias,
)

router = APIRouter(prefix="/api/homework", tags=["homework"])

# 上传体积上限。真实的 grades.csv 是几 KB（S1 是 18 行），2 MB 已经宽出三个数量级——
# 上限存在的理由不是省空间，而是让一份误传的视频或数据库导出在**解码之前**
# 就被挡住：那些内容 GB18030 几乎都能解开，解完再拒绝等于白解一遍几百 MB。
MAX_UPLOAD_BYTES = 2 * 1024 * 1024

# 自动建档的占位默认值。这门机构目前只服务讲武堂这一家，占位值就是这家机构
# 当前最常见的真实取值——不做成"一眼假"的哨兵值，因为自动建档清单本身
# 已经是"这些人需要回头核对"的信号，不需要靠字段本身自证。
_AUTO_CREATE_DEFAULTS = {"region": "美东", "level": "有基础", "source": "讲武堂"}
_UNKNOWN_NAME_PLACEHOLDER = "待定"

# 四态。三态（稿子那版）不够：倒推进来的报课全是未定场次，而没有场次就没有
# 截止时间——把这些人算作「未交」等于制造一批催不了的催促目标。
SUBMITTED = "submitted"
NOT_OPEN = "not_open"
NO_SESSION = "no_session"
MISSING = "missing"

# 一人多条报课时，合并取**最宽容**的那个状态。
#
# 顺序就是这条规则本身：报了两场、其中一场还没上的人，不该因为另一场已经过了
# 就落进未交名单。写成"取第一条"的话，读接口没有 ORDER BY，"第一条"每次可能是
# 不同的行——同一个人时而未交、时而未开放，而错的那一边会**误催**。
_LENIENCY = [SUBMITTED, NOT_OPEN, NO_SESSION, MISSING]


def merge_states(states: list[str]) -> str:
    """同一个人的多条报课合成一个状态：取最宽容的那个。

    单独具名而不是内联进循环，是为了能单独测到——这条规则错了不会报错，
    只会让某个人被催或不被催，而那件事只有收件人看得见。
    """
    for candidate in _LENIENCY:
        if candidate in states:
            return candidate
    return MISSING  # pragma: no cover - states 非空时到不了


def state_of(session_row: CourseSession | None) -> str:
    """一条**没有提交**的报课记录对应的状态。

    「场次是否已结束」复用 `derive_session_state`——它处理了人工覆盖
    （比如把一场标成已取消）。另写一套日期比较必然在某个边界上分叉。
    """
    if session_row is None:
        return NO_SESSION
    state, _ = derive_session_state(session_row)
    return MISSING if state == "done" else NOT_OPEN


def _resolve_course(alias_raw: str, session: Session) -> Course:
    """别名 → 课程。查不到就整份拒绝。

    不做任何"从文件名猜"的兜底：源仓库里 `session3/` 与 `session4/` 的评分细则
    是对调的，`session4/` 整个目录是 S3 的空壳。目录名看着像可靠线索，实际不是。
    别名错了意味着整份文件都可能挂错课，所以这里拒绝的是整个请求，不是某一行。
    """
    alias = session.get(CourseAlias, normalize_alias(alias_raw))
    if alias is None:
        raise HTTPException(status_code=404, detail=f"没有别名为 {alias_raw!r} 的课程")
    course = session.get(Course, alias.course_id)
    if course is None:  # pragma: no cover - 外键保证
        raise HTTPException(status_code=404, detail=f"别名 {alias_raw!r} 指向的课程不存在")
    return course


@router.get("", response_model=list[HomeworkPersonRead])
def list_homework(
    course: uuid.UUID = Query(),
    session: Session = Depends(get_session),
) -> list[HomeworkPersonRead]:
    """一门课的作业名单。

    **一条 JOIN 取全。** 每次数据库往返实测 ≈ 61ms（Render → Supabase），
    而往返次数就是用户感知的延迟。这里能安全 JOIN 是因为每条报课至多对应
    一名学员、一场、一份作业，不会产生笛卡尔积。

    驱动表是**报课记录**，作业外连接上去——反过来以作业为驱动表会漏掉所有
    没交的人，也就是恰好漏掉这一页存在的理由。

    已归档学员与已退课的报课不进名单。这里的计数直接导向"催谁"，
    催一个已归档或已退课的人是错的。**与报课页有意不同**：那边的已报人数
    是历史事实的统计，不排除已归档学员。

    满分表通过一条**标量子查询**（聚合成 jsonb）嵌进这条 SQL，不新增
    `session.exec` 调用——往返次数只按应用发出几次数据库调用算，子查询是
    同一条语句的一部分。
    """
    rubric_json = (
        select(func.jsonb_object_agg(HomeworkRubricItem.item, HomeworkRubricItem.max_score))
        .where(HomeworkRubricItem.course_id == course)
        .scalar_subquery()
    )
    rows = session.exec(
        select(Enrollment, Student, CourseSession, HomeworkSubmission, rubric_json)
        .join(Student, Student.email == Enrollment.student_email)
        .outerjoin(CourseSession, CourseSession.id == Enrollment.session_id)
        .outerjoin(
            HomeworkSubmission,
            (HomeworkSubmission.student_email == Enrollment.student_email)
            & (HomeworkSubmission.course_id == Enrollment.course_id),
        )
        .where(
            Enrollment.course_id == course,
            Enrollment.status != "withdrawn",
            Student.archived_at.is_(None),
        )
    ).all()
    # 同一条课程，rubric map 对每一行都一样——取第一行的就够了；没有任何一行
    # （比如这门课没有报课记录）时回退空 map。
    rubric_max: dict[str, int] = (rows[0][4] or {}) if rows else {}

    # 按人去重（`enrollment` spec 的「作业按人计，不按报课记录计」）：
    # 重复来听是加深印象，不是重修——再催她交一遍作业是打扰。
    people: dict[str, dict] = {}
    for enrollment, student, session_row, submission, _rubric in rows:
        found = people.setdefault(
            student.email,
            {"student": student, "submission": submission, "states": []},
        )
        if submission is not None:
            found["submission"] = submission
        found["states"].append(SUBMITTED if submission is not None else state_of(session_row))

    # 名次：按总分降序，并列时用邮箱打破——排序键打不破并列的话，两个同分的人
    # 谁在前会随堆顺序抖动，而堆顺序会因为任何一次写入而变。
    scored = sorted(
        ((p["submission"].total, email) for email, p in people.items() if p["submission"]),
        key=lambda pair: (-pair[0], pair[1]),
    )
    rank_by_email = {email: i + 1 for i, (_, email) in enumerate(scored)}

    result = []
    for email, found in people.items():
        student = found["student"]
        submission = found["submission"]
        scores = []
        total_max = None
        if submission:
            scores = [
                ScoreItem(item=s["item"], score=s["score"], max=rubric_max.get(s["item"]))
                for s in submission.scores
            ]
            # 全部分项都配了满分才有意义的总分母；少一项就回退成 None，
            # 不显示一个基于错误分母的比例。
            if scores and all(s.max is not None for s in scores):
                total_max = sum(s.max for s in scores)
        result.append(
            HomeworkPersonRead(
                student_email=email,
                name=student.name,
                wechat=student.wechat,
                state=merge_states(found["states"]),
                submitted_at=submission.submitted_at if submission else None,
                total=submission.total if submission else None,
                scores=scores,
                highlight=submission.highlight if submission else "",
                improve=submission.improve if submission else "",
                reply_status=submission.reply_status if submission else "",
                source_ref=submission.source_ref if submission else "",
                rank=rank_by_email.get(email),
                rank_of=len(scored),
                submission_id=submission.id if submission else None,
                replied=submission.replied if submission else False,
                replied_at=submission.replied_at if submission else None,
                total_max=total_max,
            )
        )
    # 按总分降序——先看到的是做得最好的人。没交的人没有总分，排在已交的人
    # 之后（`total is None` 排序时当成负无穷处理）；同分或都没交时按姓名、
    # 邮箱兜底，保证确定顺序——没有兜底键的话，编辑过的记录会跑到最后，
    # 位置记的是最后一次写入时间，而不是数据本身的任何属性。
    result.sort(
        key=lambda person: (
            0 if person.total is not None else 1,
            -person.total if person.total is not None else 0,
            person.name,
            person.student_email,
        )
    )
    return result


@router.get("/count", response_model=HomeworkCountRead)
def count_homework(session: Session = Depends(get_session)) -> HomeworkCountRead:
    """全部课程合计的提交总数。侧边栏徽标用——那里要的是"总共积了多少作业"，
    不是某一门课的名单，所以不带 `course` 参数，直接数 `homework_submissions` 整张表。
    """
    total = session.exec(select(func.count()).select_from(HomeworkSubmission)).one()
    return HomeworkCountRead(total=total)


def _too_large() -> HTTPException:
    """超限的说法只有一处。

    两道体积判断（decode 前的粗筛、decode 后的精筛）报的必须是同一句话——
    用户不该从措辞上察觉到自己撞的是哪一道。
    """
    limit_mb = MAX_UPLOAD_BYTES // (1024 * 1024)
    return HTTPException(
        status_code=413,
        detail=f"文件超过上限（{limit_mb} MB）。grades.csv 通常只有几 KB，"
        "请确认选的是批改流程生成的成绩文件。",
    )


def _decode_and_parse(payload: HomeworkImportRequest) -> tuple[str, ParseResult]:
    """上传的 base64 → `(实际采用的编码, 解析结果)`。不碰数据库。

    这里的四种拒绝**处置各不相同**，所以措辞分开，不合并成一句"文件有问题"：

    | 拒绝 | 用户该做什么 |
    |---|---|
    | 不是合法 base64 | 传输坏了，重传 |
    | 超过体积上限 | 确认选的是成绩文件，不是别的 |
    | 两种编码都解不开 | 用「CSV UTF-8」重新另存 |
    | 表头缺列 / 某格读不出数 | 确认是不是传错了文件；或回源文件改那一行 |

    全部是 4xx：这些都是用户正常操作能撞到的，不是服务器故障。
    """
    # 粗筛：base64 比原文长 4/3，所以「原文一定超标」的下界是 base64 长度 × 3/4。
    # 这一步在 **decode 之前**，因为 decode 会为一份误传的大文件实打实分配一遍内存，
    # 而上限存在的理由正是别让那件事发生。
    #
    # 用 `× 3 // 4` 而不是直接拿 base64 的长度比：后者会把一份 1.6MB 的合法文件
    # 当成 2MB+ 挡下来——它明明在限内。粗筛只负责挡住铁定超标的，
    # 精确的那次判断在 decode 之后。
    if len(payload.content_base64) * 3 // 4 > MAX_UPLOAD_BYTES:
        raise _too_large()

    try:
        raw = base64.b64decode(payload.content_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="上传内容不是合法的 base64")

    # 精筛：base64 里的换行与填充会让粗筛偏松，真实字节数只有解完才知道。
    if len(raw) > MAX_UPLOAD_BYTES:
        raise _too_large()

    try:
        text, encoding = decode_csv(raw)
    except CannotDecode as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        return encoding, parse(text, source=payload.filename)
    except (BadHeader, MalformedCell) as exc:
        raise HTTPException(status_code=422, detail=str(exc))


def _course_of(payload: HomeworkImportRequest, session: Session) -> Course:
    """请求里的课程入参 → 课程。**两者都不给就整份拒绝，不猜。**

    `course_id` 优先于 `course_alias`：网页手里已经有 id（在 URL 里，选不错），
    别名是给 MCP 那条路留的。两者都给且指向不同课程时以 id 为准——
    有一个确定的优先级，比"两个都试试"少一整类"到底写进哪门课"的问题。
    """
    if payload.course_id is not None:
        course = session.get(Course, payload.course_id)
        if course is None:
            raise HTTPException(status_code=404, detail="课程不存在")
        return course
    if payload.course_alias:
        return _resolve_course(payload.course_alias, session)
    # 不从文件名、路径或内容推断——源仓库的目录名本身就已经错了一处。
    raise HTTPException(status_code=422, detail="必须指定课程：给出 course_id 或 course_alias")


def _header_warning(course: Course, rows: list[dict], session: Session) -> HeaderMismatch | None:
    """上传的分项列 vs 这门课已有成绩的分项列。不同就警告，**但不拒绝**。

    比较的是**有序序列**：列的先后是评分表分组结构（A 工作流 / B 提示词 /
    C 输出 / D 心得）的唯一载体，顺序换了就是另一套评分表。

    取既有列时带 `ORDER BY`：没有排序的话"随便取一行"每次可能是不同的行，
    于是同一次上传时而警告时而不警告——而两种结果都不报错。
    """
    if not rows:
        return None
    existing = session.exec(
        select(HomeworkSubmission)
        .where(HomeworkSubmission.course_id == course.id)
        .order_by(HomeworkSubmission.student_email)
        .limit(1)
    ).first()
    if existing is None:
        # 这门课一条成绩都没有——没有可比对的既有列，就没有"不符"可言。
        return None

    file_items = [score["item"] for score in rows[0]["scores"]]
    existing_items = [score["item"] for score in existing.scores]
    if file_items == existing_items:
        return None
    return HeaderMismatch(file_items=file_items, existing_items=existing_items)


def _classify(
    course: Course,
    rows: list[dict],
    session: Session,
    *,
    names: dict[str, str],
    dry_run: bool,
) -> dict:
    """把解析出的行分成「写了」「没写」几类，并在非 dry-run 时真的写。

    三次成批查询而不是每行三次——行数是一整门课的人数（S1 是 18 行），
    而每次数据库往返实测 ≈ 61ms（Render → Supabase）。

    **覆盖式，不是同步式删除**：源文件里少了一行，库里那条仍然留着。
    csv 是会被裁剪、被重新生成的，把"这次没送来"读成"该删掉"会让一次误操作
    抹掉历史成绩，而权威副本的恢复要跨仓库。

    邮箱不在学员表的行不再跳过：自动建一条最小学员档案与一条 `derived` 报课，
    成绩照常写入（详见 `homework` / `enrollment` spec 的对应 Requirement）。
    """
    emails = [row["student_email"] for row in rows]
    known = (
        set(session.exec(select(Student.email).where(Student.email.in_(emails))).all())
        if emails
        else set()
    )
    enrolled = (
        set(
            session.exec(
                select(Enrollment.student_email).where(
                    Enrollment.course_id == course.id,
                    Enrollment.student_email.in_(emails),
                )
            ).all()
        )
        if emails
        else set()
    )
    existing = {
        row.student_email: row
        for row in session.exec(
            select(HomeworkSubmission).where(HomeworkSubmission.course_id == course.id)
        ).all()
    }

    created = updated = 0
    auto_created: list[str] = []
    no_enrollment: list[str] = []
    staged: set[str] = set()
    will_write: list[ImportRow] = []
    # 只在真的遇到未知邮箱、且非 dry-run 时才查一次——多数导入（重复导入、
    # 老学员补交）不会触发它，不给"数据库往返次数受约束"这条纪律增加常态开销。
    new_enrollment_date: date | None = None

    for row in rows:
        email = row["student_email"]
        if email not in known:
            auto_created.append(email)
            if not dry_run:
                if new_enrollment_date is None:
                    earliest = session.exec(
                        select(func.min(CourseSession.local_date)).where(
                            CourseSession.course_id == course.id
                        )
                    ).one()
                    new_enrollment_date = earliest or date.today()
                session.add(
                    Student(
                        email=email,
                        name=names.get(email) or _UNKNOWN_NAME_PLACEHOLDER,
                        **_AUTO_CREATE_DEFAULTS,
                    )
                )
                # 建 Enrollment 之前先落库 Student——两者之间没有 ORM
                # `relationship()`，unit of work 不会自动按外键把插入顺序
                # 排到 Student 之前，不 flush 会撞外键约束。
                session.flush()
                session.add(
                    Enrollment(
                        student_email=email,
                        course_id=course.id,
                        session_id=None,
                        source="derived",
                        enrolled_at=new_enrollment_date,
                    )
                )
            # 建了档、建了报课，走下面与已在册学员相同的写入路径。
            known.add(email)
            enrolled.add(email)
        if email not in enrolled:
            # 成绩照写——它是有效数据。但名单来自报课记录，所以这个人在页面上
            # 一行都不会出现，不列出来就是静默消失。
            no_enrollment.append(email)

        found = existing.get(email)
        if found is None and email not in staged:
            created += 1
            action = "create"
        else:
            updated += 1
            action = "update"
        staged.add(email)
        will_write.append(
            ImportRow(
                email=email,
                name=names.get(email, ""),
                total=row["total"],
                action=action,
            )
        )

        # dry-run **不往 session 里放任何东西**。
        #
        # 不用"照常 add、最后 rollback"：那样 dry-run 的正确性就取决于事务语义，
        # 而调用方的事务边界不归这里管——真发生过一次，回滚把调用方在本次事务里
        # 做的别的事（pytest fixture 自己的清表）一起撤销了。不写就是不写。
        if dry_run:
            continue

        # 解析层给出的键与 `HomeworkSubmission` 的列一一对应，除了主键那两个。
        fields = {key: value for key, value in row.items() if key != "student_email"}
        if found is None:
            record = HomeworkSubmission(student_email=email, course_id=course.id, **fields)
            session.add(record)
            # 同一封邮箱在一次请求里出现两次时，第二次要落到"更新"上而不是
            # 再 add 一条——唯一索引会挡，但那是 500，不是"更新了"。
            existing[email] = record
        else:
            for key, value in fields.items():
                setattr(found, key, value)
            session.add(found)

    return {
        "created": created,
        "updated": updated,
        "auto_created": auto_created,
        "skipped_no_enrollment": no_enrollment,
        "rows": will_write,
    }


@router.post("/import", response_model=HomeworkImportResult)
def import_homework(
    payload: HomeworkImportRequest,
    dry_run: bool = Query(default=False),
    session: Session = Depends(get_session),
) -> HomeworkImportResult:
    """从上传的 `grades.csv` 字节导入一门课的成绩。**唯一一条进库的路。**

    解码、解析、校验、排除、分类全在这里，因为已知的下一个调用方是 MCP，
    它不经过 Next.js——任何落在 Server Action 里的规则都会被那条路径绕过。

    `?dry_run=true` 算出完整处置结果但一条都不写。"谁在学员表""谁有该课的报课记录"
    只有数据库知道，所以 dry-run 不能只在调用方本地做：那样它报不出实际会自动建
    哪些人。

    **幂等**：同一份文件导几遍结果都一样，不会多出记录。唯一键是
    「学员 + 课程」——一个人重复听同一门课会有多条报课，但只欠一份作业。

    返回体里的两份清单**含义不同**，所以分开列，不要合并看：

    | 清单 | 含义 | 成绩写了吗 | 该做什么 |
    |---|---|---|---|
    | `auto_created` | 邮箱在 `students` 里原本查不到，本次自动建了档案与报课 | **写了** | 讲师之后回填真实信息（占位字段：美东 / 有基础 / 讲武堂） |
    | `skipped_no_enrollment` | 学员在册，但这门课没有报课 | **写了** | 补报课记录 |

    两类要特别注意：成绩都已经进库了，但作业页的名单来自**报课记录**，
    `skipped_no_enrollment` 那一类在页面上一行都不会出现。不补报课的话，
    页面计数会比 csv 的行数少，而那是**正确行为**，不是缺陷。
    """
    encoding, parsed = _decode_and_parse(payload)
    course = _course_of(payload, session)

    # 排除名单先于一切分类：被排除的人不是"待处理项"，
    # 把他留在「自动建档」那份清单里会让人一次次去建那个不该建的档。
    excluded_all = set(session.exec(select(HomeworkExcludedEmail.email)).all())
    excluded = [row["student_email"] for row in parsed.rows if row["student_email"] in excluded_all]
    kept = [row for row in parsed.rows if row["student_email"] not in excluded_all]

    # 在写入**之前**比对：写完再比的话，既有列已经被这次上传盖成新的了。
    warning = _header_warning(course, kept, session)

    outcome = _classify(course, kept, session, names=parsed.names, dry_run=dry_run)
    if not dry_run:
        # 记录只在**实际写入**时产生。dry-run 也记的话，「上次导入 …」
        # 会指向一次没有发生过的导入——而页面上看不出那一行是假的。
        session.add(
            HomeworkImport(
                course_id=course.id,
                filename=payload.filename,
                encoding=encoding,
                row_count=len(parsed.rows),
                created_count=outcome["created"],
                updated_count=outcome["updated"],
            )
        )
        session.commit()

    return HomeworkImportResult(
        encoding=encoding,
        row_count=len(parsed.rows),
        superseded=parsed.superseded,
        rows_without_email=parsed.rows_without_email,
        excluded=excluded,
        header_warning=warning,
        **outcome,
    )


@router.get("/last-import", response_model=HomeworkImportRead | None)
def last_import(
    course: uuid.UUID = Query(),
    session: Session = Depends(get_session),
) -> HomeworkImportRead | None:
    """这门课最近一次导入的元信息。还没导过就是 `null`，不是 404——
    "还没有"是正常状态，不是错误。

    `ORDER BY` 必须能打破并列：两次导入落在同一时刻时（测试里就会），
    没有第二排序键的话"最近一次"每次可能是不同的行。
    """
    found = session.exec(
        select(HomeworkImport)
        .where(HomeworkImport.course_id == course)
        .order_by(HomeworkImport.imported_at.desc(), HomeworkImport.id.desc())
        .limit(1)
    ).first()
    if found is None:
        return None
    return HomeworkImportRead(
        filename=found.filename,
        encoding=found.encoding,
        row_count=found.row_count,
        created_count=found.created_count,
        updated_count=found.updated_count,
        imported_at=found.imported_at,
    )


@router.post("/excluded", response_model=ExcludedEmailRead, status_code=201)
def add_excluded_email(
    payload: ExcludedEmailCreate,
    session: Session = Depends(get_session),
) -> ExcludedEmailRead:
    """把一个邮箱**永久**加入排除名单。全课程通用。

    幂等：已经在名单里就原样返回。重复标记同一个人是完全正常的操作
    （两次导入之间他又出现了一遍），报 409 只会让调用方去处理一个
    它无法预防的冲突。
    """
    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=422, detail="邮箱不能为空")

    found = session.get(HomeworkExcludedEmail, email)
    if found is None:
        found = HomeworkExcludedEmail(email=email, note=payload.note)
        session.add(found)
        session.commit()
        session.refresh(found)
    return ExcludedEmailRead(email=found.email, note=found.note)


@router.get("/rubric", response_model=list[RubricItemRead])
def get_rubric(
    course: uuid.UUID = Query(),
    session: Session = Depends(get_session),
) -> list[RubricItemRead]:
    """一门课的评分表：分项名字系统自动列出（去重自已导入的成绩），各自的满分。

    分项名字**不是**讲师手打的——取自 `homework_submissions.scores` 实际出现过的
    值，保证名字始终跟真实导入的数据一致，不会出现"配了但跟源文件列名对不上"。
    """
    submissions = session.exec(
        select(HomeworkSubmission.scores).where(HomeworkSubmission.course_id == course)
    ).all()
    items = sorted({score["item"] for scores in submissions for score in scores})

    configured = {
        row.item: row.max_score
        for row in session.exec(
            select(HomeworkRubricItem).where(HomeworkRubricItem.course_id == course)
        ).all()
    }
    return [RubricItemRead(item=item, max_score=configured.get(item)) for item in items]


@router.put("/rubric", response_model=list[RubricItemRead])
def save_rubric(payload: RubricSaveRequest, session: Session = Depends(get_session)) -> list[RubricItemRead]:
    """整表覆盖式写入：`max_score` 有值的 upsert，`null` 的删除已有配置。

    跟 `homework` 导入同一套哲学——写入语义是"以这次提交为准"，不是"只改我传的
    那几个字段"。讲师在课程页的表单本来就会把所有分项（有的填了、有的留空）
    一次提交上来。
    """
    for item in payload.items:
        if item.max_score is not None and item.max_score <= 0:
            raise HTTPException(status_code=422, detail=f"「{item.item}」的满分必须是正整数")

    for item in payload.items:
        existing = session.get(HomeworkRubricItem, (payload.course_id, item.item))
        if item.max_score is None:
            if existing is not None:
                session.delete(existing)
            continue
        if existing is None:
            session.add(
                HomeworkRubricItem(course_id=payload.course_id, item=item.item, max_score=item.max_score)
            )
        else:
            existing.max_score = item.max_score
            session.add(existing)
    session.commit()

    return get_rubric(course=payload.course_id, session=session)


def _load_submission(submission_id: uuid.UUID, session: Session) -> HomeworkSubmission:
    row = session.get(HomeworkSubmission, submission_id)
    if row is None:
        raise HTTPException(status_code=404, detail="没有这条提交记录")
    return row


@router.post("/submissions/{submission_id}/reply", response_model=HomeworkReplyMarkRead)
def mark_replied(submission_id: uuid.UUID, session: Session = Depends(get_session)) -> HomeworkReplyMarkRead:
    """标记讲师已经回复过这条提交。

    无请求体——这个操作只携带一个事实（"这件事发生了"），时间戳只能由服务端
    说了算，接受调用方提供的时间会让这个审计值变成客户端可控的。与
    `Student.archive`/`restore` 同一个理由。
    """
    row = _load_submission(submission_id, session)
    row.replied = True
    row.replied_at = datetime.now(UTC)
    session.add(row)
    session.commit()
    return HomeworkReplyMarkRead(replied=row.replied, replied_at=row.replied_at)


@router.post("/submissions/{submission_id}/unreply", response_model=HomeworkReplyMarkRead)
def mark_unreplied(submission_id: uuid.UUID, session: Session = Depends(get_session)) -> HomeworkReplyMarkRead:
    """标记改回来。两个字段一起清空——不给"replied=false 但 replied_at 还留着"
    这种中间态留口子。"""
    row = _load_submission(submission_id, session)
    row.replied = False
    row.replied_at = None
    session.add(row)
    session.commit()
    return HomeworkReplyMarkRead(replied=row.replied, replied_at=row.replied_at)
