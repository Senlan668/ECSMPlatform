import { AbsoluteFill } from "remotion";
import React from "react";
import { SlideContainer } from "../../../components/animations/SlideContainer";
import { TextReveal } from "../../../components/animations/TextReveal";

export interface TitleCardProps {
  headline: string;
  subhead?: string;
  themeColor?: string;
}

/**
 * 大字报标题组件 (使用 Tailwind)
 * 特点：极其克制的排版，巨大的标题充满视觉冲击
 */
export const TitleCard: React.FC<TitleCardProps> = ({
  headline,
  subhead,
  themeColor = "#818cf8",
}) => {
  return (
    <SlideContainer transitionType="zoom" exitDuration={15}>
      <AbsoluteFill className="flex flex-col items-center justify-center p-20 text-center">
        
        {subhead && (
          <TextReveal
            text={subhead}
            delay={5}
            direction="up"
            className="text-3xl font-semibold mb-8 tracking-[0.2em] relative"
            style={{ color: themeColor }}
          />
        )}
        
        <div className="max-w-[1200px]">
          <TextReveal
            text={headline}
            delay={15}
            direction="up"
            stiffness={90}
            className="text-[100px] font-black text-white leading-tight tracking-tight drop-shadow-2xl"
          />
        </div>

        {/* 装饰短线 */}
        <div className="mt-16 overflow-hidden">
          <TextReveal
            text=""
            delay={30}
            direction="left"
            className="block w-24 h-2 rounded-full"
            style={{ backgroundColor: themeColor }}
          />
        </div>

      </AbsoluteFill>
    </SlideContainer>
  );
};
