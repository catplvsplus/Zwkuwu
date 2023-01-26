import utility from '../utility.js';
import { HiddenPlayer } from './classes/HiddenPlayer.js';

export type MessageType = 'exit'|'reconnect'|'disconnect'|'login'|'chat';

export interface DisconnectMsssage { type: 'disconnect'; reason?: string|null; }
export interface ChatMessage { type: 'chat'; message: string; }

export type Message = { type: Exclude<MessageType, 'disconnect'|'chat'>; }|DisconnectMsssage|ChatMessage;

let bot: HiddenPlayer = new HiddenPlayer(utility.config.hiddenplayer.bot);

bot.on('message', message => { process.send!(message); });
bot.on('disconnect', reason => { process.send!(`Bot disconnected: ${reason}`); });
bot.on('ready', () => { process.send!('Bot is ready'); });
bot.on('reconnect', () => { process.send!(`Bot is reconnecting`); });
bot.bot?.on('kicked', reason => { process.send!(`Bot got kicked: ${reason}`); })

process.on('message', async (message: Message) => {
    switch(message.type) {
        case 'exit': process.exit(0);
        case 'reconnect':
            await bot.reconnect();
            break;
        case 'disconnect':
            await bot.destroy(message.reason || undefined);
            break;
        case 'login':
            await bot.login(utility.config.hiddenplayer.loginOptions);
            break;
        case 'chat':
            bot.bot?.chat(message.message);
            break;
    }
});