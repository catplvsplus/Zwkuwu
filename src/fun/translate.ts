import translate, { languages } from '@vitalets/google-translate-api';
import { ApplicationCommandType, ContextMenuCommandBuilder, EmbedBuilder, User } from 'discord.js';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import BaseModule from '../BaseModule';
import { InteractionEventType } from '../tools/InteractionEvents';
import util from '../tools/util';

export class TranslateModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('translate')
                .setDescription('Translate a message for you lazy bitch')
                .addStringOption(message => message
                    .setName('message')
                    .setDescription('Message to translate what else')
                    .setRequired(true)
                )
                .addStringOption(translateTo => translateTo
                    .setName('translate-to')
                    .setDescription('Translate to what language?')
                    .setAutocomplete(true)
                    .setRequired(false)
                )
                .addStringOption(translateFrom => translateFrom
                    .setName('translate-from')
                    .setDescription('Translate from what language?')
                    .setAutocomplete(true)
                    .setRequired(false)
                )
                .setExecute(async data => {
                    const interaction = data.interaction;
                    const content = interaction.options.getString('message', true);
                    const translateTo = interaction.options.getString('translate-to') ? languages.getCode(interaction.options.getString('translate-to')!) : undefined;
                    const translateFrom = interaction.options.getString('translate-from') ? languages.getCode(interaction.options.getString('translate-from')!) : undefined;

                    await interaction.deferReply();
                    await interaction.editReply({
                        embeds: [
                            await this.translate(content, interaction.user, typeof translateTo !== 'boolean' ? translateTo : undefined, typeof translateFrom !== 'boolean' ? translateFrom : undefined)
                        ]
                    });
                }),
            new MessageCommandBuilder()
                .setName('translate')
                .setDescription('Translate a message for you lazy bitch')
                .addOptions(message => message
                    .setName('message')
                    .setDescription('Message to translate what else')
                    .setRequired(true)
                )
                .setExecute(async data => {
                    const message = data.message;
                    const content = data.command.args.join(' ');

                    await message.reply({
                        embeds: [
                            await this.translate(content, message.author)
                        ]
                    });
                })
        ];

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.AutoComplete,
                commandName: 'translate',
                handle: async interaction => {
                    if (!interaction.isAutocomplete()) return;

                    const langs = Object.values(languages).filter(t => typeof t !== 'function' && t !== 'Automatic') as string[];
                    const query = interaction.options.getFocused().toLowerCase();

                    interaction.respond(
                        langs
                            .filter(lang => lang.toLowerCase() == query || lang.toLowerCase().startsWith(query) || lang.toLowerCase().includes(query))
                            .slice(0, 15)
                            .map(lang => ({
                                name: lang,
                                value: languages.getCode(lang) as string
                            }))
                    );
                }
            },
            {
                type: InteractionEventType.ContextMenu,
                commandName: 'Translate',
                handle: async interaction => {
                    if (!interaction.isMessageContextMenuCommand() || !interaction.inCachedGuild()) return;

                    await interaction.deferReply();
                    await interaction.editReply({
                        embeds: [
                            await this.translate(interaction.targetMessage.content, interaction.user)
                        ]
                    });
                }
            },
        ];

        client.commands.additionalApplicationCommands.push(
            new ContextMenuCommandBuilder()
                .setName('Translate')
                .setType(ApplicationCommandType.Message)
        );

        return true;
    }

    public async translate(content: string, author?: User, translateTo?: string, translateFrom?: string): Promise<EmbedBuilder> {
        if (!content) return util.errorEmbed('No content to translate');

        const translated = await translate(content, { to: translateTo, from: translateFrom, autoCorrect: true }).catch(() => null);
        if (!translated) return util.errorEmbed('Failed to translate');

        const embed = new EmbedBuilder()
            .setDescription(translated.text)
            .setColor(util.embedColor)
            .setFooter({ text: `Translated from "${content}"` });

        if (author) embed.setAuthor({ name: author.tag, iconURL: author.displayAvatarURL() });
        if (translated.pronunciation) embed.addFields({ name: 'Pronunciation', value: translated.pronunciation, inline: true });

        return embed;
    }
}

export default new TranslateModule();