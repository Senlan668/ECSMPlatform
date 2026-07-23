import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  spring,
} from "remotion";

/**
 * 数据卡片场景
 *
 * 用于展示总结性的关键数据指标，卡片逐个入场的动画效果。
 * 适合用在开场或结尾的概览页。
 */

interface StatCard {
  icon: string;
  title: string;
  value: string;
  trend: string; // 如 "↑ 23%", "新增", "Top 1"
  trendColor: string;
}

interface DataCardSceneProps {
  sceneTitle: string;
  cards: StatCard[];
  narration: string;
}

export const DataCardScene: React.FC<DataCardSceneProps> = ({
  sceneTitle,
  cards,
  narration,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const isLandscape = width > height;

  const titleOpacity = spring({ frame, fps, config: { damping: 20 } });
  const titleY = interpolate(titleOpacity, [0, 1], [30, 0]);

  const narrationOpacity = interpolate(frame, [15, 25], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 30% 50%, #1e1b4b 0%, #0c0a1d 100%)",
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
      }}
    >
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
            color: "#a78bfa",
            letterSpacing: 6,
            marginBottom: isLandscape ? 8 : 16,
          }}
        >
          🎯 KEY METRICS
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

      {/* 数据卡片网格 */}
      <div
        style={{
          display: "flex",
          flexDirection: isLandscape ? "row" : "column",
          gap: isLandscape ? 16 : 24,
          marginTop: isLandscape ? 40 : 80,
          width: "100%",
          maxWidth: isLandscape ? 1600 : 840,
          padding: "0 20px",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {cards.map((card, i) => {
          const cardProgress = spring({
            frame: Math.max(0, frame - 10 - i * 8),
            fps,
            config: { damping: 18, stiffness: 100 },
          });

          const slideX = interpolate(cardProgress, [0, 1], [60, 0]);

          return (
            <div
              key={i}
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: isLandscape ? 16 : 20,
                padding: isLandscape ? "20px 28px" : "28px 36px",
                display: "flex",
                alignItems: "center",
                gap: isLandscape ? 16 : 24,
                opacity: cardProgress,
                transform: `translateX(${slideX}px)`,
                backdropFilter: "blur(12px)",
                flex: isLandscape ? "1 1 auto" : undefined,
                minWidth: isLandscape ? 280 : undefined,
              }}
            >
              <div
                style={{
                  fontSize: 40,
                  width: 64,
                  height: 64,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(255,255,255,0.06)",
                  borderRadius: 16,
                  flexShrink: 0,
                }}
              >
                {card.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 18,
                    color: "rgba(255,255,255,0.5)",
                    fontWeight: 500,
                    marginBottom: 4,
                  }}
                >
                  {card.title}
                </div>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 800,
                    color: "#fff",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {card.value}
                </div>
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: card.trendColor,
                  background: `${card.trendColor}15`,
                  padding: "6px 16px",
                  borderRadius: 10,
                }}
              >
                {card.trend}
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
