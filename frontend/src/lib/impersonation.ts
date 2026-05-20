import { useEffect, useState } from 'react'
import { api } from './api'

const IMP_ID_KEY = 'erp_imp_id'
const IMP_NAME_KEY = 'erp_imp_name'

let _tenantId: number | null = null
let _tenantName: string | null = null
const _listeners = new Set<() => void>()

function _notify() {
  _listeners.forEach((fn) => fn())
}

export function startImpersonation(tenantId: number, tenantName: string): void {
  _tenantId = tenantId
  _tenantName = tenantName
  sessionStorage.setItem(IMP_ID_KEY, String(tenantId))
  sessionStorage.setItem(IMP_NAME_KEY, tenantName)
  api.defaults.headers.common['X-Impersonate-Tenant-Id'] = String(tenantId)
  _notify()
}

export function stopImpersonation(): void {
  _tenantId = null
  _tenantName = null
  sessionStorage.removeItem(IMP_ID_KEY)
  sessionStorage.removeItem(IMP_NAME_KEY)
  delete api.defaults.headers.common['X-Impersonate-Tenant-Id']
  _notify()
}

export function getImpersonation(): { tenantId: number | null; tenantName: string | null } {
  return { tenantId: _tenantId, tenantName: _tenantName }
}

export function subscribeImpersonation(fn: () => void): () => void {
  _listeners.add(fn)
  return () => { _listeners.delete(fn) }
}

export function useImpersonation() {
  const [state, setState] = useState(getImpersonation)
  useEffect(() => subscribeImpersonation(() => setState(getImpersonation())), [])
  return state
}

// Initialize from sessionStorage on module load (survives page refresh within the same tab)
;(function init() {
  const id = sessionStorage.getItem(IMP_ID_KEY)
  const name = sessionStorage.getItem(IMP_NAME_KEY)
  if (id && name) {
    const parsed = parseInt(id, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      _tenantId = parsed
      _tenantName = name
      // Note: api interceptor in api.ts strips this header from /auth/ endpoints
      api.defaults.headers.common['X-Impersonate-Tenant-Id'] = id
    } else {
      sessionStorage.removeItem(IMP_ID_KEY)
      sessionStorage.removeItem(IMP_NAME_KEY)
    }
  }
})()
