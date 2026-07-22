/**
 * 通用加载旋转器 — 消除项目中 3+ 处重复的 spinner 标记。
 */
export default function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const borderW = size === 'lg' ? 'border-[3px]' : 'border-2'
  const dim = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5'
  return <div className={`${dim} ${borderW} border-accent/30 border-t-accent rounded-full animate-spin shrink-0`} />
}
