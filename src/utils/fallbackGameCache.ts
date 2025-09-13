// STUB: Old cache system archived - using event sourcing now
export const fallbackGameCache = { 
  get: async (_key: string) => null, 
  set: async (_key: string, _value: any) => true,
  delete: async (_key: string) => true
};