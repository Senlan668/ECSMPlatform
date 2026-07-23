import { AbsoluteFill } from "remotion";
import React from "react";
import { SlideContainer } from "../../../components/animations/SlideContainer";
import { TextReveal } from "../../../components/animations/TextReveal";

export interface SplitScreenProps {
  title: string;
  keywords: string[];
  themeColor?: string;
}

/**
 * 左右分屏布局组件
 * 左侧预留图片/3D素材位置，右侧垂直排版文字
 */
export const SplitScreen: React.FC<SplitScreenProps> = ({
  title,
  keywords,
  themeColor = "#818cf8",
}) => {
  return (
    <SlideContainer transitionType="push-up" exitDuration={15}>
      <AbsoluteFill className="flex flex-row items-center justify-between px-24 py-16">
        
        {/* 左侧：视觉锚点/配图区 */}
        <div className="w-5/12 h-[75%] bg-white/5 border border-white/10 backdrop-blur-3xl rounded-3xl relative overflow-hidden flex flex-col items-center justify-center shadow-2xl">
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-white/5 z-0" />
          <div className="absolute top-0 right-0 p-8 text-white/20 text-6xl font-black italic mix-blend-overlay pointer-events-none">
            {keywords?.[0]?.substring(0, 3)?.toUpperCase() || "VIS"}
          </div>
          <div className="relative z-10 w-48 h-48 border-4 border-dashed rounded-full flex items-center justify-center" style={{ borderColor: themeColor }}>
            <span className="text-white/40 font-mono tracking-widest text-sm">IMAGE_AREA</span>
          </div>
        </div>

        {/* 右侧：文案解析区 */}
        <div className="w-6/12 flex flex-col justify-center h-[75%] pl-12">
          
          <TextReveal
            text={title}
            delay={10}
            direction="up"
            stiffness={90}
            className="text-[64px] font-bold text-white leading-tight mb-8"
          />

          <div className="flex flex-wrap gap-4 mt-8">
            {keywords.map((kw, idx) => (
              <div key={idx} className="overflow-hidden">
                 <TextReveal
                    text={kw}
                    delay={25 + idx * 5}
                    direction="up"
                    className="px-6 py-3 rounded-xl bg-white/10 backdrop-blur-md text-white/90 text-2xl font-medium border border-white/20 shadow-lg"
                 />
              </div>
            ))}
          </div>
          
        </div>
      </AbsoluteFill>
    </SlideContainer>
  );
};
