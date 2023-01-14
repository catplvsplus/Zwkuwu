import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { BaseModule } from '../BaseModule.js';
import localeCode, { LanguageCode } from 'iso-639-1';
import { EmbedBuilder, User } from 'discord.js';
import { translate } from '@vitalets/google-translate-api';
import utility from '../utils/utility.js';

export class TranslateModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('translate')
                .setDescription('Translate a message')
                .addStringOption(text => text
                    .setName('text')
                    .setDescription('Message you want to traslate')
                    .setMaxLength(500)
                    .setRequired(true)
                )
                .addStringOption(translateTo => translateTo
                    .setName('translate-to')
                    .setDescription('Translate to what language?')
                    .setAutocomplete(true)
                )
                .addStringOption(translateFrom => translateFrom
                    .setName('translate-from')
                    .setDescription('Translate from what language?')
                    .setAutocomplete(true)
                )
                .setExecute(async ({ interaction }) => {
                    const content = interaction.options.getString('text', true);

                    const languages = localeCode.getLanguages(localeCode.getAllCodes());

                    const translateToRaw = interaction.options.getString('translate-to') || 'en';
                    const translateFromRaw = interaction.options.getString('translate-from') || undefined;

                    const translateTo = languages.find(lang => lang.code === translateToRaw || lang.name.toLowerCase() === translateFromRaw?.toLocaleLowerCase() || lang.nativeName.toLowerCase() === translateFromRaw?.toLocaleLowerCase())?.code;
                    const translateFrom = languages.find(lang => lang.code === translateFromRaw || lang.name.toLowerCase() === translateFromRaw?.toLocaleLowerCase() || lang.nativeName.toLowerCase() === translateFromRaw?.toLocaleLowerCase())?.code;

                    if (translateToRaw && !translateTo || translateFromRaw && !translateFrom) {
                        await interaction.reply({
                            embeds: [
                                utility.createSmallEmbed('Invalid language name or code', { positive: false })
                            ],
                            ephemeral: true
                        });
                        return;
                    }

                    await interaction.deferReply();

                    const embed = await this.translate({ text: content, author: interaction.user, from: translateFrom, to: translateTo });

                    await interaction.editReply({
                        embeds: [embed]
                    });
                }),
            new MessageCommandBuilder()
                .setName('translate')
                .setDescription('Translate a text to english')
                .addOptions(text => text
                    .setName('text')
                    .setDescription('Message you want to traslate')
                    .setRequired(true)
                )
                .setExecute(async data => {
                    const message = data.message;
                    const content = data.command.args.join(' ');

                    if (content.length > 500) {
                        await message.reply({
                            embeds: [
                                utility.createSmallEmbed('Text is too long', { positive: false })
                            ]
                        });
                        return;
                    }

                    await message.reply({
                        embeds: [
                            await this.translate({ text: content, author: message.author, to: 'en' })
                        ]
                    })
                })
        ];

        this.interactions = [
            {
                type: 'Autocomplete',
                commandName: 'translate',
                handle: async interaction => {
                    const query = interaction.options.getFocused().toLowerCase();
                    const langs = localeCode.getLanguages(localeCode.getAllCodes()).filter(lang => !query || lang.name.toLowerCase() === query || lang.nativeName.toLowerCase() === query || lang.code.toLowerCase() === query || lang.name.toLowerCase().includes(query) || lang.nativeName.toLowerCase().includes(query));

                    await interaction.respond(
                        langs.map(lang => ({
                            name: lang.name + (lang.name !== lang.nativeName ? ` (${lang.nativeName})` : ''),
                            value: lang.code
                        })).slice(0, 25)
                    );
                }
            }
        ];

        return true;
    }

    public async translate(options: { text: string; author?: User; from?: LanguageCode; to?: LanguageCode; }): Promise<EmbedBuilder> {
        if (!options.text) return utility.createSmallEmbed('Cannot translate empty text', { positive: false });

        const translateData = await translate(options.text, options).catch(() => null);
        if (!translateData?.text) return utility.createSmallEmbed('Failed to translate text', { positive: false });

        const embed = new EmbedBuilder()
            .setDescription(translateData.text)
            .setColor(utility.config.embedColor)
            .setFooter({ text: `Translated from "${options.text}"` });

        if (options.author) embed.setAuthor({ name: options.author.tag, iconURL: options.author.displayAvatarURL() });
        return embed;
    }
}

export default new TranslateModule();