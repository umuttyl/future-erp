/// <reference types="vite/client" />

import 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    /** İstekte Authorization başlığı ekleme (login / refresh). */
    skipAuth?: boolean
    /** 401 sonrası tek yeniden deneme işareti. */
    _retry?: boolean
  }
}
