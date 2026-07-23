import { AbsoluteFill, useVideoConfig } from "remotion";
import React from "react";
import { SlideContainer } from "../../components/animations/SlideContainer";
import { TextReveal } from "../../components/animations/TextReveal";
import { SequentialList } from "../../components/animations/SequentialList";

interface ContentSceneProps {
  narration: string;
  imageUrl: string;
  sceneIndex: number;
  totalScenes: number;
  sceneTitle: string;
  keyPoints: string[];
  codeExample: string;
}

/**
 * 极简干货内容场景 (PPT / Keynote 风格)
 * 左对齐/整体居中布局，网格对齐，极其干净的呼吸留白，逐行交错文字浮现
 */
export const ContentScene: React.FC<ContentSceneProps> = ({
  narration,
  sceneIndex,
  totalScenes,
  sceneTitle,
  keyPoints,
  codeExample,
}) => {
  const { width, height } = useVideoConfig();
  const isLandscape = width > height;

  // 针对演示风格的极致排版尺寸
  const sizes = isLandscape
    ? {
        padH: 120,
        padV: 100,
        skillFont: 18,
        titleFont: 56,
        subFont: 22,
        pointFont: 28,
        capFont: 24,
        maxW: 1000,
        gap: 32,
      }
    : {
        padH: 80,
        padV: 300,
        skillFont: 24,
        titleFont: 64,
        subFont: 28,
        pointFont: 36,
        capFont: 32,
        maxW: 850,
        gap: 40,
      };

  return (
    <SlideContainer transitionType="push-up" exitDuration={15}>
      <AbsoluteFill
        style={{
          padding: `${sizes.padV}px ${sizes.padH}px`,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center", // 整体居中
          alignItems: "flex-start", // 内部左对齐（更具高级排版感），竖屏如果喜欢居中可以视情况调整
        }}
      >
        <div style={{ maxWidth: sizes.maxW, width: "100%", margin: "0 auto" }}>
          
          {/* 1. 顶部小标记，类似发布会的 Section Name */}
          <TextReveal
            text={`PART ${String(sceneIndex + 1).padStart(2, "0")}`}
            delay={5}
            direction="up"
            style={{
              fontSize: sizes.skillFont,
              fontWeight: 800,
              // 用高亮的渐变色打破单调
              background: "linear-gradient(90deg, #38bdf8, #818cf8)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: 4,
              marginBottom: sizes.gap / 2,
              fontFamily: "'SF Mono', monospace",
            }}
          />

          {/* 2. 主标题，大号加粗 */}
          {sceneTitle && (
            <TextReveal
              text={sceneTitle}
              delay={15}
              direction="up"
              stiffness={100}
              style={{
                fontSize: sizes.titleFont,
                fontWeight: 700,
                color: "#ffffff",
                lineHeight: 1.25,
                // 给主标题加一点微弱但是有色彩的弥散阴影
                textShadow: "0 4px 24px rgba(56, 189, 248, 0.2)",
                marginBottom: sizes.gap / 2,
              }}
            />
          )}

          {/* 3. 辅助说明文案 / 引用 */}
          {codeExample && (
            <TextReveal
              text={codeExample}
              delay={25}
              direction="up"
              style={{
                fontSize: sizes.subFont,
                fontWeight: 400,
                color: "rgba(255,255,255,0.75)",
                lineHeight: 1.5,
                // 高级感的亮色边框引用
                borderLeft: "4px solid #818cf8",
                paddingLeft: 20,
                marginBottom: sizes.gap,
              }}
            />
          )}

          {/* 4. 重点呈现区：无框线的纯文字错落列表 */}
          {keyPoints.length > 0 && (
            <div style={{ marginTop: sizes.gap, marginLeft: 10 }}>
              <SequentialList
                initialDelay={40}  // 等主标题等出完再入场
                delayBetweenItems={12} // 交错间隔的帧数
                animateType="fade-slide-up"
                itemStyle={{
                  fontSize: sizes.pointFont,
                  fontWeight: 500,
                  color: "#ffffff",
                  lineHeight: 1.6,
                  display: "flex",
                  alignItems: "center", // 改为 center 让圆点更好看
                  gap: 16,
                }}
                items={keyPoints.map((pt, i) => {
                  // 给每一项分配一个多彩的点
                  const dotColors = [
                    "linear-gradient(135deg, #38bdf8, #3b82f6)", 
                    "linear-gradient(135deg, #a78bfa, #8b5cf6)", 
                    "linear-gradient(135deg, #f472b6, #ec4899)", 
                    "linear-gradient(135deg, #fbbf24, #f59e0b)"
                  ];
                  const dotBg = dotColors[i % dotColors.length];
                  return (
                  <React.Fragment key={i}>
                    {/* 彩色发光小圆点 */}
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: dotBg,
                      boxShadow: "0 0 10px " + dotBg.split(", ")[1], // 取第一个颜色做阴影
                      flexShrink: 0,
                    }} />
                    <span>{pt}</span>
                  </React.Fragment>
                )})}
              />
            </div>
          )}
        </div>

        {/* 5. 底部字幕区域 (独立浮出) */}
        {narration && (
          <div
            style={{
              position: "absolute",
              bottom: isLandscape ? 120 : 400,
              left: sizes.padH,
              right: sizes.padH,
              textAlign: "center",
            }}
          >
            <TextReveal
              text={narration}
              delay={40 + keyPoints.length * 12 + 10} // 稍晚于列表出现
              direction="up"
              stiffness={80}
              style={{
                fontSize: sizes.capFont,
                fontWeight: 400,
                color: "rgba(255,255,255,0.8)",
                lineHeight: 1.5,
                // 对于极简背景，文字不用特意加黑阴影，可以轻微发白晕
                textShadow: "0 2px 10px rgba(0,0,0,0.5)",
              }}
            />
          </div>
        )}
      </AbsoluteFill>
    </SlideContainer>
  );
};
