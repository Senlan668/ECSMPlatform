import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

export interface TextRevealProps {
  text: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
  style?: React.CSSProperties;
  className?: string;
  stiffness?: number;
  damping?: number;
}

/**
 * PPT风格文本揭示动画 (Mask Reveal)
 * 文字会被一个遮罩包裹，从其外侧平滑滑入到正常位置
 */
export const TextReveal: React.FC<TextRevealProps> = ({
  text,
  delay = 0,
  direction = "up",
  style = {},
  className = "",
  stiffness = 120, // 默认稍微干脆一点的弹簧
  damping = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 根据方向计算位移差值
  const translateDistance = 60; // 内部移动的像素长度

  // 计算从 delay 开始的弹簧动画进度
  const progress = spring({
    frame: Math.max(0, frame - delay),
    fps,
    config: {
      damping,
      stiffness,
      mass: 0.8, // 略微轻盈
    },
  });

  // 透明度跟随
  const opacity = interpolate(progress, [0, 0.5, 1], [0, 0.8, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // 计算位移
  let transform = "none";
  if (direction === "up") transform = `translateY(${interpolate(progress, [0, 1], [translateDistance, 0])}px)`;
  if (direction === "down") transform = `translateY(${interpolate(progress, [0, 1], [-translateDistance, 0])}px)`;
  if (direction === "left") transform = `translateX(${interpolate(progress, [0, 1], [translateDistance, 0])}px)`;
  if (direction === "right") transform = `translateX(${interpolate(progress, [0, 1], [-translateDistance, 0])}px)`;

  return (
    <div
      className={className}
      style={{
        display: "inline-block",
        overflow: "hidden", // 关键：裁切溢出部分，实现遮罩揭示
        verticalAlign: "bottom",
      }}
    >
      <div
        style={{
          display: "inline-block",
          transform,
          opacity,
          ...style,
        }}
      >
        {text}
      </div>
    </div>
  );
};
