"""
海报/封面生成 API 路由
提供自定义生成、模板生成、模板/风格查询等接口
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_async_session
from app.core.errors import CapabilityUnavailableError
from app.core.limits import IMAGE_PROMPT_MAX_LENGTH, MAX_REFERENCE_IMAGES
from app.core.media import ImageBase64
from app.dependencies.auth import get_current_user, get_current_user_optional
from app.models.user import User
from app.services.brand_service import brand_service
from app.services.image_model_service import image_model_service
from app.services.poster_service import poster_service
from app.services.gallery_service import gallery_service
from app.services.profile_service import profile_service
from app.services.sales_sync_service import SalesSyncError, sales_sync_service

router = APIRouter(prefix="/poster", tags=["Poster"])


# ======================== 请求/响应模型 ========================

class ReferenceImageInput(BaseModel):
    """参考图片输入"""
    image_base64: ImageBase64 = Field(..., description="参考图片的 base64 / data URL 数据")
    name: Optional[str] = Field(None, max_length=80, description="参考图名称，如 图1")


class CustomGenerateRequest(BaseModel):
    """自定义生成请求"""
    prompt: str = Field(..., description="用户输入的提示词", min_length=1, max_length=IMAGE_PROMPT_MAX_LENGTH)
    style_tags: Optional[List[str]] = Field(None, description="风格标签名称列表")
    aspect_ratio: str = Field("3:4", description="输出比例: 3:4 / 2.35:1 / 9:16 / 1:1 / 16:9")
    color_tone: Optional[str] = Field(None, description="色调偏好")
    reference_images: Optional[List[ReferenceImageInput]] = Field(
        None,
        max_length=MAX_REFERENCE_IMAGES,
        description="自定义生成参考图片列表",
    )


class TemplateGenerateRequest(BaseModel):
    """模板生成请求"""
    template_id: str = Field(..., description="模板 ID（UUID）")
    params: Dict[str, str] = Field(..., description="文案参数，如 {title: '...', subtitle: '...'}")
    style_tag: Optional[str] = Field(None, description="覆盖模板默认风格")
    color_option: Optional[str] = Field(None, description="色调选项")
    aspect_ratio: Optional[str] = Field(None, description="覆盖模板默认比例")


class EditGenerateRequest(BaseModel):
    """以图改图请求"""
    image_base64: ImageBase64 = Field(..., description="原始图片的 base64 编码数据")
    edit_prompt: str = Field(..., description="编辑指令", min_length=1, max_length=IMAGE_PROMPT_MAX_LENGTH)
    aspect_ratio: str = Field("3:4", description="输出比例")


class StyleTransferRequest(BaseModel):
    """风格迁移请求"""
    image_base64: ImageBase64 = Field(..., description="原始图片的 base64 编码数据")
    style_tags: List[str] = Field(..., description="目标风格标签名称列表", min_length=1)
    strength: str = Field("medium", description="迁移强度: light / medium / strong")
    aspect_ratio: str = Field("3:4", description="输出比例")


class GenerateResponse(BaseModel):
    """生成结果响应"""
    success: bool = Field(..., description="是否生成成功")
    image_url: Optional[str] = Field(None, description="生成图片的访问路径")
    prompt_used: Optional[str] = Field(None, description="实际使用的 AI 提示词")
    aspect_ratio: Optional[str] = Field(None, description="输出比例")
    width: Optional[int] = Field(None, description="图片宽度")
    height: Optional[int] = Field(None, description="图片高度")
    mode: Optional[str] = Field(None, description="生成模式")
    template_name: Optional[str] = Field(None, description="使用的模板名称")
    style_tags: Optional[List[str]] = Field(None, description="使用的风格标签")
    strength: Optional[str] = Field(None, description="迁移强度")
    error: Optional[str] = Field(None, description="错误信息")


class SalesSyncRequest(BaseModel):
    """同步喜报到销售系统请求"""
    image_url: str = Field(..., description="本系统生成的图片地址")
    query: Optional[str] = Field(None, description="学员姓名或手机号")
    student_id: Optional[int] = Field(None, description="已确认的销售系统学员 ID")
    title: Optional[str] = Field(None, description="同步到销售系统的素材标题")


class SalesSyncResponse(BaseModel):
    """同步喜报到销售系统响应"""
    success: bool
    status: str
    message: str
    student: Optional[Dict[str, Any]] = None
    material: Optional[Dict[str, Any]] = None
    candidates: List[Dict[str, Any]] = Field(default_factory=list)


async def _auto_save_generation(
    *,
    db: AsyncSession,
    current_user: Optional[User],
    source_mode: str,
    result: Dict[str, Any],
    request_payload: Dict[str, Any],
) -> None:
    """用户已登录时，将成功生成结果自动保存到作品库。"""
    if not current_user or not result.get("success"):
        return

    if source_mode == "export_all":
        await gallery_service.create_export_all_records(
            db,
            user_id=current_user.id,
            export_result=result,
            request_payload=request_payload,
        )
        return

    await gallery_service.create_generation_record(
        db,
        user_id=current_user.id,
        source_mode=source_mode,
        generation_result=result,
        request_payload=request_payload,
    )


async def _get_user_provider(
    db: AsyncSession, user: Optional[User]
) -> Optional[str]:
    """获取当前用户的图片生成引擎偏好"""
    if not user:
        return None
    return await profile_service.get_user_image_provider(db, user_id=user.id)


async def _get_user_brand_kit(
    db: AsyncSession, user: Optional[User]
):
    """获取当前用户品牌包；未登录或未配置时返回 None"""
    if not user:
        return None
    return await brand_service.get_brand_kit(db, user_id=user.id)


async def _get_user_image_model_config(
    db: AsyncSession,
    user: Optional[User],
    provider: Optional[str],
) -> Optional[Dict[str, Any]]:
    """
    获取当前应使用的公共图片模型配置。

    用户显式选择公共模型时优先；若未选择旧版 provider，则使用管理员设定的默认公共模型；
    都不存在时返回 None，继续走 .env / 旧版 provider 配置。
    """
    config = await image_model_service.resolve_runtime_config(
        db,
        user_id=user.id if user else None,
        legacy_provider=provider,
    )
    poster_service.require_configured(provider, config)
    return config


# ======================== 查询接口 ========================

@router.get("/templates", summary="获取模板列表")
async def get_templates():
    """
    获取所有预置海报模板

    返回模板列表，每个模板包含名称、描述、分类、风格标签和配置参数
    """
    templates = poster_service.get_templates()
    return {
        "templates": [
            {
                "index": i,
                "name": t["name"],
                "description": t.get("description", ""),
                "category": t.get("category", ""),
                "style_tag": t.get("style_tag", ""),
                "text_slots": t.get("config", {}).get("text_slots", []),
                "color_options": t.get("config", {}).get("color_options", []),
                "default_aspect_ratio": t.get("config", {}).get("default_aspect_ratio", "3:4"),
            }
            for i, t in enumerate(templates)
        ],
        "total": len(templates),
    }


@router.get("/templates/{index}", summary="获取模板详情")
async def get_template_detail(index: int):
    """获取单个模板的完整配置"""
    template = poster_service.get_template_by_index(index)
    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"模板索引 {index} 不存在",
        )
    return {"index": index, **template}


@router.get("/style-tags", summary="获取风格标签列表")
async def get_style_tags():
    """
    获取所有预置风格标签

    每个标签包含名称、描述、配色方案和 emoji 图标
    """
    tags = poster_service.get_style_tags()
    return {
        "tags": tags,
        "total": len(tags),
    }


@router.get("/aspect-ratios", summary="获取支持的尺寸比例")
async def get_aspect_ratios():
    """获取所有支持的输出尺寸比例"""
    ratios = poster_service.get_aspect_ratios()
    return {
        "ratios": [
            {"key": k, **v}
            for k, v in ratios.items()
        ]
    }


@router.post("/sales-sync", response_model=SalesSyncResponse, summary="同步喜报到销售系统")
async def sync_report_to_sales(
    req: SalesSyncRequest,
    current_user: User = Depends(get_current_user),
):
    """
    将已生成的喜报图片同步到销售系统，并按学员姓名/手机号或学员 ID 绑定。
    """
    try:
        result = await sales_sync_service.sync_report(
            image_url=req.image_url,
            query=req.query,
            student_id=req.student_id,
            title=req.title,
            uploaded_by=current_user.username,
        )
        return SalesSyncResponse(**result)
    except SalesSyncError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e


# ======================== 提示词生成接口 ========================

@router.post("/generate-prompt", summary="生成提示词（不生成图片）")
async def generate_prompt_only(req: CustomGenerateRequest):
    """
    调用 LLM 生成优化的英文提示词，供 Nano Banana Pro 等外部工具使用。
    不调用图片生成 API，只生成文本提示词。
    """
    try:
        result = await poster_service.build_external_prompt(
            user_prompt=req.prompt,
            style_tags=req.style_tags,
            aspect_ratio=req.aspect_ratio,
            color_tone=req.color_tone,
        )
        return result
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return {"success": False, "error": f"提示词生成失败: {str(e)}"}


# ======================== 生成接口 ========================

@router.post("/generate/custom", response_model=GenerateResponse, summary="自定义生成海报")
async def generate_custom(
    req: CustomGenerateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_async_session),
):
    """
    自定义生成海报

    - 用户输入提示词，可选择风格标签和色调
    - 支持多种输出比例
    - AI 直接生成完整海报图片
    """
    try:
        provider = await _get_user_provider(db, current_user)
        brand_kit = await _get_user_brand_kit(db, current_user)
        image_model_config = await _get_user_image_model_config(db, current_user, provider)
        result = await poster_service.generate_custom(
            prompt=req.prompt,
            style_tags=req.style_tags,
            aspect_ratio=req.aspect_ratio,
            color_tone=req.color_tone,
            reference_images=[image.model_dump() for image in (req.reference_images or [])],
            provider_override=provider,
            image_model_config=image_model_config,
            brand_kit=brand_kit,
        )
        request_payload = req.model_dump()
        if req.reference_images:
            request_payload["reference_images"] = [
                {"name": image.name or f"图{index + 1}", "has_image": True}
                for index, image in enumerate(req.reference_images)
            ]
        await _auto_save_generation(
            db=db,
            current_user=current_user,
            source_mode="custom",
            result=result,
            request_payload=request_payload,
        )
        return GenerateResponse(**result)
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"海报生成失败: {str(e)}",
        ) from e


@router.post("/generate/template", response_model=GenerateResponse, summary="模板生成海报")
async def generate_from_template(
    req: TemplateGenerateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_async_session),
):
    """
    模板生成海报

    - 支持系统预置模板（template_index）和个人模板（template_id）
    - 可覆盖模板默认风格和色调
    - AI 基于模板约束生成海报
    """
    try:
        provider = await _get_user_provider(db, current_user)
        brand_kit = await _get_user_brand_kit(db, current_user)
        image_model_config = await _get_user_image_model_config(db, current_user, provider)

        # 统一通过 template_id 从数据库查找（包含个人模板和系统模板）
        from app.services.template_service import template_service
        from uuid import UUID as _UUID
        
        tpl = await template_service.get_template(db, template_id=_UUID(req.template_id))
        if not tpl:
            return GenerateResponse(success=False, error=f"模板 {req.template_id} 不存在")

        # 用数据库模板的 config 调用生成
        result = await poster_service.generate_from_db_template(
            template_config=tpl.config or {},
            template_name=tpl.name,
            template_style_tag=tpl.style_tag,
            params=req.params,
            style_tag=req.style_tag,
            color_option=req.color_option,
            aspect_ratio=req.aspect_ratio,
            provider_override=provider,
            image_model_config=image_model_config,
            brand_kit=brand_kit,
        )
        
        # 使用次数 +1
        await template_service.increment_use_count(db, template_id=tpl.id)

        await _auto_save_generation(
            db=db,
            current_user=current_user,
            source_mode="template",
            result=result,
            request_payload=req.model_dump(),
        )
        return GenerateResponse(**result)
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"模板生成失败: {str(e)}",
        ) from e


@router.post("/generate/edit", response_model=GenerateResponse, summary="以图改图")
async def generate_edit(
    req: EditGenerateRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_async_session),
):
    """
    以图改图

    - 上传原始图片（base64 编码）
    - 输入编辑指令（如"把背景换成海边日落"、"添加一只猫"）
    - AI 根据指令修改图片
    """
    try:
        provider = await _get_user_provider(db, current_user)
        image_model_config = await _get_user_image_model_config(db, current_user, provider)
        result = await poster_service.generate_edit(
            image_base64=req.image_base64,
            edit_prompt=req.edit_prompt,
            aspect_ratio=req.aspect_ratio,
            provider_override=provider,
            image_model_config=image_model_config,
        )
        await _auto_save_generation(
            db=db,
            current_user=current_user,
            source_mode="edit",
            result=result,
            request_payload=req.model_dump(),
        )
        return GenerateResponse(**result)
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"以图改图失败: {str(e)}",
        ) from e


@router.post("/generate/style-transfer", response_model=GenerateResponse, summary="风格迁移")
async def generate_style_transfer(
    req: StyleTransferRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_async_session),
):
    """
    风格迁移

    - 上传原始图片（base64 编码）
    - 选择目标风格标签（如赛博朋克、日系清新等）
    - 可调节迁移强度（light/medium/strong）
    - AI 将图片转换为目标风格
    """
    try:
        provider = await _get_user_provider(db, current_user)
        image_model_config = await _get_user_image_model_config(db, current_user, provider)
        result = await poster_service.generate_style_transfer(
            image_base64=req.image_base64,
            style_tags=req.style_tags,
            strength=req.strength,
            aspect_ratio=req.aspect_ratio,
            provider_override=provider,
            image_model_config=image_model_config,
        )
        await _auto_save_generation(
            db=db,
            current_user=current_user,
            source_mode="style_transfer",
            result=result,
            request_payload=req.model_dump(),
        )
        return GenerateResponse(**result)
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"风格迁移失败: {str(e)}",
        ) from e


# ======================== 局部重绘 / 擦除 接口 ========================

class InpaintRequest(BaseModel):
    """局部重绘请求"""
    image_base64: ImageBase64 = Field(..., description="原始图片的 base64 编码数据")
    mask_base64: ImageBase64 = Field(..., description="遮罩图片的 base64 编码数据（白色=重绘区域）")
    inpaint_prompt: str = Field(..., description="重绘提示词", min_length=1, max_length=IMAGE_PROMPT_MAX_LENGTH)
    aspect_ratio: str = Field("3:4", description="输出比例")


class EraseRequest(BaseModel):
    """智能擦除请求"""
    image_base64: ImageBase64 = Field(..., description="原始图片的 base64 编码数据")
    mask_base64: ImageBase64 = Field(..., description="遮罩图片的 base64 编码数据（白色=擦除区域）")


@router.post("/inpaint", response_model=GenerateResponse, summary="局部重绘")
async def generate_inpaint(
    req: InpaintRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_async_session),
):
    """
    局部重绘

    - 上传原始图片和遮罩图（白色区域为需要修改的部分）
    - 输入替换提示词（如 "一只金毛犬"、"一束鲜花"）
    - AI 仅修改遮罩区域，保留其余部分不变
    """
    try:
        provider = await _get_user_provider(db, current_user)
        image_model_config = await _get_user_image_model_config(db, current_user, provider)
        result = await poster_service.generate_inpaint(
            image_base64=req.image_base64,
            mask_base64=req.mask_base64,
            inpaint_prompt=req.inpaint_prompt,
            aspect_ratio=req.aspect_ratio,
            provider_override=provider,
            image_model_config=image_model_config,
        )
        await _auto_save_generation(
            db=db,
            current_user=current_user,
            source_mode="inpaint",
            result=result,
            request_payload=req.model_dump(),
        )
        return GenerateResponse(**result)
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return GenerateResponse(success=False, error=f"局部重绘失败: {str(e)}")


@router.post("/erase", response_model=GenerateResponse, summary="智能擦除")
async def generate_erase(
    req: EraseRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_async_session),
):
    """
    智能擦除

    - 上传原始图片和遮罩图（白色区域为需要擦除的部分）
    - AI 自动移除遮罩区域内容并补全背景
    - 无需提示词
    """
    try:
        provider = await _get_user_provider(db, current_user)
        image_model_config = await _get_user_image_model_config(db, current_user, provider)
        result = await poster_service.generate_erase(
            image_base64=req.image_base64,
            mask_base64=req.mask_base64,
            provider_override=provider,
            image_model_config=image_model_config,
        )
        await _auto_save_generation(
            db=db,
            current_user=current_user,
            source_mode="erase",
            result=result,
            request_payload=req.model_dump(),
        )
        return GenerateResponse(**result)
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return GenerateResponse(success=False, error=f"智能擦除失败: {str(e)}")


# ======================== 多尺寸适配 / 全平台导出 接口 ========================

class AdaptRequest(BaseModel):
    """尺寸适配请求"""
    image_base64: ImageBase64 = Field(..., description="原始图片的 base64 编码数据")
    source_ratio: str = Field(..., description="源图当前比例 (如 3:4)")
    target_ratio: str = Field(..., description="目标比例 (如 16:9)")
    strategy: str = Field("outpaint", description="适配策略: crop(智能裁剪) 或 outpaint(AI扩图)")
    outpaint_prompt: Optional[str] = Field(None, description="AI 扩图时的补充提示词")


class ExportAllRequest(BaseModel):
    """全平台导出请求"""
    image_base64: ImageBase64 = Field(..., description="原始图片的 base64 编码数据")
    source_ratio: str = Field(..., description="源图当前比例")
    strategy: str = Field("outpaint", description="适配策略: crop 或 outpaint")
    outpaint_prompt: Optional[str] = Field(None, description="AI 扩图时的补充提示词")


class ExportAllResponse(BaseModel):
    """全平台导出响应"""
    success: bool = Field(..., description="是否至少有一张生成成功")
    mode: Optional[str] = Field(None, description="生成模式")
    images: Optional[List[Dict[str, Any]]] = Field(None, description="生成的图片列表")
    total: Optional[int] = Field(None, description="成功生成的总数")
    errors: Optional[List[str]] = Field(None, description="失败的比例及错误信息")


@router.post("/adapt", response_model=GenerateResponse, summary="尺寸适配")
async def generate_adapt(
    req: AdaptRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_async_session),
):
    """
    尺寸适配

    - 上传原始图片，指定源比例和目标比例
    - 选择适配策略：智能裁剪 (crop) 或 AI 扩图 (outpaint)
    - AI 扩图模式下可提供补充提示词以优化扩展区域
    """
    try:
        provider = await _get_user_provider(db, current_user)
        image_model_config = await _get_user_image_model_config(db, current_user, provider)
        result = await poster_service.generate_adapt(
            image_base64=req.image_base64,
            source_ratio=req.source_ratio,
            target_ratio=req.target_ratio,
            strategy=req.strategy,
            outpaint_prompt=req.outpaint_prompt,
            provider_override=provider,
            image_model_config=image_model_config,
        )
        await _auto_save_generation(
            db=db,
            current_user=current_user,
            source_mode="adapt",
            result=result,
            request_payload=req.model_dump(),
        )
        return GenerateResponse(**result)
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return GenerateResponse(success=False, error=f"尺寸适配失败: {str(e)}")


@router.post("/export-all", response_model=ExportAllResponse, summary="全平台一键导出")
async def generate_export_all(
    req: ExportAllRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
    db: AsyncSession = Depends(get_async_session),
):
    """
    全平台一键导出

    - 上传原始图片，指定源比例
    - 自动并发适配为所有其他比例 (3:4, 2.35:1, 9:16, 1:1, 16:9)
    - 返回多张适配后的图片
    """
    try:
        provider = await _get_user_provider(db, current_user)
        image_model_config = await _get_user_image_model_config(db, current_user, provider)
        result = await poster_service.generate_export_all(
            image_base64=req.image_base64,
            source_ratio=req.source_ratio,
            strategy=req.strategy,
            outpaint_prompt=req.outpaint_prompt,
            provider_override=provider,
            image_model_config=image_model_config,
        )
        await _auto_save_generation(
            db=db,
            current_user=current_user,
            source_mode="export_all",
            result=result,
            request_payload=req.model_dump(),
        )
        return ExportAllResponse(**result)
    except CapabilityUnavailableError:
        raise
    except Exception as e:
        return ExportAllResponse(success=False, errors=[f"全平台导出失败: {str(e)}"])
