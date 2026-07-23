import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

/**
 * 数字翻转动画场景
 *
 * 展示关键数字指标，带有从 0 翻转到目标值的动画效果。
 * 支持多个数据指标卡片，横向或纵向排列。
 */

interface DataMetric {
  label: string;
  value: number;
  suffix: string; // 如 "%", "万", "x", "倍"
  color: string;
}

interface NumberFlipSceneProps {
  sceneTitle: string;
  metrics: DataMetric[];
  narration: string;
}

const AnimatedNumber: React.FC<{
  value: number;
  suffix: string;
  color: string;
  delay: number;
  isLandscape: boolean;
}> = ({ value, suffix, color, delay, isLandscape }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: { damping: 30, stiffness: 80, mass: 1 },
  });

  const currentValue = Math.round(value * progress);

  const scale = interpolate(
    spring({ frame: Math.max(0, frame - delay), fps, config: { damping: 15 } }),
    [0, 1],
    [0.3, 1]
  );

  return (
    <div
      style={{
        transform: `scale(${scale})`,
        textAlign: "center",
      }}
    >
      <span
        style={{
          fontSize: isLandscape ? 52 : 72,
          fontWeight: 900,
          color,
          letterSpacing: "-2px",
          fontVariantNumeric: "tabular-nums",
          textShadow: `0 0 40px ${color}44`,
        }}
      >
        {currentValue.toLocaleString()}
      </span>
      <span
        style={{
          fontSize: isLandscape ? 24 : 32,
          fontWeight: 700,
          color,
          marginLeft: 4,
          opacity: 0.9,
        }}
      >
        {suffix}
      </span>
    </div>
  );
};

export const NumberFlipScene: React.FC<NumberFlipSceneProps> = ({
  sceneTitle,
  metrics,
  narration,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const isLandscape = width > height;

  const titleOpacity = spring({
    frame,
    fps,
    config: { damping: 20 },
  });

  const titleY = interpolate(titleOpacity, [0, 1], [30, 0]);

  // 底部旁白
  const narrationOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, #1a1a3e 0%, #0d0d1f 100%)",
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      {/* 背景装饰 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle at 20% 20%, rgba(99,102,241,0.08) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236,72,153,0.06) 0%, transparent 50%)",
        }}
      />

      {/* 标题 */}
      <div
        style={{
          position: "absolute",
          top: isLandscape ? 60 : 160,
          left: 0,
          right: 0,
          textAlign: "center",
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
        }}
      >
        <div
          style={{
            fontSize: isLandscape ? 16 : 20,
            fontWeight: 600,
            color: "#818cf8",
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: isLandscape ? 8 : 16,
          }}
        >
          📊 DATA INSIGHT
        </div>
        <div
          style={{
            fontSize: isLandscape ? 36 : 48,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.3,
            padding: "0 40px",
          }}
        >
          {sceneTitle}
        </div>
      </div>

      {/* 数字指标网格 */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 40,
          marginTop: 80,
          maxWidth: 900,
        }}
      >
        {metrics.map((metric, i) => (
          <div
            key={i}
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 24,
              padding: "40px 48px",
              minWidth: 280,
              backdropFilter: "blur(20px)",
            }}
          >
            <AnimatedNumber
              value={metric.value}
              suffix={metric.suffix}
              color={metric.color}
              delay={i * 8}
              isLandscape={isLandscape}
            />
            <div
              style={{
                fontSize: 22,
                color: "rgba(255,255,255,0.6)",
                textAlign: "center",
                marginTop: 12,
                fontWeight: 500,
              }}
            >
              {metric.label}
            </div>
          </div>
        ))}
      </div>

      {/* 底部旁白字幕 */}
      <div
        style={{
          position: "absolute",
          bottom: isLandscape ? 40 : 200,
          left: 60,
          right: 60,
          textAlign: "center",
          opacity: narrationOpacity,
        }}
      >
        <div
          style={{
            background: "rgba(0,0,0,0.5)",
            borderRadius: 16,
            padding: "16px 32px",
            display: "inline-block",
            maxWidth: "90%",
          }}
        >
          <span
            style={{
              fontSize: 24,
              color: "rgba(255,255,255,0.9)",
              lineHeight: 1.6,
            }}
          >
            {narration}
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
