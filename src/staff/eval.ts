import { PrismaClient } from '@prisma/client';
import { ActionRowBuilder, ApplicationCommandType, ContextMenuCommandBuilder, EmbedBuilder, ModalBuilder, PermissionFlagsBits, PermissionsBitField, TextInputBuilder, TextInputStyle } from 'discord.js';
import { escapeRegExp, replaceAll } from 'fallout-utility';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { inspect } from 'util';
import BaseModule from '../BaseModule';
import { InteractionEventType } from '../tools/InteractionEvents';
import util from '../tools/util';

export class EvalModule extends BaseModule {
    public client!: RecipleClient;
    public prisma!: PrismaClient;

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.client = client;
        this.prisma = util.prisma;

        this.commands = [
            new SlashCommandBuilder()
                .setName('eval')
                .setDescription('Eval code')
                .setRequiredMemberPermissions('Administrator')
                .setExecute(async data => {
                    const interaction = data.interaction;
                    interaction.showModal(this.evalModal());
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
                    const code = data.command.args.join(' ');
                    const reply = await message.reply({ embeds: [util.smallEmbed('Evaluating...')] });

                    await reply.edit({ embeds: [this.evalEmbed(code)] });
                }),
        ];

        client.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Evaluate Code')
                .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
                .setType(ApplicationCommandType.Message)
        );

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.ModalSubmit,
                customId: 'eval-modal',
                handle: async interaction => {
                    if (!interaction.isModalSubmit()) return;
                    if (!interaction.inCachedGuild() || !interaction.memberPermissions.has('Administrator')) return;

                    await interaction.deferReply();

                    const code = interaction.fields.getTextInputValue('code');
                    await interaction.editReply({ embeds: [this.evalEmbed(code)] });
                }
            }
        ];

        return true;
    }

    public evalModal(): ModalBuilder {
        return new ModalBuilder()
            .setCustomId('eval-modal')
            .setTitle('Evaluation Code')
            .setComponents(
                new ActionRowBuilder<TextInputBuilder>()
                    .setComponents(
                        new TextInputBuilder()
                            .setCustomId('code')
                            .setLabel('Code')
                            .setPlaceholder('console.log("hi")')
                            .setRequired(true)
                            .setStyle(TextInputStyle.Paragraph)
                    )
            );
    }

    public evalEmbed(code: string): EmbedBuilder {
        return util.smallEmbed('Eval').setDescription('```\n'+ this.eval(code).slice(0, 4000) +'\n```');
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

    public maskString(data: string, ...strings: string[]): string {
        return replaceAll(data, strings.map(str => escapeRegExp(str)), strings.map(str => str.length > 1 ? '*'.repeat(str.length) : ''));
    }
}

export default new EvalModule();