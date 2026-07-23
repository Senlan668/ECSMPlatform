import { AbsoluteFill, Sequence, Audio, useVideoConfig } from "remotion";
import { TitleScene } from "./TitleScene";
import { ContentScene } from "./ContentScene";
import { OutroScene } from "./OutroScene";
import { TitleCard } from "./layouts/TitleCard";
import { SplitScreen } from "./layouts/SplitScreen";
import { BulletPointsCard } from "./layouts/BulletPointsCard";

/**
 * 单个场景数据
 */
export interface SceneData {
  narration: string;
  audioUrl: string;
  audioDuration: number; // 秒
  imageUrl?: string;
  sceneTitle?: string;         // 场景标题文字
  keyPoints?: string[];        // 要点列表
  codeExample?: string;        // 代码示例
  sceneType?: string;          // intro / content / outro
  
  // V3 Component-Driven 配置属性
  layoutType?: "TitleCard" | "SplitScreen" | "BulletPointsCard";
  themeColor?: string;
  content?: any;
}

/**
 * KnowledgeVideo 输入属性
 */
export type KnowledgeVideoProps = {
  title: string;
  scenes: SceneData[];
};

const TITLE_DURATION = 3; // 开场 3 秒
const OUTRO_DURATION = 3; // 结尾 3 秒

/**
 * 知识讲解型视频主 Composition
 * 结构: 开场标题 → 内容段落(N段，带音频) → 结尾CTA
 */
export const KnowledgeVideo: React.FC<KnowledgeVideoProps> = ({ title, scenes }) => {
  const { fps } = useVideoConfig();

  // 计算每个段落的起始帧
  let currentFrame = Math.ceil(TITLE_DURATION * fps);
  const sceneTimings = scenes.map((scene) => {
    const startFrame = currentFrame;
    const durationFrames = Math.ceil((scene.audioDuration || 5) * fps);
    currentFrame += durationFrames;
    return { startFrame, durationFrames };
  });

  const outroStartFrame = currentFrame;
  const outroDurationFrames = Math.ceil(OUTRO_DURATION * fps);

  return (
    <AbsoluteFill
      style={{
        // 采用苹果发布会常见的“深邃星云”级别的极暗冷暖渐变，既干净又富含色彩层次
        background: "linear-gradient(135deg, #090e17 0%, #161122 50%, #02040a 100%)",
        fontFamily: "'SF Pro Display', 'Inter', 'PingFang SC', 'Microsoft YaHei', sans-serif",
      }}
    >
      {/* 提前加入一个 SlideContainer 管理进入退出，这里因为是外层，先保持 Sequence */}
      {/* 开场标题 */}
      <Sequence from={0} durationInFrames={Math.ceil(TITLE_DURATION * fps)}>
        <TitleScene title={title} />
      </Sequence>

      {/* 内容段落 + 音频 */}
      {scenes.map((scene, index) => {
        const timing = sceneTimings[index];
        return (
          <Sequence
            key={index}
            from={timing.startFrame}
            durationInFrames={timing.durationFrames}
          >
            {/* V3 动态组件渲染架构 */}
            {scene.layoutType === "TitleCard" ? (
              <TitleCard {...(scene.content || {})} themeColor={scene.themeColor} />
            ) : scene.layoutType === "SplitScreen" ? (
              <SplitScreen {...(scene.content || {})} themeColor={scene.themeColor} />
            ) : scene.layoutType === "BulletPointsCard" ? (
              <BulletPointsCard {...(scene.content || {})} />
            ) : (
              // V2 降级渲染兜底：原来的 ContentScene
              <ContentScene
                narration={scene.narration}
                imageUrl={scene.imageUrl || ""}
                sceneIndex={index}
                totalScenes={scenes.length}
                sceneTitle={scene.sceneTitle || ""}
                keyPoints={scene.keyPoints || []}
                codeExample={scene.codeExample || ""}
              />
            )}
            {/* TTS 音频 */}
            {scene.audioUrl && (
              <Audio src={scene.audioUrl} volume={1} />
            )}
          </Sequence>
        );
      })}

      {/* 结尾 CTA */}
      <Sequence from={outroStartFrame} durationInFrames={outroDurationFrames}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};
