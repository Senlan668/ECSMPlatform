import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { businessBlobRequest, businessRequest, businessStreamRequest } from './http'

export function useBusinessApi() {
  const { accessToken, activeTenant } = useAuth()
  return useCallback(<T,>(path: string, init?: RequestInit) => {
    if (!accessToken || !activeTenant) return Promise.reject(new Error('登录状态或租户上下文无效'))
    return businessRequest<T>(path, { accessToken, tenantId: activeTenant.id }, init)
  }, [accessToken, activeTenant])
}

export function useBusinessBlobApi() {
  const { accessToken, activeTenant } = useAuth()
  return useCallback((path: string, init?: RequestInit) => {
    if (!accessToken || !activeTenant) return Promise.reject(new Error('登录状态或租户上下文无效'))
    return businessBlobRequest(path, { accessToken, tenantId: activeTenant.id }, init)
  }, [accessToken, activeTenant])
}

export function useBusinessStreamApi() {
  const { accessToken, activeTenant } = useAuth()
  return useCallback((path: string, init?: RequestInit) => {
    if (!accessToken || !activeTenant) return Promise.reject(new Error('登录状态或租户上下文无效'))
    return businessStreamRequest(path, { accessToken, tenantId: activeTenant.id }, init)
  }, [accessToken, activeTenant])
}

export function useBusinessCollection<T>(path: string) {
  const { activeTenant } = useAuth()
  const request = useBusinessApi()
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestSequence = useRef(0)

  const reload = useCallback(async () => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError('')
    try {
      const records = await request<T[]>(path)
      if (sequence === requestSequence.current) setItems(records)
    } catch (reason) {
      if (sequence === requestSequence.current) {
        setError(reason instanceof Error ? reason.message : '数据加载失败')
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false)
    }
  }, [path, request])

  useEffect(() => {
    setItems([])
    void reload()
    return () => { requestSequence.current += 1 }
  }, [activeTenant?.id, reload])

  return { items, setItems, loading, error, reload, request }
}
