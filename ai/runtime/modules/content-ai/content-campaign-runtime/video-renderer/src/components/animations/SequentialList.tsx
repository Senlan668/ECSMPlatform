import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

export interface SequentialListProps {
  items: React.ReactNode[];
  delayBetweenItems?: number; // 每一项之间的间隔帧数
  initialDelay?: number;      // 列表整体开始前的延迟帧数
  animateType?: "fade-slide-up" | "scale-fade" | "none";
  style?: React.CSSProperties;
  itemStyle?: React.CSSProperties;
  className?: string;
  itemClassName?: string;
}

/**
 * PPT风格交错列表 (Staggered Reveal)
 * 自动为子元素分配递增的延迟，实现优雅的瀑布流进入
 */
export const SequentialList: React.FC<SequentialListProps> = ({
  items,
  delayBetweenItems = 12,
  initialDelay = 0,
  animateType = "fade-slide-up",
  style = {},
  itemStyle = {},
  className = "",
  itemClassName = "",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 16, ...style }}>
      {items.map((item, index) => {
        const itemDelay = initialDelay + index * delayBetweenItems;
        
        // 计算每个元素的弹簧进度
        const progress = spring({
          frame: Math.max(0, frame - itemDelay),
          fps,
          config: { damping: 16, stiffness: 100 },
        });

        // 默认不施加内部动画
        let itemTransform = "none";
        let itemOpacity = 1;

        if (animateType === "fade-slide-up") {
          itemOpacity = interpolate(progress, [0, 1], [0, 1]);
          itemTransform = `translateY(${interpolate(progress, [0, 1], [30, 0])}px)`;
        } else if (animateType === "scale-fade") {
          itemOpacity = interpolate(progress, [0, 1], [0, 1]);
          itemTransform = `scale(${interpolate(progress, [0, 1], [0.9, 1])})`;
        }

        // 可以考虑结合视线引导机制：如果渲染了第 N 项，第 N-2 项的透明度可以适当降低(本版本暂不加入，保持简洁)

        return (
          <div
            key={index}
            className={itemClassName}
            style={{
              opacity: itemOpacity,
              transform: itemTransform,
              ...itemStyle,
            }}
          >
            {item}
          </div>
        );
      })}
    </div>
  );
};
