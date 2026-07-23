import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Save, Upload } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useBusinessApi } from '../../lib/businessApi'
import { jsonRequest } from '../../lib/http'
import { campaignPath, fileAsBase64 } from './api'
import { ActionState, CampaignMedia, RefreshButton, SectionHeading, inputClass, primaryButton, secondaryButton, textareaClass } from './ui'

interface BrandKit {
  id?: string | null
  brand_name?: string | null
  logo_url?: string | null
  colors: string[]
  font_style?: string | null
  tone?: string | null
  tone_prompt?: string | null
  banned_words: string[]
}

export default function BrandView() {
  const request = useBusinessApi(); const { activeTenant } = useAuth()
  const [kit, setKit] = useState<BrandKit | null>(null); const [name, setName] = useState(''); const [colors, setColors] = useState('#1A1A1A,#FFFFFF'); const [font, setFont] = useState('现代无衬线'); const [tone, setTone] = useState('专业严谨'); const [tonePrompt, setTonePrompt] = useState(''); const [banned, setBanned] = useState('')
  const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('')
  const apply = useCallback((value: BrandKit) => { setKit(value); setName(value.brand_name || ''); setColors((value.colors || []).join(',')); setFont(value.font_style || '现代无衬线'); setTone(value.tone || '专业严谨'); setTonePrompt(value.tone_prompt || ''); setBanned((value.banned_words || []).join(',')) }, [])
  const load = useCallback(async () => { setLoading(true); setError(''); try { apply(await request<BrandKit>(campaignPath('/brand/me'))) } catch (reason) { setError(reason instanceof Error ? reason.message : '品牌包加载失败') } finally { setLoading(false) } }, [apply, request])
  useEffect(() => { void load() }, [activeTenant?.id, load])
  async function save() { setLoading(true); setError(''); setSuccess(''); try { const updated = await request<BrandKit>(campaignPath('/brand/me'), jsonRequest('PUT', { brand_name: name.trim() || null, colors: colors.split(',').map(value => value.trim()).filter(Boolean), font_style: font.trim() || null, tone: tone.trim() || null, tone_prompt: tonePrompt.trim() || null, banned_words: banned.split(',').map(value => value.trim()).filter(Boolean) })); apply(updated); setSuccess('品牌规范已保存') } catch (reason) { setError(reason instanceof Error ? reason.message : '品牌包保存失败') } finally { setLoading(false) } }
  async function upload(file?: File) { if (!file) return; setLoading(true); setError(''); try { const encoded = await fileAsBase64(file); const response = await request<{ logo_url: string }>(campaignPath('/brand/me/logo'), jsonRequest('POST', { logo_base64: encoded.base64, content_type: encoded.contentType })); setKit(current => ({ ...(current || { colors: [], banned_words: [] }), logo_url: response.logo_url })); setSuccess('品牌 Logo 已更新') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Logo 上传失败') } finally { setLoading(false) } }
  async function reset() { setLoading(true); setError(''); try { await request(campaignPath('/brand/me'), jsonRequest('DELETE')); apply({ colors: [], banned_words: [], tone: '专业严谨' }); setSuccess('品牌规范已重置') } catch (reason) { setError(reason instanceof Error ? reason.message : '品牌包重置失败') } finally { setLoading(false) } }
  return <section aria-label="品牌规范"><SectionHeading title="品牌视觉与语气规范" action={<RefreshButton onClick={() => void load()} />} /><div className="mt-5 grid gap-7 lg:grid-cols-[240px_minmax(0,1fr)]"><div><div className="aspect-square overflow-hidden border border-border"><CampaignMedia url={kit?.logo_url} alt="品牌 Logo" /></div><label className={`${secondaryButton} mt-3 w-full cursor-pointer`}><Upload size={13} /> 上传 Logo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={event => void upload(event.target.files?.[0])} /></label></div><div className="space-y-4"><label className="block text-xs text-text-secondary">品牌名称<input value={name} onChange={event => setName(event.target.value)} className={inputClass} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs text-text-secondary">品牌色<input value={colors} onChange={event => setColors(event.target.value)} className={inputClass} placeholder="#111111,#FFFFFF" /></label><label className="block text-xs text-text-secondary">字体风格<input value={font} onChange={event => setFont(event.target.value)} className={inputClass} /></label><label className="block text-xs text-text-secondary">表达语气<input value={tone} onChange={event => setTone(event.target.value)} className={inputClass} /></label><label className="block text-xs text-text-secondary">禁用词<input value={banned} onChange={event => setBanned(event.target.value)} className={inputClass} placeholder="逗号分隔" /></label></div><label className="block text-xs text-text-secondary">品牌语气 Prompt<textarea value={tonePrompt} onChange={event => setTonePrompt(event.target.value)} className={textareaClass} /></label><div className="flex justify-end gap-2"><button onClick={() => void reset()} disabled={!kit?.id || loading} className={secondaryButton}><RotateCcw size={13} /> 重置</button><button onClick={() => void save()} disabled={loading} className={primaryButton}><Save size={13} /> 保存规范</button></div><ActionState loading={loading} error={error} success={success} /></div></div></section>
}
