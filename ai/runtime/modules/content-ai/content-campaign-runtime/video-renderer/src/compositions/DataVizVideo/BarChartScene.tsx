import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

/**
 * 柱状图动画场景
 *
 * 展示对比数据的柱状图从 0 高度增长到目标高度的动画。
 */

interface BarItem {
  label: string;
  value: number;
  color: string;
}

interface BarChartSceneProps {
  sceneTitle: string;
  bars: BarItem[];
  narration: string;
  unit: string; // 如 "%", "万", "分"
}

export const BarChartScene: React.FC<BarChartSceneProps> = ({
  sceneTitle,
  bars,
  narration,
  unit,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const isLandscape = width > height;

  const titleOpacity = spring({ frame, fps, config: { damping: 20 } });
  const titleY = interpolate(titleOpacity, [0, 1], [30, 0]);

  const maxValue = Math.max(...bars.map((b) => b.value), 1);

  const narrationOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%, #0f172a 0%, #020617 100%)",
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
      {/* 网格背景 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* 标题 */}
      <div
        style={{
          position: "absolute",
          top: isLandscape ? 50 : 160,
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
            color: "#38bdf8",
            letterSpacing: 6,
            marginBottom: isLandscape ? 8 : 16,
          }}
        >
          📈 COMPARISON
        </div>
        <div
          style={{
            fontSize: isLandscape ? 32 : 44,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.3,
            padding: "0 40px",
          }}
        >
          {sceneTitle}
        </div>
      </div>

      {/* 柱状图区域 */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: isLandscape ? 48 : 32,
          height: isLandscape ? 300 : 500,
          marginTop: isLandscape ? 60 : 120,
          padding: "0 60px",
        }}
      >
        {bars.map((bar, i) => {
          const barProgress = spring({
            frame: Math.max(0, frame - 15 - i * 6),
            fps,
            config: { damping: 25, stiffness: 60, mass: 1.2 },
          });

          const heightPercent = (bar.value / maxValue) * 100;
          const barHeight = heightPercent * (isLandscape ? 2.5 : 3.5) * barProgress;

          const currentValue = Math.round(bar.value * barProgress);

          return (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                flex: 1,
                maxWidth: 140,
              }}
            >
              {/* 数值标签 */}
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 800,
                  color: bar.color,
                  marginBottom: 12,
                  opacity: barProgress,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {currentValue}
                <span style={{ fontSize: 18 }}>{unit}</span>
              </div>

              {/* 柱体 */}
              <div
                style={{
                  width: "100%",
                  height: barHeight,
                  background: `linear-gradient(180deg, ${bar.color} 0%, ${bar.color}88 100%)`,
                  borderRadius: "12px 12px 4px 4px",
                  boxShadow: `0 0 20px ${bar.color}33`,
                  minHeight: 4,
                }}
              />

              {/* 底部标签 */}
              <div
                style={{
                  fontSize: 20,
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 16,
                  textAlign: "center",
                  fontWeight: 500,
                }}
              >
                {bar.label}
              </div>
            </div>
          );
        })}
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
