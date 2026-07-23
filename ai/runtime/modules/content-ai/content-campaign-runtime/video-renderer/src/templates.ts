/**
 * 视频模板注册表
 *
 * 每个模板是一个独立的 Remotion Composition，
 * 通过 compositionId 在渲染时选择使用哪个模板。
 *
 * 添加新模板步骤：
 * 1. 在 compositions/ 下创建新文件夹（如 TechReview/）
 * 2. 导出主组件和 Props 类型
 * 3. 在本文件注册
 */

export interface TemplateConfig {
  id: string;            // compositionId，用于渲染时指定
  name: string;          // 模板显示名称
  description: string;   // 模板说明
  width: number;
  height: number;
  fps: number;
  defaultDurationFrames: number;
}

/**
 * 已注册的模板列表
 * Python 后端通过 /templates API 获取可用模板
 */
export const TEMPLATES: TemplateConfig[] = [
  {
    id: "KnowledgeVideo",
    name: "干货技能卡",
    description: "仿抖音知识类视频风格：星空背景 + SKILL编号 + 标题 + 2列要点卡片 + 底部字幕",
    width: 1080,
    height: 1920,
    fps: 30,
    defaultDurationFrames: 30 * 60,
  },
  {
    id: "DataVizVideo",
    name: "数据可视化",
    description: "数字翻转动画 + 柱状图对比 + 数据卡片，适合数据分析、行业报告等场景",
    width: 1080,
    height: 1920,
    fps: 30,
    defaultDurationFrames: 30 * 60,
  },
  // 未来可扩展更多模板：
  // {
  //   id: "ListCountdown",
  //   name: "排行榜盘点",
  //   description: "TOP N 倒计时 + 排名卡片逐条展示",
  //   ...
  // },
];

/**
 * 根据 ID 获取模板配置
 */
export const getTemplateById = (id: string): TemplateConfig | undefined => {
  return TEMPLATES.find((t) => t.id === id);
};
