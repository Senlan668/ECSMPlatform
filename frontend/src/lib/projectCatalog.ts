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
    id: 'content-assets', number: '项目四', group: '运营中心', name: '内容资产与多模态加工', shortName: '内容资产', description: '管理文件、版本、版权与衍生物，承载直播切片、销售素材、OCR、ASR 与媒体加工。', ownership: '原始资产、解析内容、切片计划、衍生媒体与版权状态', deployment: 'Java AI 业务控制面 + Python 媒体 Worker', status: '待配置', icon: FileStack, capabilities: ['资产版本', '直播切片', '销售素材', 'OCR / ASR', '资产谱系'], initialMetrics: [{ label: '资产', detail: '等待上传素材' }, { label: '加工任务', detail: '暂无运行任务' }, { label: '待审核', detail: '暂无待审资产' }], initializationSteps: ['上传首份商品或品牌素材', '设置资产版权与保留策略', '选择直播切片或文档解析任务'],
  },
  {
    id: 'content-operations', number: '项目五', group: '运营中心', name: '内容与营销运营', shortName: '内容运营', description: '统一选题、写作、人审、品牌、日历、海报、视频、平台适配、发布与效果回流。', ownership: '运营简报、内容版本、审核、媒体意图与发布意图', deployment: 'Java AI 业务控制面 + Python AI Runtime', status: '待配置', icon: Sparkles, capabilities: ['内容工作流', '运营日历', '海报与视频', '平台适配', '审核发布'], initialMetrics: [{ label: '运营任务', detail: '等待创建简报' }, { label: '内容草稿', detail: '暂无生成内容' }, { label: '待审核', detail: '暂无待审版本' }], initializationSteps: ['选择商品、目标渠道与素材', '创建第一份运营简报', '配置审核与发布负责人'],
  },
  {
    id: 'customer-service', number: '项目六', group: '运营中心', name: '智能客服与销售训练', shortName: '客服与训练', description: '在可验证证据和受控工具下协同文本客服、实时语音、人工接管、工单与销售考核。', ownership: '会话、知识发布、语音会话、工单、试卷与人工复核', deployment: 'Java AI 业务控制面 + Python AI Runtime', status: '待配置', icon: Headphones, capabilities: ['知识发布', '受控问答', '实时语音', '人工接管', '销售考核'], initialMetrics: [{ label: '知识库', detail: '等待发布文档' }, { label: '会话', detail: '暂无客户会话' }, { label: '考核', detail: '暂无销售考核' }], initializationSteps: ['发布首个客服知识版本', '配置订单只读工具权限', '设置语音、人工接管与考核复核策略'],
  },
  {
    id: 'analytics', number: '项目七', group: '智能与分析', name: '经营分析中心', shortName: '经营分析', description: '统一经营指标、内容效果、销售能力以及 AI 质量与成本反馈。', ownership: '指标定义、分析事实、报表、异常、考核投影与 AI 成本', deployment: '数据分析栈', status: '待配置', icon: BarChart3, capabilities: ['指标语义', '内容效果', '销售能力', 'AI 质量与成本'], initialMetrics: [{ label: '指标', detail: '等待定义口径' }, { label: '数据质量规则', detail: '等待配置规则' }, { label: '报告', detail: '暂无可用报告' }], initializationSteps: ['接入业务与运营领域事件', '定义内容、销售与 AI 成本口径', '配置首个经营看板'],
  },
  {
    id: 'ai-governance', number: '项目八', group: '智能与分析', name: 'AI 模型与服务中心', shortName: '模型与服务', description: '管理模型、服务密钥、Prompt 版本、工具目录、调用路由、评测、追踪、用量与成本。', ownership: '模型配置、Prompt、工具策略、AI Trace、索引投影、评测与用量', deployment: 'Python AI Runtime + Java 治理控制', status: '待配置', icon: BrainCircuit, capabilities: ['模型网关', 'Prompt 版本', 'HTTP / MCP 工具', 'RAG 与索引', '成本治理'], initialMetrics: [{ label: '模型', detail: '等待添加模型' }, { label: 'API Key', detail: '等待创建密钥' }, { label: '运行调用', detail: '暂无调用记录' }], initializationSteps: ['添加并启动第一个模型', '创建服务 API Key', '配置 Prompt、工具路由与预算策略'],
  },
]

export function findProject(projectId: string | undefined) {
  return platformProjects.find(project => project.id === projectId)
}
