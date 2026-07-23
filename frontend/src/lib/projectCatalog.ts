import type { LucideIcon } from 'lucide-react'
import { BarChart3, BrainCircuit, Boxes, Cable, FileStack, Headphones, ShieldCheck, Sparkles } from 'lucide-react'

export type ProjectGroup = '基础平台' | '运营中心' | '智能与分析'
export type ProjectStatus = '待配置'

interface InitialMetric {
  label: string
  detail: string
}

export interface PlatformProject {
  id: string
  number: string
  group: ProjectGroup
  name: string
  shortName: string
  description: string
  ownership: string
  deployment: string
  status: ProjectStatus
  icon: LucideIcon
  capabilities: string[]
  initialMetrics: InitialMetric[]
  initializationSteps: string[]
}

export const navigationGroups: ProjectGroup[] = ['基础平台', '运营中心', '智能与分析']

export const platformProjects: PlatformProject[] = [
  {
    id: 'identity-access', number: '项目一', group: '基础平台', name: '租户与访问控制', shortName: '租户与权限', description: '管理租户、成员、角色、店铺范围、授权策略与套餐权益。', ownership: '租户、身份、授权与安全审计', deployment: 'Java 核心控制面', status: '待配置', icon: ShieldCheck, capabilities: ['租户与组织', 'RBAC / ABAC', '服务身份', '安全审计'], initialMetrics: [{ label: '成员', detail: '等待邀请成员' }, { label: '角色', detail: '等待定义角色' }, { label: '授权策略', detail: '等待配置范围' }], initializationSteps: ['建立默认组织与成员角色', '配置店铺和资源访问范围', '启用服务身份与安全审计'],
  },
  {
    id: 'channel-integration', number: '项目二', group: '基础平台', name: '渠道连接与数据接入', shortName: '渠道连接', description: '以可靠连接器接入外部渠道，沉淀原始证据并输出标准化事件。', ownership: '渠道授权、同步游标、原始报文与回执', deployment: 'Java 核心控制面', status: '待配置', icon: Cable, capabilities: ['渠道授权', 'Webhook 接收', '增量同步', '对账回执'], initialMetrics: [{ label: '渠道连接', detail: '等待授权连接' }, { label: '同步任务', detail: '等待创建任务' }, { label: '异常回执', detail: '暂无待处理项' }], initializationSteps: ['授权第一个电商渠道', '配置商品与订单同步范围', '验证 Webhook 和初次数据对账'],
  },
  {
    id: 'commerce-core', number: '项目三', group: '基础平台', name: '电商业务中心', shortName: '电商业务', description: '建立店铺、商品、库存、订单与售后的统一业务事实和受控工具。', ownership: '商品、订单、售后与消费者引用', deployment: 'Java 核心控制面', status: '待配置', icon: Boxes, capabilities: ['商品与 SKU', '订单快照', '售后状态机', '领域事件'], initialMetrics: [{ label: '店铺', detail: '等待渠道同步' }, { label: '商品', detail: '等待建立事实快照' }, { label: '订单', detail: '等待业务数据接入' }], initializationSteps: ['确认店铺与渠道映射', '建立商品、SKU 与价格快照', '启用订单与售后领域事件'],
  },
  {
    id: 'content-assets', number: '项目四', group: '运营中心', name: '内容资产中心', shortName: '内容资产', description: '管理文件、版本、版权与衍生物，并异步执行多模态加工。', ownership: '原始资产、解析内容、衍生媒体与版权状态', deployment: 'Java AI 业务控制面 + Python 媒体 Worker', status: '待配置', icon: FileStack, capabilities: ['资产版本', 'OCR / 文档解析', 'ASR / 转码', '资产谱系'], initialMetrics: [{ label: '资产', detail: '等待上传素材' }, { label: '加工任务', detail: '暂无运行任务' }, { label: '待审核', detail: '暂无待审资产' }], initializationSteps: ['上传首份商品或品牌素材', '设置资产版权与保留策略', '选择文档解析或媒体加工任务'],
  },
  {
    id: 'content-operations', number: '项目五', group: '运营中心', name: '内容与营销运营', shortName: '内容运营', description: '将生成、事实校验、人工审核、发布与效果回流纳入可追溯闭环。', ownership: '运营简报、内容版本、审核与发布意图', deployment: 'Java AI 业务控制面 + Python AI Runtime', status: '待配置', icon: Sparkles, capabilities: ['内容生成', '事实校验', '审核发布', '实验定义'], initialMetrics: [{ label: '运营任务', detail: '等待创建简报' }, { label: '内容草稿', detail: '暂无生成内容' }, { label: '待审核', detail: '暂无待审版本' }], initializationSteps: ['选择商品、目标渠道与素材', '创建第一份运营简报', '配置审核与发布负责人'],
  },
  {
    id: 'customer-service', number: '项目六', group: '运营中心', name: '智能客服与工单', shortName: '智能客服', description: '在可验证证据和受控业务工具下，协同机器人、人工客服与售后工单。', ownership: '会话、知识库发布清单、工单与质检标签', deployment: 'Java AI 业务控制面 + Python AI Runtime', status: '待配置', icon: Headphones, capabilities: ['知识库发布', '受控问答', '人工接管', '售后工单'], initialMetrics: [{ label: '知识库', detail: '等待发布文档' }, { label: '会话', detail: '暂无客户会话' }, { label: '工单', detail: '暂无待处理工单' }], initializationSteps: ['发布首个客服知识库', '配置订单只读工具权限', '设置人工接管与工单 SLA'],
  },
  {
    id: 'analytics', number: '项目七', group: '智能与分析', name: '经营分析中心', shortName: '经营分析', description: '在可追溯的指标语义和数据质量基础上提供经营分析与 AI 反馈。', ownership: '指标、分析事实、报表、异常与预测', deployment: '数据分析栈', status: '待配置', icon: BarChart3, capabilities: ['指标语义', '数据质量', '经营看板', '效果反馈'], initialMetrics: [{ label: '指标', detail: '等待定义口径' }, { label: '数据质量规则', detail: '等待配置规则' }, { label: '报告', detail: '暂无可用报告' }], initializationSteps: ['接入业务与运营领域事件', '定义 GMV、退款与内容效果口径', '配置首个经营看板'],
  },
  {
    id: 'ai-governance', number: '项目八', group: '智能与分析', name: 'AI 模型与服务中心', shortName: '模型与服务', description: '管理模型、服务密钥、调用路由、评测、追踪、用量与成本。', ownership: '模型配置、AI Trace、索引投影、评测与用量', deployment: 'Python AI Runtime', status: '待配置', icon: BrainCircuit, capabilities: ['模型网关', 'RAG 与索引', '评测回滚', '成本治理'], initialMetrics: [{ label: '模型', detail: '等待添加模型' }, { label: 'API Key', detail: '等待创建密钥' }, { label: '运行调用', detail: '暂无调用记录' }], initializationSteps: ['添加并启动第一个模型', '创建服务 API Key', '配置调用路由与预算策略'],
  },
]

export function findProject(projectId: string | undefined) {
  return platformProjects.find(project => project.id === projectId)
}
