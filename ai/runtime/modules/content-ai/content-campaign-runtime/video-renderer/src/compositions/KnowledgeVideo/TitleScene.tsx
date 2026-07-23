import { AbsoluteFill, useVideoConfig } from "remotion";
import React from "react";
import { SlideContainer } from "../../components/animations/SlideContainer";
import { TextReveal } from "../../components/animations/TextReveal";

interface TitleSceneProps {
  title: string;
}

/**
 * 极简开场标题场景 (PPT / Keynote 风格)
 * 移除所有冗余发光粒子，聚焦极其干净的大字号排版与流畅的遮罩浮现动画
 */
export const TitleScene: React.FC<TitleSceneProps> = ({ title }) => {
  const { width, height } = useVideoConfig();
  const isLandscape = width > height;

  // 极简响应式尺寸
  const sizes = isLandscape
    ? { titleFont: 72, subFont: 24, maxW: 1000, gap: 16 }
    : { titleFont: 84, subFont: 32, maxW: 800, gap: 24 };

  return (
    // 使用 SlideContainer 包装整个场景，提供优雅的入场和退场切页
    <SlideContainer transitionType="zoom" exitDuration={15}>
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: "60px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: sizes.gap }}>
          {/* 装饰性副标题 - 先出现 */}
          <TextReveal 
            text="INSIGHTS & KNOWLEDGE" 
            direction="up" 
            delay={5} 
            stiffness={90}
            style={{
              fontSize: sizes.subFont,
              fontWeight: 500,
              color: "rgba(255,255,255,0.4)",
              letterSpacing: 8,
              textAlign: "center",
            }} 
          />
          
          {/* 主标题 - 强视觉冲击，稍微延迟 */}
          <div style={{ maxWidth: sizes.maxW, textAlign: "center" }}>
            <TextReveal 
              text={title} 
              direction="up" 
              delay={15} 
              stiffness={110}
              style={{
                fontSize: sizes.titleFont,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.3,
                letterSpacing: 2,
              }} 
            />
          </div>

          {/* 极简分割线 */}
          <div style={{ overflow: "hidden", marginTop: sizes.gap * 2 }}>
            <TextReveal 
              text="" 
              direction="left" 
              delay={25}
              style={{
                width: 80,
                height: 4,
                background: "linear-gradient(90deg, #38bdf8, #818cf8)",
                display: "block",
                borderRadius: 2,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>
    </SlideContainer>
  );
};
