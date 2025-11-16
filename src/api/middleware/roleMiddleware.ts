import { Request, Response, NextFunction } from 'express';

/**
 * injectRoleMiddleware
 * 
 * 将用户角色注入到 req.user.role：
 * - 优先从 req.user.role 读取（若上游认证已设置）
 * - 兼容从请求头读取：x-admin-role=admin 或 x-user-role
 * - 兼容从 Authorization 读取简单约定：Bearer admin:<token> → admin 角色
 * 
 * 仅做注入，不做授权决策；具体授权在各控制器内完成。
 */
export function injectRoleMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const u: any = (req as any).user || {};
    let role = u.role;

    // header 覆盖
    const hdrAdmin = req.headers['x-admin-role'];
    const hdrUserRole = req.headers['x-user-role'];
    if (!role && typeof hdrAdmin === 'string' && hdrAdmin.toLowerCase() === 'admin') {
      role = 'admin';
    } else if (!role && typeof hdrUserRole === 'string') {
      role = hdrUserRole;
    }

    // 简单 Authorization 约定解析（非严格 JWT，仅用于本地/测试）
    if (!role && typeof req.headers.authorization === 'string') {
      const auth = req.headers.authorization.trim();
      if (auth.toLowerCase().startsWith('bearer ')) {
        const token = auth.substring(7);
        if (token.startsWith('admin:')) {
          role = 'admin';
        }
      }
    }

    (req as any).user = { ...(req as any).user, role };
    next();
  };
}


