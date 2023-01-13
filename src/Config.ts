export interface BaseConfig {}

export const defaultconfig = {} satisfies BaseConfig;

export type Config = typeof defaultconfig & BaseConfig;