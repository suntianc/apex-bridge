import axios, { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import { useAuthStore } from '@/store/authStore';

// 创建axios实例
const apiClient: AxiosInstance = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器 - 添加Token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 获取完整的请求 URL（考虑 baseURL）
    const url = config.url || '';
    const fullUrl = url.startsWith('http') ? url : `${config.baseURL || ''}${url}`;
    
    // setup API 不需要认证，不添加 Authorization header
    if (fullUrl.includes('/api/setup/')) {
      return config;
    }
    
    const token = useAuthStore.getState().token;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 处理错误和Token刷新
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // 获取请求 URL
      const requestUrl = error.config?.url || '';
      const fullUrl = requestUrl.startsWith('http') 
        ? requestUrl 
        : `${error.config?.baseURL || ''}${requestUrl}`;
      
      // setup API 的 401 错误不触发 logout（因为 setup 阶段不需要认证）
      if (!fullUrl.includes('/api/setup/')) {
        // Token过期或无效，清除认证状态
        useAuthStore.getState().logout();
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;

