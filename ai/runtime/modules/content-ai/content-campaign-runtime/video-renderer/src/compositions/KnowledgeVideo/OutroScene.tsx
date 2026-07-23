import { AbsoluteFill, useVideoConfig } from "remotion";
import React from "react";
import { SlideContainer } from "../../components/animations/SlideContainer";
import { TextReveal } from "../../components/animations/TextReveal";

/**
 * 极简结尾 CTA 场景 (PPT / Keynote 风格)
 * 极致留版，纯净文字呈现，去除多余渐变和微光效果
 */
export const OutroScene: React.FC = () => {
  const { width, height } = useVideoConfig();
  const isLandscape = width > height;

  // 极简响应式尺寸
  const sizes = isLandscape
    ? { titleFont: 64, subFont: 28, gap: 24, ctaFont: 22, maxW: 800 }
    : { titleFont: 72, subFont: 34, gap: 32, ctaFont: 28, maxW: 700 };

  return (
    <SlideContainer transitionType="fade" exitDuration={15}>
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "60px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: sizes.gap, maxWidth: sizes.maxW }}>
          
          {/* 图标 (使用极简纯黑白或低饱和度风格即可，这里简单用文字表情，也可替换为精致的SVG) */}
          <TextReveal
            text="✦"
            direction="up"
            delay={5}
            style={{
              fontSize: sizes.titleFont * 1.2,
              background: "linear-gradient(135deg, #38bdf8, #a78bfa)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textAlign: "center",
            }}
          />

          {/* 致谢标题 */}
          <TextReveal
            text="THANKS FOR WATCHING"
            direction="up"
            delay={15}
            stiffness={100}
            style={{
              fontSize: sizes.titleFont,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: 4,
              textAlign: "center",
              fontFamily: "'SF Pro Display', 'Inter', sans-serif",
            }}
          />

          {/* 副标题 */}
          <TextReveal
            text="感谢观看 / 关注获取更多知识分享"
            direction="up"
            delay={25}
            stiffness={90}
            style={{
              fontSize: sizes.subFont,
              fontWeight: 400,
              color: "rgba(255,255,255,0.5)",
              letterSpacing: 2,
              textAlign: "center",
              marginTop: sizes.gap / 2,
            }}
          />

          {/* 纯净的 CTA 边框 (取代发光按钮) */}
          <div style={{ overflow: "hidden", marginTop: sizes.gap }}>
            <TextReveal
              text="SUBSCRIBE"
              direction="up"
              delay={40}
              stiffness={120}
              style={{
                fontSize: sizes.ctaFont,
                fontWeight: 600,
                color: "#ffffff",
                letterSpacing: 4,
                padding: "16px 48px",
                background: "linear-gradient(90deg, #38bdf8, #818cf8)",
                boxShadow: "0 8px 30px rgba(56, 189, 248, 0.3)",
                border: "none",
                borderRadius: "100px",
                display: "inline-block",
                textAlign: "center",
              }}
            />
          </div>
          
        </div>
      </AbsoluteFill>
    </SlideContainer>
  );
};
