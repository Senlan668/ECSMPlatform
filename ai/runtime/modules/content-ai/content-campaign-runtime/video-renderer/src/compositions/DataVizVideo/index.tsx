import { AbsoluteFill, Sequence, Audio, useVideoConfig, useCurrentFrame, spring, interpolate } from "remotion";
import { NumberFlipScene } from "./NumberFlipScene";
import { BarChartScene } from "./BarChartScene";
import { DataCardScene } from "./DataCardScene";

/**
 * 数据可视化场景数据
 *
 * sceneType 决定使用哪种视觉组件:
 * - "number_flip": 数字翻转指标
 * - "bar_chart": 柱状图对比
 * - "data_card": 数据卡片列表
 */

interface DataMetric {
  label: string;
  value: number;
  suffix: string;
  color: string;
}

interface BarItem {
  label: string;
  value: number;
  color: string;
}

interface StatCard {
  icon: string;
  title: string;
  value: string;
  trend: string;
  trendColor: string;
}

export interface DataVizSceneData {
  sceneType: "number_flip" | "bar_chart" | "data_card";
  sceneTitle: string;
  narration: string;
  audioUrl: string;
  audioDuration: number;
  // number_flip 专用
  metrics?: DataMetric[];
  // bar_chart 专用
  bars?: BarItem[];
  unit?: string;
  // data_card 专用
  cards?: StatCard[];
}

export type DataVizVideoProps = {
  title: string;
  scenes: DataVizSceneData[];
};

const INTRO_DURATION = 3;
const OUTRO_DURATION = 3;

/**
 * 数据可视化型视频主 Composition
 *
 * 支持混合使用数字翻转、柱状图、数据卡片三种场景。
 */
export const DataVizVideo: React.FC<DataVizVideoProps> = ({
  title,
  scenes,
}) => {
  const { fps } = useVideoConfig();

  // 开场标题帧
  const introFrames = Math.ceil(INTRO_DURATION * fps);

  // 计算每个场景的时间轴
  let currentFrame = introFrames;
  const sceneTimings = scenes.map((scene) => {
    const startFrame = currentFrame;
    const durationFrames = Math.ceil((scene.audioDuration || 8) * fps);
    currentFrame += durationFrames;
    return { startFrame, durationFrames };
  });

  const outroStart = currentFrame;
  const outroFrames = Math.ceil(OUTRO_DURATION * fps);

  return (
    <AbsoluteFill
      style={{
        fontFamily:
          "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif",
      }}
    >
      {/* ═══ 开场标题 ═══ */}
      <Sequence from={0} durationInFrames={introFrames}>
        <IntroScene title={title} />
      </Sequence>

      {/* ═══ 数据场景 ═══ */}
      {scenes.map((scene, index) => {
        const timing = sceneTimings[index];
        return (
          <Sequence
            key={index}
            from={timing.startFrame}
            durationInFrames={timing.durationFrames}
          >
            {/* 根据 sceneType 渲染不同组件 */}
            {scene.sceneType === "number_flip" && (
              <NumberFlipScene
                sceneTitle={scene.sceneTitle}
                metrics={scene.metrics || []}
                narration={scene.narration}
              />
            )}
            {scene.sceneType === "bar_chart" && (
              <BarChartScene
                sceneTitle={scene.sceneTitle}
                bars={scene.bars || []}
                narration={scene.narration}
                unit={scene.unit || ""}
              />
            )}
            {scene.sceneType === "data_card" && (
              <DataCardScene
                sceneTitle={scene.sceneTitle}
                cards={scene.cards || []}
                narration={scene.narration}
              />
            )}
            {/* TTS 音频 */}
            {scene.audioUrl && <Audio src={scene.audioUrl} volume={1} />}
          </Sequence>
        );
      })}

      {/* ═══ 结尾 ═══ */}
      <Sequence from={outroStart} durationInFrames={outroFrames}>
        <OutroScene />
      </Sequence>
    </AbsoluteFill>
  );
};

/**
 * 开场标题
 */

const IntroScene: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame, fps, config: { damping: 18 } });
  const scale = interpolate(progress, [0, 1], [0.8, 1]);
  const opacity = progress;

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, #1a1a3e 0%, #0a0a1a 100%)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* 装饰光效 */}
      <div
        style={{
          position: "absolute",
          width: 400,
          height: 400,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          textAlign: "center",
          opacity,
          transform: `scale(${scale})`,
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: "#818cf8",
            letterSpacing: 8,
            marginBottom: 24,
          }}
        >
          📊 DATA VISUALIZATION
        </div>
        <div
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#fff",
            lineHeight: 1.3,
            maxWidth: 800,
            padding: "0 40px",
          }}
        >
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * 结尾
 */
const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({ frame, fps, config: { damping: 20 } });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 50%, #1a1a3e 0%, #0a0a1a 100%)",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ textAlign: "center", opacity: progress }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>📊</div>
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: "#fff",
            marginBottom: 12,
          }}
        >
          数据不会说谎
        </div>
        <div
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.5)",
            fontWeight: 500,
          }}
        >
          关注我 · 用数据说话
        </div>
      </div>
    </AbsoluteFill>
  );
};
