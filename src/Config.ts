import { ColorResolvable } from 'discord.js';
import { SnipeConfig } from './fun/snipe.js';

export interface BaseConfig {
    embedColor: ColorResolvable;
    snipes: SnipeConfig;
};

export const snowflake = '0000000000000000000';

export const defaultconfig = {
    embedColor: 'Blue',
    snipes: {
        ignoredUsers: [snowflake],
        ignoredWords: [snowflake]
    }
} satisfies BaseConfig;

export type Config = typeof defaultconfig & BaseConfig;