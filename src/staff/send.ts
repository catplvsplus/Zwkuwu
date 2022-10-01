import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { MessageCommandBuilder, RecipleClient, SlashCommandBuilder } from 'reciple';
import { InteractionEventType } from '../tools/InteractionEvents';
import BaseModule from '../BaseModule';
import util from '../tools/util';

export class SendModule extends BaseModule {
    public async onStart(client: RecipleClient<boolean>): Promise<boolean> {
        this.commands = [
            new SlashCommandBuilder()
                .setName('send')
                .setDescription('Morph your message as a bot')
                .setRequiredMemberPermissions('ManageMessages')
                .setExecute(async data => {
                    const interaction = data.interaction;

                    await interaction.showModal(this.sendModal());
                }),
            new MessageCommandBuilder()
                .setName('send')
                .setDescription('Morph your messag as a bot')
                .setRequiredMemberPermissions('ManageMessages')
                .addOption(content => content
                    .setName('content')
                    .setDescription('Your message')
                    .setRequired(true)    
                )
                .setExecute(async data => {
                    const message = data.message;
                    const content = data.command.args.join(' ');

                    console.log(message.content, message.cleanContent);

                    if (content.length > 2000) {
                        await message.reply({ embeds: [util.errorEmbed('Message too long')] });
                        return;
                    }

                    await message.delete();
                    await message.channel.send(content);
                })
        ];

        this.interactionEventHandlers = [
            {
                type: InteractionEventType.ModalSubmit,
                customId: `send-message`,
                handle: async interaction => {
                    if (!interaction.isModalSubmit() || !interaction.inCachedGuild()) return;

                    const channel = interaction.channel;
                    const content = interaction.fields.getTextInputValue('content');

                    if (!channel) {
                        interaction.reply({ embeds: [util.errorEmbed('No channel found')] });
                        return;
                    }

                    await interaction.deferReply({ ephemeral: true });
                    await channel.sendTyping();
                    await channel.send(content);

                    await interaction.editReply({ embeds: [util.smallEmbed('Message sent!')] });
                }
            }
        ];

        return true;
    }

    public sendModal(): ModalBuilder {
        return new ModalBuilder()
            .setTitle(`Send Message`)
            .setCustomId(`send-message`)
            .setComponents(
                new ActionRowBuilder<TextInputBuilder>()
                    .setComponents(
                        new TextInputBuilder()
                            .setCustomId(`content`)
                            .setLabel(`Message`)
                            .setMaxLength(2000)
                            .setRequired(true)
                            .setPlaceholder(`Suck my sock`)
                            .setStyle(TextInputStyle.Paragraph)
                    )
            )
    }
}

export default new SendModule();