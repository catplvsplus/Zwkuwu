import { EmbedBuilder } from 'discord.js';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { inspect } from 'util';
import BaseModule from '../BaseModule';
import util from '../tools/util';

export class EvalModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('eval')
                .setDescription('Eval code')
                .setRequiredMemberPermissions('Administrator')
                .setExecute(async data => {
                    const interaction = data.interaction;
                }),
            new MessageCommandBuilder()
                .setName('eval')
                .setDescription('Eval code')
                .setRequiredMemberPermissions('Administrator')
                .addOption(code => code
                    .setName('code')
                    .setDescription('Code to evaluate')
                    .setRequired(true)
                )
                .setExecute(async data => {
                    const message = data.message;
                }),
        ];

        return true;
    }

    public evalEmbed(code: string): EmbedBuilder {
        return util.smallEmbed('Eval').setDescription('```\n'+ this.eval(code) +'\n```');
    }

    public eval(code: string): string {
        try {
            let result = eval(code);
            if (typeof result !== 'string') result = inspect(result);

            return result;
        } catch (err) {
            return inspect(err);
        }
    }
}