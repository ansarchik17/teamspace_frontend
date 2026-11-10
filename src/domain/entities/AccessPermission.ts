export interface AccessPermission { code: string; group: string; name: string; description: string }
export interface AccessDependency { permission: string; any_of: string[] }
