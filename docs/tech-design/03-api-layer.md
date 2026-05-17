# API 层详细设计

> 文档版本：v3.0（2026-05-16）
> 实现状态：已实现（Cloudflare Workers）

## 1. API 概览

### 1.1 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 运行时 | Cloudflare Workers | Edge 部署，fetch 事件驱动 |
| 语言 | TypeScript | 编译期类型检查 |
| API 层 | Workers 内置路由 | 简单路由，无需额外框架 |
| 认证 | Cloudflare Auth / JWT | 用户认证 |
| CORS | Workers CORS 配置 | 跨域支持 |

### 1.2 端点总览

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/v1/assess` | POST | 提交副作用评估 | 用户 |
| `/api/v1/assessments/{id}` | GET | 获取评估详情 | 用户 |
| `/api/v1/assessments` | GET | 获取评估历史列表 | 用户 |
| `/api/v1/assessments/{id}/feedback` | POST | 提交评估反馈 | 用户 |
| `/api/v1/team/notify` | POST | 发送团队通知 | 用户 |
| `/api/v1/team/assessments` | GET | 团队查看患者评估 | 团队 |
| `/api/v1/team/feedback` | POST | 团队提交反馈 | 团队 |
| `/api/v1/rules/versions` | GET | 获取当前规则版本 | 公开 |
| `/api/v1/health` | GET | 健康检查 | 公开 |
| `/api/v1/users/profile` | GET/PUT | 用户资料 | 用户 |

## 2. 请求/响应格式

### 2.1 统一响应格式

```python
# src/api/schemas/response.py

from typing import Generic, TypeVar, Optional, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

T = TypeVar('T')

class ResponseStatus(Enum):
    """响应状态"""
    SUCCESS = "success"
    ERROR = "error"
    PARTIAL = "partial"  # 部分成功

class APIResponse(BaseModel, Generic[T]):
    """统一 API 响应格式"""
    
    status: ResponseStatus = ResponseStatus.SUCCESS
    message: Optional[str] = None
    data: Optional[T] = None
    error: Optional[ErrorDetail] = None
    meta: Optional[ResponseMeta] = None
    
    # 兼容 FastAPI 的标准响应
    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "message": "评估完成",
                "data": {...},
                "meta": {
                    "request_id": "uuid-xxx",
                    "processing_time_ms": 150
                }
            }
        }

class ErrorDetail(BaseModel):
    """错误详情"""
    code: str                    # 错误码，如 "VALIDATION_ERROR"
    message: str                 # 人类可读的错误消息
    details: Optional[Dict[str, Any]] = None
    field: Optional[str] = None  # 如果是字段错误，标识具体字段

class ResponseMeta(BaseModel):
    """响应元数据"""
    request_id: str
    processing_time_ms: Optional[float] = None
    pagination: Optional[PaginationMeta] = None

class PaginationMeta(BaseModel):
    """分页元数据"""
    page: int
    page_size: int
    total: int
    total_pages: int
```

### 2.2 评估相关格式

#### 评估请求

```python
# src/api/schemas/assessment.py

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, field_validator
from datetime import datetime

class AssessmentRequest(BaseModel):
    """评估请求"""
    
    # 用户输入
    input: str = Field(
        ...,
        min_length=5,
        max_length=2000,
        description="副作用/症状描述",
        examples=["恶心想吐，已经持续2天了，而且吃不下东西"]
    )
    
    # 可选上下文
    context: Optional[AssessmentContext] = Field(
        default=None,
        description="评估上下文"
    )
    
    @field_validator('input')
    @classmethod
    def validate_input(cls, v: str) -> str:
        # 移除明显的空白和格式化
        v = ' '.join(v.split())
        if len(v) < 5:
            raise ValueError('输入内容过短，请详细描述您的症状')
        return v

class AssessmentContext(BaseModel):
    """评估上下文"""
    
    treatment_phase: Optional[str] = Field(
        default=None,
        description="治疗阶段",
        examples=["chemotherapy_cycle_2", "post_surgery_week_2"]
    )
    
    treatment_type: Optional[str] = Field(
        default=None,
        description="治疗类型",
        examples=["AC-T", "Herceptin", "Surgery"]
    )
    
    treatment_day: Optional[int] = Field(
        default=None,
        ge=1,
        le=30,
        description="治疗天数（化疗后第几天）"
    )
    
    known_side_effects: Optional[List[str]] = Field(
        default_factory=list,
        description="已知副作用"
    )
    
    additional_info: Optional[Dict[str, Any]] = Field(
        default=None,
        description="其他补充信息"
    )

class AssessmentResponse(BaseModel):
    """评估响应"""
    
    assessment_id: str
    risk_level: RiskLevel = Field(description="风险等级")
    risk_score: float = Field(ge=0, le=100, description="风险分数 0-100")
    
    # 决策信息
    result: RiskResult = Field(description="风险结果详情")
    immediate_action: str = Field(description="立即行动建议")
    follow_up_suggestion: Optional[str] = Field(default=None, description="后续建议")
    reasoning: str = Field(description="决策推理过程")
    triggered_rules: List[TriggeredRule] = Field(default_factory=list, description="触发的规则")
    
    # 标志
    team_contact_required: bool = Field(default=False, description="是否需要联系团队")
    
    # 元数据
    metadata: AssessmentMetadata
    
    # 时间戳
    created_at: datetime

class RiskLevel(str):
    """风险等级枚举"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class RiskResult(BaseModel):
    """风险结果"""
    level: RiskLevel
    label: str = Field(description="中文标签")
    color: str = Field(description="颜色代码")

class TriggeredRule(BaseModel):
    """触发的规则"""
    id: str
    name: str
    confidence: float = Field(ge=0, le=1)
    source: str = Field(description="依据来源")
    immediate_action: Optional[str] = None

class AssessmentMetadata(BaseModel):
    """评估元数据"""
    model_version: str
    rules_version: str
    processing_time_ms: float
```

#### 评估历史请求

```python
class AssessmentListRequest(BaseModel):
    """评估历史列表请求"""
    
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    
    # 筛选条件
    risk_level: Optional[RiskLevel] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    # 排序
    sort_by: str = Field(default="created_at")
    sort_order: SortOrder = Field(default=SortOrder.DESC)

class AssessmentListItem(BaseModel):
    """评估列表项"""
    
    assessment_id: str
    risk_level: RiskLevel
    risk_score: float
    summary: str = Field(description="症状摘要")
    triggered_rules_count: int
    team_contact_required: bool
    created_at: datetime
```

### 2.3 反馈相关格式

```python
class FeedbackRequest(BaseModel):
    """反馈请求"""
    
    assessment_id: str
    
    # 反馈类型
    feedback_type: FeedbackType = Field(description="反馈类型")
    
    # 用户显式反馈
    is_helpful: Optional[bool] = Field(default=None, description="是否有帮助")
    rating: Optional[int] = Field(default=None, ge=1, le=5, description="评分 1-5")
    comment: Optional[str] = Field(default=None, max_length=500, description="评论")
    
    # 团队反馈
    team_verdict: Optional[TeamVerdict] = Field(default=None, description="团队判断")
    team_comment: Optional[str] = Field(default=None, max_length=1000, description="团队评论")
    
    @field_validator('is_helpful', 'rating')
    @classmethod
    def validate_user_feedback(cls, v, info):
        # 如果是用户反馈，必须提供 is_helpful 或 rating
        if info.data.get('feedback_type') == FeedbackType.USER_RATING:
            if v is None and info.data.get('rating') is None:
                raise ValueError('用户反馈需要提供 is_helpful 或 rating')
        return v

class FeedbackType(str):
    """反馈类型"""
    USER_RATING = "user_rating"
    TEAM_VERDICT = "team_verdict"
    BEHAVIOR_TRACKING = "behavior_tracking"

class TeamVerdict(str):
    """团队判断"""
    ACCURATE = "accurate"
    INACCURATE = "inaccurate"
    NEEDS_ADJUSTMENT = "needs_adjustment"
```

### 2.4 团队协作格式

```python
class TeamNotificationRequest(BaseModel):
    """团队通知请求"""
    
    assessment_id: str
    priority: NotificationPriority = Field(default=NotificationPriority.NORMAL)
    message: Optional[str] = Field(default=None, max_length=500, description="附言")

class TeamNotificationResponse(BaseModel):
    """团队通知响应"""
    
    notification_id: str
    status: NotificationStatus
    sent_at: datetime
    recipients: List[str] = Field(description="接收人列表")

class NotificationPriority(str):
    """通知优先级"""
    URGENT = "urgent"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"

class TeamPatientAssessmentsRequest(BaseModel):
    """团队查看患者评估请求"""
    
    patient_id: str
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    risk_level: Optional[RiskLevel] = None
```

## 3. API 实现

### 3.1 评估端点

```python
# src/api/routes/assess.py

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from typing import Optional
from datetime import datetime
import logging

from ..schemas.assessment import (
    AssessmentRequest,
    AssessmentResponse,
    AssessmentListRequest,
    AssessmentListItem,
    RiskLevel
)
from ..schemas.response import APIResponse
from ..dependencies import get_current_user, get_db_session
from ...services.assessment_service import AssessmentService
from ...agents.execution.assessment_flow import AssessmentExecutionFlow

router = APIRouter(prefix="/assess", tags=["评估"])
logger = logging.getLogger(__name__)

@router.post(
    "",
    response_model=APIResponse[AssessmentResponse],
    summary="提交副作用评估",
    description="用户提交副作用描述，系统进行风险评估并返回建议"
)
async def create_assessment(
    request: Request,
    body: AssessmentRequest,
    background_tasks: BackgroundTasks,
    current_user = Depends(get_current_user),
    db = Depends(get_db_session)
):
    """
    创建评估
    
    流程:
    1. 验证请求
    2. 启动 Assessment Orchestrator Agent
    3. 返回初步响应（处理中）
    4. 后台处理完成评估
    5. 保存结果到数据库
    6. 发送团队通知（如需要）
    """
    
    request_id = request.state.request_id
    start_time = datetime.utcnow()
    
    logger.info(
        f"[{request_id}] Assessment request from user {current_user.id}",
        extra={"request_id": request_id, "user_id": current_user.id}
    )
    
    try:
        # 初始化服务
        assessment_service = AssessmentService(db, request.app.state.llm_client)
        
        # 执行评估流程
        result = await assessment_service.execute_assessment(
            user_id=current_user.id,
            user_input=body.input,
            context=body.context.model_dump() if body.context else None
        )
        
        processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        
        # 构建响应
        response = AssessmentResponse(
            assessment_id=result["assessment_id"],
            risk_level=result["risk_level"],
            risk_score=result["risk_score"],
            result={
                "level": result["risk_level"],
                "label": {"high": "高风险", "medium": "中风险", "low": "低风险"}[result["risk_level"]],
                "color": {
                    "high": "#EF4444",
                    "medium": "#F59E0B",
                    "low": "#22C55E"
                }.get(result["risk_level"], "#6B7280")
            },
            immediate_action=result["immediate_action"],
            follow_up_suggestion=result.get("follow_up_suggestion"),
            reasoning=result["reasoning"],
            triggered_rules=result.get("triggered_rules", []),
            team_contact_required=result.get("team_contact_required", False),
            metadata={
                "model_version": "v1.0.0",
                "rules_version": result.get("rules_version", "v1.0.0"),
                "processing_time_ms": processing_time
            },
            created_at=result["created_at"]
        )
        
        # 如果是高风险，后台发送通知
        if result["risk_level"] == "high":
            background_tasks.add_task(
                send_high_risk_notification,
                result["assessment_id"],
                current_user.id
            )
        
        return APIResponse(
            status=ResponseStatus.SUCCESS,
            message="评估完成",
            data=response,
            meta=ResponseMeta(
                request_id=request_id,
                processing_time_ms=processing_time
            )
        )
        
    except Exception as e:
        logger.error(f"[{request_id}] Assessment failed: {e}", exc_info=True)
        
        raise HTTPException(
            status_code=500,
            detail={
                "code": "ASSESSMENT_FAILED",
                "message": "评估服务暂时不可用，请稍后重试"
            }
        )


@router.get(
    "/assessments",
    response_model=APIResponse[List[AssessmentListItem]],
    summary="获取评估历史列表"
)
async def list_assessments(
    current_user = Depends(get_current_user),
    db = Depends(get_db_session),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    risk_level: Optional[RiskLevel] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    """获取当前用户的评估历史列表"""
    
    # 构建查询
    query = db.query(Assessment).filter(Assessment.user_id == current_user.id)
    
    # 应用筛选
    if risk_level:
        query = query.filter(Assessment.risk_level == risk_level.value)
    if start_date:
        query = query.filter(Assessment.created_at >= start_date)
    if end_date:
        query = query.filter(Assessment.created_at <= end_date)
    
    # 获取总数
    total = query.count()
    
    # 分页查询
    assessments = query.order_by(Assessment.created_at.desc())\
        .offset((page - 1) * page_size)\
        .limit(page_size)\
        .all()
    
    # 构建响应列表
    items = [
        AssessmentListItem(
            assessment_id=a.id,
            risk_level=a.risk_level,
            risk_score=a.risk_score,
            summary=generate_summary(a.raw_input),
            triggered_rules_count=len(a.triggered_rules or []),
            team_contact_required=a.team_contact_required,
            created_at=a.created_at
        )
        for a in assessments
    ]
    
    return APIResponse(
        data=items,
        meta=ResponseMeta(
            request_id="",  # 简化处理
            pagination=PaginationMeta(
                page=page,
                page_size=page_size,
                total=total,
                total_pages=(total + page_size - 1) // page_size
            )
        )
    )


@router.get(
    "/assessments/{assessment_id}",
    response_model=APIResponse[AssessmentResponse],
    summary="获取评估详情"
)
async def get_assessment(
    assessment_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db_session)
):
    """获取指定评估的详细信息"""
    
    assessment = db.query(Assessment).filter(
        Assessment.id == assessment_id,
        Assessment.user_id == current_user.id
    ).first()
    
    if not assessment:
        raise HTTPException(status_code=404, detail="评估不存在")
    
    return APIResponse(data=assessment_to_response(assessment))


def generate_summary(raw_input: str, max_length: int = 100) -> str:
    """生成症状摘要"""
    if len(raw_input) <= max_length:
        return raw_input
    return raw_input[:max_length] + "..."


def assessment_to_response(assessment: Assessment) -> AssessmentResponse:
    """将数据库模型转换为响应格式"""
    return AssessmentResponse(
        assessment_id=assessment.id,
        risk_level=assessment.risk_level,
        risk_score=assessment.risk_score,
        result={
            "level": assessment.risk_level,
            "label": {"high": "高风险", "medium": "中风险", "low": "低风险"}[assessment.risk_level],
            "color": {
                "high": "#EF4444",
                "medium": "#F59E0B",
                "low": "#22C55E"
            }.get(assessment.risk_level, "#6B7280")
        },
        immediate_action=assessment.immediate_action,
        follow_up_suggestion=assessment.follow_up_suggestion,
        reasoning=assessment.reasoning,
        triggered_rules=assessment.triggered_rules or [],
        team_contact_required=assessment.team_contact_required,
        metadata={
            "model_version": assessment.model_version,
            "rules_version": assessment.rules_version,
            "processing_time_ms": assessment.processing_time_ms
        },
        created_at=assessment.created_at
    )
```

### 3.2 反馈端点

```python
# src/api/routes/feedback.py

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field
from datetime import datetime
import logging

from ..schemas.feedback import (
    FeedbackRequest,
    FeedbackResponse
)
from ..schemas.response import APIResponse
from ..dependencies import get_current_user, get_db_session

router = APIRouter(prefix="/feedback", tags=["反馈"])
logger = logging.getLogger(__name__)

@router.post(
    "",
    response_model=APIResponse[FeedbackResponse],
    summary="提交反馈"
)
async def submit_feedback(
    request: Request,
    body: FeedbackRequest,
    current_user = Depends(get_current_user),
    db = Depends(get_db_session)
):
    """
    提交评估反馈
    
    支持:
    - 用户评价（是否有帮助）
    - 团队判断（准确/不准确/需调整）
    - 行为追踪（后续是否就医）
    """
    
    request_id = request.state.request_id
    
    # 验证评估存在且属于当前用户
    assessment = db.query(Assessment).filter(
        Assessment.id == body.assessment_id,
        Assessment.user_id == current_user.id
    ).first()
    
    if not assessment:
        # 团队用户可以查看任何评估
        if current_user.role == "team":
            assessment = db.query(Assessment).filter(
                Assessment.id == body.assessment_id
            ).first()
            
            if not assessment:
                raise HTTPException(status_code=404, detail="评估不存在")
        else:
            raise HTTPException(status_code=404, detail="评估不存在")
    
    # 创建反馈记录
    feedback = Feedback(
        assessment_id=body.assessment_id,
        feedback_type=body.feedback_type.value,
        source="patient" if current_user.role == "patient" else "team",
        is_helpful=body.is_helpful,
        rating=body.rating,
        comment=body.comment,
        team_verdict=body.team_verdict.value if body.team_verdict else None,
        team_comment=body.team_comment,
        created_at=datetime.utcnow()
    )
    
    db.add(feedback)
    await db.commit()
    
    logger.info(
        f"[{request_id}] Feedback submitted for assessment {body.assessment_id}",
        extra={"feedback_type": body.feedback_type.value}
    )
    
    return APIResponse(
        data=FeedbackResponse(
            feedback_id=feedback.id,
            assessment_id=feedback.assessment_id,
            feedback_type=feedback.feedback_type,
            created_at=feedback.created_at
        ),
        message="反馈已提交"
    )
```

### 3.3 团队端点

```python
# src/api/routes/team.py

from fastapi import APIRouter, Depends, HTTPException, Request
from typing import Optional
from datetime import datetime
import logging

from ..schemas.team import (
    TeamNotificationRequest,
    TeamNotificationResponse,
    TeamPatientAssessmentsRequest,
    PatientReportResponse
)
from ..schemas.response import APIResponse
from ..dependencies import get_current_team_user, get_db_session
from ...services.notification_service import NotificationService

router = APIRouter(prefix="/team", tags=["医疗团队"])
logger = logging.getLogger(__name__)

@router.post(
    "/notify",
    response_model=APIResponse[TeamNotificationResponse],
    summary="发送团队通知",
    description="用户主动请求联系医疗团队"
)
async def create_notification(
    request: Request,
    body: TeamNotificationRequest,
    current_user = Depends(get_current_user),
    db = Depends(get_db_session)
):
    """用户请求联系医疗团队"""
    
    # 获取评估信息
    assessment = db.query(Assessment).filter(
        Assessment.id == body.assessment_id
    ).first()
    
    if not assessment:
        raise HTTPException(status_code=404, detail="评估不存在")
    
    # 发送通知
    notification_service = NotificationService()
    
    result = await notification_service.send_patient_request(
        assessment_id=assessment.id,
        patient_id=assessment.user_id,
        priority=body.priority.value,
        message=body.message
    )
    
    logger.info(
        f"Team notification created for assessment {assessment.id}",
        extra={"priority": body.priority.value}
    )
    
    return APIResponse(
        data=TeamNotificationResponse(
            notification_id=result["notification_id"],
            status="sent",
            sent_at=result["sent_at"],
            recipients=result["recipients"]
        ),
        message="已通知医疗团队"
    )


@router.get(
    "/assessments",
    summary="查看患者评估列表"
)
async def list_team_assessments(
    request: Request,
    current_team_user = Depends(get_current_team_user),
    db = Depends(get_db_session),
    patient_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    high_risk_only: bool = False
):
    """医疗团队查看患者评估列表"""
    
    query = db.query(Assessment)
    
    # 按患者筛选
    if patient_id:
        query = query.filter(Assessment.user_id == patient_id)
    
    # 只看高风险
    if high_risk_only:
        query = query.filter(Assessment.risk_level == "high")
    
    # 获取关联团队的患者
    if not patient_id:
        patient_ids = db.query(TeamPatientMapping.patient_id).filter(
            TeamPatientMapping.team_id == current_team_user.team_id
        ).all()
        patient_ids = [p[0] for p in patient_ids]
        query = query.filter(Assessment.user_id.in_(patient_ids))
    
    # 分页
    total = query.count()
    assessments = query.order_by(Assessment.created_at.desc())\
        .offset((page - 1) * page_size)\
        .limit(page_size)\
        .all()
    
    return APIResponse(
        data=[
            {
                "assessment_id": a.id,
                "patient_id": a.user_id,
                "risk_level": a.risk_level,
                "risk_score": a.risk_score,
                "triggered_rules": a.triggered_rules,
                "created_at": a.created_at.isoformat()
            }
            for a in assessments
        ],
        meta=ResponseMeta(
            pagination=PaginationMeta(
                page=page,
                page_size=page_size,
                total=total,
                total_pages=(total + page_size - 1) // page_size
            )
        )
    )


@router.get(
    "/patients/{patient_id}/report",
    response_model=APIResponse[PatientReportResponse],
    summary="生成患者报告"
)
async def generate_patient_report(
    patient_id: str,
    current_team_user = Depends(get_current_team_user),
    db = Depends(get_db_session),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
):
    """医疗团队生成患者评估报告"""
    
    # 验证团队有权限查看该患者
    mapping = db.query(TeamPatientMapping).filter(
        TeamPatientMapping.team_id == current_team_user.team_id,
        TeamPatientMapping.patient_id == patient_id
    ).first()
    
    if not mapping:
        raise HTTPException(status_code=403, detail="无权查看该患者信息")
    
    # 获取评估数据
    query = db.query(Assessment).filter(Assessment.user_id == patient_id)
    
    if start_date:
        query = query.filter(Assessment.created_at >= start_date)
    if end_date:
        query = query.filter(Assessment.created_at <= end_date)
    
    assessments = query.order_by(Assessment.created_at.desc()).all()
    
    if not assessments:
        raise HTTPException(status_code=404, detail="该患者无评估记录")
    
    # 生成报告
    report = generate_patient_assessment_report(assessments)
    
    return APIResponse(data=report)


def generate_patient_assessment_report(assessments: List[Assessment]) -> Dict:
    """生成患者评估报告"""
    
    # 统计风险分布
    risk_counts = {"high": 0, "medium": 0, "low": 0}
    symptom_frequency = {}
    
    for a in assessments:
        risk_counts[a.risk_level] += 1
        
        # 统计症状频率
        for symptom in (a.symptoms_identified or []):
            symptom_frequency[symptom] = symptom_frequency.get(symptom, 0) + 1
    
    # 计算趋势
    recent_assessments = assessments[:10]  # 最近10次
    avg_recent_score = sum(a.risk_score for a in recent_assessments) / len(recent_assessments) if recent_assessments else 0
    
    # 高风险评估详情
    high_risk_details = [
        {
            "assessment_id": a.id,
            "risk_level": a.risk_level,
            "triggered_rules": a.triggered_rules,
            "created_at": a.created_at.isoformat()
        }
        for a in assessments if a.risk_level == "high"
    ]
    
    return {
        "patient_id": assessments[0].user_id,
        "report_period": {
            "start": assessments[-1].created_at.isoformat() if assessments else None,
            "end": assessments[0].created_at.isoformat() if assessments else None
        },
        "summary": {
            "total_assessments": len(assessments),
            "risk_distribution": risk_counts,
            "symptom_frequency": sorted(
                [{"symptom": k, "count": v} for k, v in symptom_frequency.items()],
                key=lambda x: -x["count"]
            )[:10],
            "avg_recent_risk_score": round(avg_recent_score, 1),
            "trend": "increasing" if avg_recent_score > 60 else "decreasing" if avg_recent_score < 40 else "stable"
        },
        "high_risk_assessments": high_risk_details,
        "generated_at": datetime.utcnow().isoformat()
    }
```

## 4. 中间件

### 4.1 请求追踪中间件

```python
# src/api/middleware/tracing.py

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime
import uuid
import logging

logger = logging.getLogger(__name__)

class RequestTracingMiddleware(BaseHTTPMiddleware):
    """请求追踪中间件"""
    
    async def dispatch(self, request: Request, call_next) -> Response:
        # 生成请求 ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id
        
        # 记录开始时间
        start_time = datetime.utcnow()
        
        # 添加到响应头
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        
        # 计算处理时间
        processing_time = (datetime.utcnow() - start_time).total_seconds() * 1000
        response.headers["X-Processing-Time-Ms"] = str(int(processing_time))
        
        # 记录日志
        logger.info(
            f"{request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "processing_time_ms": processing_time,
                "client_ip": request.client.host if request.client else None
            }
        )
        
        return response
```

### 4.2 限流中间件

```python
# src/api/middleware/rate_limit.py

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime, timedelta
from collections import defaultdict
import asyncio

class RateLimitMiddleware(BaseHTTPMiddleware):
    """限流中间件"""
    
    def __init__(self, app, requests_per_minute: int = 60):
        super().__init__(app)
        self.requests_per_minute = requests_per_minute
        self._request_counts = defaultdict(list)
        self._cleanup_lock = asyncio.Lock()
    
    async def dispatch(self, request: Request, call_next):
        # 获取客户端标识
        client_id = self._get_client_id(request)
        
        # 检查限流
        if not await self._check_rate_limit(client_id):
            raise HTTPException(
                status_code=429,
                detail="请求过于频繁，请稍后再试"
            )
        
        return await call_next(request)
    
    def _get_client_id(self, request: Request) -> str:
        """获取客户端标识"""
        # 使用 API Key 或 IP
        api_key = request.headers.get("X-API-Key")
        if api_key:
            return f"api_key:{api_key}"
        return f"ip:{request.client.host if request.client else 'unknown'}"
    
    async def _check_rate_limit(self, client_id: str) -> bool:
        """检查是否超出限流"""
        now = datetime.utcnow()
        cutoff = now - timedelta(minutes=1)
        
        async with self._cleanup_lock:
            # 清理旧记录
            self._request_counts[client_id] = [
                t for t in self._request_counts[client_id]
                if t > cutoff
            ]
            
            # 检查限流
            if len(self._request_counts[client_id]) >= self.requests_per_minute:
                return False
            
            # 记录请求
            self._request_counts[client_id].append(now)
            return True
```

### 4.3 审计日志中间件

```python
# src/api/middleware/audit.py

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """审计日志中间件"""
    
    # 需要记录的操作
    AUDITED_PATHS = {
        "POST": ["/api/v1/assess", "/api/v1/feedback", "/api/v1/team/notify"],
        "PUT": ["/api/v1/users/profile"],
        "DELETE": []
    }
    
    async def dispatch(self, request: Request, call_next):
        method = request.method
        path = request.url.path
        
        # 检查是否需要审计
        if method in self.AUDITED_PATHS:
            if any(path.startswith(p) for p in self.AUDITED_PATHS.get(method, [])):
                await self._log_audit(request)
        
        return await call_next(request)
    
    async def _log_audit(self, request: Request):
        """记录审计日志"""
        audit_log = {
            "timestamp": datetime.utcnow().isoformat(),
            "request_id": getattr(request.state, "request_id", None),
            "method": request.method,
            "path": request.url.path,
            "user_id": getattr(request.state, "user_id", None),
            "client_ip": request.client.host if request.client else None,
            "user_agent": request.headers.get("User-Agent")
        }
        
        logger.info(f"AUDIT: {audit_log}")
        
        # 可选：保存到数据库
        # await self._save_audit_log(audit_log)
```

## 5. 依赖注入

```python
# src/api/dependencies.py

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import logging

from ..core.database import get_db
from ..core.security import verify_token, verify_team_token
from ..models.database import User

security = HTTPBearer()
logger = logging.getLogger(__name__)

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """获取当前用户"""
    token = credentials.credentials
    
    try:
        payload = verify_token(token)
        user_id = payload.get("sub")
        
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="无效的认证信息"
            )
        
        # 从数据库获取用户（简化版）
        user = await get_user_by_id(user_id)
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在"
            )
        
        return user
        
    except Exception as e:
        logger.error(f"Authentication failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="认证失败"
        )

async def get_current_team_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """获取当前医疗团队用户"""
    token = credentials.credentials
    
    try:
        payload = verify_team_token(token)
        user_id = payload.get("sub")
        
        user = await get_user_by_id(user_id)
        
        if not user or user.role != "team":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="无权访问医疗团队功能"
            )
        
        return user
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="团队认证失败"
        )

async def get_db_session() -> AsyncSession:
    """获取数据库会话"""
    async for session in get_db():
        yield session
```

## 6. 错误处理

```python
# src/api/exceptions.py

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class AppException(HTTPException):
    """应用异常基类"""
    
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[dict] = None
    ):
        super().__init__(
            status_code=status_code,
            detail={
                "code": code,
                "message": message,
                "details": details
            }
        )
        self.code = code
        self.details = details

class ValidationError(AppException):
    """验证错误"""
    
    def __init__(self, message: str, field: str = None, details: dict = None):
        super().__init__(
            status_code=422,
            code="VALIDATION_ERROR",
            message=message,
            details=details
        )
        self.field = field

class NotFoundError(AppException):
    """资源不存在"""
    
    def __init__(self, resource: str, identifier: str = None):
        message = f"{resource}不存在"
        if identifier:
            message = f"{resource} '{identifier}' 不存在"
        
        super().__init__(
            status_code=404,
            code="NOT_FOUND",
            message=message
        )

class AuthenticationError(AppException):
    """认证错误"""
    
    def __init__(self, message: str = "认证失败"):
        super().__init__(
            status_code=401,
            code="AUTHENTICATION_ERROR",
            message=message
        )

class AuthorizationError(AppException):
    """授权错误"""
    
    def __init__(self, message: str = "无权访问"):
        super().__init__(
            status_code=403,
            code="AUTHORIZATION_ERROR",
            message=message
        )

async def app_exception_handler(request: Request, exc: AppException):
    """应用异常处理器"""
    
    logger.warning(
        f"App exception: {exc.code} - {exc.detail}",
        extra={"request_id": getattr(request.state, 'request_id', None)}
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "error",
            "error": {
                "code": exc.code,
                "message": exc.detail,
                "details": exc.details
            }
        }
    )

async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理器"""
    
    logger.error(
        f"Unhandled exception: {exc}",
        exc_info=True,
        extra={"request_id": getattr(request.state, 'request_id', None)}
    )
    
    return JSONResponse(
        status_code=500,
        content={
            "status": "error",
            "error": {
                "code": "INTERNAL_ERROR",
                "message": "服务器内部错误"
            }
        }
    )
```

---

## 7. API 路由注册

```python
# src/api/routes/__init__.py

from fastapi import APIRouter
from .assess import router as assess_router
from .feedback import router as feedback_router
from .team import router as team_router
from .rules import router as rules_router
from .health import router as health_router

def create_api_router() -> APIRouter:
    """创建 API 路由"""
    
    api_router = APIRouter(prefix="/api/v1")
    
    # 注册子路由
    api_router.include_router(assess_router)
    api_router.include_router(feedback_router)
    api_router.include_router(team_router)
    api_router.include_router(rules_router)
    api_router.include_router(health_router)
    
    return api_router
```

---

## 8. API 测试示例

```python
# tests/api/test_assess.py

import pytest
from httpx import AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_create_assessment():
    """测试创建评估"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/assess",
            json={
                "input": "恶心想吐，已经2天了，而且吃不下东西",
                "context": {
                    "treatment_phase": "chemotherapy_cycle_2",
                    "treatment_type": "AC-T"
                }
            },
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["status"] == "success"
        assert "assessment_id" in data["data"]
        assert data["data"]["risk_level"] in ["high", "medium", "low"]
        assert "immediate_action" in data["data"]

@pytest.mark.asyncio
async def test_get_assessment_history():
    """测试获取评估历史"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get(
            "/api/v1/assess/assessments",
            params={"page": 1, "page_size": 10},
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "data" in data
        assert isinstance(data["data"], list)

@pytest.mark.asyncio
async def test_submit_feedback():
    """测试提交反馈"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/v1/feedback",
            json={
                "assessment_id": test_assessment_id,
                "feedback_type": "user_rating",
                "is_helpful": True,
                "rating": 5
            },
            headers={"Authorization": f"Bearer {test_token}"}
        )
        
        assert response.status_code == 200
```
