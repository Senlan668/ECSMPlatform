import { AbsoluteFill } from "remotion";
import React from "react";
import { SlideContainer } from "../../../components/animations/SlideContainer";
import { TextReveal } from "../../../components/animations/TextReveal";
import { SequentialList } from "../../../components/animations/SequentialList";

export interface BulletPointsCardProps {
  title: string;
  points: string[];
}

/**
 * 要点卡片布局组件 (使用 Tailwind 重构)
 * 特点：毛玻璃卡片、高对比度排版
 */
export const BulletPointsCard: React.FC<BulletPointsCardProps> = ({
  title,
  points,
}) => {
  return (
    <SlideContainer transitionType="push-up" exitDuration={15}>
      <AbsoluteFill className="flex flex-col items-center justify-center p-16 relative">
        {/* 背景装饰光效 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-500/20 rounded-full blur-[100px]" />
        
        {/* 卡片主体 */}
        <div className="relative z-10 w-full max-w-4xl bg-white/5 border border-white/10 backdrop-blur-3xl rounded-3xl p-12 shadow-2xl">
          <TextReveal
            text={title}
            delay={5}
            direction="up"
            className="text-5xl font-bold text-white mb-10 text-center"
            style={{ textShadow: "0 4px 20px rgba(0,0,0,0.5)" }}
          />

          <div className="mt-8 text-2xl">
            <SequentialList
              initialDelay={20}
              delayBetweenItems={12}
              animateType="fade-slide-up"
              items={points.map((pt, i) => {
                const colors = [
                  "from-sky-400 to-blue-500",
                  "from-purple-400 to-indigo-500",
                  "from-pink-400 to-rose-500",
                  "from-amber-400 to-orange-500"
                ];
                const bgClass = colors[i % colors.length];
                return (
                  <div key={i} className="flex items-center gap-6 mb-8 group">
                    <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${bgClass} shadow-lg shadow-current shrink-0`} />
                    <span className="text-white/90 font-medium leading-relaxed tracking-wide">
                      {pt}
                    </span>
                  </div>
                );
              })}
            />
          </div>
        </div>
      </AbsoluteFill>
    </SlideContainer>
  );
};
