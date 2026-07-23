import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

export interface SlideContainerProps {
  children: React.ReactNode;
  transitionType?: "push-up" | "fade" | "zoom";
  exitDuration?: number; // 退出动画占据的帧数
  style?: React.CSSProperties;
}

/**
 * 提供统一页面级别转场的容器 (类似幻灯片切换)
 */
export const SlideContainer: React.FC<SlideContainerProps> = ({
  children,
  transitionType = "fade",
  exitDuration = 15,
  style = {},
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // 1. 进入动画
  const enterProgress = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 }, // 柔和的进入
  });

  // 2. 退出动画 (在生命周期的最后 N 帧触发)
  const exitStartFrame = durationInFrames - exitDuration;
  const exitProgress = spring({
    frame: Math.max(0, frame - exitStartFrame),
    fps,
    config: { damping: 16, stiffness: 100 }, // 稍快的退出
  });

  let enterTransform = "none";
  let enterOpacity = 1;
  let exitTransform = "none";
  let exitOpacity = 1;

  if (transitionType === "fade") {
    enterOpacity = interpolate(enterProgress, [0, 1], [0, 1]);
    exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);
  } else if (transitionType === "push-up") {
    enterOpacity = interpolate(enterProgress, [0, 0.4], [0, 1], { extrapolateRight: "clamp" });
    enterTransform = `translateY(${interpolate(enterProgress, [0, 1], [60, 0])}px)`;
    
    exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);
    exitTransform = `translateY(${interpolate(exitProgress, [0, 1], [0, -40])}px)`; // 向上推走
  } else if (transitionType === "zoom") {
    enterOpacity = interpolate(enterProgress, [0, 0.5], [0, 1], { extrapolateRight: "clamp" });
    enterTransform = `scale(${interpolate(enterProgress, [0, 1], [0.95, 1])})`;
    
    exitOpacity = interpolate(exitProgress, [0, 1], [1, 0]);
    exitTransform = `scale(${interpolate(exitProgress, [0, 1], [1, 1.05])})`; // 轻微放大消失
  }

  // 结合进入和退出的变换
  const currentOpacity = frame >= exitStartFrame ? exitOpacity : enterOpacity;
  const currentTransform = frame >= exitStartFrame ? exitTransform : enterTransform;

  return (
    <AbsoluteFill
      style={{
        opacity: currentOpacity,
        transform: currentTransform,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
