import { ColorResolvable } from 'discord.js';
import { SnipeConfig } from './fun/snipe.js';
import { ConfessionsConfig } from './fun/confessions.js';
import { TiktokConfig } from './fun/tiktok.js';

export interface BaseConfig {
    embedColor: ColorResolvable;
    errorEmbedColor: ColorResolvable;
    snipes: SnipeConfig;
    confessions: ConfessionsConfig;
    tiktok: TiktokConfig;
};

export const snowflake = '0000000000000000000';

export const defaultconfig = {
    embedColor: 'Blue',
    errorEmbedColor: 'DarkButNotBlack',
    snipes: {
        ignoredUsers: [snowflake],
        ignoredWords: [snowflake]
    },
    confessions: {
        confessionsChannelId: snowflake,
        titleAccessRequiredPermissions: 'Administrator',
        modalPlaceholders: [
            'I am so pretty',
            'I farted',
            'I hate you',
            'WTF'
        ]
    },
    tiktok: {
        cookies: ''
    }
} satisfies BaseConfig;

export type Config = typeof defaultconfig & BaseConfig;