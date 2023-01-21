import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import utility from '../utils/utility.js';
import { ActionRowBuilder, AttachmentBuilder, BaseMessageOptions, EmbedBuilder, ModalActionRowComponentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, codeBlock, escapeCodeBlock } from 'discord.js';
import { replaceAll } from 'fallout-utility';
import { inspect } from 'util';

export class EvalModule extends BaseModule {
    get client() { return utility.client; }
    get prisma() { return utility.prisma; }
    get utility() { return utility; }
    get config() { return utility.config; }

    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.client 

        this.commands = [
            new SlashCommandBuilder()
                .setName('eval')
                .setDescription('Evaluate javascript code')
                .setRequiredMemberPermissions('Administrator')
                .addStringOption(code => code
                    .setName('code')
                    .setDescription('Code to evaluate')
                )
                .addBooleanOption(ephemeral => ephemeral
                    .setName('ephemeral')
                    .setDescription('Send result as ephemeral')
                )
                .setExecute(async ({ interaction }) => {
                    const code = interaction.options.getString('code');
                    const ephemeral = !!interaction.options.getBoolean('ephemeral');

                    if (!code) {
                        await interaction.showModal(
                            new ModalBuilder()
                                .setCustomId(`eval${ephemeral ? '-' + 'true' : ''}`)
                                .setTitle('Evaluate Code')
                                .setComponents(
                                    new ActionRowBuilder<ModalActionRowComponentBuilder>()
                                        .setComponents(
                                            new TextInputBuilder()
                                                .setCustomId('code')
                                                .setLabel('Code')
                                                .setPlaceholder(`console.log('Hello, world!')`)
                                                .setStyle(TextInputStyle.Paragraph)
                                                .setMaxLength(4000)
                                                .setRequired(true)
                                        )
                                )
                        );
                        return;
                    }

                    await interaction.deferReply({ ephemeral });
                    await interaction.editReply(this.eval(code));
                }),
            new MessageCommandBuilder()
                .setName('eval')
                .setDescription('Evaluate code')
                .setRequiredMemberPermissions('Administrator')
                .addOption(code => code
                    .setName('code')
                    .setDescription('Code to evaluate')
                    .setRequired(true)
                )
                .setExecute(async ({ message, command }) => {
                    const code = command.args.join(' ');
                    await message.reply(this.eval(code));
                })
        ];

        this.interactions = [
            {
                type: 'ModalSubmit',
                customId: customId => customId.startsWith('eval'),
                handle: async interaction => {
                    if (!interaction.inCachedGuild()) return;

                    const code = interaction.fields.getTextInputValue('code');
                    const ephemeral = interaction.customId.split('-').length > 1;

                    await interaction.deferReply({ ephemeral });
                    await interaction.editReply(this.eval(code));
                }
            }
        ];

        return true;
    }

    public eval(code: string): BaseMessageOptions {
        let result: string;
        let error: boolean = false;

        try {
            result = inspect(eval(code));
        } catch (err) {
            result = inspect(err);
            error = true;
        }

        if (this.client.token) result = replaceAll(result, this.client.token, '*'.repeat(this.client.token.length));

        return result.length >= 4000 ? {
            files: [
                new AttachmentBuilder(Buffer.from(result, 'utf-8'))
                    .setName('Evaluated code.txt')
            ]
        } : {
            embeds: [
                new EmbedBuilder()
                    .setAuthor({ name: `Evaluated code` })
                    .setColor(error ? utility.config.errorEmbedColor : utility.config.embedColor)
                    .setDescription(codeBlock(escapeCodeBlock(result)))
                    .setTimestamp()
            ]
        }
    }
}

export default new EvalModule();